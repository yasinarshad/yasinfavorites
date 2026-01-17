# Yasin Favorites

Add files and folders directly to a favorites panel at root level - no mandatory categories required.

![Yasin Favorites Demo](https://raw.githubusercontent.com/yasinarshad/yasinfavorites/main/images/demo.png)

## Features

- **Quick Access Panel** - Dedicated "YASIN FAVORITES" view in the Explorer sidebar
- **Drag & Drop Organization** - Manually reorder favorites with Alt+Up/Down or drag
- **Optional Folders** - Create category folders to organize, or keep everything at root level
- **Full File Operations** - Cut, copy, paste, rename, delete directly from the panel
- **Folder Customization** - Apply colors and emoji badges to folders
- **Keyboard Shortcuts** - All standard shortcuts work (Cmd+C, Cmd+V, etc.)
- **Cross-Extension Integration** - Works with Focus Folder extension

## Installation

1. Open VS Code
2. Go to Extensions (Cmd+Shift+X)
3. Search for "Yasin Favorites"
4. Click Install

## Usage

### Adding Favorites
- Right-click any file or folder in the Explorer
- Select **"Add to Yasin Favorites"**

### Organizing
- **Create folders**: Click the folder icon in the panel header
- **Move items**: Right-click → "Move to Folder" or drag
- **Reorder**: Alt+Up / Alt+Down or right-click → Move Up/Down

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Copy | Cmd+C | Ctrl+C |
| Cut | Cmd+X | Ctrl+X |
| Paste | Cmd+V | Ctrl+V |
| Copy Path | Alt+Cmd+C | Alt+Ctrl+C |
| Rename | Enter | F2 |
| Delete | Cmd+Backspace | Delete |
| Reveal in Finder | Cmd+Shift+R | Ctrl+Shift+R |
| Move Up | Alt+Up | Alt+Up |
| Move Down | Alt+Down | Alt+Down |

## Commands

All commands are available via right-click context menu:

- Add to Yasin Favorites
- Remove from Yasin Favorites
- Move to Folder / Move to Root
- New File / New Folder
- Reveal in Side Bar / Reveal in Finder
- Folder Customization (Color, Emoji Badge)

## Settings

This extension stores favorites in VS Code's settings:

- `yasinFavorites.items` - List of favorited paths
- `yasinFavorites.categories` - List of folder names
- `yasinFavorites.sortOrder` - Sort order (ASC, DESC, MODIFIED, MANUAL)

## Requirements

- VS Code 1.70.0 or higher

## Known Issues

None currently. Please report issues on [GitHub](https://github.com/yasinarshad/yasinfavorites/issues).

## Release Notes

### 1.0.0

- Initial release
- Favorites panel with drag & drop
- Category folders
- Full file operations
- Keyboard shortcuts
- Folder customization

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/yasinarshad/yasinfavorites).

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Enjoy!**
