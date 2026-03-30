# Phase 8: Pretext Text Rendering - Research

**Researched:** 2026-03-30
**Domain:** DOM-free text measurement library (pretext) and TUI applicability
**Confidence:** HIGH

## Summary

Pretext is a JavaScript/TypeScript library by Cheng Lou that achieves fast text measurement by avoiding expensive DOM operations (`getBoundingClientRect`, `offsetHeight`) and using Canvas `measureText` instead. The library separates work into two phases: a one-time `prepare()` that caches text measurements via Canvas, and a hot-path `layout()` that performs pure arithmetic over cached widths.

**Critical finding for TUI applicability:** Pretext CANNOT work in a terminal environment. It requires a browser Canvas API that does not exist in TUIs. The 500x performance claim specifically refers to DOM-based text measurement in browsers, not terminal rendering. The TUI architecture uses `unicode-width` for character width calculation, which is the appropriate approach for fixed-width terminal rendering.

**Verdict: INFEASIBLE** - Pretext is fundamentally a browser library. Its core innovation (Canvas-based text measurement to avoid DOM reflow) does not translate to terminal environments.

---

## User Constraints (from CONTEXT.md)

### Phase Description
Phase 8: Pretext Text Rendering - Research pretext for TUI text measurement and evaluate feasibility for 500x DOM-rendering performance improvement.

### Success Criteria
1. Researched pretext architecture and DOM-free text measurement approach
2. Evaluated pretext applicability to TUI (terminal) environment
3. Identified integration points and potential performance gains

### Research Prompt
https://github.com/chenglou/pretext - Research this DOM-free text measurement library claiming 500x faster rendering

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| Phase 8 | Research pretext for TUI text measurement feasibility | Pretext architecture analysis complete; TUI applicability evaluated |

---

## What is Pretext?

Pretext is a pure JavaScript/TypeScript library for **multiline text measurement and layout without DOM manipulation**.

### Core Problem It Solves

In browsers, measuring text requires DOM elements and triggers expensive layout reflow:
- `getBoundingClientRect()` forces layout recalculation
- `offsetHeight` / `offsetWidth` have similar costs
- Repeated measurements compound the cost exponentially

### Pretext's Solution

1. **`prepare(text, fontSpec)`** - One-time cost:
   - Normalizes whitespace
   - Segments text into meaningful units
   - Applies typographic glue rules
   - **Measures segments using Canvas `measureText()`**
   - Returns an opaque handle with cached widths

2. **`layout(preparedHandle, width, lineHeight)`** - Hot path:
   - Pure arithmetic over cached widths
   - No DOM access, no reflow
   - Returns `{ height, lineCount }`

### Performance Claims

| Operation | Time (500-text batch) |
|-----------|----------------------|
| `prepare()` | ~19ms |
| `layout()` | ~0.09ms |

The 500x speedup claim refers to: **Canvas-based cached measurement vs DOM's forced reflow**

### API Example

```typescript
// Use case 1: Simple height/lineCount measurement
const prepared = prepare(text, '16px Inter')
const { height, lineCount } = layout(prepared, textWidth, 20)

// Use case 2: Manual line layout control
const segments = prepareWithSegments(text, '16px Inter')
for (const lineRange of walkLineRanges(segments, textWidth)) {
  const line = layoutNextLine(segments, textWidth, lineRange)
  // render line to Canvas/SVG/DOM
}
```

### Browser Dependencies

- **Canvas API** - Required for `measureText()` to get font metrics
- **Browser font engine** - Used as ground truth for measurements
- **No DOM required** for measurement phase

---

## TUI Architecture Analysis

### Current Stack

| Component | Library | Purpose |
|-----------|---------|---------|
| TUI Framework | `ratatui` 0.29 | Terminal UI rendering |
| Backend | `crossterm` 0.29 | Terminal I/O |
| Text Width | `unicode-width` 0.1 | Character width calculation |
| Text Storage | `ropey` 1 | Efficient text buffer |
| Markdown | `pulldown-cmark` 0.12 | Markdown parsing |

### Current Text Measurement Implementation

The TUI uses `unicode-width` crate for character width calculation:

```rust
// From chat.rs:596
let ch_width = UnicodeWidthChar::width(ch).unwrap_or(1).max(1);

// From chat.rs:646 - bubble width calculation
let natural_width = content
    .lines()
    .map(UnicodeWidthStr::width)
    .max()
    .unwrap_or(0)
    .max(1);
```

Text wrapping is implemented manually in `wrap_text_lines()` (chat.rs:581-618):
- Iterates character by character
- Uses `UnicodeWidthChar::width()` for each character
- Breaks lines when width exceeds `max_width`
- Handles multi-byte Unicode characters correctly

### Key Differences: Browser vs Terminal

| Aspect | Browser | Terminal |
|--------|---------|----------|
| Rendering surface | Pixel-based (Canvas/DOM) | Character-based (fixed grid) |
| Text measurement | Canvas `measureText()` or DOM | `unicode-width` crate |
| Reflow trigger | DOM mutations | None (character grid is fixed) |
| Font rendering | Operating system font engine | Terminal emulator font |
| Line breaking | CSS-dependent | Character width-dependent |

---

## Feasibility Analysis

### Why Pretext CANNOT Work in TUI

1. **Canvas API does not exist in terminals**
   - Pretext's core innovation relies on `Canvas.measureText()`
   - Terminals render text as characters, not pixels
   - No equivalent API in terminal environments

2. **No DOM reflow problem in terminals**
   - Pretext solves DOM-induced reflow costs
   - Terminals have no DOM
   - Text rendering goes directly to a character buffer

3. **500x claim is browser-specific**
   - The comparison is: Canvas measurement vs DOM `getBoundingClientRect`
   - This benchmark is meaningless for terminal rendering
   - Terminals don't have `getBoundingClientRect`

4. **Font rendering differs fundamentally**
   - Browser: Render text at pixel level via font engine
   - Terminal: Determine which character cell each character occupies
   - Different APIs, different metrics

### What COULD Be Applied (Principles Only)

Pretext's principles could inspire TUI optimizations, but require different implementation:

| Pretext Principle | TUI Equivalent | Current State |
|-------------------|----------------|---------------|
| Cache measurements | Pre-compute line widths | Not implemented |
| Separate prepare/layout | Cache wrapped line layouts | Not implemented |
| Avoid re-measurement | Memoize text width calculations | Partially exists |

### Rust Alternatives for TUI Text Measurement

| Library | Status | Notes |
|---------|--------|-------|
| `unicode-width` | Standard | Already in use, appropriate for terminals |
| `ropey` | Standard | Already in use for text storage |
| `simpler-user-tek` | Alternative | May provide faster measurement |
| `cosmic-text` | Alternative | Rich text in TUI contexts |

**No Canvas-like API exists for Rust terminal applications.**

---

## Common Pitfalls

### Misunderstanding Performance Claims

**Pitfall:** Interpreting 500x speedup as "pretext is 500x faster than any other text measurement"

**Reality:** The 500x claim specifically compares Canvas `measureText()` to DOM `getBoundingClientRect()` in browsers. It does NOT claim superiority over all other text measurement approaches, and does NOT apply to terminal environments.

**Verification:** See pretext GitHub README benchmarks section

### Assuming DOM-free Means Server-side Ready

**Pitfall:** Assuming "DOM-free" means pretext works outside browsers

**Reality:** Pretext is DOM-free but NOT DOM-less. It still requires Canvas API which is a browser API. Server-side rendering is listed as "coming soon" in the README but is not implemented.

### Looking for Canvas Equivalents in Terminals

**Pitfall:** Searching for terminal "Canvas" or "measureText" equivalents

**Reality:** Terminals fundamentally differ from browsers in how they handle text. There is no Canvas-like API because terminals don't render at pixel level.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified - this is a research phase, not implementation)

---

## Sources

### Primary (HIGH confidence)
- [pretext GitHub README](https://github.com/chenglou/pretext) - Architecture, API, performance claims
- [pretext repository metadata](https://api.github.com/repos/chenglou/pretext) - Activity status (active, 16k stars)
- `tui-notebook/src/components/chat.rs` - Current text wrapping implementation
- `tui-notebook/Cargo.toml` - Current dependency stack

### Secondary (MEDIUM confidence)
- WebFetch of pretext README - Confirmed Canvas dependency and server-side status

---

## Metadata

**Confidence breakdown:**
- Pretext architecture: HIGH - Official docs verified
- Canvas dependency: HIGH - Explicitly stated in README
- TUI in applicability: HIGH - Based on fundamental architectural differences
- Performance claims context: HIGH - Verified from official source

**Research date:** 2026-03-30
**Valid until:** 2026-04-29 (30 days - library appears stable)

---

## Recommendation

### For Phase 8 Implementation

**Do NOT attempt to integrate pretext** - it is fundamentally incompatible with terminal environments due to Canvas API requirement.

### If Performance Improvement is Needed

Consider these Rust-native approaches:
1. **Cache wrapped line layouts** - Pre-compute and cache text layout instead of re-wrapping on every render
2. **Use `ropey` for efficient text operations** - Already a dependency, can optimize character iteration
3. **Batch text width calculations** - Measure once, cache, reuse

### If Research Phase Wants Concrete Output

Consider investigating:
1. `unicode-width` alternatives that may be faster
2. Memoization strategies for text layout in TUI context
3. Whether the TUI actually has a performance problem worth solving

---

## Open Questions

1. **Is there an actual measured performance problem in TUI text rendering?**
   - What we know: The TUI uses `unicode-width` which is O(n) per character
   - What's unclear: Whether this is actually a bottleneck in practice
   - Recommendation: Profile first before optimizing

2. **What would "500x improvement" even mean for TUI?**
   - What we know: Pretext's 500x is DOM vs Canvas in browsers
   - What's unclear: What the equivalent benchmark would be for terminals
   - Recommendation: Define concrete metrics (e.g., "reduce chat panel render time from Xms to Yms")

3. **Is server-side pretext available now?**
   - What we know: README says "soon, server-side" but no timeline
   - What's unclear: Whether any fork or alternative exists
   - Recommendation: Check pretext repository for updates (research only, still won't help)
