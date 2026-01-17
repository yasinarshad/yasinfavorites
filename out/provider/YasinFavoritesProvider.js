const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * FavoriteItem - TreeItem representing a favorited file or folder
 */
class FavoriteItem extends vscode.TreeItem {
    /**
     * @param {string} label - Display name
     * @param {vscode.TreeItemCollapsibleState} collapsibleState - Collapse state
     * @param {string} itemPath - Absolute filesystem path
     * @param {'file' | 'folder'} type - Resource type
     * @param {string|undefined} category - Category name (undefined = root level)
     */
    constructor(label, collapsibleState, itemPath, type, category) {
        super(label, collapsibleState);
        this.value = itemPath;
        this.itemPath = itemPath;
        this.type = type;
        this.category = category;
        this.resourceUri = vscode.Uri.file(itemPath);
        this.tooltip = itemPath;

        // Set context value based on type and category
        if (type === 'folder') {
            this.contextValue = category ? 'favorite.folder.categorized' : 'favorite.folder';
        } else {
            this.contextValue = category ? 'favorite.categorized' : 'favorite';
        }

        // Files open on click
        if (type === 'file') {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
    }
}

/**
 * Category - TreeItem representing a virtual category folder
 */
class Category extends vscode.TreeItem {
    /**
     * @param {string} name - Category name
     */
    constructor(name) {
        super(name, vscode.TreeItemCollapsibleState.Expanded);
        this.name = name;
        this.contextValue = 'category';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

/**
 * Resource - TreeItem representing a file or folder inside a favorited folder
 */
class Resource extends vscode.TreeItem {
    /**
     * @param {string} label - Display name
     * @param {vscode.TreeItemCollapsibleState} collapsibleState - Collapse state
     * @param {string} value - Absolute filesystem path
     * @param {string} contextValue - Type identifier for context menu routing
     */
    constructor(label, collapsibleState, value, contextValue) {
        super(label, collapsibleState);
        this.value = value;
        this.contextValue = contextValue;
        this.resourceUri = vscode.Uri.file(value);
        this.tooltip = value;

        // Files open on click
        if (collapsibleState === vscode.TreeItemCollapsibleState.None) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
    }
}

/**
 * YasinFavoritesProvider - TreeDataProvider for the FAVORITES panel
 */
class YasinFavoritesProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        // Array of favorite items: { path: string, type: 'file' | 'folder', category?: string }
        this.items = [];

        // Array of category names (includes empty categories)
        this.categoryList = [];

        // Sort order: 'ASC', 'DESC', or 'MANUAL'
        this.sortOrder = 'MANUAL';

        // Drag and Drop support
        this.dropMimeTypes = ['application/vnd.code.tree.yasinFavorites'];
        this.dragMimeTypes = ['application/vnd.code.tree.yasinFavorites'];
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    /**
     * Set sort order and refresh
     * @param {'ASC' | 'DESC' | 'MANUAL'} order
     */
    setSortOrder(order) {
        this.sortOrder = order;
        this.refresh();
    }

    /**
     * Set category list (for restoring from config)
     * @param {string[]} categories
     */
    setCategoryList(categories) {
        this.categoryList = categories || [];
        this.refresh();
    }

    /**
     * Get category list
     * @returns {string[]}
     */
    getCategoryList() {
        return [...this.categoryList];
    }

    /**
     * Add a new category
     * @param {string} name
     */
    addCategory(name) {
        if (!this.categoryList.includes(name)) {
            this.categoryList.push(name);
            this.refresh();
        }
    }

    /**
     * Get unique category names from items (legacy - categories that have items)
     * @returns {string[]}
     */
    getCategories() {
        const categories = new Set();
        this.items.forEach(item => {
            if (item.category) {
                categories.add(item.category);
            }
        });
        return Array.from(categories);
    }

    /**
     * Get all categories (union of categoryList and categories with items)
     * @returns {string[]}
     */
    getAllCategories() {
        const categories = new Set(this.categoryList);
        this.items.forEach(item => {
            if (item.category) {
                categories.add(item.category);
            }
        });
        return Array.from(categories);
    }

    /**
     * Get modification time for a path
     * @param {string} filePath
     * @returns {number} mtime in ms, 0 if not found
     */
    _getMtime(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                return stat.mtimeMs;
            }
        } catch (e) {
            // ignore
        }
        return 0;
    }

    /**
     * Sort items based on current sort order
     * @param {Array} items - Items to sort
     * @returns {Array} - Sorted items
     */
    _sortItems(items) {
        if (this.sortOrder === 'MANUAL' || !items || items.length === 0) {
            return items; // Keep original order
        }

        const sorted = [...items];

        if (this.sortOrder === 'MODIFIED') {
            // Pre-fetch all mtimes to avoid repeated stat calls during sort
            const mtimes = new Map();
            for (const item of sorted) {
                const p = item.path || item;
                mtimes.set(p, this._getMtime(p));
            }
            sorted.sort((a, b) => {
                const mtimeA = mtimes.get(a.path || a) || 0;
                const mtimeB = mtimes.get(b.path || b) || 0;
                return mtimeB - mtimeA; // Newest first
            });
        } else if (this.sortOrder === 'ASC') {
            sorted.sort((a, b) => {
                const nameA = path.basename(a.path || a).toLowerCase();
                const nameB = path.basename(b.path || b).toLowerCase();
                return nameA.localeCompare(nameB);
            });
        } else if (this.sortOrder === 'DESC') {
            sorted.sort((a, b) => {
                const nameA = path.basename(a.path || a).toLowerCase();
                const nameB = path.basename(b.path || b).toLowerCase();
                return nameB.localeCompare(nameA);
            });
        }

        return sorted;
    }

    /**
     * Get children - returns favorites/categories at root, or folder contents when element provided
     */
    getChildren(element) {
        // Root level - return root favorites and categories
        if (!element) {
            const result = [];
            const allCategories = this.getAllCategories();

            // Get root-level favorites (no category) - KEEP MANUAL ORDER (no sorting)
            const rootItems = this.items.filter(item => !item.category);

            rootItems.forEach(item => {
                const exists = fs.existsSync(item.path);
                const label = path.basename(item.path);
                const collapsible = item.type === 'folder'
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                const favoriteItem = new FavoriteItem(label, collapsible, item.path, item.type, undefined);

                // Mark missing paths
                if (!exists) {
                    favoriteItem.iconPath = new vscode.ThemeIcon('warning');
                    favoriteItem.description = '(missing)';
                    favoriteItem.contextValue = 'favorite.missing';
                }

                result.push(favoriteItem);
            });

            // Add category nodes - KEEP MANUAL ORDER (no sorting)
            allCategories.forEach(categoryName => {
                result.push(new Category(categoryName));
            });

            return result;
        }

        // Category element - return items in that category - KEEP MANUAL ORDER (no sorting)
        if (element instanceof Category) {
            const categoryItems = this.items.filter(item => item.category === element.name);

            return categoryItems.map(item => {
                const exists = fs.existsSync(item.path);
                const label = path.basename(item.path);
                const collapsible = item.type === 'folder'
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                const favoriteItem = new FavoriteItem(label, collapsible, item.path, item.type, item.category);

                if (!exists) {
                    favoriteItem.iconPath = new vscode.ThemeIcon('warning');
                    favoriteItem.description = '(missing)';
                    favoriteItem.contextValue = 'favorite.missing';
                }

                return favoriteItem;
            });
        }

        // FavoriteItem folder - return filesystem children
        if (element instanceof FavoriteItem && element.type === 'folder') {
            return this._getFilesystemChildren(element.itemPath);
        }

        // Resource directory - return filesystem children
        if (element instanceof Resource && element.contextValue === 'resource.dir') {
            return this._getFilesystemChildren(element.value);
        }

        return [];
    }

    /**
     * Get filesystem children of a directory - APPLIES sortOrder setting
     * @param {string} dirPath - Directory path
     * @returns {Resource[]}
     */
    _getFilesystemChildren(dirPath) {
        try {
            const items = fs.readdirSync(dirPath);
            const filtered = items.filter(item => !item.startsWith('.'));

            // Pre-fetch stat info for sorting
            const itemStats = new Map();
            for (const item of filtered) {
                const fullPath = path.join(dirPath, item);
                try {
                    const stat = fs.statSync(fullPath);
                    itemStats.set(item, {
                        isDir: stat.isDirectory(),
                        mtime: stat.mtimeMs,
                        fullPath: fullPath
                    });
                } catch (e) {
                    itemStats.set(item, { isDir: false, mtime: 0, fullPath: fullPath });
                }
            }

            // Sort based on sortOrder setting
            filtered.sort((a, b) => {
                const statA = itemStats.get(a);
                const statB = itemStats.get(b);

                // Directories always first (regardless of sort order)
                if (statA.isDir && !statB.isDir) return -1;
                if (!statA.isDir && statB.isDir) return 1;

                // Then apply sortOrder
                if (this.sortOrder === 'MODIFIED') {
                    return statB.mtime - statA.mtime; // Newest first
                } else if (this.sortOrder === 'DESC') {
                    return b.toLowerCase().localeCompare(a.toLowerCase()); // Z-A
                } else {
                    // ASC or MANUAL - alphabetical (A-Z)
                    return a.toLowerCase().localeCompare(b.toLowerCase());
                }
            });

            return filtered
                .map(item => {
                    const stat = itemStats.get(item);
                    const collapsibleState = stat.isDir
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;
                    const contextValue = stat.isDir ? 'resource.dir' : 'resource';
                    return new Resource(item, collapsibleState, stat.fullPath, contextValue);
                })
                .filter(item => item !== null);
        } catch (err) {
            console.error('YasinFavoritesProvider.getChildren error:', err);
            return [];
        }
    }

    /**
     * Add a path to favorites
     * @param {string} itemPath - Absolute path
     * @param {'file' | 'folder'} type - Resource type
     * @returns {boolean} - True if added, false if duplicate
     */
    addFavorite(itemPath, type) {
        // Check for duplicate
        if (this.items.some(item => item.path === itemPath)) {
            vscode.window.showInformationMessage('Already in favorites: ' + path.basename(itemPath));
            return false;
        }
        this.items.push({ path: itemPath, type: type });
        this.refresh();
        return true;
    }

    /**
     * Remove a path from favorites
     * @param {string} itemPath - Absolute path
     */
    removeFavorite(itemPath) {
        const index = this.items.findIndex(item => item.path === itemPath);
        if (index > -1) {
            this.items.splice(index, 1);
            this.refresh();
        }
    }

    /**
     * Move item to category
     * @param {string} itemPath - Path of item to move
     * @param {string} categoryName - Target category name
     */
    moveToCategory(itemPath, categoryName) {
        const item = this.items.find(item => item.path === itemPath);
        if (item) {
            item.category = categoryName;
            // Ensure category is in the list
            if (!this.categoryList.includes(categoryName)) {
                this.categoryList.push(categoryName);
            }
            this.refresh();
        }
    }

    /**
     * Move item to root (remove category)
     * @param {string} itemPath - Path of item to move
     */
    moveToRoot(itemPath) {
        const item = this.items.find(item => item.path === itemPath);
        if (item) {
            delete item.category;
            this.refresh();
        }
    }

    /**
     * Rename a category
     * @param {string} oldName - Current category name
     * @param {string} newName - New category name
     */
    renameCategory(oldName, newName) {
        // Update items
        this.items.forEach(item => {
            if (item.category === oldName) {
                item.category = newName;
            }
        });

        // Update category list
        const index = this.categoryList.indexOf(oldName);
        if (index > -1) {
            this.categoryList[index] = newName;
        }

        this.refresh();
    }

    /**
     * Delete a category (moves all items to root)
     * @param {string} categoryName - Category to delete
     */
    deleteCategory(categoryName) {
        // Move items to root
        this.items.forEach(item => {
            if (item.category === categoryName) {
                delete item.category;
            }
        });

        // Remove from category list
        const index = this.categoryList.indexOf(categoryName);
        if (index > -1) {
            this.categoryList.splice(index, 1);
        }

        this.refresh();
    }

    /**
     * Set all favorites (for restoration from config)
     * @param {Array<{path: string, type: string, category?: string}>} items
     */
    setItems(items) {
        this.items = items || [];
        this.refresh();
    }

    /**
     * Get current favorites
     * @returns {Array<{path: string, type: string, category?: string}>}
     */
    getItems() {
        return [...this.items];
    }

    /**
     * Handle drag start - only allow dragging Resource items (not favorites or categories)
     * @param {(FavoriteItem|Resource|Category)[]} source - Items being dragged
     * @param {vscode.DataTransfer} dataTransfer - Data transfer object
     * @param {vscode.CancellationToken} token - Cancellation token
     */
    async handleDrag(source, dataTransfer, token) {
        // Only allow dragging Resource items (files/folders inside expanded favorites)
        // FavoriteItem and Category should NOT be draggable - use Move Up/Down instead
        const resourceItems = source.filter(item => item instanceof Resource);

        if (resourceItems.length === 0) {
            return; // Don't set data transfer - prevents drag
        }

        const data = resourceItems.map(item => ({
            path: item.value,
            isFavorite: false,
            type: item.contextValue === 'resource.dir' ? 'folder' : 'file'
        }));

        dataTransfer.set(
            'application/vnd.code.tree.yasinFavorites',
            new vscode.DataTransferItem(data)
        );
    }

    /**
     * Handle drop - move files/folders within the filesystem
     * Only Resource items can be dragged, so we only handle filesystem moves
     * @param {FavoriteItem|Resource|Category|undefined} target - Drop target
     * @param {vscode.DataTransfer} dataTransfer - Data transfer with dragged items
     * @param {vscode.CancellationToken} token - Cancellation token
     */
    async handleDrop(target, dataTransfer, token) {
        const draggedItem = dataTransfer.get('application/vnd.code.tree.yasinFavorites');
        if (!draggedItem) return;

        const sourceItems = draggedItem.value;
        if (!sourceItems || sourceItems.length === 0) return;

        // Must have a valid drop target with a path
        if (!target || (!target.value && !target.itemPath)) {
            vscode.window.showWarningMessage('Cannot drop here - select a folder as drop target');
            return;
        }

        // Handle dropping files onto folders (filesystem move)
        const targetPath = target.value || target.itemPath;
        let targetFolder;

        try {
            const targetStat = fs.statSync(targetPath);
            if (targetStat.isDirectory()) {
                targetFolder = targetPath;
            } else {
                // If target is a file, use its parent folder
                targetFolder = path.dirname(targetPath);
            }
        } catch (err) {
            vscode.window.showErrorMessage('Invalid drop target');
            return;
        }

        for (const item of sourceItems) {
            const sourcePath = item.path;
            const destPath = path.join(targetFolder, path.basename(sourcePath));

            if (sourcePath === destPath) continue;
            if (destPath.startsWith(sourcePath + path.sep)) {
                vscode.window.showWarningMessage('Cannot move folder into itself');
                continue;
            }

            try {
                fs.renameSync(sourcePath, destPath);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to move ${path.basename(sourcePath)}: ${err.message}`);
            }
        }

        this.refresh();
    }
}

module.exports = YasinFavoritesProvider;
