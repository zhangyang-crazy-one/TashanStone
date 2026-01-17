# Editor UI Fixes

> Date: 2026-01-12
> Status: Fixed

## Issues Addressed

### 1. Editor Button Unresponsive
**Symptom:** Clicking the "Editor" button in the toolbar dropdown had no effect when in Split View.
**Root Cause:** The "Editor" button only updated the `viewMode` state but failed to reset the `splitMode` state. The `SplitEditor` component relies on `splitMode` to determine whether to show single or multiple panes.
**Fix:** Updated `Toolbar.tsx` to explicitly set `splitMode` to `'none'` when switching to "Editor" or "Preview" view modes.

### 2. Blank Screen / Delayed Rendering
**Symptom:** When switching views, the editor area would sometimes appear black or blank, showing only the character count, until clicked.
**Root Cause:** CodeMirror layout was not automatically refreshing when its container size changed or when it became visible after being hidden (e.g., switching from Split to Single view).
**Fix:** Added a `ResizeObserver` and layout refresh timers in `CodeMirrorEditor.tsx` to force `view.requestMeasure()` whenever the container resizes or mounts.

## Changes

### `components/Toolbar.tsx`
- Modified "Editor" and "Preview" dropdown items to call `onSplitModeChange('none')`.
- Modified "Single View" toggle button to also set `viewMode` to `Editor`.
- Modified "Split" toggle buttons to also set `viewMode` to `Split`.

### `components/CodeMirrorEditor.tsx`
- Added `ResizeObserver` to monitor container size changes.
- Added delayed `requestMeasure()` calls to handle animation transitions.

## Verification
- [x] Click "Editor" in toolbar -> Switches to single pane editor.
- [x] Click "Preview" in toolbar -> Switches to single pane preview.
- [x] Click "Split" icons -> Switches to split view and updates view mode.
- [x] Editor content renders immediately without needing a click.
