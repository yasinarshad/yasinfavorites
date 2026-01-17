---
date: 2026-01-16
status: complete
files_affected: [out/extension.js, package.json]
---

# Copy Path Hotkey Fix + FT Extension Bridge Fix

## Goal

Fix Copy Path hotkey and Create Templated Folder command in Yasin Favorites extension.

**Hotkey Change**: Copy Path changed from `Alt+Cmd+C` to `Cmd+Shift+C`

**Success Criteria:**
- [x] Alt+Cmd+C copies path when item is selected (hotkey invocation)
- [x] Right-click → Copy Path still works (context menu invocation)
- [x] Create Templated Folder creates files in correct location (not doubled path)

---

## Problem Statement

### Issue 1: Copy Path Hotkey Not Working
- **Symptom:** Pressing Alt+Cmd+C with an item selected did nothing
- **How discovered:** User tested hotkey after context menu worked
- **Impact:** Had to right-click every time to copy a path

### Issue 2: Create Templated Folder Creating Files in Wrong Location
- **Symptom:** Files created in `/workspace/workspace/path` instead of `/workspace/path`
- **How discovered:** User saw "Skipped creating file" message with doubled path
- **Impact:** Template folders couldn't be created from Yasin Favorites

---

## Root Cause Analysis

### Issue 1: Hotkey Not Working
**Cause A**: When a VS Code command is invoked via **keyboard shortcut**, the `resource` and `selectedItems` parameters are **undefined**. The code was:
```javascript
const items = selectedItems?.length > 0 ? selectedItems : (resource ? [resource] : []);
```
When invoked via hotkey: `selectedItems = undefined`, `resource = undefined`, so `items = []` (empty array).

**Cause B**: Keybinding `when` clause had **quotes** around view ID:
```json
"when": "focusedView == 'yasinFavorites'"  // BROKEN - quotes
"when": "focusedView == yasinFavorites"    // FIXED - no quotes
```
VS Code context keys don't use quotes. Confirmed by examining GitLens extension patterns.

### Issue 2: FT Extension Path Doubling
The FT (Fast Folder Structure) extension's `ts` function treats string paths as relative:
```javascript
// FT extension internal code
return F.Uri.parse(e+"/"+t)  // e = workspace, t = passed path
```
When passed an absolute string path, it incorrectly prepends the workspace root.

---

## Solution Options Considered

### Issue 1: Hotkey Fix

| Option | How It Works | Pros | Cons | Chosen? |
|--------|-------------|------|------|---------|
| Use `treeView.selection` fallback | Check treeView.selection when resource is undefined | Works for all keyboard shortcuts | Requires access to treeView variable | YES |
| Query selection via vscode API | Use `vscode.window.activeTreeView` | Doesn't need treeView reference | API doesn't exist | NO |

### Issue 2: FT Bridge Fix

| Option | How It Works | Pros | Cons | Chosen? |
|--------|-------------|------|------|---------|
| Pass Uri object | `vscode.Uri.file(path)` | FT handles Uri correctly | None | YES |
| Pass relative path | Calculate relative path from workspace | Complex, error-prone | Not reliable | NO |

---

## Implementation

### Changes Made
| File | Change |
|------|--------|
| `out/extension.js:267` | Added `treeView.selection` fallback for `copyPath` |
| `out/extension.js:293` | Added `treeView.selection` fallback for `copyRelativePath` |
| `out/extension.js:427` | Changed `targetDir` to `vscode.Uri.file(targetDir)` for FT bridge |

### Code Pattern - Hotkey Fix
```javascript
// Before (hotkey returns empty array)
const items = selectedItems?.length > 0 ? selectedItems : (resource ? [resource] : []);

// After (falls back to treeView.selection)
const items = selectedItems?.length > 0 ? selectedItems : (resource ? [resource] : treeView.selection);
```

### Code Pattern - FT Bridge Fix
```javascript
// Before (string path - FT prepends workspace root)
vscode.commands.executeCommand('FT.createFolderStructure', targetDir);

// After (Uri object - FT uses fsPath correctly)
vscode.commands.executeCommand('FT.createFolderStructure', vscode.Uri.file(targetDir));
```

---

## Learnings

1. **VS Code commands invoked via hotkey don't receive context parameters** - When a command is triggered by keyboard shortcut instead of context menu, the `resource` and `selectedItems` parameters are undefined. Always implement `treeView.selection` as a fallback for keyboard-invoked commands.

2. **FT (Fast Folder Structure) extension expects Uri objects, not strings** - When passing a string path, FT's internal `ts` function treats it as a relative path and concatenates it with the workspace root: `return F.Uri.parse(e+"/"+t)`. This causes doubled paths like `/workspace/workspace/actual/path`. Pass `vscode.Uri.file(path)` to avoid this.

3. **The fallback chain for tree view commands should be: selectedItems → resource → treeView.selection** - This covers all three invocation methods: multi-select context menu, single-item context menu, and keyboard shortcut.

---

## Open Questions

- [x] All issues fixed and working
