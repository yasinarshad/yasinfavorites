const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const YasinFavoritesProvider = require('./provider/YasinFavoritesProvider');

let fileWatchers = [];
let clipboardPaths = [];  // Array for multi-select support
let clipboardOperation = null; // 'cut' or 'copy'

/**
 * Get workspace root path
 */
function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Convert absolute path to relative (for saving)
 * Returns relative path if inside workspace, otherwise keeps absolute
 */
function toRelativePath(absolutePath) {
    const root = getWorkspaceRoot();
    if (!root) return absolutePath;

    if (absolutePath.startsWith(root)) {
        const relative = path.relative(root, absolutePath);
        return relative || '.'; // '.' if it's the root itself
    }
    return absolutePath; // Keep absolute if outside workspace
}

/**
 * Convert relative path to absolute (for loading)
 * Handles both relative and already-absolute paths
 */
function toAbsolutePath(storedPath) {
    const root = getWorkspaceRoot();
    if (!root) return storedPath;

    // Already absolute
    if (path.isAbsolute(storedPath)) {
        return storedPath;
    }

    // Convert relative to absolute
    return path.join(root, storedPath);
}

/**
 * Save favorites to workspace settings (converts to relative paths)
 */
function saveConfig(provider) {
    const config = vscode.workspace.getConfiguration('yasinFavorites');
    const items = provider.getItems().map(item => ({
        ...item,
        path: toRelativePath(item.path)
    }));
    config.update('items', items, vscode.ConfigurationTarget.Workspace);
}

/**
 * Save categories to workspace settings
 */
function saveCategories(provider) {
    const config = vscode.workspace.getConfiguration('yasinFavorites');
    config.update('categories', provider.getCategoryList(), vscode.ConfigurationTarget.Workspace);
}

/**
 * Create file watcher for a favorited path
 */
function createWatcher(provider, favPath, context) {
    const pattern = new vscode.RelativePattern(favPath, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(() => provider.refresh());
    watcher.onDidDelete((uri) => {
        provider.refresh();
    });
    watcher.onDidChange(() => provider.refresh());
    context.subscriptions.push(watcher);
    return watcher;
}

/**
 * Setup watchers for all favorited paths
 */
function setupWatchers(provider, context) {
    fileWatchers.forEach(w => w.dispose());
    fileWatchers = [];
    provider.getItems().forEach(item => {
        if (item.type === 'folder' && fs.existsSync(item.path)) {
            fileWatchers.push(createWatcher(provider, item.path, context));
        }
    });
}

function activate(context) {
    const provider = new YasinFavoritesProvider();
    const treeView = vscode.window.createTreeView('yasinFavorites', {
        treeDataProvider: provider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: provider
    });

    context.subscriptions.push(
        // Add to favorites (from Explorer context menu OR from Resource inside favorites panel)
        vscode.commands.registerCommand('yasinFavorites.addToFavorites', (uriOrResource) => {
            let itemPath;
            // Handle Explorer URI (fsPath)
            if (uriOrResource?.fsPath) {
                itemPath = uriOrResource.fsPath;
            }
            // Handle Resource item from Yasin Favorites panel (value)
            else if (uriOrResource?.value) {
                itemPath = uriOrResource.value;
            }

            if (itemPath) {
                let type = 'file';
                try {
                    if (fs.statSync(itemPath).isDirectory()) {
                        type = 'folder';
                    }
                } catch (e) {
                    // If stat fails, assume file
                }
                if (provider.addFavorite(itemPath, type)) {
                    saveConfig(provider);
                    setupWatchers(provider, context);
                }
            }
        }),

        // Remove from favorites
        vscode.commands.registerCommand('yasinFavorites.remove', (resource) => {
            const itemPath = resource?.value || resource?.itemPath;
            if (itemPath) {
                provider.removeFavorite(itemPath);
                saveConfig(provider);
                setupWatchers(provider, context);
            }
        }),

        // Refresh
        vscode.commands.registerCommand('yasinFavorites.refresh', () => {
            provider.refresh();
        }),

        // Sort command - cycles through ASC, DESC, MANUAL
        vscode.commands.registerCommand('yasinFavorites.sort', async () => {
            const config = vscode.workspace.getConfiguration('yasinFavorites');
            const current = config.get('sortOrder') || 'MANUAL';

            const options = [
                { label: 'A → Z (Ascending)', value: 'ASC', description: current === 'ASC' ? '✓ Current' : '' },
                { label: 'Z → A (Descending)', value: 'DESC', description: current === 'DESC' ? '✓ Current' : '' },
                { label: 'Latest Modified', value: 'MODIFIED', description: current === 'MODIFIED' ? '✓ Current' : '' },
                { label: 'Manual (Drag Order)', value: 'MANUAL', description: current === 'MANUAL' ? '✓ Current' : '' }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `Current: ${current} - Select sort order`
            });

            if (selected) {
                await config.update('sortOrder', selected.value, vscode.ConfigurationTarget.Workspace);
                provider.setSortOrder(selected.value);
                vscode.window.showInformationMessage(`Sort: ${selected.label}`);
            }
        }),

        // Favorites Folder operations
        vscode.commands.registerCommand('yasinFavorites.newCategory', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter favorites folder name',
                placeHolder: 'My Folder'
            });
            if (name) {
                // Add folder to the list (even if empty)
                provider.addCategory(name);
                saveCategories(provider);
                vscode.window.showInformationMessage(`Favorites folder "${name}" created`);
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.renameCategory', async (category) => {
            if (category?.name) {
                const newName = await vscode.window.showInputBox({
                    prompt: 'Enter new folder name',
                    value: category.name
                });
                if (newName && newName !== category.name) {
                    provider.renameCategory(category.name, newName);
                    saveConfig(provider);
                    saveCategories(provider);
                }
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.deleteCategory', async (category) => {
            if (category?.name) {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete folder "${category.name}"? Items will move to root.`,
                    { modal: true },
                    'Delete'
                );
                if (confirm) {
                    provider.deleteCategory(category.name);
                    saveConfig(provider);
                    saveCategories(provider);
                }
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.moveToCategory', async (resource) => {
            const itemPath = resource?.value || resource?.itemPath;
            if (itemPath) {
                const categories = provider.getCategoryList();
                const items = [...categories, '+ Create New Folder'];

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select or create a favorites folder'
                });

                if (selected === '+ Create New Folder') {
                    const newName = await vscode.window.showInputBox({
                        prompt: 'Enter new folder name'
                    });
                    if (newName) {
                        provider.addCategory(newName);
                        provider.moveToCategory(itemPath, newName);
                        saveConfig(provider);
                        saveCategories(provider);
                    }
                } else if (selected) {
                    provider.moveToCategory(itemPath, selected);
                    saveConfig(provider);
                }
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.moveToRoot', (resource) => {
            const itemPath = resource?.value || resource?.itemPath;
            if (itemPath) {
                provider.moveToRoot(itemPath);
                saveConfig(provider);
            }
        }),

        // Navigation
        vscode.commands.registerCommand('yasinFavorites.revealInSidebar', (resource) => {
            if (resource?.resourceUri) {
                vscode.commands.executeCommand('revealInExplorer', resource.resourceUri);
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.revealInFinder', (resource) => {
            if (resource?.resourceUri) {
                vscode.commands.executeCommand('revealFileInOS', resource.resourceUri);
            }
        }),

        // Copy paths
        vscode.commands.registerCommand('yasinFavorites.copyPath', (resource, selectedItems) => {
            // Use selectedItems if multi-select, otherwise single resource, fallback to treeView.selection for hotkey
            const items = selectedItems?.length > 0 ? selectedItems : (resource ? [resource] : treeView.selection);

            // Extract paths, filtering out category folders (no value/itemPath)
            const paths = items
                .map(r => r?.value || r?.itemPath)
                .filter(Boolean);

            if (paths.length === 0) {
                return; // No valid paths
            }

            // Single item: no trailing newline (backward compatible)
            // Multiple items: newline-separated
            const clipboardText = paths.length === 1 ? paths[0] : paths.join('\n');

            vscode.env.clipboard.writeText(clipboardText);

            // Dynamic message
            const message = paths.length === 1
                ? 'Path copied'
                : `${paths.length} paths copied`;
            vscode.window.setStatusBarMessage(`✅ ${message}`, 2000);
        }),

        vscode.commands.registerCommand('yasinFavorites.copyRelativePath', (resource, selectedItems) => {
            // Use selectedItems if multi-select, otherwise single resource, fallback to treeView.selection for hotkey
            const items = selectedItems?.length > 0 ? selectedItems : (resource ? [resource] : treeView.selection);
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            // Extract paths and convert to relative
            const paths = items
                .map(r => r?.value || r?.itemPath)
                .filter(Boolean)
                .map(itemPath => {
                    return root && itemPath.startsWith(root)
                        ? itemPath.replace(root + '/', '')
                        : itemPath;
                });

            if (paths.length === 0) {
                return; // No valid paths
            }

            // Single item: no trailing newline (backward compatible)
            // Multiple items: newline-separated
            const clipboardText = paths.length === 1 ? paths[0] : paths.join('\n');

            vscode.env.clipboard.writeText(clipboardText);

            // Dynamic message
            const message = paths.length === 1
                ? 'Relative path copied'
                : `${paths.length} relative paths copied`;
            vscode.window.setStatusBarMessage(`✅ ${message}`, 2000);
        }),

        // File operations
        vscode.commands.registerCommand('yasinFavorites.newFile', async (resource) => {
            const targetDir = resource?.value || resource?.itemPath;
            if (targetDir) {
                const name = await vscode.window.showInputBox({ prompt: 'New file name' });
                if (name) {
                    const newPath = path.join(targetDir, name);
                    fs.writeFileSync(newPath, '');
                    const doc = await vscode.workspace.openTextDocument(newPath);
                    await vscode.window.showTextDocument(doc);
                    provider.refresh();
                }
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.newFolder', async (resource) => {
            const targetDir = resource?.value || resource?.itemPath;
            if (targetDir) {
                const name = await vscode.window.showInputBox({ prompt: 'New folder name' });
                if (name) {
                    fs.mkdirSync(path.join(targetDir, name), { recursive: true });
                    provider.refresh();
                }
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.rename', async (resource) => {
            const itemPath = resource?.value || resource?.itemPath;
            if (itemPath) {
                const oldName = path.basename(itemPath);
                const newName = await vscode.window.showInputBox({ prompt: 'New name', value: oldName });
                if (newName && newName !== oldName) {
                    const newPath = path.join(path.dirname(itemPath), newName);
                    fs.renameSync(itemPath, newPath);

                    // Update favorite path if this was a favorite
                    const items = provider.getItems();
                    const favItem = items.find(f => f.path === itemPath);
                    if (favItem) {
                        favItem.path = newPath;
                        provider.setItems(items);
                        saveConfig(provider);
                    } else {
                        provider.refresh();
                    }
                }
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.delete', async (resource) => {
            // Handle multi-select: use treeView.selection if available
            const items = resource ? [resource] : treeView.selection;
            const validItems = items.filter(r => r?.value || r?.itemPath);
            if (validItems.length > 0) {
                const names = validItems.map(r => path.basename(r.value || r.itemPath)).join(', ');
                const confirm = await vscode.window.showWarningMessage(
                    `Move ${validItems.length} item(s) to Trash?\n${names}`,
                    { modal: true }, 'Move to Trash'
                );
                if (confirm) {
                    for (const item of validItems) {
                        const itemPath = item.value || item.itemPath;
                        await vscode.workspace.fs.delete(vscode.Uri.file(itemPath), { useTrash: true, recursive: true });

                        // Remove from favorites if it was a favorite
                        provider.removeFavorite(itemPath);
                    }
                    saveConfig(provider);
                    provider.refresh();
                }
            }
        }),

        // Cut/Copy/Paste
        vscode.commands.registerCommand('yasinFavorites.cut', (resource) => {
            // Handle multi-select: use treeView.selection if available
            const items = resource ? [resource] : treeView.selection;
            if (items.length > 0) {
                clipboardPaths = items
                    .filter(r => r?.value || r?.itemPath)
                    .map(r => r.value || r.itemPath);
                clipboardOperation = 'cut';
                const names = clipboardPaths.map(p => path.basename(p)).join(', ');
                vscode.window.showInformationMessage('Cut: ' + names);
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.copy', (resource) => {
            // Handle multi-select: use treeView.selection if available
            const items = resource ? [resource] : treeView.selection;
            if (items.length > 0) {
                clipboardPaths = items
                    .filter(r => r?.value || r?.itemPath)
                    .map(r => r.value || r.itemPath);
                clipboardOperation = 'copy';
                const names = clipboardPaths.map(p => path.basename(p)).join(', ');
                vscode.window.showInformationMessage('Copied: ' + names);
            }
        }),

        // Templated Folder & Folder Customization bridges
        vscode.commands.registerCommand('yasinFavorites.createTemplatedFolder', (resource) => {
            const targetDir = resource?.value || resource?.itemPath;
            if (targetDir) {
                vscode.commands.executeCommand('FT.createFolderStructure', vscode.Uri.file(targetDir));
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.fcApplyColor', (resource) => {
            if (resource?.resourceUri) {
                vscode.commands.executeCommand('folder-customization.setColor', resource.resourceUri);
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.fcApplyIcon', (resource) => {
            if (resource?.resourceUri) {
                vscode.commands.executeCommand('folder-customization.setEmojiBadge', resource.resourceUri);
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.fcReset', (resource) => {
            if (resource?.resourceUri) {
                vscode.commands.executeCommand('folder-customization.clearCustomization', resource.resourceUri);
            }
        }),

        // Bridge to Focus Folder extension
        vscode.commands.registerCommand('yasinFavorites.addToFocusFolder', (resource) => {
            const itemPath = resource?.value || resource?.itemPath;
            if (itemPath) {
                vscode.commands.executeCommand('focusFolder.focusOnFolder', { fsPath: itemPath });
            }
        }),

        vscode.commands.registerCommand('yasinFavorites.paste', async (resource) => {
            // Handle keyboard shortcut: use treeView.selection if no resource passed
            let targetDir = resource?.value || resource?.itemPath;
            if (!targetDir && treeView.selection.length > 0) {
                // Use first selected item as target
                const selected = treeView.selection[0];
                const selectedPath = selected?.value || selected?.itemPath;
                if (selectedPath) {
                    // If selected is a file, paste into its parent folder
                    try {
                        const stat = fs.statSync(selectedPath);
                        targetDir = stat.isDirectory() ? selectedPath : path.dirname(selectedPath);
                    } catch (e) {
                        targetDir = selectedPath;
                    }
                }
            }

            if (targetDir && clipboardPaths.length > 0) {
                for (const sourcePath of clipboardPaths) {
                    if (!fs.existsSync(sourcePath)) continue;
                    const destPath = path.join(targetDir, path.basename(sourcePath));
                    if (clipboardOperation === 'cut') {
                        fs.renameSync(sourcePath, destPath);

                        // Update favorite path if this was a favorite
                        const items = provider.getItems();
                        const favItem = items.find(f => f.path === sourcePath);
                        if (favItem) {
                            favItem.path = destPath;
                            provider.setItems(items);
                        }
                    } else {
                        await vscode.workspace.fs.copy(
                            vscode.Uri.file(sourcePath),
                            vscode.Uri.file(destPath),
                            { overwrite: false }
                        );
                    }
                }
                if (clipboardOperation === 'cut') {
                    clipboardPaths = [];
                    clipboardOperation = null;
                    saveConfig(provider);
                }
                provider.refresh();
            }
        }),

        // Move Up/Down for reordering favorites
        vscode.commands.registerCommand('yasinFavorites.moveUp', (resource) => {
            const itemPath = resource?.value || resource?.itemPath;
            if (!itemPath) return;

            const items = provider.getItems();
            const category = resource?.category;

            // Find items in same category (or root if no category)
            const sameCategory = items.filter(item =>
                category ? item.category === category : !item.category
            );

            const currentIndex = sameCategory.findIndex(item => item.path === itemPath);
            if (currentIndex <= 0) return; // Already at top or not found

            // Find the actual indices in the full items array
            const currentFullIndex = items.findIndex(item => item.path === itemPath);
            const prevItem = sameCategory[currentIndex - 1];
            const prevFullIndex = items.findIndex(item => item.path === prevItem.path);

            // Swap in the full array
            [items[currentFullIndex], items[prevFullIndex]] = [items[prevFullIndex], items[currentFullIndex]];

            provider.setItems(items);
            saveConfig(provider);
        }),

        vscode.commands.registerCommand('yasinFavorites.moveDown', (resource) => {
            const itemPath = resource?.value || resource?.itemPath;
            if (!itemPath) return;

            const items = provider.getItems();
            const category = resource?.category;

            // Find items in same category (or root if no category)
            const sameCategory = items.filter(item =>
                category ? item.category === category : !item.category
            );

            const currentIndex = sameCategory.findIndex(item => item.path === itemPath);
            if (currentIndex < 0 || currentIndex >= sameCategory.length - 1) return; // At bottom or not found

            // Find the actual indices in the full items array
            const currentFullIndex = items.findIndex(item => item.path === itemPath);
            const nextItem = sameCategory[currentIndex + 1];
            const nextFullIndex = items.findIndex(item => item.path === nextItem.path);

            // Swap in the full array
            [items[currentFullIndex], items[nextFullIndex]] = [items[nextFullIndex], items[currentFullIndex]];

            provider.setItems(items);
            saveConfig(provider);
        }),

        treeView
    );

    // Restore on activation (convert relative paths back to absolute)
    const config = vscode.workspace.getConfiguration('yasinFavorites');
    const saved = config.get('items') || [];
    const savedCategories = config.get('categories') || [];
    const sortOrder = config.get('sortOrder') || 'MANUAL';

    provider.setSortOrder(sortOrder);
    provider.setCategoryList(savedCategories);

    if (saved.length > 0) {
        // Convert stored paths (relative or absolute) to absolute paths
        const items = saved.map(item => ({
            ...item,
            path: toAbsolutePath(item.path)
        }));
        provider.setItems(items);
        setupWatchers(provider, context);
    }
}

function deactivate() {
    fileWatchers.forEach(w => w.dispose());
}

module.exports = { activate, deactivate };
