# CodeMirror Cursor Scroll Fix

> Date: 2026-01-01
> Version: V1.76

## Problem

When switching from Plain Text Editor to CodeMirror Editor, the cursor position was not being scrolled to the correct location. The editor would render at the top of the page instead of at the cursor position.

### Symptoms
- Editor displays at initial position (top of page) after switching
- Manual scroll position calculations were incorrect
- Flash/jump effect during initialization

## Root Cause

### Coordinate System Confusion

The `coordsAtPos()` method returns coordinates relative to the **viewport**, but `scrollDOM.scrollTop` requires coordinates relative to the **scrollDOM content**. Attempting to use these values directly without proper conversion led to incorrect scroll positions.

### Previous Incorrect Approach

```typescript
// WRONG: coordsAtPos returns viewport coordinates
const cursorCoords = view.coordsAtPos(initialCursor.start);
const targetScrollTop = cursorCoords.top - (viewportHeight / 2);
scrollDOM.scrollTop = targetScrollTop;  // Incorrect!
```

## Solution

Use CodeMirror's built-in `scrollIntoView` effect, which handles all coordinate conversions and timing internally:

```typescript
view.dispatch({
  selection: { anchor: initialCursor.start, head: initialCursor.end },
  effects: EditorView.scrollIntoView(initialCursor.start, { y: 'center' })
});
```

### Key Benefits

1. **Correct Coordinates**: CodeMirror handles viewport-to-content coordinate conversion internally
2. **Proper Timing**: The effect is applied at the correct moment in CodeMirror's update cycle
3. **Performance**: No manual DOM measurements or multiple requestAnimationFrame calls
4. **Simplicity**: Clean, declarative code

## Files Modified

- `components/CodeMirrorEditor.tsx` - useEffect for cursor initialization

## Implementation Details

### Before (Incorrect)

```typescript
useEffect(() => {
  if (!viewRef.current || !initialCursor) return;
  
  const view = viewRef.current;
  
  // Manual coordinate calculation - prone to errors
  const cursorCoords = view.coordsAtPos(initialCursor.start);
  const scrollDOM = view.scrollDOM;
  const scrollDOMRect = scrollDOM.getBoundingClientRect();
  
  // Complex coordinate conversion
  const cursorInContentTop = cursorCoords.top - scrollDOMRect.top + scrollDOM.scrollTop;
  const targetScrollTop = cursorInContentTop - (viewportHeight / 2);
  
  scrollDOM.scrollTop = Math.max(0, targetScrollTop);
}, [initialCursor]);
```

### After (Correct)

```typescript
useEffect(() => {
  if (!viewRef.current || !initialCursor) return;
  
  const view = viewRef.current;
  
  // Check if initialization is needed
  const currentSelection = view.state.selection.main;
  const needsInitialization = !initializedRef.current ||
    currentSelection.from !== initialCursor.start ||
    currentSelection.to !== initialCursor.end;
  
  if (!needsInitialization) return;
  initializedRef.current = true;
  
  // Use CodeMirror's built-in scrollIntoView effect
  view.dispatch({
    selection: { anchor: initialCursor.start, head: initialCursor.end },
    effects: EditorView.scrollIntoView(initialCursor.start, { y: 'center' })
  });
  
  // Remove initialization state after brief delay
  requestAnimationFrame(() => {
    setIsInitializing(false);
  });
}, [initialCursor]);
```

## CodeMirror Scroll API Reference

### EditorView.scrollIntoView

```typescript
scrollIntoView(position: number, options?: { y?: 'start' | 'center' | 'end', x?: 'start' | 'center' | 'end' })
```

- **position**: Character position to scroll to
- **y**: Vertical alignment ('start', 'center', 'end')
- **x**: Horizontal alignment ('start', 'center', 'end')

### Usage Examples

```typescript
// Scroll to position with center vertical alignment
EditorView.scrollIntoView(pos, { y: 'center' })

// Scroll to start of line
EditorView.scrollIntoView(pos, { y: 'start' })

// Scroll to end with center both axes
EditorView.scrollIntoView(pos, { y: 'end', x: 'center' })
```

## Lessons Learned

1. **Use Native APIs**: When a library provides functionality (like scrolling), use it instead of manual implementations
2. **Understand Coordinate Systems**: Browser APIs use different coordinate systems (viewport, document, relative to elements)
3. **Trust the Framework**: CodeMirror's internal state system knows best when and how to apply effects

## Related Documentation

- CodeMirror View API: https://codemirror.net/docs/ref/#view.EditorView.scrollIntoView
