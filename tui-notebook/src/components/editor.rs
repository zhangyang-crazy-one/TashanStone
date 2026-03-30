//! Editor component - Markdown editing with syntax highlighting
//!
//! Supports:
//! - Wiki links [[]] with navigation
//! - Block references ((id))
//! - Syntax highlighting via tree-sitter

use crate::action::{Action, EditorAction};
use crate::i18n::{Language, TextKey};
use crossterm::event::KeyEvent;
use image::ImageReader;
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Clear, Paragraph},
    Frame,
};
use ratatui_image::{picker::Picker, protocol::StatefulProtocol, Resize, StatefulImage};
use ropey::Rope;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

const DEFAULT_PREVIEW_FONT_SIZE: (u16, u16) = (10, 20);
const MIN_PREVIEW_IMAGE_HEIGHT: u16 = 6;
const MAX_PREVIEW_IMAGE_HEIGHT: u16 = 18;
const MAX_EDIT_HISTORY: usize = 256;

/// Editor state
pub struct Editor {
    /// Document buffer
    buffer: Rope,
    /// Current file path
    current_file: Option<String>,
    /// Is modified
    is_modified: bool,
    /// Cursor position
    cursor_line: usize,
    cursor_col: usize,
    /// Scroll offset
    scroll_offset: usize,
    /// Horizontal scroll offset in terminal cells
    horizontal_scroll: usize,
    /// Last known visible editor viewport size inside the border
    viewport_width: u16,
    viewport_height: u16,
    /// Parsed link spans in the document
    links: RefCell<Vec<EditorLink>>,
    /// Block references (id -> location)
    block_refs: RefCell<HashMap<String, BlockRef>>,
    /// Whether link/block analysis needs to be rebuilt from the buffer
    document_index_dirty: Cell<bool>,
    /// Monotonic version used to invalidate preview render cache on edits
    document_version: Cell<u64>,
    /// Snapshot used to determine whether the current buffer is dirty
    saved_snapshot: Rope,
    /// Modified files pending save
    modified_files: HashMap<String, Rope>,
    /// Undo history entries
    undo_stack: Vec<EditHistoryEntry>,
    /// Redo history entries
    redo_stack: Vec<EditHistoryEntry>,
    /// Workspace root for resolving image paths
    workspace_root: Option<PathBuf>,
    /// Terminal image protocol picker initialized after entering alt screen
    preview_picker: RefCell<Option<Picker>>,
    /// Cached image protocols keyed by resolved file path
    preview_image_cache: RefCell<HashMap<PathBuf, PreviewImageCacheEntry>>,
    /// Cached preview render keyed by content width
    preview_render_cache: RefCell<HashMap<u16, PreviewRenderCacheValue>>,
    /// Current UI language
    language: Language,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CursorSnapshot {
    line: usize,
    column: usize,
    scroll_offset: usize,
    horizontal_scroll: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditKind {
    Insert,
    Paste,
    Backspace,
    Delete,
    Cut,
}

#[derive(Debug, Clone)]
struct EditHistoryEntry {
    before: Rope,
    after: Rope,
    before_cursor: CursorSnapshot,
    after_cursor: CursorSnapshot,
    kind: EditKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditorLinkKind {
    Wiki,
    Markdown,
    Image,
}

/// Parsed link in the document with visible screen coordinates.
#[derive(Debug, Clone)]
pub struct EditorLink {
    pub kind: EditorLinkKind,
    pub line: usize,
    pub start_col: usize,
    pub end_col: usize,
    pub target: String,
    pub label: Option<String>,
    pub raw_text: String,
}

/// Block reference
#[derive(Debug, Clone)]
pub struct BlockRef {
    pub id: String,
    pub file_path: String,
    pub line: usize,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviewTargetKind {
    MarkdownLink,
    WikiLink,
    BlockRef,
    Image,
}

#[derive(Debug, Clone)]
pub struct PreviewHit {
    pub line: usize,
    pub start_col: usize,
    pub end_col: usize,
    pub kind: PreviewTargetKind,
    pub target: String,
    pub label: String,
}

#[derive(Debug, Clone, Default)]
struct PreviewRender {
    lines: Vec<Line<'static>>,
    hits: Vec<PreviewHit>,
    images: Vec<PreviewImageBlock>,
}

#[derive(Debug, Clone)]
struct PreviewImageBlock {
    start_line: usize,
    height: usize,
    path: PathBuf,
}

enum PreviewImageCacheEntry {
    Ready(StatefulProtocol),
    Failed(String),
}

#[derive(Debug, Clone)]
struct PreviewRenderCacheValue {
    document_version: u64,
    render: PreviewRender,
}

/// Markdown block types for rendering
#[derive(Debug, Clone)]
enum MdBlock {
    /// Heading with level
    Heading { level: u8, content: InlineLine },
    /// Paragraph text
    Paragraph { lines: Vec<InlineLine> },
    /// Code block with language and content
    CodeBlock { language: String, code: String },
    /// Mermaid block fallback
    Mermaid { code: String },
    /// Table with rows
    Table {
        header: Vec<InlineLine>,
        rows: Vec<Vec<InlineLine>>,
        alignments: Vec<Alignment>,
    },
    /// Block quote
    BlockQuote {
        kind: Option<CalloutKind>,
        title: Option<InlineLine>,
        collapsed: bool,
        lines: Vec<InlineLine>,
        depth: usize,
    },
    /// List item (ordered or unordered)
    ListItem {
        ordered: bool,
        number: Option<u64>,
        checked: Option<bool>,
        indent: usize,
        lines: Vec<InlineLine>,
    },
    /// Standalone image fallback
    Image { alt: InlineLine, src: String },
    /// HTML block fallback
    HtmlBlock { raw: String },
    /// Footnote definition fallback
    FootnoteDefinition {
        label: String,
        lines: Vec<InlineLine>,
    },
    /// Display math fallback
    DisplayMath { text: String },
    /// Horizontal rule
    HorizontalRule,
}

type InlineLine = Vec<InlineSegment>;

#[derive(Debug, Clone, PartialEq, Eq)]
enum InlineRole {
    Text,
    Code,
    Link,
    WikiLink,
    Tag,
    FootnoteReference,
    Html,
    Kbd,
    BlockRef,
    Image,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct InlineSegment {
    text: String,
    role: InlineRole,
    target: Option<String>,
    strong: bool,
    emphasis: bool,
    strikethrough: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CalloutKind {
    Note,
    Abstract,
    Info,
    Tip,
    Success,
    Question,
    Important,
    Warning,
    Failure,
    Danger,
    Bug,
    Example,
    Quote,
    Caution,
}

/// Table column alignment
#[derive(Debug, Clone)]
enum Alignment {
    Left,
    Center,
    Right,
    None,
}

impl MdBlock {
    /// Calculate the height this block needs for rendering
    fn calculate_height(&self, width: u16) -> u16 {
        preview_block_to_lines(self, width).len() as u16
    }
}

fn map_preview_scroll(
    editor_scroll: usize,
    editor_max_scroll: usize,
    preview_max_scroll: usize,
) -> usize {
    if editor_max_scroll == 0 || preview_max_scroll == 0 {
        return 0;
    }

    let mapped = editor_scroll.saturating_mul(preview_max_scroll);
    (mapped + editor_max_scroll / 2) / editor_max_scroll
}

#[derive(Debug, Clone, Default)]
struct InlineBuilder {
    lines: Vec<InlineLine>,
}

impl InlineBuilder {
    fn new() -> Self {
        Self {
            lines: vec![Vec::new()],
        }
    }

    fn is_empty(&self) -> bool {
        self.lines
            .iter()
            .flatten()
            .all(|segment| segment.text.is_empty())
    }

    fn ensure_line(&mut self) {
        if self.lines.is_empty() {
            self.lines.push(Vec::new());
        }
    }

    fn last_segment_text(&self) -> Option<&str> {
        self.lines
            .last()?
            .last()
            .map(|segment| segment.text.as_str())
    }

    fn push_segment(&mut self, segment: InlineSegment) {
        if segment.text.is_empty() {
            return;
        }

        self.ensure_line();
        let current = self.lines.last_mut().expect("line exists");
        if let Some(last) = current.last_mut() {
            if last.role == segment.role
                && last.target == segment.target
                && last.strong == segment.strong
                && last.emphasis == segment.emphasis
                && last.strikethrough == segment.strikethrough
            {
                last.text.push_str(&segment.text);
                return;
            }
        }
        current.push(segment);
    }

    fn push_plain_text(&mut self, text: &str, strong: bool, emphasis: bool, strikethrough: bool) {
        for segment in parse_special_inline_segments(text, strong, emphasis, strikethrough) {
            self.push_segment(segment);
        }
    }

    fn push_break(&mut self) {
        self.ensure_line();
        self.lines.push(Vec::new());
    }

    fn take_lines(&mut self) -> Vec<InlineLine> {
        let taken = std::mem::take(&mut self.lines);
        self.lines = vec![Vec::new()];
        normalize_inline_lines(taken)
    }
}

#[derive(Debug, Clone, Default)]
struct InlineStyleContext {
    emphasis_depth: usize,
    strong_depth: usize,
    strikethrough_depth: usize,
    link_targets: Vec<String>,
    link_suppressed: Vec<bool>,
    kbd_depth: usize,
}

impl InlineStyleContext {
    fn emphasis(&self) -> bool {
        self.emphasis_depth > 0
    }

    fn strong(&self) -> bool {
        self.strong_depth > 0
    }

    fn strikethrough(&self) -> bool {
        self.strikethrough_depth > 0
    }

    fn active_link(&self) -> Option<String> {
        match (self.link_targets.last(), self.link_suppressed.last()) {
            (Some(target), Some(false)) => Some(target.clone()),
            _ => None,
        }
    }

    fn push_link(&mut self, target: String, suppressed: bool) {
        self.link_targets.push(target);
        self.link_suppressed.push(suppressed);
    }

    fn pop_link(&mut self) {
        self.link_targets.pop();
        self.link_suppressed.pop();
    }
}

#[derive(Debug, Clone)]
struct QuoteBuilder {
    kind: Option<CalloutKind>,
    depth: usize,
    builder: InlineBuilder,
}

#[derive(Debug, Clone)]
struct ListFrame {
    ordered: bool,
    next_number: u64,
}

#[derive(Debug, Clone)]
struct ListItemBuilder {
    ordered: bool,
    number: Option<u64>,
    checked: Option<bool>,
    indent: usize,
    emitted_fragment: bool,
    builder: InlineBuilder,
}

#[derive(Debug, Clone)]
struct ImageAccumulator {
    src: String,
    alt: InlineBuilder,
}

#[derive(Debug, Clone)]
struct FootnoteBuilder {
    label: String,
    builder: InlineBuilder,
}

#[derive(Debug, Clone, Default)]
struct TableBuilder {
    alignments: Vec<Alignment>,
    header: Vec<InlineLine>,
    rows: Vec<Vec<InlineLine>>,
    current_row: Vec<InlineLine>,
    current_cell: InlineBuilder,
    in_header: bool,
    in_row: bool,
}

fn make_segment(
    text: String,
    role: InlineRole,
    target: Option<String>,
    strong: bool,
    emphasis: bool,
    strikethrough: bool,
) -> InlineSegment {
    InlineSegment {
        text,
        role,
        target,
        strong,
        emphasis,
        strikethrough,
    }
}

fn expand_special_text_segments(line: InlineLine) -> InlineLine {
    let mut expanded = Vec::new();

    for segment in line {
        if segment.role == InlineRole::Text {
            expanded.extend(parse_special_inline_segments(
                &segment.text,
                segment.strong,
                segment.emphasis,
                segment.strikethrough,
            ));
        } else {
            expanded.push(segment);
        }
    }

    let mut merged: Vec<InlineSegment> = Vec::new();
    for segment in expanded {
        if let Some(last) = merged.last_mut() {
            if last.role == segment.role
                && last.target == segment.target
                && last.strong == segment.strong
                && last.emphasis == segment.emphasis
                && last.strikethrough == segment.strikethrough
            {
                last.text.push_str(&segment.text);
                continue;
            }
        }
        merged.push(segment);
    }

    merged
}

fn normalize_inline_lines(mut lines: Vec<InlineLine>) -> Vec<InlineLine> {
    for line in &mut lines {
        *line = expand_special_text_segments(std::mem::take(line));
    }

    while lines.len() > 1 && lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }
    if lines.is_empty() {
        lines.push(Vec::new());
    }
    lines
}

fn plain_text_from_line(line: &InlineLine) -> String {
    line.iter().map(|segment| segment.text.as_str()).collect()
}

fn plain_text_from_lines(lines: &[InlineLine], separator: &str) -> String {
    lines
        .iter()
        .map(plain_text_from_line)
        .collect::<Vec<_>>()
        .join(separator)
}

fn flatten_inline_lines(lines: Vec<InlineLine>, separator: &str) -> InlineLine {
    let mut merged = Vec::new();
    for (index, line) in lines.into_iter().enumerate() {
        if index > 0 && !separator.is_empty() {
            merged.push(make_segment(
                separator.to_string(),
                InlineRole::Text,
                None,
                false,
                false,
                false,
            ));
        }
        merged.extend(line);
    }
    merged
}

fn paragraph_from_lines(lines: Vec<InlineLine>) -> MdBlock {
    let visible_lines = normalize_inline_lines(lines);
    if visible_lines.len() == 1 {
        let line = &visible_lines[0];
        if line.len() == 1 && matches!(line[0].role, InlineRole::Image) {
            return MdBlock::Image {
                alt: vec![make_segment(
                    line[0].text.clone(),
                    InlineRole::Text,
                    None,
                    false,
                    false,
                    false,
                )],
                src: line[0].target.clone().unwrap_or_default(),
            };
        }
    }

    MdBlock::Paragraph {
        lines: visible_lines,
    }
}

fn emit_paragraph(blocks: &mut Vec<MdBlock>, builder: &mut InlineBuilder, active: &mut bool) {
    if !*active || builder.is_empty() {
        *active = false;
        return;
    }

    blocks.push(paragraph_from_lines(builder.take_lines()));
    *active = false;
}

fn emit_item_fragment(blocks: &mut Vec<MdBlock>, item: &mut ListItemBuilder) {
    if item.builder.is_empty() {
        return;
    }

    blocks.push(MdBlock::ListItem {
        ordered: item.ordered,
        number: item.number,
        checked: item.checked,
        indent: item.indent,
        lines: item.builder.take_lines(),
    });
    item.emitted_fragment = true;
}

fn flush_active_item_fragment(blocks: &mut Vec<MdBlock>, item_stack: &mut [ListItemBuilder]) {
    if let Some(item) = item_stack.last_mut() {
        emit_item_fragment(blocks, item);
    }
}

fn push_text_with_context(builder: &mut InlineBuilder, text: &str, context: &InlineStyleContext) {
    if let Some(link_target) = context.active_link() {
        builder.push_segment(make_segment(
            text.to_string(),
            InlineRole::Link,
            Some(link_target),
            context.strong(),
            context.emphasis(),
            context.strikethrough(),
        ));
    } else if context.kbd_depth > 0 {
        builder.push_segment(make_segment(
            text.to_string(),
            InlineRole::Kbd,
            None,
            context.strong(),
            context.emphasis(),
            context.strikethrough(),
        ));
    } else {
        builder.push_plain_text(
            text,
            context.strong(),
            context.emphasis(),
            context.strikethrough(),
        );
    }
}

fn is_tag_boundary(text: &str, byte_idx: usize) -> bool {
    if byte_idx == 0 {
        return true;
    }

    text[..byte_idx]
        .chars()
        .last()
        .map(|ch| !(ch.is_alphanumeric() || matches!(ch, '_' | '-' | '/')))
        .unwrap_or(true)
}

fn scan_tag(text: &str, start: usize) -> Option<usize> {
    let rest = &text[start..];
    if let Some(inner) = rest.strip_prefix("#[") {
        let close = inner.find(']')?;
        if close == 0 {
            return None;
        }
        return Some(start + 2 + close + 1);
    }

    let mut end = start + '#'.len_utf8();
    let mut consumed = false;
    for ch in text[end..].chars() {
        if ch.is_alphanumeric() || matches!(ch, '_' | '-' | '/') {
            end += ch.len_utf8();
            consumed = true;
        } else {
            break;
        }
    }

    consumed.then_some(end)
}

fn split_target_alias(inner: &str) -> (String, Option<String>) {
    if let Some(pipe) = inner.find('|') {
        let target = inner[..pipe].trim().to_string();
        let label = inner[pipe + 1..].trim();
        let label = (!label.is_empty()).then(|| label.to_string());
        (target, label)
    } else {
        (inner.trim().to_string(), None)
    }
}

fn default_image_label(target: &str) -> String {
    let path_part = target
        .split('#')
        .next()
        .unwrap_or(target)
        .split('?')
        .next()
        .unwrap_or(target)
        .trim();

    Path::new(path_part)
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .or_else(|| {
            Path::new(path_part)
                .file_name()
                .and_then(|name| name.to_str())
                .filter(|name| !name.is_empty())
        })
        .unwrap_or_default()
        .to_string()
}

fn is_image_target(target: &str) -> bool {
    let path_part = target
        .split('#')
        .next()
        .unwrap_or(target)
        .split('?')
        .next()
        .unwrap_or(target)
        .trim();

    Path::new(path_part)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "avif"
            )
        })
        .unwrap_or(false)
}

fn parse_special_inline_segments(
    text: &str,
    strong: bool,
    emphasis: bool,
    strikethrough: bool,
) -> Vec<InlineSegment> {
    let mut segments = Vec::new();
    let mut index = 0;
    let mut plain_start = 0;

    while index < text.len() {
        let rest = &text[index..];

        if rest.starts_with("![[") {
            if let Some(close_offset) = rest.find("]]") {
                if plain_start < index {
                    segments.push(make_segment(
                        text[plain_start..index].to_string(),
                        InlineRole::Text,
                        None,
                        strong,
                        emphasis,
                        strikethrough,
                    ));
                }

                let inner = &rest[3..close_offset];
                let (target, label) = split_target_alias(inner);
                if !target.is_empty() {
                    let role = if is_image_target(&target) {
                        InlineRole::Image
                    } else {
                        InlineRole::WikiLink
                    };
                    let label = label.unwrap_or_else(|| {
                        if role == InlineRole::Image {
                            default_image_label(&target)
                        } else {
                            target.clone()
                        }
                    });

                    segments.push(make_segment(
                        label,
                        role,
                        Some(target),
                        strong,
                        emphasis,
                        strikethrough,
                    ));
                }

                index += close_offset + 2;
                plain_start = index;
                continue;
            }
        }

        if rest.starts_with("[[") {
            if let Some(close_offset) = rest.find("]]") {
                if plain_start < index {
                    segments.push(make_segment(
                        text[plain_start..index].to_string(),
                        InlineRole::Text,
                        None,
                        strong,
                        emphasis,
                        strikethrough,
                    ));
                }

                let inner = &rest[2..close_offset];
                let (target, label) = split_target_alias(inner);
                let label = label.unwrap_or_else(|| target.clone());

                if !target.is_empty() {
                    segments.push(make_segment(
                        label,
                        InlineRole::WikiLink,
                        Some(target),
                        strong,
                        emphasis,
                        strikethrough,
                    ));
                }

                index += close_offset + 2;
                plain_start = index;
                continue;
            }
        }

        if rest.starts_with("((") {
            if let Some(close_offset) = rest.find("))") {
                if plain_start < index {
                    segments.push(make_segment(
                        text[plain_start..index].to_string(),
                        InlineRole::Text,
                        None,
                        strong,
                        emphasis,
                        strikethrough,
                    ));
                }

                let inner = rest[2..close_offset].trim().to_string();
                if !inner.is_empty() {
                    segments.push(make_segment(
                        format!("(({}))", inner),
                        InlineRole::BlockRef,
                        Some(inner),
                        strong,
                        emphasis,
                        strikethrough,
                    ));
                }

                index += close_offset + 2;
                plain_start = index;
                continue;
            }
        }

        if rest.starts_with('#') && is_tag_boundary(text, index) {
            if let Some(tag_end) = scan_tag(text, index) {
                if plain_start < index {
                    segments.push(make_segment(
                        text[plain_start..index].to_string(),
                        InlineRole::Text,
                        None,
                        strong,
                        emphasis,
                        strikethrough,
                    ));
                }

                segments.push(make_segment(
                    text[index..tag_end].to_string(),
                    InlineRole::Tag,
                    None,
                    strong,
                    emphasis,
                    strikethrough,
                ));
                index = tag_end;
                plain_start = tag_end;
                continue;
            }
        }

        let ch = rest.chars().next().expect("character exists");
        index += ch.len_utf8();
    }

    if plain_start < text.len() {
        segments.push(make_segment(
            text[plain_start..].to_string(),
            InlineRole::Text,
            None,
            strong,
            emphasis,
            strikethrough,
        ));
    }

    segments
}

fn to_callout_kind(kind: pulldown_cmark::BlockQuoteKind) -> CalloutKind {
    match kind {
        pulldown_cmark::BlockQuoteKind::Note => CalloutKind::Note,
        pulldown_cmark::BlockQuoteKind::Tip => CalloutKind::Tip,
        pulldown_cmark::BlockQuoteKind::Important => CalloutKind::Important,
        pulldown_cmark::BlockQuoteKind::Warning => CalloutKind::Warning,
        pulldown_cmark::BlockQuoteKind::Caution => CalloutKind::Caution,
    }
}

fn callout_kind_from_marker(marker: &str) -> Option<CalloutKind> {
    match marker.trim().to_ascii_lowercase().as_str() {
        "note" => Some(CalloutKind::Note),
        "abstract" | "summary" | "tldr" => Some(CalloutKind::Abstract),
        "info" => Some(CalloutKind::Info),
        "tip" | "hint" => Some(CalloutKind::Tip),
        "success" | "check" | "done" => Some(CalloutKind::Success),
        "question" | "help" | "faq" => Some(CalloutKind::Question),
        "important" => Some(CalloutKind::Important),
        "warning" | "attention" => Some(CalloutKind::Warning),
        "failure" | "fail" | "missing" => Some(CalloutKind::Failure),
        "danger" | "error" => Some(CalloutKind::Danger),
        "bug" => Some(CalloutKind::Bug),
        "example" => Some(CalloutKind::Example),
        "quote" | "cite" => Some(CalloutKind::Quote),
        "caution" => Some(CalloutKind::Caution),
        _ => None,
    }
}

fn inline_line_from_text(text: &str) -> InlineLine {
    parse_special_inline_segments(text, false, false, false)
}

fn parse_callout_metadata(
    fallback_kind: Option<CalloutKind>,
    lines: Vec<InlineLine>,
) -> (
    Option<CalloutKind>,
    Option<InlineLine>,
    bool,
    Vec<InlineLine>,
) {
    let Some(first_line) = lines.first() else {
        return (fallback_kind, None, false, lines);
    };

    let plain = plain_text_from_line(first_line);
    let trimmed = plain.trim();
    if !trimmed.starts_with("[!") {
        return (fallback_kind, None, false, lines);
    }

    let Some(close_idx) = trimmed.find(']') else {
        return (fallback_kind, None, false, lines);
    };

    let marker = &trimmed[2..close_idx];
    let Some(kind) = callout_kind_from_marker(marker).or(fallback_kind) else {
        return (fallback_kind, None, false, lines);
    };

    let rest = trimmed[close_idx + 1..].trim_start();
    let (collapsed, title_text) = if let Some(remaining) = rest.strip_prefix('-') {
        (true, remaining.trim())
    } else if let Some(remaining) = rest.strip_prefix('+') {
        (false, remaining.trim())
    } else {
        (false, rest.trim())
    };

    let title = (!title_text.is_empty()).then(|| inline_line_from_text(title_text));
    let body_lines = lines.into_iter().skip(1).collect();
    (Some(kind), title, collapsed, body_lines)
}

/// Parse Markdown text into blocks
fn parse_markdown(md_text: &str) -> Vec<MdBlock> {
    use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_GFM);

    let parser = Parser::new_ext(md_text, options);
    let mut blocks = Vec::new();
    let mut paragraph = InlineBuilder::new();
    let mut paragraph_active = false;
    let mut heading: Option<(u8, InlineBuilder)> = None;
    let mut quote: Option<QuoteBuilder> = None;
    let mut footnote: Option<FootnoteBuilder> = None;
    let mut table: Option<TableBuilder> = None;
    let mut html_block: Option<String> = None;
    let mut code_block: Option<(String, String)> = None;
    let mut list_stack: Vec<ListFrame> = Vec::new();
    let mut item_stack: Vec<ListItemBuilder> = Vec::new();
    let mut image_stack: Vec<ImageAccumulator> = Vec::new();
    let mut inline_context = InlineStyleContext::default();

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                heading = Some((level as u8, InlineBuilder::new()));
            }
            Event::End(TagEnd::Heading(level)) => {
                if let Some((_, mut builder)) = heading.take() {
                    blocks.push(MdBlock::Heading {
                        level: level as u8,
                        content: flatten_inline_lines(builder.take_lines(), " "),
                    });
                }
            }
            Event::Start(Tag::Paragraph) => {
                if heading.is_none()
                    && quote.is_none()
                    && footnote.is_none()
                    && table.is_none()
                    && item_stack.is_empty()
                    && image_stack.is_empty()
                {
                    paragraph_active = true;
                }
            }
            Event::End(TagEnd::Paragraph) => {
                if footnote.is_some() || quote.is_some() || !item_stack.is_empty() {
                    if let Some(item) = item_stack.last_mut() {
                        item.builder.push_break();
                    } else if let Some(quote_builder) = quote.as_mut() {
                        quote_builder.builder.push_break();
                    } else if let Some(footnote_builder) = footnote.as_mut() {
                        footnote_builder.builder.push_break();
                    }
                } else if heading.is_none() && table.is_none() && html_block.is_none() {
                    emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                }
            }
            Event::Start(Tag::CodeBlock(kind)) => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                flush_active_item_fragment(&mut blocks, &mut item_stack);
                let language = match kind {
                    CodeBlockKind::Fenced(info) => info.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
                code_block = Some((language, String::new()));
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some((language, code)) = code_block.take() {
                    if language.trim().eq_ignore_ascii_case("mermaid") {
                        blocks.push(MdBlock::Mermaid { code });
                    } else {
                        blocks.push(MdBlock::CodeBlock { language, code });
                    }
                }
            }
            Event::Start(Tag::BlockQuote(kind)) => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                flush_active_item_fragment(&mut blocks, &mut item_stack);
                if let Some(existing) = quote.as_mut() {
                    existing.depth += 1;
                    if existing.kind.is_none() {
                        existing.kind = kind.map(to_callout_kind);
                    }
                } else {
                    quote = Some(QuoteBuilder {
                        kind: kind.map(to_callout_kind),
                        depth: 1,
                        builder: InlineBuilder::new(),
                    });
                }
            }
            Event::End(TagEnd::BlockQuote(_)) => {
                if let Some(existing) = quote.as_mut() {
                    if existing.depth > 1 {
                        existing.depth -= 1;
                    } else if let Some(mut finished) = quote.take() {
                        let (kind, title, collapsed, lines) =
                            parse_callout_metadata(finished.kind, finished.builder.take_lines());
                        blocks.push(MdBlock::BlockQuote {
                            kind,
                            title,
                            collapsed,
                            lines,
                            depth: finished.depth,
                        });
                    }
                }
            }
            Event::Start(Tag::HtmlBlock) => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                html_block = Some(String::new());
            }
            Event::End(TagEnd::HtmlBlock) => {
                if let Some(raw) = html_block.take() {
                    let trimmed = raw.trim();
                    if !trimmed.is_empty() {
                        blocks.push(MdBlock::HtmlBlock {
                            raw: trimmed.to_string(),
                        });
                    }
                }
            }
            Event::Start(Tag::FootnoteDefinition(label)) => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                footnote = Some(FootnoteBuilder {
                    label: label.to_string(),
                    builder: InlineBuilder::new(),
                });
            }
            Event::End(TagEnd::FootnoteDefinition) => {
                if let Some(mut finished) = footnote.take() {
                    blocks.push(MdBlock::FootnoteDefinition {
                        label: finished.label,
                        lines: finished.builder.take_lines(),
                    });
                }
            }
            Event::Start(Tag::Table(alignments)) => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                table = Some(TableBuilder {
                    alignments: alignments
                        .iter()
                        .map(|alignment| match alignment {
                            pulldown_cmark::Alignment::Left => Alignment::Left,
                            pulldown_cmark::Alignment::Center => Alignment::Center,
                            pulldown_cmark::Alignment::Right => Alignment::Right,
                            pulldown_cmark::Alignment::None => Alignment::None,
                        })
                        .collect(),
                    header: Vec::new(),
                    rows: Vec::new(),
                    current_row: Vec::new(),
                    current_cell: InlineBuilder::new(),
                    in_header: false,
                    in_row: false,
                });
            }
            Event::End(TagEnd::Table) => {
                if let Some(builder) = table.take() {
                    blocks.push(MdBlock::Table {
                        header: builder.header,
                        rows: builder.rows,
                        alignments: builder.alignments,
                    });
                }
            }
            Event::Start(Tag::TableHead) => {
                if let Some(builder) = table.as_mut() {
                    builder.in_header = true;
                    builder.current_row.clear();
                }
            }
            Event::End(TagEnd::TableHead) => {
                if let Some(builder) = table.as_mut() {
                    if builder.header.is_empty() && !builder.current_row.is_empty() {
                        builder.header = builder.current_row.clone();
                        builder.current_row.clear();
                    }
                    builder.in_header = false;
                }
            }
            Event::Start(Tag::TableRow) => {
                if let Some(builder) = table.as_mut() {
                    builder.in_row = true;
                    builder.current_row.clear();
                }
            }
            Event::End(TagEnd::TableRow) => {
                if let Some(builder) = table.as_mut() {
                    if builder.in_header {
                        builder.header = builder.current_row.clone();
                    } else if !builder.current_row.is_empty() {
                        builder.rows.push(builder.current_row.clone());
                    }
                    builder.current_row.clear();
                    builder.in_row = false;
                }
            }
            Event::Start(Tag::TableCell) => {
                if let Some(builder) = table.as_mut() {
                    builder.current_cell = InlineBuilder::new();
                }
            }
            Event::End(TagEnd::TableCell) => {
                if let Some(builder) = table.as_mut() {
                    builder
                        .current_row
                        .push(flatten_inline_lines(builder.current_cell.take_lines(), " "));
                }
            }
            Event::Start(Tag::List(start)) => {
                if !item_stack.is_empty() {
                    flush_active_item_fragment(&mut blocks, &mut item_stack);
                } else {
                    emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                }
                list_stack.push(ListFrame {
                    ordered: start.is_some(),
                    next_number: start.unwrap_or(1),
                });
            }
            Event::End(TagEnd::List(_)) => {
                list_stack.pop();
            }
            Event::Start(Tag::Item) => {
                if let Some(frame) = list_stack.last_mut() {
                    let number = if frame.ordered {
                        let current = frame.next_number;
                        frame.next_number += 1;
                        Some(current)
                    } else {
                        None
                    };

                    item_stack.push(ListItemBuilder {
                        ordered: frame.ordered,
                        number,
                        checked: None,
                        indent: list_stack.len().saturating_sub(1),
                        emitted_fragment: false,
                        builder: InlineBuilder::new(),
                    });
                }
            }
            Event::End(TagEnd::Item) => {
                if let Some(mut item) = item_stack.pop() {
                    if !item.builder.is_empty() || !item.emitted_fragment {
                        emit_item_fragment(&mut blocks, &mut item);
                    }
                }
            }
            Event::Start(Tag::Emphasis) => {
                inline_context.emphasis_depth += 1;
            }
            Event::End(TagEnd::Emphasis) => {
                inline_context.emphasis_depth = inline_context.emphasis_depth.saturating_sub(1);
            }
            Event::Start(Tag::Strong) => {
                inline_context.strong_depth += 1;
            }
            Event::End(TagEnd::Strong) => {
                inline_context.strong_depth = inline_context.strong_depth.saturating_sub(1);
            }
            Event::Start(Tag::Strikethrough) => {
                inline_context.strikethrough_depth += 1;
            }
            Event::End(TagEnd::Strikethrough) => {
                inline_context.strikethrough_depth =
                    inline_context.strikethrough_depth.saturating_sub(1);
            }
            Event::Start(Tag::Link { dest_url, .. }) => {
                let suppress_link = image_stack
                    .last()
                    .map(|image| &image.alt)
                    .or_else(|| table.as_ref().map(|builder| &builder.current_cell))
                    .or_else(|| heading.as_ref().map(|(_, builder)| builder))
                    .or_else(|| item_stack.last().map(|item| &item.builder))
                    .or_else(|| quote.as_ref().map(|builder| &builder.builder))
                    .or_else(|| footnote.as_ref().map(|builder| &builder.builder))
                    .or_else(|| paragraph_active.then_some(&paragraph))
                    .and_then(InlineBuilder::last_segment_text)
                    .is_some_and(|text| text.ends_with("]("));

                inline_context.push_link(dest_url.to_string(), suppress_link);
            }
            Event::End(TagEnd::Link) => {
                inline_context.pop_link();
            }
            Event::Start(Tag::Image { dest_url, .. }) => {
                image_stack.push(ImageAccumulator {
                    src: dest_url.to_string(),
                    alt: InlineBuilder::new(),
                });
            }
            Event::End(TagEnd::Image) => {
                if let Some(mut image) = image_stack.pop() {
                    let alt_text = plain_text_from_lines(&image.alt.take_lines(), " ");
                    let image_segment = make_segment(
                        if alt_text.trim().is_empty() {
                            default_image_label(&image.src)
                        } else {
                            alt_text
                        },
                        InlineRole::Image,
                        Some(image.src),
                        false,
                        false,
                        false,
                    );

                    if let Some(builder) = image_stack.last_mut() {
                        builder.alt.push_segment(image_segment);
                    } else if let Some(builder) = table.as_mut() {
                        builder.current_cell.push_segment(image_segment);
                    } else if let Some((_, builder)) = heading.as_mut() {
                        builder.push_segment(image_segment);
                    } else if let Some(item) = item_stack.last_mut() {
                        item.builder.push_segment(image_segment);
                    } else if let Some(quote_builder) = quote.as_mut() {
                        quote_builder.builder.push_segment(image_segment);
                    } else if let Some(footnote_builder) = footnote.as_mut() {
                        footnote_builder.builder.push_segment(image_segment);
                    } else {
                        paragraph_active = true;
                        paragraph.push_segment(image_segment);
                    }
                }
            }
            Event::Text(text) => {
                if let Some((_, code)) = code_block.as_mut() {
                    code.push_str(&text);
                } else if let Some(html) = html_block.as_mut() {
                    html.push_str(&text);
                } else if let Some(image) = image_stack.last_mut() {
                    push_text_with_context(&mut image.alt, &text, &inline_context);
                } else if let Some(builder) = table.as_mut() {
                    push_text_with_context(&mut builder.current_cell, &text, &inline_context);
                } else if let Some((_, builder)) = heading.as_mut() {
                    push_text_with_context(builder, &text, &inline_context);
                } else if let Some(item) = item_stack.last_mut() {
                    push_text_with_context(&mut item.builder, &text, &inline_context);
                } else if let Some(quote_builder) = quote.as_mut() {
                    push_text_with_context(&mut quote_builder.builder, &text, &inline_context);
                } else if let Some(footnote_builder) = footnote.as_mut() {
                    push_text_with_context(&mut footnote_builder.builder, &text, &inline_context);
                } else {
                    paragraph_active = true;
                    push_text_with_context(&mut paragraph, &text, &inline_context);
                }
            }
            Event::Code(code) => {
                let segment = make_segment(
                    code.to_string(),
                    InlineRole::Code,
                    None,
                    inline_context.strong(),
                    inline_context.emphasis(),
                    inline_context.strikethrough(),
                );

                if let Some(image) = image_stack.last_mut() {
                    image.alt.push_segment(segment);
                } else if let Some(builder) = table.as_mut() {
                    builder.current_cell.push_segment(segment);
                } else if let Some((_, builder)) = heading.as_mut() {
                    builder.push_segment(segment);
                } else if let Some(item) = item_stack.last_mut() {
                    item.builder.push_segment(segment);
                } else if let Some(quote_builder) = quote.as_mut() {
                    quote_builder.builder.push_segment(segment);
                } else if let Some(footnote_builder) = footnote.as_mut() {
                    footnote_builder.builder.push_segment(segment);
                } else {
                    paragraph_active = true;
                    paragraph.push_segment(segment);
                }
            }
            Event::InlineHtml(html) => {
                let trimmed = html.trim();
                if trimmed.eq_ignore_ascii_case("<kbd>") {
                    inline_context.kbd_depth += 1;
                } else if trimmed.eq_ignore_ascii_case("</kbd>") {
                    inline_context.kbd_depth = inline_context.kbd_depth.saturating_sub(1);
                } else {
                    let segment = make_segment(
                        trimmed.to_string(),
                        InlineRole::Html,
                        None,
                        false,
                        false,
                        false,
                    );

                    if let Some(builder) = image_stack.last_mut() {
                        builder.alt.push_segment(segment);
                    } else if let Some(builder) = table.as_mut() {
                        builder.current_cell.push_segment(segment);
                    } else if let Some((_, builder)) = heading.as_mut() {
                        builder.push_segment(segment);
                    } else if let Some(item) = item_stack.last_mut() {
                        item.builder.push_segment(segment);
                    } else if let Some(quote_builder) = quote.as_mut() {
                        quote_builder.builder.push_segment(segment);
                    } else if let Some(footnote_builder) = footnote.as_mut() {
                        footnote_builder.builder.push_segment(segment);
                    } else {
                        paragraph_active = true;
                        paragraph.push_segment(segment);
                    }
                }
            }
            Event::Html(html) => {
                if let Some(raw) = html_block.as_mut() {
                    raw.push_str(&html);
                    raw.push('\n');
                } else {
                    blocks.push(MdBlock::HtmlBlock {
                        raw: html.to_string(),
                    });
                }
            }
            Event::FootnoteReference(label) => {
                let segment = make_segment(
                    format!("[^{}]", label),
                    InlineRole::FootnoteReference,
                    Some(label.to_string()),
                    false,
                    false,
                    false,
                );

                if let Some(builder) = image_stack.last_mut() {
                    builder.alt.push_segment(segment);
                } else if let Some(builder) = table.as_mut() {
                    builder.current_cell.push_segment(segment);
                } else if let Some((_, builder)) = heading.as_mut() {
                    builder.push_segment(segment);
                } else if let Some(item) = item_stack.last_mut() {
                    item.builder.push_segment(segment);
                } else if let Some(quote_builder) = quote.as_mut() {
                    quote_builder.builder.push_segment(segment);
                } else if let Some(footnote_builder) = footnote.as_mut() {
                    footnote_builder.builder.push_segment(segment);
                } else {
                    paragraph_active = true;
                    paragraph.push_segment(segment);
                }
            }
            Event::TaskListMarker(checked) => {
                if let Some(item) = item_stack.last_mut() {
                    item.checked = Some(checked);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some((_, code)) = code_block.as_mut() {
                    code.push('\n');
                } else if let Some(raw) = html_block.as_mut() {
                    raw.push('\n');
                } else if let Some(builder) = image_stack.last_mut() {
                    builder.alt.push_break();
                } else if let Some(builder) = table.as_mut() {
                    builder.current_cell.push_break();
                } else if let Some((_, builder)) = heading.as_mut() {
                    builder.push_break();
                } else if let Some(item) = item_stack.last_mut() {
                    item.builder.push_break();
                } else if let Some(quote_builder) = quote.as_mut() {
                    quote_builder.builder.push_break();
                } else if let Some(footnote_builder) = footnote.as_mut() {
                    footnote_builder.builder.push_break();
                } else if paragraph_active {
                    paragraph.push_break();
                }
            }
            Event::Rule => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                blocks.push(MdBlock::HorizontalRule);
            }
            Event::DisplayMath(text) => {
                emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
                blocks.push(MdBlock::DisplayMath {
                    text: text.to_string(),
                });
            }
            Event::InlineMath(text) => {
                let segment = make_segment(
                    text.to_string(),
                    InlineRole::Code,
                    None,
                    false,
                    false,
                    false,
                );
                if let Some(builder) = image_stack.last_mut() {
                    builder.alt.push_segment(segment);
                } else if let Some(builder) = table.as_mut() {
                    builder.current_cell.push_segment(segment);
                } else if let Some((_, builder)) = heading.as_mut() {
                    builder.push_segment(segment);
                } else if let Some(item) = item_stack.last_mut() {
                    item.builder.push_segment(segment);
                } else if let Some(quote_builder) = quote.as_mut() {
                    quote_builder.builder.push_segment(segment);
                } else if let Some(footnote_builder) = footnote.as_mut() {
                    footnote_builder.builder.push_segment(segment);
                } else {
                    paragraph_active = true;
                    paragraph.push_segment(segment);
                }
            }
            _ => {}
        }
    }

    emit_paragraph(&mut blocks, &mut paragraph, &mut paragraph_active);
    blocks
}

fn preview_inline_style(segment: &InlineSegment) -> Style {
    let mut style = match segment.role {
        InlineRole::Text => Style::default(),
        InlineRole::Code => Style::default()
            .fg(Color::Rgb(255, 203, 107))
            .bg(Color::Rgb(38, 42, 51)),
        InlineRole::Link => Style::default()
            .fg(Color::Rgb(97, 175, 239))
            .add_modifier(Modifier::UNDERLINED),
        InlineRole::WikiLink => Style::default()
            .fg(Color::Rgb(97, 218, 251))
            .bg(Color::Rgb(28, 40, 56))
            .add_modifier(Modifier::UNDERLINED),
        InlineRole::Tag => Style::default()
            .fg(Color::Rgb(255, 203, 107))
            .bg(Color::Rgb(58, 47, 30)),
        InlineRole::FootnoteReference => Style::default()
            .fg(Color::Rgb(198, 120, 221))
            .add_modifier(Modifier::BOLD),
        InlineRole::Html => Style::default()
            .fg(Color::Rgb(209, 154, 102))
            .add_modifier(Modifier::DIM),
        InlineRole::Kbd => Style::default()
            .fg(Color::Rgb(230, 230, 230))
            .bg(Color::Rgb(56, 62, 72))
            .add_modifier(Modifier::BOLD),
        InlineRole::BlockRef => Style::default()
            .fg(Color::Rgb(198, 120, 221))
            .add_modifier(Modifier::ITALIC),
        InlineRole::Image => Style::default()
            .fg(Color::Rgb(86, 182, 194))
            .add_modifier(Modifier::ITALIC),
    };

    if segment.strong {
        style = style.add_modifier(Modifier::BOLD);
    }
    if segment.emphasis {
        style = style.add_modifier(Modifier::ITALIC);
    }
    if segment.strikethrough {
        style = style.add_modifier(Modifier::CROSSED_OUT);
    }

    style
}

fn preview_segment_text(segment: &InlineSegment) -> String {
    match segment.role {
        InlineRole::Image => format!("[{}]", segment.text),
        InlineRole::Kbd => format!(" {} ", segment.text.trim()),
        _ => segment.text.clone(),
    }
}

fn preview_target_kind(role: &InlineRole) -> Option<PreviewTargetKind> {
    match role {
        InlineRole::Link => Some(PreviewTargetKind::MarkdownLink),
        InlineRole::WikiLink => Some(PreviewTargetKind::WikiLink),
        InlineRole::BlockRef => Some(PreviewTargetKind::BlockRef),
        InlineRole::Image => Some(PreviewTargetKind::Image),
        _ => None,
    }
}

fn spans_display_width(spans: &[Span<'static>]) -> usize {
    spans
        .iter()
        .map(|span| UnicodeWidthStr::width(span.content.as_ref()))
        .sum()
}

fn line_display_width(line: &Line<'static>) -> usize {
    spans_display_width(line.spans.as_slice())
}

fn append_preview_render(target: &mut PreviewRender, mut chunk: PreviewRender) {
    let line_offset = target.lines.len();
    for hit in &mut chunk.hits {
        hit.line += line_offset;
    }
    for image in &mut chunk.images {
        image.start_line += line_offset;
    }
    target.lines.extend(chunk.lines);
    target.hits.extend(chunk.hits);
    target.images.extend(chunk.images);
}

fn flush_wrapped_line(
    output: &mut Vec<Line<'static>>,
    line: &mut Vec<Span<'static>>,
    continuation_prefix: &[Span<'static>],
    current_width: &mut usize,
    content_width: &mut usize,
) {
    output.push(Line::from(std::mem::take(line)));
    *line = continuation_prefix.to_vec();
    *current_width = spans_display_width(continuation_prefix);
    *content_width = 0;
}

fn wrap_spans_with_prefix(
    content: Vec<Span<'static>>,
    width: usize,
    first_prefix: Vec<Span<'static>>,
    continuation_prefix: Vec<Span<'static>>,
) -> Vec<Line<'static>> {
    let width = width.max(1);
    let mut output = Vec::new();
    let mut line = first_prefix.clone();
    let mut current_width = spans_display_width(&line);
    let mut content_width = 0usize;

    if content.is_empty() {
        output.push(Line::from(line));
        return output;
    }

    for span in content {
        let style = span.style;
        let text = span.content.into_owned();
        let mut buffer = String::new();

        for ch in text.chars() {
            let ch_width = UnicodeWidthChar::width(ch).unwrap_or(0);

            if ch == '\n' {
                if !buffer.is_empty() {
                    line.push(Span::styled(std::mem::take(&mut buffer), style));
                }
                flush_wrapped_line(
                    &mut output,
                    &mut line,
                    &continuation_prefix,
                    &mut current_width,
                    &mut content_width,
                );
                continue;
            }

            if content_width == 0 && ch.is_whitespace() {
                continue;
            }

            if content_width > 0 && current_width + ch_width > width {
                if !buffer.is_empty() {
                    line.push(Span::styled(std::mem::take(&mut buffer), style));
                }
                flush_wrapped_line(
                    &mut output,
                    &mut line,
                    &continuation_prefix,
                    &mut current_width,
                    &mut content_width,
                );
                if ch.is_whitespace() {
                    continue;
                }
            }

            buffer.push(ch);
            current_width += ch_width;
            content_width += ch_width;

            if content_width > 0 && current_width >= width {
                if !buffer.is_empty() {
                    line.push(Span::styled(std::mem::take(&mut buffer), style));
                }
                flush_wrapped_line(
                    &mut output,
                    &mut line,
                    &continuation_prefix,
                    &mut current_width,
                    &mut content_width,
                );
            }
        }

        if !buffer.is_empty() {
            line.push(Span::styled(buffer, style));
        }
    }

    if content_width > 0 || output.is_empty() {
        output.push(Line::from(line));
    }

    output
}

fn inline_line_to_spans(line: &InlineLine) -> Vec<Span<'static>> {
    line.iter()
        .map(|segment| Span::styled(preview_segment_text(segment), preview_inline_style(segment)))
        .collect()
}

fn wrap_inline_lines(
    lines: &[InlineLine],
    width: usize,
    first_prefix: Vec<Span<'static>>,
    continuation_prefix: Vec<Span<'static>>,
) -> Vec<Line<'static>> {
    if lines.is_empty() {
        return vec![Line::from(first_prefix)];
    }

    let mut output = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let prefix = if index == 0 {
            first_prefix.clone()
        } else {
            continuation_prefix.clone()
        };
        output.extend(wrap_spans_with_prefix(
            inline_line_to_spans(line),
            width,
            prefix,
            continuation_prefix.clone(),
        ));
    }

    output
}

fn wrap_inline_lines_with_hits(
    lines: &[InlineLine],
    width: usize,
    first_prefix: Vec<Span<'static>>,
    continuation_prefix: Vec<Span<'static>>,
) -> PreviewRender {
    let width = width.max(1);
    let mut render = PreviewRender::default();

    if lines.is_empty() {
        render.lines.push(Line::from(first_prefix));
        return render;
    }

    for (logical_index, inline_line) in lines.iter().enumerate() {
        let mut line = if logical_index == 0 {
            first_prefix.clone()
        } else {
            continuation_prefix.clone()
        };
        let mut current_width = spans_display_width(&line);
        let mut content_width = 0usize;
        let started_at = render.lines.len();

        for segment in inline_line {
            let text = preview_segment_text(segment);
            let style = preview_inline_style(segment);
            let hit_kind = preview_target_kind(&segment.role);
            let mut buffer = String::new();
            let mut hit_start = None::<usize>;

            for ch in text.chars() {
                let ch_width = UnicodeWidthChar::width(ch).unwrap_or(0);

                let mut flush_segment =
                    |render: &mut PreviewRender,
                     line: &mut Vec<Span<'static>>,
                     buffer: &mut String,
                     current_width: usize,
                     hit_start: &mut Option<usize>| {
                        if buffer.is_empty() {
                            return;
                        }

                        line.push(Span::styled(std::mem::take(buffer), style));

                        if let (Some(kind), Some(start), Some(target)) =
                            (hit_kind, *hit_start, segment.target.clone())
                        {
                            if current_width > start {
                                render.hits.push(PreviewHit {
                                    line: render.lines.len(),
                                    start_col: start,
                                    end_col: current_width,
                                    kind,
                                    target,
                                    label: segment.text.clone(),
                                });
                            }
                        }

                        *hit_start = None;
                    };

                if ch == '\n' {
                    flush_segment(
                        &mut render,
                        &mut line,
                        &mut buffer,
                        current_width,
                        &mut hit_start,
                    );
                    flush_wrapped_line(
                        &mut render.lines,
                        &mut line,
                        &continuation_prefix,
                        &mut current_width,
                        &mut content_width,
                    );
                    continue;
                }

                if content_width == 0 && ch.is_whitespace() {
                    continue;
                }

                if content_width > 0 && current_width + ch_width > width {
                    flush_segment(
                        &mut render,
                        &mut line,
                        &mut buffer,
                        current_width,
                        &mut hit_start,
                    );
                    flush_wrapped_line(
                        &mut render.lines,
                        &mut line,
                        &continuation_prefix,
                        &mut current_width,
                        &mut content_width,
                    );
                    if ch.is_whitespace() {
                        continue;
                    }
                }

                if hit_kind.is_some() && hit_start.is_none() {
                    hit_start = Some(current_width);
                }

                buffer.push(ch);
                current_width += ch_width;
                content_width += ch_width;

                if content_width > 0 && current_width >= width {
                    flush_segment(
                        &mut render,
                        &mut line,
                        &mut buffer,
                        current_width,
                        &mut hit_start,
                    );
                    flush_wrapped_line(
                        &mut render.lines,
                        &mut line,
                        &continuation_prefix,
                        &mut current_width,
                        &mut content_width,
                    );
                }
            }

            if !buffer.is_empty() {
                line.push(Span::styled(std::mem::take(&mut buffer), style));
                if let (Some(kind), Some(start), Some(target)) =
                    (hit_kind, hit_start, segment.target.clone())
                {
                    if current_width > start {
                        render.hits.push(PreviewHit {
                            line: render.lines.len(),
                            start_col: start,
                            end_col: current_width,
                            kind,
                            target,
                            label: segment.text.clone(),
                        });
                    }
                }
            }
        }

        if content_width > 0 || render.lines.len() == started_at {
            render.lines.push(Line::from(line));
        }
    }

    render
}

fn wrap_plain_text_lines(
    lines: &[String],
    width: usize,
    style: Style,
    first_prefix: Vec<Span<'static>>,
    continuation_prefix: Vec<Span<'static>>,
) -> Vec<Line<'static>> {
    if lines.is_empty() {
        return vec![Line::from(first_prefix)];
    }

    let mut output = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let prefix = if index == 0 {
            first_prefix.clone()
        } else {
            continuation_prefix.clone()
        };
        output.extend(wrap_spans_with_prefix(
            vec![Span::styled(line.clone(), style)],
            width,
            prefix,
            continuation_prefix.clone(),
        ));
    }
    output
}

fn truncate_to_width(text: &str, width: usize) -> String {
    if width == 0 {
        return String::new();
    }

    let ellipsis = if width > 1 { "…" } else { "" };
    let ellipsis_width = UnicodeWidthStr::width(ellipsis);
    let mut output = String::new();
    let mut used = 0usize;

    for ch in text.chars() {
        let ch_width = UnicodeWidthChar::width(ch).unwrap_or(0);
        if used + ch_width > width {
            if !ellipsis.is_empty() && used + ellipsis_width <= width {
                output.push_str(ellipsis);
            }
            return output;
        }
        output.push(ch);
        used += ch_width;
    }

    output
}

fn pad_to_width(text: &str, width: usize, alignment: &Alignment) -> String {
    let truncated = truncate_to_width(text, width);
    let current = UnicodeWidthStr::width(truncated.as_str());
    let padding = width.saturating_sub(current);

    match alignment {
        Alignment::Right => format!("{}{}", " ".repeat(padding), truncated),
        Alignment::Center => {
            let left = padding / 2;
            let right = padding.saturating_sub(left);
            format!("{}{}{}", " ".repeat(left), truncated, " ".repeat(right))
        }
        _ => format!("{}{}", truncated, " ".repeat(padding)),
    }
}

fn styled_text_line(text: String, style: Style) -> Line<'static> {
    Line::from(Span::styled(text, style))
}

fn heading_styles(level: u8) -> (Style, Style) {
    match level {
        1 => (
            Style::default()
                .fg(Color::Rgb(255, 203, 107))
                .add_modifier(Modifier::BOLD),
            Style::default()
                .fg(Color::Rgb(255, 203, 107))
                .bg(Color::Rgb(65, 48, 20))
                .add_modifier(Modifier::BOLD),
        ),
        2 => (
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .add_modifier(Modifier::BOLD),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .bg(Color::Rgb(24, 40, 58))
                .add_modifier(Modifier::BOLD),
        ),
        3 => (
            Style::default()
                .fg(Color::Rgb(152, 195, 121))
                .add_modifier(Modifier::BOLD),
            Style::default()
                .fg(Color::Rgb(152, 195, 121))
                .bg(Color::Rgb(30, 51, 30))
                .add_modifier(Modifier::BOLD),
        ),
        _ => (
            Style::default()
                .fg(Color::Rgb(209, 154, 102))
                .add_modifier(Modifier::BOLD),
            Style::default()
                .fg(Color::Rgb(209, 154, 102))
                .bg(Color::Rgb(60, 43, 22))
                .add_modifier(Modifier::BOLD),
        ),
    }
}

fn callout_styles(kind: Option<CalloutKind>) -> (String, Style, Style) {
    callout_styles_localized(kind, Language::En)
}

fn callout_styles_localized(
    kind: Option<CalloutKind>,
    language: Language,
) -> (String, Style, Style) {
    let t = language.translator();
    match kind {
        Some(CalloutKind::Note) => (
            format!(" {} ", t.text(TextKey::EditorCalloutNote)),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .bg(Color::Rgb(27, 40, 58))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(97, 175, 239)),
        ),
        Some(CalloutKind::Abstract) => (
            format!(" {} ", t.text(TextKey::EditorCalloutAbstract)),
            Style::default()
                .fg(Color::Rgb(86, 182, 194))
                .bg(Color::Rgb(24, 46, 48))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(86, 182, 194)),
        ),
        Some(CalloutKind::Info) => (
            format!(" {} ", t.text(TextKey::EditorCalloutInfo)),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .bg(Color::Rgb(24, 40, 58))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(97, 175, 239)),
        ),
        Some(CalloutKind::Tip) => (
            format!(" {} ", t.text(TextKey::EditorCalloutTip)),
            Style::default()
                .fg(Color::Rgb(152, 195, 121))
                .bg(Color::Rgb(31, 50, 31))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(152, 195, 121)),
        ),
        Some(CalloutKind::Success) => (
            format!(" {} ", t.text(TextKey::EditorCalloutSuccess)),
            Style::default()
                .fg(Color::Rgb(152, 195, 121))
                .bg(Color::Rgb(31, 50, 31))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(152, 195, 121)),
        ),
        Some(CalloutKind::Question) => (
            format!(" {} ", t.text(TextKey::EditorCalloutQuestion)),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .bg(Color::Rgb(24, 40, 58))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(97, 175, 239)),
        ),
        Some(CalloutKind::Important) => (
            format!(" {} ", t.text(TextKey::EditorCalloutImportant)),
            Style::default()
                .fg(Color::Rgb(229, 192, 123))
                .bg(Color::Rgb(64, 47, 20))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(229, 192, 123)),
        ),
        Some(CalloutKind::Warning) => (
            format!(" {} ", t.text(TextKey::EditorCalloutWarning)),
            Style::default()
                .fg(Color::Rgb(224, 108, 117))
                .bg(Color::Rgb(64, 24, 24))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(224, 108, 117)),
        ),
        Some(CalloutKind::Failure) => (
            format!(" {} ", t.text(TextKey::EditorCalloutFailure)),
            Style::default()
                .fg(Color::Rgb(224, 108, 117))
                .bg(Color::Rgb(64, 24, 24))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(224, 108, 117)),
        ),
        Some(CalloutKind::Danger) => (
            format!(" {} ", t.text(TextKey::EditorCalloutDanger)),
            Style::default()
                .fg(Color::Rgb(224, 108, 117))
                .bg(Color::Rgb(72, 29, 29))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(224, 108, 117)),
        ),
        Some(CalloutKind::Bug) => (
            format!(" {} ", t.text(TextKey::EditorCalloutBug)),
            Style::default()
                .fg(Color::Rgb(190, 80, 70))
                .bg(Color::Rgb(60, 24, 20))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(190, 80, 70)),
        ),
        Some(CalloutKind::Example) => (
            format!(" {} ", t.text(TextKey::EditorCalloutExample)),
            Style::default()
                .fg(Color::Rgb(198, 120, 221))
                .bg(Color::Rgb(43, 32, 56))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(198, 120, 221)),
        ),
        Some(CalloutKind::Quote) => (
            format!(" {} ", t.text(TextKey::EditorCalloutQuote)),
            Style::default()
                .fg(Color::Rgb(171, 178, 191))
                .bg(Color::Rgb(34, 39, 46))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(171, 178, 191)),
        ),
        Some(CalloutKind::Caution) => (
            format!(" {} ", t.text(TextKey::EditorCalloutCaution)),
            Style::default()
                .fg(Color::Rgb(224, 108, 117))
                .bg(Color::Rgb(72, 29, 29))
                .add_modifier(Modifier::BOLD),
            Style::default().fg(Color::Rgb(224, 108, 117)),
        ),
        None => (
            String::new(),
            Style::default(),
            Style::default().fg(Color::Rgb(139, 148, 158)),
        ),
    }
}

fn preview_heading_lines(level: u8, content: &InlineLine, width: usize) -> Vec<Line<'static>> {
    let (text_style, badge_style) = heading_styles(level);
    let spans = inline_line_to_spans(content)
        .into_iter()
        .map(|span| Span::styled(span.content.into_owned(), text_style.patch(span.style)))
        .collect();

    let mut lines = wrap_spans_with_prefix(
        spans,
        width,
        vec![
            Span::styled(format!(" H{} ", level), badge_style),
            Span::raw(" ".to_string()),
        ],
        vec![Span::raw("     ".to_string())],
    );

    if level <= 2 {
        lines.push(styled_text_line(
            "─".repeat(width.min(40).max(8)),
            text_style.add_modifier(Modifier::DIM),
        ));
    }

    lines
}

fn preview_code_lines(label: &str, code: &str, width: usize, mermaid: bool) -> Vec<Line<'static>> {
    let badge_style = if mermaid {
        Style::default()
            .fg(Color::Rgb(86, 182, 194))
            .bg(Color::Rgb(24, 46, 48))
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default()
            .fg(Color::Rgb(198, 120, 221))
            .bg(Color::Rgb(43, 32, 56))
            .add_modifier(Modifier::BOLD)
    };

    let code_style = if mermaid {
        Style::default().fg(Color::Rgb(171, 178, 191))
    } else {
        Style::default()
            .fg(Color::Rgb(220, 223, 228))
            .bg(Color::Rgb(31, 35, 41))
    };
    let pipe_style = Style::default().fg(Color::Rgb(88, 96, 105));

    let mut lines = vec![styled_text_line(format!(" {} ", label), badge_style)];

    let raw_lines = if code.is_empty() {
        vec![String::new()]
    } else {
        code.lines().map(ToString::to_string).collect()
    };

    lines.extend(wrap_plain_text_lines(
        &raw_lines,
        width,
        code_style,
        vec![Span::styled("│ ".to_string(), pipe_style)],
        vec![Span::styled("│ ".to_string(), pipe_style)],
    ));

    lines
}

fn preview_quote_lines(
    kind: Option<CalloutKind>,
    depth: usize,
    lines: &[InlineLine],
    width: usize,
) -> Vec<Line<'static>> {
    let (label, label_style, bar_style) = callout_styles(kind);
    let bar = format!("{} ", "▏".repeat(depth.max(1).min(3)));
    let first_prefix = if label.is_empty() {
        vec![Span::styled(bar.clone(), bar_style)]
    } else {
        vec![
            Span::styled(label, label_style),
            Span::raw(" ".to_string()),
            Span::styled(bar.clone(), bar_style),
        ]
    };
    let continuation_prefix = vec![Span::styled(bar, bar_style)];

    wrap_inline_lines(lines, width, first_prefix, continuation_prefix)
}

fn preview_list_item_lines(
    ordered: bool,
    number: Option<u64>,
    checked: Option<bool>,
    indent: usize,
    lines: &[InlineLine],
    width: usize,
) -> Vec<Line<'static>> {
    let indent_text = "  ".repeat(indent);
    let (marker_text, marker_style) = match checked {
        Some(true) => (
            "[x] ".to_string(),
            Style::default()
                .fg(Color::Rgb(152, 195, 121))
                .add_modifier(Modifier::BOLD),
        ),
        Some(false) => (
            "[ ] ".to_string(),
            Style::default()
                .fg(Color::Rgb(255, 203, 107))
                .add_modifier(Modifier::BOLD),
        ),
        None if ordered => (
            format!("{}. ", number.unwrap_or(1)),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .add_modifier(Modifier::BOLD),
        ),
        None => (
            "• ".to_string(),
            Style::default()
                .fg(Color::Rgb(209, 154, 102))
                .add_modifier(Modifier::BOLD),
        ),
    };

    let continuation_indent = " ".repeat(indent_text.len() + marker_text.len());
    wrap_inline_lines(
        lines,
        width,
        vec![
            Span::raw(indent_text),
            Span::styled(marker_text, marker_style),
        ],
        vec![Span::raw(continuation_indent)],
    )
}

fn preview_image_lines(alt: &InlineLine, src: &str, width: usize) -> Vec<Line<'static>> {
    preview_image_lines_localized(alt, src, width, Language::En)
}

fn preview_image_lines_localized(
    alt: &InlineLine,
    src: &str,
    width: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let t = language.translator();
    let title_style = Style::default()
        .fg(Color::Rgb(86, 182, 194))
        .bg(Color::Rgb(23, 43, 46))
        .add_modifier(Modifier::BOLD);
    let info_style = Style::default().fg(Color::Rgb(139, 148, 158));

    let mut lines = vec![styled_text_line(
        format!(" {} ", t.text(TextKey::EditorImageBadge)),
        title_style,
    )];
    lines.extend(wrap_inline_lines(
        std::slice::from_ref(alt),
        width,
        vec![Span::styled(
            format!("{}: ", t.text(TextKey::EditorAltLabel)),
            info_style,
        )],
        vec![Span::raw("     ".to_string())],
    ));
    lines.extend(wrap_plain_text_lines(
        &[format!("{}: {}", t.text(TextKey::EditorSourceLabel), src)],
        width,
        info_style,
        Vec::new(),
        Vec::new(),
    ));
    lines
}

fn preview_html_lines(raw: &str, width: usize) -> Vec<Line<'static>> {
    preview_html_lines_localized(raw, width, Language::En)
}

fn preview_html_lines_localized(raw: &str, width: usize, language: Language) -> Vec<Line<'static>> {
    let t = language.translator();
    let title_style = Style::default()
        .fg(Color::Rgb(209, 154, 102))
        .bg(Color::Rgb(56, 40, 22))
        .add_modifier(Modifier::BOLD);
    let html_style = Style::default()
        .fg(Color::Rgb(171, 178, 191))
        .add_modifier(Modifier::DIM);

    let mut lines = vec![styled_text_line(
        format!(" {} ", t.text(TextKey::EditorHtmlBadge)),
        title_style,
    )];
    let raw_lines: Vec<String> = raw.lines().map(ToString::to_string).collect();
    lines.extend(wrap_plain_text_lines(
        &raw_lines,
        width,
        html_style,
        vec![Span::styled("│ ".to_string(), title_style)],
        vec![Span::styled("│ ".to_string(), title_style)],
    ));
    lines
}

fn preview_footnote_lines(label: &str, lines: &[InlineLine], width: usize) -> Vec<Line<'static>> {
    let prefix = format!("[^{}] ", label);
    let continuation = " ".repeat(prefix.len());
    wrap_inline_lines(
        lines,
        width,
        vec![Span::styled(
            prefix,
            Style::default()
                .fg(Color::Rgb(198, 120, 221))
                .add_modifier(Modifier::BOLD),
        )],
        vec![Span::raw(continuation)],
    )
}

fn preview_table_border(widths: &[usize], left: char, mid: char, right: char) -> String {
    let mut border = String::new();
    border.push(left);
    for (index, width) in widths.iter().enumerate() {
        border.push_str(&"─".repeat(width + 2));
        border.push(if index + 1 == widths.len() {
            right
        } else {
            mid
        });
    }
    border
}

fn preview_table_row(
    cells: &[String],
    widths: &[usize],
    alignments: &[Alignment],
    cell_style: Style,
) -> Line<'static> {
    let border_style = Style::default().fg(Color::Rgb(88, 96, 105));
    let mut spans = vec![Span::styled("│".to_string(), border_style)];

    for (index, width) in widths.iter().enumerate() {
        let text = cells.get(index).cloned().unwrap_or_default();
        let aligned = pad_to_width(
            &text,
            *width,
            alignments.get(index).unwrap_or(&Alignment::Left),
        );
        spans.push(Span::raw(" ".to_string()));
        spans.push(Span::styled(aligned, cell_style));
        spans.push(Span::raw(" ".to_string()));
        spans.push(Span::styled("│".to_string(), border_style));
    }

    Line::from(spans)
}

fn preview_table_lines(
    header: &[InlineLine],
    rows: &[Vec<InlineLine>],
    alignments: &[Alignment],
    width: usize,
) -> Vec<Line<'static>> {
    preview_table_lines_localized(header, rows, alignments, width, Language::En)
}

fn preview_table_lines_localized(
    header: &[InlineLine],
    rows: &[Vec<InlineLine>],
    alignments: &[Alignment],
    width: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let t = language.translator();
    let col_count = header
        .len()
        .max(rows.iter().map(Vec::len).max().unwrap_or(0));
    if col_count == 0 {
        return Vec::new();
    }

    let plain_header: Vec<String> = (0..col_count)
        .map(|index| {
            header
                .get(index)
                .map(plain_text_from_line)
                .unwrap_or_default()
        })
        .collect();
    let plain_rows: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            (0..col_count)
                .map(|index| row.get(index).map(plain_text_from_line).unwrap_or_default())
                .collect()
        })
        .collect();

    if width < (col_count * 6).max(12) {
        let mut fallback = vec![styled_text_line(
            format!(
                " {} {}x{} ",
                t.text(TextKey::EditorTableBadge),
                plain_rows.len() + 1,
                col_count
            ),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .bg(Color::Rgb(24, 40, 58))
                .add_modifier(Modifier::BOLD),
        )];
        fallback.push(styled_text_line(
            plain_header.join(" | "),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .add_modifier(Modifier::BOLD),
        ));
        for row in plain_rows {
            fallback.push(styled_text_line(
                row.join(" | "),
                Style::default().fg(Color::Rgb(201, 209, 217)),
            ));
        }
        return fallback;
    }

    let separators = (col_count + 1) + (col_count * 2);
    let usable_width = width.saturating_sub(separators).max(col_count * 4);
    let desired: Vec<usize> = (0..col_count)
        .map(|index| {
            std::iter::once(&plain_header[index])
                .chain(plain_rows.iter().filter_map(move |row| row.get(index)))
                .map(|cell| UnicodeWidthStr::width(cell.as_str()).max(4))
                .max()
                .unwrap_or(4)
        })
        .collect();
    let total_desired: usize = desired.iter().sum::<usize>().max(1);
    let mut widths: Vec<usize> = desired
        .iter()
        .map(|cell_width| (usable_width * *cell_width / total_desired).max(4))
        .collect();

    while widths.iter().sum::<usize>() > usable_width {
        if let Some((index, _)) = widths.iter().enumerate().max_by_key(|(_, width)| **width) {
            if widths[index] > 4 {
                widths[index] -= 1;
            } else {
                break;
            }
        }
    }

    while widths.iter().sum::<usize>() < usable_width {
        if let Some((index, _)) = desired.iter().enumerate().max_by_key(|(_, width)| **width) {
            widths[index] += 1;
        } else {
            break;
        }
    }

    let border_style = Style::default().fg(Color::Rgb(88, 96, 105));
    let header_style = Style::default()
        .fg(Color::Rgb(97, 175, 239))
        .add_modifier(Modifier::BOLD);
    let row_style = Style::default().fg(Color::Rgb(201, 209, 217));

    let mut output = vec![
        styled_text_line(preview_table_border(&widths, '┌', '┬', '┐'), border_style),
        preview_table_row(&plain_header, &widths, alignments, header_style),
        styled_text_line(preview_table_border(&widths, '├', '┼', '┤'), border_style),
    ];

    for row in plain_rows {
        output.push(preview_table_row(&row, &widths, alignments, row_style));
    }

    output.push(styled_text_line(
        preview_table_border(&widths, '└', '┴', '┘'),
        border_style,
    ));
    output
}

fn preview_display_math_lines(text: &str, width: usize) -> Vec<Line<'static>> {
    preview_display_math_lines_localized(text, width, Language::En)
}

fn preview_display_math_lines_localized(
    text: &str,
    width: usize,
    language: Language,
) -> Vec<Line<'static>> {
    let t = language.translator();
    let label_style = Style::default()
        .fg(Color::Rgb(198, 120, 221))
        .bg(Color::Rgb(40, 31, 49))
        .add_modifier(Modifier::BOLD);
    wrap_plain_text_lines(
        &[text.to_string()],
        width,
        Style::default().fg(Color::Rgb(220, 223, 228)),
        vec![Span::styled(
            format!(" {} ", t.text(TextKey::EditorMathBadge)),
            label_style,
        )],
        vec![Span::raw("      ".to_string())],
    )
}

fn preview_heading_render(level: u8, content: &InlineLine, width: usize) -> PreviewRender {
    let mut render = wrap_inline_lines_with_hits(
        &[content.clone()],
        width,
        vec![
            Span::styled(format!(" H{} ", level), heading_styles(level).1),
            Span::raw(" ".to_string()),
        ],
        vec![Span::raw("     ".to_string())],
    );

    if level <= 2 {
        render.lines.push(styled_text_line(
            "─".repeat(width.min(40).max(8)),
            heading_styles(level).0.add_modifier(Modifier::DIM),
        ));
    }

    render
}

fn preview_quote_render(
    kind: Option<CalloutKind>,
    title: Option<&InlineLine>,
    collapsed: bool,
    depth: usize,
    lines: &[InlineLine],
    width: usize,
) -> PreviewRender {
    preview_quote_render_localized(kind, title, collapsed, depth, lines, width, Language::En)
}

fn preview_quote_render_localized(
    kind: Option<CalloutKind>,
    title: Option<&InlineLine>,
    collapsed: bool,
    depth: usize,
    lines: &[InlineLine],
    width: usize,
    language: Language,
) -> PreviewRender {
    if kind.is_none() {
        let (label, label_style, bar_style) = callout_styles_localized(kind, language);
        let bar = format!("{} ", "▏".repeat(depth.max(1).min(3)));
        let first_prefix = if label.is_empty() {
            vec![Span::styled(bar.clone(), bar_style)]
        } else {
            vec![
                Span::styled(label, label_style),
                Span::raw(" ".to_string()),
                Span::styled(bar.clone(), bar_style),
            ]
        };
        let continuation_prefix = vec![Span::styled(bar, bar_style)];
        return wrap_inline_lines_with_hits(lines, width, first_prefix, continuation_prefix);
    }

    let (label, label_style, bar_style) = callout_styles_localized(kind, language);
    let chevron = if collapsed { "▸" } else { "▾" };
    let header_prefix = vec![
        Span::styled(format!("{chevron} "), bar_style),
        Span::styled(label, label_style),
        Span::raw(" ".to_string()),
    ];
    let header_padding = vec![Span::raw("   ".to_string())];

    let mut render = if let Some(title_line) =
        title.filter(|line| !plain_text_from_line(line).trim().is_empty())
    {
        wrap_inline_lines_with_hits(
            std::slice::from_ref(title_line),
            width,
            header_prefix,
            header_padding,
        )
    } else {
        PreviewRender {
            lines: vec![Line::from(header_prefix)],
            hits: Vec::new(),
            images: Vec::new(),
        }
    };

    if collapsed || lines.is_empty() {
        return render;
    }

    let body = wrap_inline_lines_with_hits(
        lines,
        width,
        vec![Span::styled("│ ".to_string(), bar_style)],
        vec![Span::styled("│ ".to_string(), bar_style)],
    );
    append_preview_render(&mut render, body);
    render.lines.push(styled_text_line(
        format!("╰{}", "─".repeat(width.saturating_sub(1).max(3))),
        bar_style,
    ));
    render
}

fn preview_list_item_render(
    ordered: bool,
    number: Option<u64>,
    checked: Option<bool>,
    indent: usize,
    lines: &[InlineLine],
    width: usize,
) -> PreviewRender {
    let indent_text = "  ".repeat(indent);
    let (marker_text, marker_style) = match checked {
        Some(true) => (
            "[x] ".to_string(),
            Style::default()
                .fg(Color::Rgb(152, 195, 121))
                .add_modifier(Modifier::BOLD),
        ),
        Some(false) => (
            "[ ] ".to_string(),
            Style::default()
                .fg(Color::Rgb(255, 203, 107))
                .add_modifier(Modifier::BOLD),
        ),
        None if ordered => (
            format!("{}. ", number.unwrap_or(1)),
            Style::default()
                .fg(Color::Rgb(97, 175, 239))
                .add_modifier(Modifier::BOLD),
        ),
        None => (
            "• ".to_string(),
            Style::default()
                .fg(Color::Rgb(209, 154, 102))
                .add_modifier(Modifier::BOLD),
        ),
    };

    let continuation_indent = " ".repeat(indent_text.len() + marker_text.len());
    wrap_inline_lines_with_hits(
        lines,
        width,
        vec![
            Span::raw(indent_text),
            Span::styled(marker_text, marker_style),
        ],
        vec![Span::raw(continuation_indent)],
    )
}

fn preview_footnote_render(label: &str, lines: &[InlineLine], width: usize) -> PreviewRender {
    let prefix = format!("[{}] ", label);
    let continuation = " ".repeat(prefix.len());
    wrap_inline_lines_with_hits(
        lines,
        width,
        vec![Span::styled(
            prefix,
            Style::default()
                .fg(Color::Rgb(198, 120, 221))
                .add_modifier(Modifier::BOLD),
        )],
        vec![Span::raw(continuation)],
    )
}

fn remember_footnote_label(order: &mut Vec<String>, label: &str) {
    if !label.is_empty() && !order.iter().any(|existing| existing == label) {
        order.push(label.to_string());
    }
}

fn collect_footnote_labels_from_line(line: &InlineLine, order: &mut Vec<String>) {
    for segment in line {
        if segment.role == InlineRole::FootnoteReference {
            if let Some(label) = segment.target.as_deref() {
                remember_footnote_label(order, label);
            }
        }
    }
}

fn collect_footnote_labels_from_lines(lines: &[InlineLine], order: &mut Vec<String>) {
    for line in lines {
        collect_footnote_labels_from_line(line, order);
    }
}

fn footnote_numbering(blocks: &[MdBlock]) -> HashMap<String, usize> {
    let mut order = Vec::new();

    for block in blocks {
        match block {
            MdBlock::Heading { content, .. } => {
                collect_footnote_labels_from_line(content, &mut order)
            }
            MdBlock::Paragraph { lines } | MdBlock::ListItem { lines, .. } => {
                collect_footnote_labels_from_lines(lines, &mut order)
            }
            MdBlock::BlockQuote { title, lines, .. } => {
                if let Some(title) = title {
                    collect_footnote_labels_from_line(title, &mut order);
                }
                collect_footnote_labels_from_lines(lines, &mut order);
            }
            MdBlock::Table { header, rows, .. } => {
                collect_footnote_labels_from_lines(header, &mut order);
                for row in rows {
                    collect_footnote_labels_from_lines(row, &mut order);
                }
            }
            MdBlock::Image { alt, .. } => collect_footnote_labels_from_line(alt, &mut order),
            MdBlock::FootnoteDefinition { label, lines } => {
                remember_footnote_label(&mut order, label);
                collect_footnote_labels_from_lines(lines, &mut order);
            }
            MdBlock::CodeBlock { .. }
            | MdBlock::Mermaid { .. }
            | MdBlock::HtmlBlock { .. }
            | MdBlock::DisplayMath { .. }
            | MdBlock::HorizontalRule => {}
        }
    }

    order
        .into_iter()
        .enumerate()
        .map(|(index, label)| (label, index + 1))
        .collect()
}

fn normalize_inline_line_for_preview(
    line: &InlineLine,
    numbering: &HashMap<String, usize>,
) -> InlineLine {
    line.iter()
        .cloned()
        .map(|mut segment| {
            if segment.role == InlineRole::FootnoteReference {
                let label = segment
                    .target
                    .as_deref()
                    .map(ToString::to_string)
                    .unwrap_or_else(|| {
                        segment
                            .text
                            .trim_start_matches("[^")
                            .trim_start_matches('[')
                            .trim_end_matches(']')
                            .to_string()
                    });
                let display = numbering
                    .get(&label)
                    .map(|number| number.to_string())
                    .unwrap_or(label);
                segment.text = format!("[{}]", display);
            }
            segment
        })
        .collect()
}

fn normalize_inline_lines_for_preview(
    lines: &[InlineLine],
    numbering: &HashMap<String, usize>,
) -> Vec<InlineLine> {
    lines
        .iter()
        .map(|line| normalize_inline_line_for_preview(line, numbering))
        .collect()
}

fn normalize_blocks_for_preview(blocks: &[MdBlock]) -> Vec<MdBlock> {
    let numbering = footnote_numbering(blocks);

    blocks
        .iter()
        .map(|block| match block {
            MdBlock::Heading { level, content } => MdBlock::Heading {
                level: *level,
                content: normalize_inline_line_for_preview(content, &numbering),
            },
            MdBlock::Paragraph { lines } => MdBlock::Paragraph {
                lines: normalize_inline_lines_for_preview(lines, &numbering),
            },
            MdBlock::CodeBlock { language, code } => MdBlock::CodeBlock {
                language: language.clone(),
                code: code.clone(),
            },
            MdBlock::Mermaid { code } => MdBlock::Mermaid { code: code.clone() },
            MdBlock::Table {
                header,
                rows,
                alignments,
            } => MdBlock::Table {
                header: normalize_inline_lines_for_preview(header, &numbering),
                rows: rows
                    .iter()
                    .map(|row| normalize_inline_lines_for_preview(row, &numbering))
                    .collect(),
                alignments: alignments.clone(),
            },
            MdBlock::BlockQuote {
                kind,
                title,
                collapsed,
                lines,
                depth,
            } => MdBlock::BlockQuote {
                kind: *kind,
                title: title
                    .as_ref()
                    .map(|title| normalize_inline_line_for_preview(title, &numbering)),
                collapsed: *collapsed,
                lines: normalize_inline_lines_for_preview(lines, &numbering),
                depth: *depth,
            },
            MdBlock::ListItem {
                ordered,
                number,
                checked,
                indent,
                lines,
            } => MdBlock::ListItem {
                ordered: *ordered,
                number: *number,
                checked: *checked,
                indent: *indent,
                lines: normalize_inline_lines_for_preview(lines, &numbering),
            },
            MdBlock::Image { alt, src } => MdBlock::Image {
                alt: normalize_inline_line_for_preview(alt, &numbering),
                src: src.clone(),
            },
            MdBlock::HtmlBlock { raw } => MdBlock::HtmlBlock { raw: raw.clone() },
            MdBlock::FootnoteDefinition { label, lines } => MdBlock::FootnoteDefinition {
                label: numbering
                    .get(label)
                    .map(|number| number.to_string())
                    .unwrap_or_else(|| label.clone()),
                lines: normalize_inline_lines_for_preview(lines, &numbering),
            },
            MdBlock::DisplayMath { text } => MdBlock::DisplayMath { text: text.clone() },
            MdBlock::HorizontalRule => MdBlock::HorizontalRule,
        })
        .collect()
}

fn preview_image_render(alt: &InlineLine, src: &str, width: usize) -> PreviewRender {
    preview_image_render_localized(alt, src, width, Language::En)
}

fn preview_image_render_localized(
    alt: &InlineLine,
    src: &str,
    width: usize,
    language: Language,
) -> PreviewRender {
    let lines = preview_image_lines_localized(alt, src, width, language);
    let label = plain_text_from_line(alt);
    let hits = if src.trim().is_empty() {
        Vec::new()
    } else {
        lines
            .iter()
            .enumerate()
            .filter_map(|(line, text)| {
                let end_col = line_display_width(text);
                (end_col > 0).then(|| PreviewHit {
                    line,
                    start_col: 0,
                    end_col,
                    kind: PreviewTargetKind::Image,
                    target: src.to_string(),
                    label: if label.trim().is_empty() {
                        language
                            .translator()
                            .text(TextKey::PreviewImage)
                            .to_string()
                    } else {
                        label.clone()
                    },
                })
            })
            .collect()
    };

    PreviewRender {
        lines,
        hits,
        images: Vec::new(),
    }
}

fn preview_block_to_render(block: &MdBlock, width: u16) -> PreviewRender {
    preview_block_to_render_localized(block, width, Language::En)
}

fn preview_block_to_render_localized(
    block: &MdBlock,
    width: u16,
    language: Language,
) -> PreviewRender {
    let t = language.translator();
    let width = width.max(1) as usize;
    match block {
        MdBlock::Heading { level, content } => preview_heading_render(*level, content, width),
        MdBlock::Paragraph { lines } => {
            wrap_inline_lines_with_hits(lines, width, Vec::new(), Vec::new())
        }
        MdBlock::CodeBlock { language, code } => {
            let label = if language.trim().is_empty() {
                t.text(TextKey::EditorCodeBadge).to_string()
            } else {
                format!("{} {}", t.text(TextKey::EditorCodeBadge), language.trim())
            };
            PreviewRender {
                lines: preview_code_lines(label.as_str(), code, width, false),
                hits: Vec::new(),
                images: Vec::new(),
            }
        }
        MdBlock::Mermaid { code } => PreviewRender {
            lines: preview_code_lines(t.text(TextKey::EditorMermaidBadge), code, width, true),
            hits: Vec::new(),
            images: Vec::new(),
        },
        MdBlock::Table {
            header,
            rows,
            alignments,
        } => PreviewRender {
            lines: preview_table_lines_localized(header, rows, alignments, width, language),
            hits: Vec::new(),
            images: Vec::new(),
        },
        MdBlock::BlockQuote {
            kind,
            title,
            collapsed,
            lines,
            depth,
        } => preview_quote_render_localized(
            *kind,
            title.as_ref(),
            *collapsed,
            *depth,
            lines,
            width,
            language,
        ),
        MdBlock::ListItem {
            ordered,
            number,
            checked,
            indent,
            lines,
        } => preview_list_item_render(*ordered, *number, *checked, *indent, lines, width),
        MdBlock::Image { alt, src } => preview_image_render_localized(alt, src, width, language),
        MdBlock::HtmlBlock { raw } => PreviewRender {
            lines: preview_html_lines_localized(raw, width, language),
            hits: Vec::new(),
            images: Vec::new(),
        },
        MdBlock::FootnoteDefinition { label, lines } => {
            preview_footnote_render(label, lines, width)
        }
        MdBlock::DisplayMath { text } => PreviewRender {
            lines: preview_display_math_lines_localized(text, width, language),
            hits: Vec::new(),
            images: Vec::new(),
        },
        MdBlock::HorizontalRule => PreviewRender {
            lines: vec![styled_text_line(
                "─".repeat(width),
                Style::default().fg(Color::Rgb(88, 96, 105)),
            )],
            hits: Vec::new(),
            images: Vec::new(),
        },
    }
}

fn preview_block_to_lines(block: &MdBlock, width: u16) -> Vec<Line<'static>> {
    preview_block_to_render(block, width).lines
}

fn build_preview_lines(blocks: &[MdBlock], width: u16) -> Vec<Line<'static>> {
    build_preview_render(blocks, width).lines
}

fn build_preview_render(blocks: &[MdBlock], width: u16) -> PreviewRender {
    let mut output = PreviewRender::default();
    let mut previous_was_list = false;

    for block in blocks {
        let current_is_list = matches!(block, MdBlock::ListItem { .. });
        if !output.lines.is_empty() && !(previous_was_list && current_is_list) {
            output.lines.push(Line::raw(""));
        }
        append_preview_render(&mut output, preview_block_to_render(block, width));
        previous_was_list = current_is_list;
    }

    output
}

impl Editor {
    pub fn new() -> Self {
        Self {
            buffer: Rope::new(),
            current_file: None,
            is_modified: false,
            cursor_line: 0,
            cursor_col: 0,
            scroll_offset: 0,
            horizontal_scroll: 0,
            viewport_width: 1,
            viewport_height: 1,
            links: RefCell::new(Vec::new()),
            block_refs: RefCell::new(HashMap::new()),
            document_index_dirty: Cell::new(false),
            document_version: Cell::new(0),
            saved_snapshot: Rope::new(),
            modified_files: HashMap::new(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            workspace_root: None,
            preview_picker: RefCell::new(None),
            preview_image_cache: RefCell::new(HashMap::new()),
            preview_render_cache: RefCell::new(HashMap::new()),
            language: Language::En,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
        self.preview_render_cache.borrow_mut().clear();
    }

    /// Initialize the editor
    pub fn init(&mut self) {
        // Load default content or last opened file
    }

    /// Check if editor has content
    pub fn has_content(&self) -> bool {
        self.buffer.len_bytes() > 0
    }

    /// Get current file path
    pub fn current_file(&self) -> Option<String> {
        self.current_file.clone()
    }

    /// Get current file name for UI display.
    pub fn current_file_name(&self) -> String {
        self.current_file
            .as_deref()
            .and_then(|path| std::path::Path::new(path).file_name())
            .and_then(|name| name.to_str())
            .unwrap_or("notes.md")
            .to_string()
    }

    pub fn set_workspace_root(&mut self, workspace_root: PathBuf) {
        self.workspace_root = Some(workspace_root);
    }

    pub fn init_preview_images(&self) {
        if self.preview_picker.borrow().is_some() {
            return;
        }

        let picker = Picker::from_query_stdio()
            .unwrap_or_else(|_| Picker::from_fontsize(DEFAULT_PREVIEW_FONT_SIZE));
        *self.preview_picker.borrow_mut() = Some(picker);
    }

    /// Current cursor line (1-indexed).
    pub fn cursor_line_number(&self) -> usize {
        self.cursor_line + 1
    }

    /// Current cursor column (1-indexed).
    pub fn cursor_column_number(&self) -> usize {
        self.cursor_col + 1
    }

    /// Whether the buffer has unsaved changes.
    pub fn is_modified(&self) -> bool {
        self.is_modified
    }

    /// Set the cursor to a specific line and column.
    pub fn set_cursor_position(&mut self, line: usize, column: usize) {
        let max_line = self.buffer.len_lines().saturating_sub(1);
        self.cursor_line = line.min(max_line);
        let line_len = self.line_len_chars(self.cursor_line);
        self.cursor_col = column.min(line_len);
        self.ensure_cursor_visible();
    }

    /// Update the currently visible editor viewport.
    pub fn set_viewport(&mut self, area: Rect) {
        self.viewport_width = area.width.saturating_sub(2).max(1);
        self.viewport_height = area.height.saturating_sub(2).max(1);
        self.ensure_cursor_visible();
    }

    /// Map a screen click inside the editor area back to a document cursor.
    pub fn set_cursor_from_screen_position(&mut self, area: Rect, x: u16, y: u16) -> bool {
        self.set_viewport(area);
        if x <= area.x
            || x >= area.x + area.width.saturating_sub(1)
            || y <= area.y
            || y >= area.y + area.height.saturating_sub(1)
        {
            return false;
        }

        let visible_line = y.saturating_sub(area.y + 1) as usize;
        let line =
            (self.scroll_offset + visible_line).min(self.buffer.len_lines().saturating_sub(1));
        let line_text = self.line_text(line);
        let line_len = line_text.chars().count();
        let display_col = self.horizontal_scroll + x.saturating_sub(area.x + 1) as usize;
        let column = Self::char_index_for_display_column(line_text.as_str(), display_col);
        self.cursor_line = line;
        self.cursor_col = column.min(line_len);
        self.ensure_cursor_visible();
        true
    }

    pub fn move_cursor_up_command(&mut self) {
        self.move_cursor_up();
    }

    pub fn move_cursor_down_command(&mut self) {
        self.move_cursor_down();
    }

    pub fn move_cursor_left_command(&mut self) {
        self.move_cursor_left();
    }

    pub fn move_cursor_right_command(&mut self) {
        self.move_cursor_right();
    }

    pub fn move_cursor_word_forward(&mut self) {
        let mut line = self.cursor_line;
        let mut column = self.cursor_col;

        loop {
            let chars: Vec<char> = self.line_text(line).chars().collect();

            while column < chars.len() && Self::is_word_char(chars[column]) {
                column += 1;
            }
            while column < chars.len() && !Self::is_word_char(chars[column]) {
                column += 1;
            }

            if column < chars.len() {
                self.cursor_line = line;
                self.cursor_col = column;
                self.ensure_cursor_visible();
                return;
            }

            if line >= self.max_line_index() {
                self.cursor_line = line;
                self.cursor_col = chars.len();
                self.ensure_cursor_visible();
                return;
            }

            line += 1;
            column = 0;
        }
    }

    pub fn move_cursor_word_backward(&mut self) {
        if self.cursor_line == 0 && self.cursor_col == 0 {
            return;
        }

        let mut line = self.cursor_line;
        let mut column = self.cursor_col;

        loop {
            let chars: Vec<char> = self.line_text(line).chars().collect();
            if column > chars.len() {
                column = chars.len();
            }

            if column == 0 {
                if line == 0 {
                    self.cursor_line = 0;
                    self.cursor_col = 0;
                    self.ensure_cursor_visible();
                    return;
                }
                line -= 1;
                column = self.line_len_chars(line);
                continue;
            }

            column -= 1;
            while column > 0 && !Self::is_word_char(chars[column]) {
                column -= 1;
            }

            if Self::is_word_char(chars[column]) {
                while column > 0 && Self::is_word_char(chars[column - 1]) {
                    column -= 1;
                }
                self.cursor_line = line;
                self.cursor_col = column;
                self.ensure_cursor_visible();
                return;
            }

            if line == 0 {
                self.cursor_line = 0;
                self.cursor_col = 0;
                self.ensure_cursor_visible();
                return;
            }

            line -= 1;
            column = self.line_len_chars(line);
        }
    }

    pub fn move_cursor_to_line_start(&mut self) {
        self.cursor_col = 0;
        self.ensure_cursor_visible();
    }

    pub fn move_cursor_to_line_end(&mut self) {
        self.cursor_col = self.line_len_chars(self.cursor_line);
        self.ensure_cursor_visible();
    }

    pub fn move_cursor_to_document_start(&mut self) {
        self.cursor_line = 0;
        self.cursor_col = 0;
        self.ensure_cursor_visible();
    }

    pub fn move_cursor_to_document_end(&mut self) {
        self.cursor_line = self.max_line_index();
        self.cursor_col = self.line_len_chars(self.cursor_line);
        self.ensure_cursor_visible();
    }

    pub fn move_half_page_down(&mut self) {
        let step = (self.visible_height() / 2).max(1);
        self.cursor_line = (self.cursor_line + step).min(self.max_line_index());
        self.cursor_col = self.cursor_col.min(self.line_len_chars(self.cursor_line));
        self.ensure_cursor_visible();
    }

    pub fn move_half_page_up(&mut self) {
        let step = (self.visible_height() / 2).max(1);
        self.cursor_line = self.cursor_line.saturating_sub(step);
        self.cursor_col = self.cursor_col.min(self.line_len_chars(self.cursor_line));
        self.ensure_cursor_visible();
    }

    pub fn open_line_below(&mut self) {
        self.cursor_col = self.line_len_chars(self.cursor_line);
        self.insert_newline();
    }

    pub fn cursor_screen_position(&self, area: Rect) -> Option<(u16, u16)> {
        let visible_y = self.cursor_line.checked_sub(self.scroll_offset)?;
        if visible_y >= area.height.saturating_sub(2) as usize {
            return None;
        }

        let line_text = self.line_text(self.cursor_line);
        let display_col = Self::display_width_for_char_index(line_text.as_str(), self.cursor_col);
        let visible_x = display_col.checked_sub(self.horizontal_scroll)?;
        if visible_x >= area.width.saturating_sub(2) as usize {
            return None;
        }

        Some((area.x + 1 + visible_x as u16, area.y + 1 + visible_y as u16))
    }

    pub fn link_at_screen_position(&self, area: Rect, x: u16, y: u16) -> Option<EditorLink> {
        if x <= area.x
            || x >= area.x + area.width.saturating_sub(1)
            || y <= area.y
            || y >= area.y + area.height.saturating_sub(1)
        {
            return None;
        }

        let line =
            (self.scroll_offset + y.saturating_sub(area.y + 1) as usize).min(self.max_line_index());
        let line_text = self.line_text(line);
        let display_col = self.horizontal_scroll + x.saturating_sub(area.x + 1) as usize;
        let column = Self::char_index_for_display_column(line_text.as_str(), display_col);
        self.ensure_document_index();
        self.links
            .borrow()
            .iter()
            .find(|link| link.line == line && column >= link.start_col && column < link.end_col)
            .cloned()
    }

    pub fn link_at_cursor(&self) -> Option<EditorLink> {
        self.ensure_document_index();
        self.links
            .borrow()
            .iter()
            .find(|link| {
                link.line == self.cursor_line
                    && self.cursor_col >= link.start_col
                    && self.cursor_col < link.end_col
            })
            .cloned()
    }

    pub fn block_ref_at_cursor(&self) -> Option<BlockRef> {
        self.ensure_document_index();
        Self::parse_block_ref_hits_in_line(
            self.cursor_line,
            self.line_text(self.cursor_line).as_str(),
        )
        .into_iter()
        .find(|(start_col, end_col, _)| self.cursor_col >= *start_col && self.cursor_col < *end_col)
        .and_then(|(_, _, id)| self.block_refs.borrow().get(&id).cloned())
    }

    pub fn synced_preview_scroll(&self, area: Rect) -> usize {
        self.preview_scroll_from_editor_scroll(area, self.scroll_offset)
    }

    pub fn preview_scroll_from_editor_scroll(&self, area: Rect, editor_scroll: usize) -> usize {
        let render = self.preview_render_for_width(area.width.saturating_sub(2));
        let max_scroll = render
            .lines
            .len()
            .saturating_sub(area.height.saturating_sub(2) as usize);
        map_preview_scroll(editor_scroll, self.max_vertical_scroll(), max_scroll)
    }

    pub fn preview_max_scroll(&self, area: Rect) -> usize {
        let render = self.preview_render_for_width(area.width.saturating_sub(2));
        render
            .lines
            .len()
            .saturating_sub(area.height.saturating_sub(2) as usize)
    }

    pub fn preview_targets(&self, area: Rect) -> Vec<PreviewHit> {
        let render = self.preview_render_for_width(area.width.saturating_sub(2));
        let mut deduped = Vec::new();
        for hit in render.hits {
            let duplicate = deduped.last().is_some_and(|last: &PreviewHit| {
                last.kind == hit.kind
                    && last.target == hit.target
                    && last.label == hit.label
                    && last.end_col == hit.end_col
                    && last.start_col == hit.start_col
                    && last.line + 1 >= hit.line
            });
            if !duplicate {
                deduped.push(hit);
            }
        }
        deduped
    }

    pub fn preview_hit_at_screen_position(&self, area: Rect, x: u16, y: u16) -> Option<PreviewHit> {
        let preview_scroll = self.synced_preview_scroll(area);
        self.preview_hit_at_screen_position_with_scroll(area, x, y, preview_scroll)
    }

    pub fn preview_hit_at_screen_position_with_scroll(
        &self,
        area: Rect,
        x: u16,
        y: u16,
        preview_scroll: usize,
    ) -> Option<PreviewHit> {
        if x <= area.x
            || x >= area.x + area.width.saturating_sub(1)
            || y <= area.y
            || y >= area.y + area.height.saturating_sub(1)
        {
            return None;
        }

        let render = self.preview_render_for_width(area.width.saturating_sub(2));

        let preview_line = preview_scroll + y.saturating_sub(area.y + 1) as usize;
        let display_col = x.saturating_sub(area.x + 1) as usize;

        render.hits.into_iter().find(|hit| {
            hit.line == preview_line && display_col >= hit.start_col && display_col < hit.end_col
        })
    }

    pub fn block_ref_by_id(&self, block_id: &str) -> Option<BlockRef> {
        self.ensure_document_index();
        self.block_refs.borrow().get(block_id).cloned()
    }

    /// Load a file into the editor
    pub fn load_file(&mut self, path: &str) {
        match std::fs::read_to_string(path) {
            Ok(content) => {
                self.buffer = Rope::from_str(&content);
                self.current_file = Some(path.to_string());
                self.is_modified = false;
                self.cursor_line = 0;
                self.cursor_col = 0;
                self.scroll_offset = 0;
                self.horizontal_scroll = 0;
                self.saved_snapshot = self.buffer.clone();
                self.modified_files.clear();
                self.undo_stack.clear();
                self.redo_stack.clear();
                self.invalidate_buffer_caches();
                self.parse_document();
                self.refresh_modified_tracking();
                self.ensure_cursor_visible();
                self.preview_image_cache.borrow_mut().clear();
            }
            Err(e) => {
                tracing::error!("Failed to load file {}: {}", path, e);
            }
        }
    }

    /// Create a new file
    pub fn create_file(&mut self, name: &str) {
        self.buffer = Rope::from_str("");
        self.current_file = Some(name.to_string());
        self.cursor_line = 0;
        self.cursor_col = 0;
        self.scroll_offset = 0;
        self.horizontal_scroll = 0;
        self.saved_snapshot = self.buffer.clone();
        self.modified_files.clear();
        self.undo_stack.clear();
        self.redo_stack.clear();
        self.invalidate_buffer_caches();
        self.refresh_modified_tracking();
        self.preview_image_cache.borrow_mut().clear();
    }

    /// Save the current file
    pub fn save_file(&mut self, path: &str) {
        let content = self.buffer.to_string();
        if let Some(parent) = std::path::Path::new(path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::write(path, content) {
            tracing::error!("Failed to save file {}: {}", path, e);
        } else {
            self.saved_snapshot = self.buffer.clone();
            self.refresh_modified_tracking();
            tracing::info!("Saved file: {}", path);
        }
    }

    /// Save all modified files
    pub fn save_all(&mut self) {
        for (path, buffer) in &self.modified_files {
            if let Err(e) = std::fs::write(path, buffer.to_string()) {
                tracing::error!("Failed to save file {}: {}", path, e);
            }
        }
        if self.current_file.is_some() {
            self.saved_snapshot = self.buffer.clone();
        }
        self.modified_files.clear();
        self.refresh_modified_tracking();
    }

    /// Parse the document for wiki links and block references
    fn parse_document(&self) {
        let mut links = Vec::new();
        let mut block_refs = HashMap::new();
        let text = self.buffer.to_string();
        for (line_idx, line) in text.lines().enumerate() {
            links.extend(Self::parse_wiki_embeds_in_line(line_idx, line));
            links.extend(Self::parse_wiki_links_in_line(line_idx, line));
            links.extend(Self::parse_markdown_images_in_line(line_idx, line));
            links.extend(Self::parse_markdown_links_in_line(line_idx, line));
            for block_ref in Self::parse_block_refs_in_line(line_idx, line) {
                block_refs.insert(block_ref.id.clone(), block_ref);
            }
        }

        *self.links.borrow_mut() = links;
        *self.block_refs.borrow_mut() = block_refs;
        self.document_index_dirty.set(false);
    }

    fn ensure_document_index(&self) {
        if self.document_index_dirty.get() {
            self.parse_document();
        }
    }

    fn invalidate_buffer_caches(&self) {
        self.document_index_dirty.set(true);
        self.document_version
            .set(self.document_version.get().wrapping_add(1));
        self.preview_render_cache.borrow_mut().clear();
    }

    fn parse_wiki_embeds_in_line(line_idx: usize, line: &str) -> Vec<EditorLink> {
        let mut links = Vec::new();
        let mut search_start = 0;

        while let Some(offset) = line[search_start..].find("![[") {
            let start_byte = search_start + offset;
            let rest = &line[start_byte + 3..];
            let Some(close_offset) = rest.find("]]") else {
                break;
            };

            let end_byte = start_byte + 3 + close_offset + 2;
            let inner = &rest[..close_offset];
            let (target, label) = split_target_alias(inner);

            if !target.is_empty() {
                let kind = if is_image_target(&target) {
                    EditorLinkKind::Image
                } else {
                    EditorLinkKind::Wiki
                };

                links.push(EditorLink {
                    kind,
                    line: line_idx,
                    start_col: Self::byte_to_char_index(line, start_byte),
                    end_col: Self::byte_to_char_index(line, end_byte),
                    target: target.clone(),
                    label: Some(label.unwrap_or_else(|| {
                        if kind == EditorLinkKind::Image {
                            default_image_label(&target)
                        } else {
                            target.clone()
                        }
                    })),
                    raw_text: line[start_byte..end_byte].to_string(),
                });
            }

            search_start = end_byte;
        }

        links
    }

    fn parse_wiki_links_in_line(line_idx: usize, line: &str) -> Vec<EditorLink> {
        let mut links = Vec::new();
        let mut search_start = 0;

        while let Some(offset) = line[search_start..].find("[[") {
            let start_byte = search_start + offset;
            if start_byte > 0 && line.as_bytes()[start_byte - 1] == b'!' {
                search_start = start_byte + 2;
                continue;
            }
            let rest = &line[start_byte + 2..];
            let Some(close_offset) = rest.find("]]") else {
                break;
            };

            let end_byte = start_byte + 2 + close_offset + 2;
            let inner = &rest[..close_offset];
            let (target, label) = split_target_alias(inner);

            if !target.is_empty() {
                links.push(EditorLink {
                    kind: EditorLinkKind::Wiki,
                    line: line_idx,
                    start_col: Self::byte_to_char_index(line, start_byte),
                    end_col: Self::byte_to_char_index(line, end_byte),
                    target,
                    label,
                    raw_text: line[start_byte..end_byte].to_string(),
                });
            }

            search_start = end_byte;
        }

        links
    }

    fn parse_markdown_images_in_line(line_idx: usize, line: &str) -> Vec<EditorLink> {
        let bytes = line.as_bytes();
        let mut index = 0;
        let mut links = Vec::new();

        while index < bytes.len() {
            if bytes[index] != b'!' || index + 1 >= bytes.len() || bytes[index + 1] != b'[' {
                index += 1;
                continue;
            }

            if index + 2 < bytes.len() && bytes[index + 2] == b'[' {
                index += 1;
                continue;
            }

            let Some(label_end_rel) = line[index + 2..].find("](") else {
                index += 1;
                continue;
            };
            let label_end = index + 2 + label_end_rel;
            let target_start = label_end + 2;
            let Some(target_end_rel) = line[target_start..].find(')') else {
                index += 1;
                continue;
            };
            let target_end = target_start + target_end_rel;
            let end_byte = target_end + 1;

            let label = line[index + 2..label_end].trim().to_string();
            let target = line[target_start..target_end].trim().to_string();
            if !target.is_empty() {
                links.push(EditorLink {
                    kind: EditorLinkKind::Image,
                    line: line_idx,
                    start_col: Self::byte_to_char_index(line, index),
                    end_col: Self::byte_to_char_index(line, end_byte),
                    target,
                    label: Some(if label.is_empty() {
                        default_image_label(line[target_start..target_end].trim())
                    } else {
                        label
                    }),
                    raw_text: line[index..end_byte].to_string(),
                });
            }

            index = end_byte;
        }

        links
    }

    fn parse_markdown_links_in_line(line_idx: usize, line: &str) -> Vec<EditorLink> {
        let bytes = line.as_bytes();
        let mut index = 0;
        let mut links = Vec::new();

        while index < bytes.len() {
            if bytes[index] != b'[' {
                index += 1;
                continue;
            }

            if index + 1 < bytes.len() && bytes[index + 1] == b'[' {
                index += 2;
                continue;
            }

            if index > 0 && bytes[index - 1] == b'!' {
                index += 1;
                continue;
            }

            let Some(label_end_rel) = line[index + 1..].find("](") else {
                index += 1;
                continue;
            };
            let label_end = index + 1 + label_end_rel;
            let target_start = label_end + 2;
            let Some(target_end_rel) = line[target_start..].find(')') else {
                index += 1;
                continue;
            };
            let target_end = target_start + target_end_rel;
            let end_byte = target_end + 1;

            let label = line[index + 1..label_end].trim().to_string();
            let target = line[target_start..target_end].trim().to_string();
            if !target.is_empty() {
                links.push(EditorLink {
                    kind: EditorLinkKind::Markdown,
                    line: line_idx,
                    start_col: Self::byte_to_char_index(line, index),
                    end_col: Self::byte_to_char_index(line, end_byte),
                    target,
                    label: Some(label),
                    raw_text: line[index..end_byte].to_string(),
                });
            }

            index = end_byte;
        }

        links
    }

    fn parse_block_refs_in_line(line_idx: usize, line: &str) -> Vec<BlockRef> {
        let mut refs = Vec::new();
        for (_, _, id) in Self::parse_block_ref_hits_in_line(line_idx, line) {
            if !id.is_empty() {
                refs.push(BlockRef {
                    id,
                    file_path: String::new(),
                    line: line_idx,
                    content: line.trim().to_string(),
                });
            }
        }

        refs
    }

    fn parse_block_ref_hits_in_line(line_idx: usize, line: &str) -> Vec<(usize, usize, String)> {
        let mut hits = Vec::new();
        let mut search_start = 0;

        while let Some(offset) = line[search_start..].find("((") {
            let start_byte = search_start + offset;
            let rest = &line[start_byte + 2..];
            let Some(close_offset) = rest.find("))") else {
                break;
            };
            let end_byte = start_byte + 2 + close_offset + 2;
            let id = rest[..close_offset].trim().to_string();
            hits.push((
                Self::byte_to_char_index(line, start_byte),
                Self::byte_to_char_index(line, end_byte),
                id,
            ));
            search_start = end_byte;
        }

        if line_idx > 0 && hits.is_empty() {
            return Vec::new();
        }

        hits
    }

    fn byte_to_char_index(line: &str, byte_idx: usize) -> usize {
        line[..byte_idx.min(line.len())].chars().count()
    }

    fn line_len_chars(&self, line: usize) -> usize {
        let rope_line = self.buffer.line(self.clamp_line_index(line));
        let len = rope_line.len_chars();
        if len > 0 && rope_line.char(len - 1) == '\n' {
            len - 1
        } else {
            len
        }
    }

    fn line_text(&self, line: usize) -> String {
        self.buffer
            .line(self.clamp_line_index(line))
            .to_string()
            .trim_end_matches('\n')
            .to_string()
    }

    fn visible_width(&self) -> usize {
        self.viewport_width.max(1) as usize
    }

    fn visible_height(&self) -> usize {
        self.viewport_height.max(1) as usize
    }

    fn max_vertical_scroll(&self) -> usize {
        self.buffer
            .len_lines()
            .saturating_sub(self.visible_height())
    }

    fn max_line_index(&self) -> usize {
        self.buffer.len_lines().saturating_sub(1)
    }

    fn clamp_line_index(&self, line: usize) -> usize {
        line.min(self.max_line_index())
    }

    fn clamp_cursor_to_buffer(&mut self) {
        self.cursor_line = self.clamp_line_index(self.cursor_line);
        self.cursor_col = self.cursor_col.min(self.line_len_chars(self.cursor_line));
        self.scroll_offset = self.scroll_offset.min(self.max_vertical_scroll());
    }

    fn current_line_display_col(&self) -> usize {
        Self::display_width_for_char_index(
            self.line_text(self.cursor_line).as_str(),
            self.cursor_col,
        )
    }

    fn ensure_cursor_visible(&mut self) {
        self.clamp_cursor_to_buffer();
        let visible_height = self.visible_height();
        if self.cursor_line < self.scroll_offset {
            self.scroll_offset = self.cursor_line;
        } else if self.cursor_line >= self.scroll_offset + visible_height {
            self.scroll_offset = self.cursor_line + 1 - visible_height;
        }
        self.scroll_offset = self.scroll_offset.min(self.max_vertical_scroll());

        let visible_width = self.visible_width();
        let display_col = self.current_line_display_col();
        if display_col < self.horizontal_scroll {
            self.horizontal_scroll = display_col;
        } else if display_col >= self.horizontal_scroll + visible_width {
            self.horizontal_scroll = display_col + 1 - visible_width;
        }
    }

    fn clamp_cursor_to_view(&mut self) {
        let visible_height = self.visible_height();
        if visible_height == 0 {
            return;
        }

        let max_line = self.buffer.len_lines().saturating_sub(1);
        if self.cursor_line < self.scroll_offset {
            self.cursor_line = self.scroll_offset.min(max_line);
        } else if self.cursor_line >= self.scroll_offset + visible_height {
            self.cursor_line = (self.scroll_offset + visible_height - 1).min(max_line);
        }
        self.cursor_col = self.cursor_col.min(self.line_len_chars(self.cursor_line));
        self.ensure_cursor_visible();
    }

    fn is_word_char(c: char) -> bool {
        c.is_alphanumeric() || matches!(c, '_' | '-')
    }

    fn display_width_for_char_index(text: &str, char_idx: usize) -> usize {
        text.chars()
            .take(char_idx)
            .map(|ch| UnicodeWidthChar::width(ch).unwrap_or(0))
            .sum()
    }

    fn char_index_for_display_column(text: &str, display_col: usize) -> usize {
        let mut width = 0;
        let mut char_idx = 0;

        for ch in text.chars() {
            let char_width = UnicodeWidthChar::width(ch).unwrap_or(0);
            if width >= display_col {
                break;
            }

            let next_width = width + char_width;
            if next_width > display_col {
                let distance_to_left = display_col.saturating_sub(width);
                let distance_to_right = next_width.saturating_sub(display_col);
                if distance_to_right <= distance_to_left {
                    char_idx += 1;
                }
                break;
            }

            width = next_width;
            char_idx += 1;
        }

        char_idx.min(text.chars().count())
    }

    fn cursor_snapshot(&self) -> CursorSnapshot {
        CursorSnapshot {
            line: self.cursor_line,
            column: self.cursor_col,
            scroll_offset: self.scroll_offset,
            horizontal_scroll: self.horizontal_scroll,
        }
    }

    fn restore_cursor_snapshot(&mut self, snapshot: CursorSnapshot) {
        self.cursor_line = snapshot.line;
        self.cursor_col = snapshot.column;
        self.scroll_offset = snapshot.scroll_offset;
        self.horizontal_scroll = snapshot.horizontal_scroll;
        self.ensure_cursor_visible();
    }

    fn refresh_modified_tracking(&mut self) {
        self.is_modified = self.buffer != self.saved_snapshot;

        self.modified_files.clear();
        if self.is_modified {
            if let Some(path) = self.current_file.clone() {
                self.modified_files.insert(path, self.buffer.clone());
            }
        }
    }

    fn push_edit_history(&mut self, entry: EditHistoryEntry, merge: bool) {
        if merge {
            if let Some(last) = self.undo_stack.last_mut() {
                if last.kind == entry.kind
                    && last.after == entry.before
                    && last.after_cursor == entry.before_cursor
                    && matches!(entry.kind, EditKind::Insert)
                {
                    last.after = entry.after;
                    last.after_cursor = entry.after_cursor;
                    self.redo_stack.clear();
                    return;
                }
            }
        }

        self.undo_stack.push(entry);
        if self.undo_stack.len() > MAX_EDIT_HISTORY {
            self.undo_stack.remove(0);
        }
        self.redo_stack.clear();
    }

    fn apply_edit<F>(&mut self, kind: EditKind, merge: bool, mutate: F) -> bool
    where
        F: FnOnce(&mut Self),
    {
        let before = self.buffer.clone();
        let before_cursor = self.cursor_snapshot();
        mutate(self);
        if self.buffer == before {
            return false;
        }

        self.invalidate_buffer_caches();
        self.ensure_cursor_visible();
        self.refresh_modified_tracking();
        let after = self.buffer.clone();
        let after_cursor = self.cursor_snapshot();
        self.push_edit_history(
            EditHistoryEntry {
                before,
                after,
                before_cursor,
                after_cursor,
                kind,
            },
            merge,
        );
        true
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        match key.code {
            crossterm::event::KeyCode::Char(c)
                if key.modifiers.is_empty()
                    || key.modifiers == crossterm::event::KeyModifiers::SHIFT =>
            {
                self.insert_char(c);
                Some(Action::Editor(EditorAction::Insert(c.to_string())))
            }
            crossterm::event::KeyCode::Enter => {
                self.insert_newline();
                Some(Action::Editor(EditorAction::Insert("\n".to_string())))
            }
            crossterm::event::KeyCode::Backspace => {
                self.delete_backward();
                Some(Action::Editor(EditorAction::Delete))
            }
            crossterm::event::KeyCode::Delete => {
                self.delete_forward();
                Some(Action::Editor(EditorAction::Delete))
            }
            crossterm::event::KeyCode::Up => {
                self.move_cursor_up();
                None
            }
            crossterm::event::KeyCode::Down => {
                self.move_cursor_down();
                None
            }
            crossterm::event::KeyCode::Left => {
                self.move_cursor_left();
                None
            }
            crossterm::event::KeyCode::Right => {
                self.move_cursor_right();
                None
            }
            crossterm::event::KeyCode::Tab => {
                self.insert_tab();
                None
            }
            _ => None,
        }
    }

    /// Handle an action
    pub fn handle_action(&mut self, action: &EditorAction) {
        match action {
            EditorAction::NavigateToLink(path) => {
                self.load_file(path);
            }
            EditorAction::NavigateToBlock(block_id) => {
                if let Some(block_ref) = self.block_ref_by_id(block_id) {
                    self.set_cursor_position(block_ref.line, 0);
                }
            }
            EditorAction::Undo => {
                self.undo();
            }
            EditorAction::Redo => {
                self.redo();
            }
            EditorAction::Scroll(delta) => {
                self.scroll_by(*delta);
            }
            _ => {}
        }
    }

    pub fn undo(&mut self) -> bool {
        let Some(entry) = self.undo_stack.pop() else {
            return false;
        };

        self.buffer = entry.before.clone();
        self.invalidate_buffer_caches();
        self.restore_cursor_snapshot(entry.before_cursor);
        self.refresh_modified_tracking();
        self.redo_stack.push(entry);
        true
    }

    pub fn redo(&mut self) -> bool {
        let Some(entry) = self.redo_stack.pop() else {
            return false;
        };

        self.buffer = entry.after.clone();
        self.invalidate_buffer_caches();
        self.restore_cursor_snapshot(entry.after_cursor);
        self.refresh_modified_tracking();
        self.undo_stack.push(entry);
        true
    }

    pub fn copy_current_line(&self) -> Option<String> {
        self.current_line_text_with_newline()
    }

    pub fn cut_current_line(&mut self) -> Option<String> {
        let copied = self.current_line_text_with_newline()?;
        if !self.apply_edit(EditKind::Cut, false, |editor| editor.raw_cut_current_line()) {
            return None;
        }
        Some(copied)
    }

    pub fn paste_text(&mut self, text: &str) -> bool {
        if text.is_empty() {
            return false;
        }

        self.apply_edit(EditKind::Paste, false, |editor| {
            editor.raw_insert_text(text)
        })
    }

    /// Set scroll offset (for sync scrolling)
    pub fn set_scroll_offset(&mut self, offset: usize) {
        self.scroll_offset = offset.min(self.max_vertical_scroll());
        self.clamp_cursor_to_view();
    }

    /// Get current scroll offset
    pub fn scroll_offset(&self) -> usize {
        self.scroll_offset
    }

    pub fn scroll_by(&mut self, delta: i32) {
        let next_offset =
            (self.scroll_offset as i32 + delta).clamp(0, self.max_vertical_scroll() as i32);
        self.scroll_offset = next_offset as usize;
        self.clamp_cursor_to_view();
    }

    fn current_line_text_with_newline(&self) -> Option<String> {
        if self.buffer.len_lines() == 0 {
            return None;
        }
        Some(
            self.buffer
                .line(self.clamp_line_index(self.cursor_line))
                .to_string(),
        )
    }

    fn raw_insert_text(&mut self, text: &str) {
        self.clamp_cursor_to_buffer();
        let pos = self.buffer.line_to_char(self.cursor_line) + self.cursor_col;
        self.buffer.insert(pos, text);
        for ch in text.chars() {
            if ch == '\n' {
                self.cursor_line += 1;
                self.cursor_col = 0;
            } else {
                self.cursor_col += 1;
            }
        }
    }

    fn raw_delete_backward(&mut self) {
        self.clamp_cursor_to_buffer();
        if self.cursor_col > 0 {
            let pos = self.buffer.line_to_char(self.cursor_line) + self.cursor_col - 1;
            self.buffer.remove(pos..pos + 1);
            self.cursor_col -= 1;
        } else if self.cursor_line > 0 {
            let prev_line = self.cursor_line - 1;
            let prev_line_end = self.buffer.line_to_char(prev_line + 1) - 1;
            let current_line_start = self.buffer.line_to_char(self.cursor_line);
            self.buffer.remove(prev_line_end..current_line_start);
            self.cursor_line -= 1;
            self.cursor_col = self.line_len_chars(self.cursor_line);
        }
    }

    fn raw_delete_forward(&mut self) {
        self.clamp_cursor_to_buffer();
        let pos = self.buffer.line_to_char(self.cursor_line) + self.cursor_col;
        if pos < self.buffer.len_chars() {
            self.buffer.remove(pos..pos + 1);
        }
    }

    fn raw_cut_current_line(&mut self) {
        self.clamp_cursor_to_buffer();
        let start = self.buffer.line_to_char(self.cursor_line);
        let end = if self.cursor_line < self.max_line_index() {
            self.buffer.line_to_char(self.cursor_line + 1)
        } else {
            self.buffer.len_chars()
        };

        if start < end {
            self.buffer.remove(start..end);
        }
        self.cursor_line = self.cursor_line.min(self.max_line_index());
        self.cursor_col = 0;
    }

    /// Insert a character at cursor
    fn insert_char(&mut self, c: char) {
        let text = c.to_string();
        let _ = self.apply_edit(EditKind::Insert, c != '\n', |editor| {
            editor.raw_insert_text(&text)
        });
    }

    /// Insert a newline
    fn insert_newline(&mut self) {
        let _ = self.apply_edit(EditKind::Insert, false, |editor| {
            editor.raw_insert_text("\n")
        });
    }

    /// Delete character backward
    fn delete_backward(&mut self) {
        let _ = self.apply_edit(EditKind::Backspace, false, |editor| {
            editor.raw_delete_backward()
        });
    }

    /// Delete character forward
    fn delete_forward(&mut self) {
        let _ = self.apply_edit(EditKind::Delete, false, |editor| {
            editor.raw_delete_forward()
        });
    }

    /// Move cursor up
    fn move_cursor_up(&mut self) {
        if self.cursor_line > 0 {
            self.cursor_line -= 1;
            let line_len = self.line_len_chars(self.cursor_line);
            self.cursor_col = self.cursor_col.min(line_len);
            self.ensure_cursor_visible();
        }
    }

    /// Move cursor down
    fn move_cursor_down(&mut self) {
        if self.cursor_line < self.buffer.len_lines() - 1 {
            self.cursor_line += 1;
            let line_len = self.line_len_chars(self.cursor_line);
            self.cursor_col = self.cursor_col.min(line_len);
            self.ensure_cursor_visible();
        }
    }

    /// Move cursor left
    fn move_cursor_left(&mut self) {
        if self.cursor_col > 0 {
            self.cursor_col -= 1;
        } else if self.cursor_line > 0 {
            self.cursor_line -= 1;
            self.cursor_col = self.line_len_chars(self.cursor_line);
        }
        self.ensure_cursor_visible();
    }

    /// Move cursor right
    fn move_cursor_right(&mut self) {
        let line_len = self.line_len_chars(self.cursor_line);
        if self.cursor_col < line_len {
            self.cursor_col += 1;
        } else if self.cursor_line < self.buffer.len_lines() - 1 {
            self.cursor_line += 1;
            self.cursor_col = 0;
        }
        self.ensure_cursor_visible();
    }

    /// Insert tab
    fn insert_tab(&mut self) {
        let _ = self.apply_edit(EditKind::Insert, false, |editor| {
            editor.raw_insert_text("    ")
        });
    }

    /// Render the editor
    pub fn render(&self, f: &mut Frame<'_>, area: Rect) {
        let visible_height = area.height.saturating_sub(2).max(1) as usize;
        let max_line = self.max_line_index();
        let start_line = self.scroll_offset.min(max_line);
        let end_line = (start_line + visible_height).min(max_line + 1);
        let lines: Vec<Line> = (start_line..end_line)
            .map(|line| {
                let text = self.line_text(line);
                self.render_line(&text)
            })
            .collect();

        let text = Text::from(lines);

        let paragraph = Paragraph::new(text)
            .block(
                Block::default()
                    .title(format!(
                        " {} ",
                        self.language.translator().text(TextKey::EditorTitle)
                    ))
                    .borders(ratatui::widgets::Borders::ALL)
                    .title_style(Style::default().fg(Color::Rgb(139, 148, 158))),
            )
            .style(
                Style::default()
                    .bg(Color::Rgb(13, 17, 23))
                    .fg(Color::Rgb(201, 209, 217)),
            )
            .scroll((0, self.horizontal_scroll as u16));

        f.render_widget(paragraph, area);
    }

    /// Render a single line with syntax highlighting
    fn render_line(&self, text: &str) -> Line<'static> {
        let mut spans: Vec<Span> = Vec::new();
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            // Check for wiki image embed ![[image.png]]
            if i + 2 < chars.len() && chars[i] == '!' && chars[i + 1] == '[' && chars[i + 2] == '['
            {
                let start = i;
                let mut j = i + 3;
                while j + 1 < chars.len() && (chars[j] != ']' || chars[j + 1] != ']') {
                    j += 1;
                }
                if j + 1 < chars.len() {
                    let embed_text: String = chars[start..j + 2].iter().collect();
                    spans.push(Span::styled(
                        embed_text,
                        Style::default()
                            .fg(Color::Rgb(86, 182, 194))
                            .add_modifier(Modifier::ITALIC),
                    ));
                    i = j + 2;
                    continue;
                }
            }

            // Check for markdown image ![alt](target)
            if i + 1 < chars.len() && chars[i] == '!' && chars[i + 1] == '[' {
                let start = i;
                let mut label_end = i + 2;
                while label_end + 1 < chars.len()
                    && !(chars[label_end] == ']' && chars[label_end + 1] == '(')
                {
                    label_end += 1;
                }

                if label_end + 1 < chars.len()
                    && chars[label_end] == ']'
                    && chars[label_end + 1] == '('
                {
                    let mut target_end = label_end + 2;
                    while target_end < chars.len() && chars[target_end] != ')' {
                        target_end += 1;
                    }

                    if target_end < chars.len() {
                        let image_text: String = chars[start..=target_end].iter().collect();
                        spans.push(Span::styled(
                            image_text,
                            Style::default()
                                .fg(Color::Rgb(86, 182, 194))
                                .add_modifier(Modifier::ITALIC),
                        ));
                        i = target_end + 1;
                        continue;
                    }
                }
            }

            // Check for wiki link
            if i + 1 < chars.len() && chars[i] == '[' && chars[i + 1] == '[' {
                let start = i;
                let mut j = i + 2;
                while j + 1 < chars.len() && (chars[j] != ']' || chars[j + 1] != ']') {
                    j += 1;
                }
                if j + 1 < chars.len() {
                    let link_text: String = chars[start..j + 2].iter().collect();
                    spans.push(Span::styled(
                        link_text,
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::UNDERLINED),
                    ));
                    i = j + 2;
                    continue;
                }
            }

            // Check for markdown link [label](target)
            if chars[i] == '[' && !(i + 1 < chars.len() && chars[i + 1] == '[') {
                let start = i;
                let mut label_end = i + 1;
                while label_end + 1 < chars.len()
                    && !(chars[label_end] == ']' && chars[label_end + 1] == '(')
                {
                    label_end += 1;
                }

                if label_end + 1 < chars.len()
                    && chars[label_end] == ']'
                    && chars[label_end + 1] == '('
                {
                    let mut target_end = label_end + 2;
                    while target_end < chars.len() && chars[target_end] != ')' {
                        target_end += 1;
                    }

                    if target_end < chars.len() {
                        let link_text: String = chars[start..=target_end].iter().collect();
                        spans.push(Span::styled(
                            link_text,
                            Style::default()
                                .fg(Color::Cyan)
                                .add_modifier(Modifier::UNDERLINED),
                        ));
                        i = target_end + 1;
                        continue;
                    }
                }
            }

            // Check for block reference
            if i + 1 < chars.len() && chars[i] == '(' && chars[i + 1] == '(' {
                let start = i;
                let mut j = i + 2;
                while j + 1 < chars.len() && (chars[j] != ')' || chars[j + 1] != ')') {
                    j += 1;
                }
                if j + 1 < chars.len() {
                    let ref_text: String = chars[start..j + 2].iter().collect();
                    spans.push(Span::styled(
                        ref_text,
                        Style::default()
                            .fg(Color::Magenta)
                            .add_modifier(Modifier::ITALIC),
                    ));
                    i = j + 2;
                    continue;
                }
            }

            // Check for heading
            if chars[i] == '#' && (i == 0 || chars[i - 1] == '\n') {
                let start = i;
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
                let heading_text: String = chars[start..i].iter().collect();
                spans.push(Span::styled(
                    heading_text,
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                ));
                continue;
            }

            // Check for tag #[tag]
            if chars[i] == '#'
                && (i == 0
                    || !chars[i - 1].is_ascii_alphanumeric()
                        && !matches!(chars[i - 1], '_' | '-' | '/'))
            {
                if i + 1 < chars.len() && chars[i + 1] == '[' {
                    let start = i;
                    let mut j = i + 2;
                    while j < chars.len() && chars[j] != ']' {
                        j += 1;
                    }
                    if j < chars.len() {
                        let tag_text: String = chars[start..j + 1].iter().collect();
                        spans.push(Span::styled(tag_text, Style::default().fg(Color::Yellow)));
                        i = j + 1;
                        continue;
                    }
                } else {
                    let start = i;
                    let mut j = i + 1;
                    while j < chars.len()
                        && (chars[j].is_ascii_alphanumeric() || matches!(chars[j], '_' | '-' | '/'))
                    {
                        j += 1;
                    }
                    if j > i + 1 {
                        let tag_text: String = chars[start..j].iter().collect();
                        spans.push(Span::styled(tag_text, Style::default().fg(Color::Yellow)));
                        i = j;
                        continue;
                    }
                }
            }

            // Regular character
            spans.push(Span::raw(chars[i].to_string()));
            i += 1;
        }

        Line::from(spans)
    }

    /// Render the preview pane with Markdown rendering
    pub fn render_preview(&self, f: &mut Frame<'_>, area: Rect, preview_scroll: usize) {
        f.render_widget(Clear, area);

        let render = self.preview_render_for_width(area.width.saturating_sub(2));
        let lines = render.lines;

        let max_scroll = lines
            .len()
            .saturating_sub(area.height.saturating_sub(2) as usize);
        let synced_scroll = preview_scroll.min(max_scroll);
        let preview = Paragraph::new(Text::from(lines))
            .block(
                Block::default()
                    .title(format!(
                        " {} ",
                        self.language.translator().text(TextKey::PreviewTitle)
                    ))
                    .borders(ratatui::widgets::Borders::ALL)
                    .title_style(Style::default().fg(Color::Rgb(139, 148, 158))),
            )
            .style(
                Style::default()
                    .bg(Color::Rgb(13, 17, 23))
                    .fg(Color::Rgb(201, 209, 217)),
            )
            .scroll((synced_scroll.min(max_scroll) as u16, 0));

        f.render_widget(preview, area);

        if area.width <= 2 || area.height <= 2 {
            return;
        }

        let preview_body = Rect::new(
            area.x + 1,
            area.y + 1,
            area.width.saturating_sub(2),
            area.height.saturating_sub(2),
        );
        let viewport_end = synced_scroll + preview_body.height as usize;

        for image in render.images {
            let image_end = image.start_line + image.height;
            if image.start_line < synced_scroll || image_end > viewport_end {
                continue;
            }

            let image_area = Rect::new(
                preview_body.x,
                preview_body.y + (image.start_line - synced_scroll) as u16,
                preview_body.width,
                image.height as u16,
            );
            self.render_preview_image(f, image_area, &image.path);
        }
    }

    fn preview_render_for_width(&self, width: u16) -> PreviewRender {
        let width = width.max(1);
        let document_version = self.document_version.get();
        if let Some(cached) = self.preview_render_cache.borrow().get(&width) {
            if cached.document_version == document_version {
                return cached.render.clone();
            }
        }

        let blocks = normalize_blocks_for_preview(&parse_markdown(&self.buffer.to_string()));
        let render = if blocks.is_empty() {
            PreviewRender {
                lines: vec![styled_text_line(
                    self.language
                        .translator()
                        .text(TextKey::EditorNothingToPreview)
                        .to_string(),
                    Style::default().fg(Color::Rgb(139, 148, 158)),
                )],
                hits: Vec::new(),
                images: Vec::new(),
            }
        } else {
            self.build_preview_render_with_images(&blocks, width)
        };

        self.preview_render_cache.borrow_mut().insert(
            width,
            PreviewRenderCacheValue {
                document_version,
                render: render.clone(),
            },
        );

        render
    }

    fn build_preview_render_with_images(&self, blocks: &[MdBlock], width: u16) -> PreviewRender {
        let mut output = PreviewRender::default();
        let mut previous_was_list = false;

        for block in blocks {
            let current_is_list = matches!(block, MdBlock::ListItem { .. });
            if !output.lines.is_empty() && !(previous_was_list && current_is_list) {
                output.lines.push(Line::raw(""));
            }

            let render = match block {
                MdBlock::Image { alt, src } => {
                    self.preview_image_render_with_overlay(alt, src, width)
                }
                _ => preview_block_to_render_localized(block, width, self.language),
            };
            append_preview_render(&mut output, render);
            previous_was_list = current_is_list;
        }

        output
    }

    fn preview_image_render_with_overlay(
        &self,
        alt: &InlineLine,
        src: &str,
        width: u16,
    ) -> PreviewRender {
        let mut render =
            preview_image_render_localized(alt, src, width.max(1) as usize, self.language);
        let Some((path, image_height)) = self.preview_image_layout(src, width) else {
            return render;
        };

        let label = plain_text_from_line(alt);
        while render.lines.len() < image_height as usize {
            render.lines.push(Line::raw(""));
        }

        render.hits = (0..render.lines.len())
            .map(|line| PreviewHit {
                line,
                start_col: 0,
                end_col: width.max(1) as usize,
                kind: PreviewTargetKind::Image,
                target: src.to_string(),
                label: if label.trim().is_empty() {
                    self.language
                        .translator()
                        .text(TextKey::PreviewImage)
                        .to_string()
                } else {
                    label.clone()
                },
            })
            .collect();
        render.images.push(PreviewImageBlock {
            start_line: 0,
            height: image_height as usize,
            path,
        });

        render
    }

    fn preview_image_layout(&self, src: &str, width: u16) -> Option<(PathBuf, u16)> {
        let path = self.resolve_image_path(src)?;
        let picker = self.preview_picker.borrow().clone()?;
        let max_height = width.clamp(MIN_PREVIEW_IMAGE_HEIGHT, MAX_PREVIEW_IMAGE_HEIGHT);
        let render_bounds = Rect::new(0, 0, width.max(1), max_height);

        let mut cache = self.preview_image_cache.borrow_mut();
        let entry = cache
            .entry(path.clone())
            .or_insert_with(|| match ImageReader::open(&path) {
                Ok(reader) => match reader.decode() {
                    Ok(image) => PreviewImageCacheEntry::Ready(picker.new_resize_protocol(image)),
                    Err(error) => PreviewImageCacheEntry::Failed(error.to_string()),
                },
                Err(error) => PreviewImageCacheEntry::Failed(error.to_string()),
            });

        match entry {
            PreviewImageCacheEntry::Ready(state) => {
                let desired = state.size_for(Resize::Fit(None), render_bounds);
                Some((path, desired.height.max(MIN_PREVIEW_IMAGE_HEIGHT)))
            }
            PreviewImageCacheEntry::Failed(error) => {
                tracing::debug!("Skipping preview image {src}: {error}");
                None
            }
        }
    }

    pub(crate) fn resolve_image_path(&self, src: &str) -> Option<PathBuf> {
        let trimmed = src.trim();
        if trimmed.is_empty() || trimmed.contains("://") {
            return None;
        }

        let raw = Path::new(trimmed);
        let mut candidates = Vec::new();
        if raw.is_absolute() {
            candidates.push(raw.to_path_buf());
        } else {
            if let Some(current_file) = self.current_file.as_deref() {
                if let Some(parent) = Path::new(current_file).parent() {
                    candidates.push(parent.join(raw));
                }
            }
            if let Some(workspace_root) = self.workspace_root.as_ref() {
                candidates.push(workspace_root.join(raw));
            }
            candidates.push(raw.to_path_buf());
        }

        candidates.into_iter().find(|candidate| candidate.exists())
    }

    fn render_preview_image(&self, f: &mut Frame<'_>, area: Rect, path: &Path) {
        let mut cache = self.preview_image_cache.borrow_mut();
        let Some(PreviewImageCacheEntry::Ready(state)) = cache.get_mut(path) else {
            return;
        };

        f.render_stateful_widget(
            StatefulImage::default().resize(Resize::Fit(None)),
            area,
            state,
        );

        if let Some(result) = state.last_encoding_result() {
            if let Err(error) = result {
                tracing::warn!(
                    "Preview image encode failed for {}: {}",
                    path.display(),
                    error
                );
            }
        }
    }
}

impl Default for Editor {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for Editor {
    fn init(&mut self) {
        // Initialize editor state
        if self.buffer.len_bytes() == 0 {
            self.buffer = Rope::from_str(
                format!(
                    "{}\n\n{}\n",
                    self.language
                        .translator()
                        .text(TextKey::EditorNewDocumentHeading),
                    self.language
                        .translator()
                        .text(TextKey::EditorNewDocumentBody)
                )
                .as_str(),
            );
        }
    }

    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        Editor::handle_key_event(self, key)
    }

    fn handle_action(&mut self, action: &Action) {
        if let Action::Editor(editor_action) = action {
            Editor::handle_action(self, editor_action);
        }
    }

    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        Editor::render(self, f, area);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render_text(render: &PreviewRender) -> String {
        render
            .lines
            .iter()
            .map(|line| {
                line.spans
                    .iter()
                    .map(|span| span.content.as_ref())
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn test_parse_markdown_heading_and_paragraph() {
        let md = "# Hello\n\nThis is a paragraph.";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 2);
        match &blocks[0] {
            MdBlock::Heading { level, content } => {
                assert_eq!(*level, 1);
                assert_eq!(plain_text_from_line(content), "Hello");
            }
            _ => panic!("Expected Heading block"),
        }
        match &blocks[1] {
            MdBlock::Paragraph { lines } => {
                assert_eq!(plain_text_from_lines(lines, "\n"), "This is a paragraph.");
            }
            _ => panic!("Expected Paragraph block"),
        }
    }

    #[test]
    fn test_parse_markdown_table() {
        let md = "| Header1 | Header2 |\n|--------|--------|\n| Cell1  | Cell2  |";

        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 1);
        match &blocks[0] {
            MdBlock::Table { header, rows, .. } => {
                assert_eq!(header.len(), 2);
                assert_eq!(plain_text_from_line(&header[0]), "Header1");
                assert_eq!(plain_text_from_line(&header[1]), "Header2");
                assert_eq!(rows.len(), 1);
                assert_eq!(rows[0].len(), 2);
                assert_eq!(plain_text_from_line(&rows[0][0]), "Cell1");
                assert_eq!(plain_text_from_line(&rows[0][1]), "Cell2");
            }
            _ => panic!("Expected Table block, got something else"),
        }
    }

    #[test]
    fn test_parse_markdown_table_with_inline_code() {
        // Table cells with inline code like `code`
        let md = "| Header | Code |\n|--------|------|\n| Normal | `test` |";

        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 1);
        match &blocks[0] {
            MdBlock::Table { header, rows, .. } => {
                assert_eq!(header.len(), 2);
                assert_eq!(plain_text_from_line(&header[0]), "Header");
                assert_eq!(plain_text_from_line(&header[1]), "Code");
                assert_eq!(rows.len(), 1);
                assert_eq!(rows[0].len(), 2);
                assert_eq!(plain_text_from_line(&rows[0][0]), "Normal");
                assert_eq!(plain_text_from_line(&rows[0][1]), "test");
                assert_eq!(rows[0][1][0].role, InlineRole::Code);
            }
            _ => panic!("Expected Table block, got something else"),
        }
    }

    #[test]
    fn test_parse_markdown_empty() {
        let md = "";
        let blocks = parse_markdown(md);
        assert!(blocks.is_empty());
    }

    #[test]
    fn test_display_width_tracks_wide_characters() {
        assert_eq!(Editor::display_width_for_char_index("我a", 0), 0);
        assert_eq!(Editor::display_width_for_char_index("我a", 1), 2);
        assert_eq!(Editor::display_width_for_char_index("我a", 2), 3);
    }

    #[test]
    fn test_vertical_cursor_motion_advances_scroll_offset() {
        let mut editor = Editor::new();
        editor.buffer = Rope::from_str("1\n2\n3\n4\n5\n");
        editor.set_viewport(Rect::new(0, 0, 12, 4));

        editor.move_cursor_down();
        editor.move_cursor_down();
        editor.move_cursor_down();

        assert_eq!(editor.cursor_line, 3);
        assert_eq!(editor.scroll_offset, 2);
    }

    #[test]
    fn test_horizontal_scroll_keeps_cursor_visible() {
        let mut editor = Editor::new();
        editor.buffer = Rope::from_str("我应该说些什么呢？");
        editor.set_viewport(Rect::new(0, 0, 10, 4));
        editor.set_cursor_position(0, editor.line_len_chars(0));

        assert!(editor.horizontal_scroll > 0);

        let (x, y) = editor
            .cursor_screen_position(Rect::new(0, 0, 10, 4))
            .expect("cursor should remain visible");
        assert!(x < 10);
        assert_eq!(y, 1);
    }

    #[test]
    fn test_hover_lookup_clamps_screen_line_to_buffer() {
        let mut editor = Editor::new();
        editor.set_viewport(Rect::new(0, 0, 20, 8));

        assert!(editor
            .link_at_screen_position(Rect::new(0, 0, 20, 8), 4, 6)
            .is_none());
    }

    #[test]
    fn test_ensure_cursor_visible_clamps_stale_cursor_state() {
        let mut editor = Editor::new();
        editor.buffer = Rope::from_str("");
        editor.cursor_line = 29;
        editor.cursor_col = 18;
        editor.scroll_offset = 12;
        editor.set_viewport(Rect::new(0, 0, 20, 8));

        assert_eq!(editor.cursor_line, 0);
        assert_eq!(editor.cursor_col, 0);
        assert_eq!(editor.scroll_offset, 0);
    }

    #[test]
    fn test_parse_markdown_blockquote() {
        let md = "> This is a quote\n> with multiple lines";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 1);
        match &blocks[0] {
            MdBlock::BlockQuote { kind, lines, .. } => {
                assert!(kind.is_none());
                assert_eq!(
                    plain_text_from_lines(lines, "\n"),
                    "This is a quote\nwith multiple lines"
                );
            }
            _ => panic!("Expected BlockQuote, got {:?}", blocks[0]),
        }
    }

    #[test]
    fn test_parse_markdown_obsidian_callout_metadata() {
        let md = "> [!tip]- 选择建议\n> 关注样本量";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 1);

        match &blocks[0] {
            MdBlock::BlockQuote {
                kind,
                title,
                collapsed,
                lines,
                ..
            } => {
                assert_eq!(*kind, Some(CalloutKind::Tip));
                assert!(title.is_some());
                assert_eq!(
                    plain_text_from_line(title.as_ref().expect("title")),
                    "选择建议"
                );
                assert!(*collapsed);
                assert_eq!(plain_text_from_lines(lines, "\n"), "关注样本量");
            }
            other => panic!("Expected callout blockquote, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_markdown_list() {
        let md = "- Item 1\n- Item 2\n- Item 3";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 3);
        for block in &blocks {
            match block {
                MdBlock::ListItem {
                    ordered,
                    number,
                    lines,
                    ..
                } => {
                    let text = plain_text_from_lines(lines, "\n");
                    assert!(text == "Item 1" || text == "Item 2" || text == "Item 3");
                    assert!(!ordered);
                    assert!(number.is_none());
                }
                _ => panic!("Expected ListItem, got {:?}", block),
            }
        }
    }

    #[test]
    fn test_parse_markdown_ordered_list() {
        let md = "1. First\n2. Second\n3. Third";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 3);
        for (i, block) in blocks.iter().enumerate() {
            match block {
                MdBlock::ListItem {
                    ordered,
                    number,
                    lines,
                    ..
                } => {
                    assert!(*ordered);
                    assert_eq!(*number, Some((i + 1) as u64));
                    let text = plain_text_from_lines(lines, "\n");
                    assert!(text == "First" || text == "Second" || text == "Third");
                }
                _ => panic!("Expected ListItem, got {:?}", block),
            }
        }
    }

    #[test]
    fn test_parse_markdown_task_list_checkbox() {
        let md = "- [x] done\n- [ ] todo";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 2);

        match &blocks[0] {
            MdBlock::ListItem { checked, lines, .. } => {
                assert_eq!(*checked, Some(true));
                assert_eq!(plain_text_from_lines(lines, "\n"), "done");
            }
            _ => panic!("Expected checked list item"),
        }

        match &blocks[1] {
            MdBlock::ListItem { checked, lines, .. } => {
                assert_eq!(*checked, Some(false));
                assert_eq!(plain_text_from_lines(lines, "\n"), "todo");
            }
            _ => panic!("Expected unchecked list item"),
        }
    }

    #[test]
    fn test_parse_markdown_wikilink_alias_and_tag() {
        let md = "See [[Target Page|Alias]] and #tag.";
        let blocks = parse_markdown(md);
        match &blocks[0] {
            MdBlock::Paragraph { lines } => {
                let flat = &lines[0];
                assert!(flat.iter().any(|segment| {
                    segment.role == InlineRole::WikiLink
                        && segment.text == "Alias"
                        && segment.target.as_deref() == Some("Target Page")
                }));
                assert!(flat
                    .iter()
                    .any(|segment| { segment.role == InlineRole::Tag && segment.text == "#tag" }));
            }
            _ => panic!("Expected paragraph"),
        }
    }

    #[test]
    fn test_parse_markdown_footnote_reference_and_definition() {
        let md = "Footnote here[^1]\n\n[^1]: explanation";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 2);

        match &blocks[0] {
            MdBlock::Paragraph { lines } => {
                assert!(lines[0].iter().any(|segment| {
                    segment.role == InlineRole::FootnoteReference
                        && segment.target.as_deref() == Some("1")
                }));
            }
            _ => panic!("Expected paragraph"),
        }

        match &blocks[1] {
            MdBlock::FootnoteDefinition { label, lines } => {
                assert_eq!(label, "1");
                assert_eq!(plain_text_from_lines(lines, "\n"), "explanation");
            }
            _ => panic!("Expected footnote definition"),
        }
    }

    #[test]
    fn test_preview_render_normalizes_footnotes() {
        let blocks = normalize_blocks_for_preview(&parse_markdown(
            "Footnote here[^note1]\n\n[^note1]: explanation",
        ));
        let render = build_preview_render(&blocks, 80);
        let text = render_text(&render);

        assert!(text.contains("[1]"));
        assert!(!text.contains("[^note1]"));
    }

    #[test]
    fn test_preview_render_escaped_markdown_link_stays_plain_text() {
        let blocks = parse_markdown(r"\[这不是链接\](https://example.com)");
        let render = build_preview_render(&blocks, 80);
        let text = render_text(&render);

        assert!(text.contains("[这不是链接](https://example.com)"));
        assert!(!render
            .hits
            .iter()
            .any(|hit| hit.kind == PreviewTargetKind::MarkdownLink));
    }

    #[test]
    fn test_preview_render_collapsed_callout_hides_body() {
        let blocks =
            normalize_blocks_for_preview(&parse_markdown("> [!warning]- 证据局限\n> 第二行内容"));
        let render = build_preview_render(&blocks, 80);
        let text = render_text(&render);

        assert!(text.contains("证据局限"));
        assert!(!text.contains("第二行内容"));
    }

    #[test]
    fn test_preview_render_expanded_callout_keeps_body() {
        let blocks =
            normalize_blocks_for_preview(&parse_markdown("> [!tip]+ 选择建议\n> 第二行内容"));
        let render = build_preview_render(&blocks, 80);
        let text = render_text(&render);

        assert!(text.contains("选择建议"));
        assert!(text.contains("第二行内容"));
    }

    #[test]
    fn test_parse_markdown_mermaid_image_and_html_fallbacks() {
        let md = "```mermaid\ngraph TD\n```\n\n![Alt](img.png)\n\n<div>raw</div>";
        let blocks = parse_markdown(md);
        assert_eq!(blocks.len(), 3);

        match &blocks[0] {
            MdBlock::Mermaid { code } => assert_eq!(code.trim(), "graph TD"),
            _ => panic!("Expected mermaid block"),
        }

        match &blocks[1] {
            MdBlock::Image { alt, src } => {
                assert_eq!(plain_text_from_line(alt), "Alt");
                assert_eq!(src, "img.png");
            }
            _ => panic!("Expected image fallback"),
        }

        match &blocks[2] {
            MdBlock::HtmlBlock { raw } => assert!(raw.contains("<div>raw</div>")),
            _ => panic!("Expected html fallback"),
        }
    }

    #[test]
    fn test_preview_scroll_mapping_reaches_preview_bottom() {
        assert_eq!(map_preview_scroll(0, 80, 120), 0);
        assert_eq!(map_preview_scroll(80, 80, 120), 120);
        assert_eq!(map_preview_scroll(40, 80, 120), 60);
    }

    #[test]
    fn test_build_preview_render_tracks_interactive_hits() {
        let md = "See [[Target Page|Alias]], [Docs](notes/topic.md), and ((render-test-block)).\n\n![Alt](img.png)";
        let blocks = parse_markdown(md);
        let render = build_preview_render(&blocks, 80);

        assert!(render.hits.iter().any(|hit| {
            hit.kind == PreviewTargetKind::WikiLink
                && hit.target == "Target Page"
                && hit.label == "Alias"
        }));
        assert!(render.hits.iter().any(|hit| {
            hit.kind == PreviewTargetKind::MarkdownLink
                && hit.target == "notes/topic.md"
                && hit.label == "Docs"
        }));
        assert!(render.hits.iter().any(|hit| {
            hit.kind == PreviewTargetKind::BlockRef
                && hit.target == "render-test-block"
                && hit.label == "((render-test-block))"
        }));
        assert!(render.hits.iter().any(|hit| {
            hit.kind == PreviewTargetKind::Image && hit.target == "img.png" && hit.label == "Alt"
        }));
    }

    #[test]
    fn test_preview_hit_lookup_maps_screen_coordinates() {
        let mut editor = Editor::new();
        editor.buffer =
            Rope::from_str("See [[Target Page|Alias]], [Docs](notes/topic.md), and ((block-a)).");
        editor.parse_document();

        let area = Rect::new(0, 0, 80, 8);
        editor.set_viewport(area);

        let blocks = parse_markdown(&editor.buffer.to_string());
        let render = build_preview_render(&blocks, area.width.saturating_sub(2));

        let wiki_hit = render
            .hits
            .iter()
            .find(|hit| hit.kind == PreviewTargetKind::WikiLink)
            .expect("wiki hit");
        let markdown_hit = render
            .hits
            .iter()
            .find(|hit| hit.kind == PreviewTargetKind::MarkdownLink)
            .expect("markdown hit");
        let block_hit = render
            .hits
            .iter()
            .find(|hit| hit.kind == PreviewTargetKind::BlockRef)
            .expect("block hit");

        let hovered_wiki = editor
            .preview_hit_at_screen_position(
                area,
                area.x + 1 + wiki_hit.start_col as u16,
                area.y + 1 + wiki_hit.line as u16,
            )
            .expect("hovered wiki hit");
        assert_eq!(hovered_wiki.kind, PreviewTargetKind::WikiLink);
        assert_eq!(hovered_wiki.target, "Target Page");

        let hovered_markdown = editor
            .preview_hit_at_screen_position(
                area,
                area.x + 1 + markdown_hit.start_col as u16,
                area.y + 1 + markdown_hit.line as u16,
            )
            .expect("hovered markdown hit");
        assert_eq!(hovered_markdown.kind, PreviewTargetKind::MarkdownLink);
        assert_eq!(hovered_markdown.target, "notes/topic.md");

        let hovered_block = editor
            .preview_hit_at_screen_position(
                area,
                area.x + 1 + block_hit.start_col as u16,
                area.y + 1 + block_hit.line as u16,
            )
            .expect("hovered block hit");
        assert_eq!(hovered_block.kind, PreviewTargetKind::BlockRef);
        assert_eq!(hovered_block.target, "block-a");
    }

    #[test]
    fn test_parse_markdown_wiki_image_embed_promotes_to_image_block() {
        let blocks = parse_markdown("![[assets/diagram.png]]");
        assert_eq!(blocks.len(), 1);

        match &blocks[0] {
            MdBlock::Image { alt, src } => {
                assert_eq!(plain_text_from_line(alt), "diagram");
                assert_eq!(src, "assets/diagram.png");
            }
            other => panic!("Expected image block, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_document_detects_embedded_and_markdown_images() {
        let mut editor = Editor::new();
        editor.buffer = Rope::from_str("![[assets/diagram.png]]\n![Alt](img/photo.jpg)\n");
        editor.parse_document();
        let links = editor.links.borrow();

        assert!(links.iter().any(|link| {
            link.kind == EditorLinkKind::Image
                && link.target == "assets/diagram.png"
                && link.label.as_deref() == Some("diagram")
        }));
        assert!(links.iter().any(|link| {
            link.kind == EditorLinkKind::Image
                && link.target == "img/photo.jpg"
                && link.label.as_deref() == Some("Alt")
        }));
    }

    #[test]
    fn test_undo_redo_merges_contiguous_insertions() {
        let mut editor = Editor::new();
        editor.create_file("notes.md");

        editor.insert_char('a');
        editor.insert_char('b');

        assert_eq!(editor.buffer.to_string(), "ab");
        assert!(editor.is_modified());
        assert!(editor.undo());
        assert_eq!(editor.buffer.to_string(), "");
        assert!(!editor.is_modified());
        assert!(editor.redo());
        assert_eq!(editor.buffer.to_string(), "ab");
        assert!(editor.is_modified());
    }

    #[test]
    fn test_paste_is_single_undo_transaction() {
        let mut editor = Editor::new();
        editor.create_file("notes.md");

        assert!(editor.paste_text("alpha\nbeta"));
        assert_eq!(editor.buffer.to_string(), "alpha\nbeta");
        assert!(editor.undo());
        assert_eq!(editor.buffer.to_string(), "");
        assert!(editor.redo());
        assert_eq!(editor.buffer.to_string(), "alpha\nbeta");
    }

    #[test]
    fn test_copy_and_cut_current_line() {
        let mut editor = Editor::new();
        editor.buffer = Rope::from_str("alpha\nbeta\n");
        editor.saved_snapshot = editor.buffer.clone();
        editor.set_cursor_position(0, 0);

        assert_eq!(editor.copy_current_line().as_deref(), Some("alpha\n"));
        assert_eq!(editor.cut_current_line().as_deref(), Some("alpha\n"));
        assert_eq!(editor.buffer.to_string(), "beta\n");
        assert!(editor.is_modified());
        assert!(editor.undo());
        assert_eq!(editor.buffer.to_string(), "alpha\nbeta\n");
    }
}
