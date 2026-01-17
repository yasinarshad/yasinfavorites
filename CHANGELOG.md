# Changelog

All notable changes to the "Yasin Favorites" extension will be documented in this file.

## [1.0.1] - 2026-01-17

### Fixed
- Added Cmd+Shift+C keybinding for Copy Path (standard shortcut)
- Changed notifications to status bar (auto-dismisses after 2 seconds)

> **Dev note:** Changed `showInformationMessage` → `setStatusBarMessage` in extension.js:288,320. Added keybinding with `when: "focusedView == yasinFavorites"` to avoid conflict with copy-path-notify's broader `explorerViewletFocus`. User keybindings.json may override—check `~/Library/Application Support/Code/User/keybindings.json` if issues arise.

## [1.0.0] - 2025-01-17

### Added
- Initial release
- Favorites panel in Explorer sidebar
- Add files and folders to favorites via right-click
- Create category folders for organization
- Drag and drop reordering (Alt+Up/Down)
- Full file operations (cut, copy, paste, rename, delete)
- Folder customization (colors, emoji badges)
- Keyboard shortcuts for all operations
- Integration with Focus Folder extension
- Sort options (A-Z, Z-A, Modified, Manual)
