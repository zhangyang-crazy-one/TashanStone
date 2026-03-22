//! Editor component - Markdown editing with syntax highlighting
//!
//! Supports:
//! - Wiki links [[]] with navigation
//! - Block references ((id))
//! - Syntax highlighting via tree-sitter

use crate::action::{Action, EditorAction};
use crossterm::event::KeyEvent;
use pulldown_cmark::Parser;
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Paragraph},
    Frame,
};
use ropey::Rope;
use std::collections::HashMap;

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
    /// Wiki link cache (path -> block positions)
    wiki_links: HashMap<String, Vec<WikiLink>>,
    /// Block references (id -> location)
    block_refs: HashMap<String, BlockRef>,
    /// Modified files pending save
    modified_files: HashMap<String, Rope>,
}

/// Wiki link in the document
#[derive(Debug, Clone)]
pub struct WikiLink {
    pub start: usize,
    pub end: usize,
    pub target: String,
    pub label: Option<String>,
}

/// Block reference
#[derive(Debug, Clone)]
pub struct BlockRef {
    pub id: String,
    pub file_path: String,
    pub line: usize,
    pub content: String,
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
            wiki_links: HashMap::new(),
            block_refs: HashMap::new(),
            modified_files: HashMap::new(),
        }
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

    /// Load a file into the editor
    pub fn load_file(&mut self, path: &str) {
        match std::fs::read_to_string(path) {
            Ok(content) => {
                self.buffer = Rope::from_str(&content);
                self.current_file = Some(path.to_string());
                self.is_modified = false;
                self.parse_document();
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
        self.is_modified = false;
    }

    /// Save the current file
    pub fn save_file(&mut self, path: &str) {
        let content = self.buffer.to_string();
        if let Err(e) = std::fs::write(path, content) {
            tracing::error!("Failed to save file {}: {}", path, e);
        } else {
            self.is_modified = false;
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
        self.modified_files.clear();
    }

    /// Parse the document for wiki links and block references
    fn parse_document(&mut self) {
        self.wiki_links.clear();
        self.block_refs.clear();

        let text = self.buffer.to_string();
        let chars: Vec<char> = text.chars().collect();

        let mut i = 0;
        while i < chars.len() {
            // Check for wiki link [[]]
            if i + 1 < chars.len() && chars[i] == '[' && chars[i + 1] == '[' {
                if let Some(link) = self.parse_wiki_link(&chars, i) {
                    let start = i;
                    let end = i + link.target.len() + 4;
                    self.wiki_links.insert(
                        link.target.clone(),
                        vec![WikiLink {
                            start,
                            end,
                            target: link.target.clone(),
                            label: link.label,
                        }],
                    );
                    i += end - start;
                    continue;
                }
            }

            // Check for block reference ((
            if i + 1 < chars.len() && chars[i] == '(' && chars[i + 1] == '(' {
                if let Some(block_ref) = self.parse_block_ref(&chars, i) {
                    self.block_refs.insert(block_ref.id.clone(), block_ref.clone());
                    i += block_ref.id.len() + 4;
                    continue;
                }
            }

            i += 1;
        }
    }

    /// Parse a wiki link starting at position i
    fn parse_wiki_link(&self, chars: &[char], i: usize) -> Option<WikiLink> {
        // Find closing ]]
        let mut j = i + 2;
        while j + 1 < chars.len() && (chars[j] != ']' || chars[j + 1] != ']') {
            j += 1;
        }

        if j + 1 >= chars.len() {
            return None;
        }

        let inner: String = chars[i + 2..j].iter().collect();

        // Check for alias [[target|label]]
        let (target, label) = if let Some(pipe) = inner.find('|') {
            (inner[..pipe].to_string(), Some(inner[pipe + 1..].to_string()))
        } else {
            (inner.clone(), Some(inner))
        };

        Some(WikiLink {
            start: i,
            end: j + 2,
            target,
            label,
        })
    }

    /// Parse a block reference starting at position i
    fn parse_block_ref(&self, chars: &[char], i: usize) -> Option<BlockRef> {
        // Find closing ))
        let mut j = i + 2;
        while j + 1 < chars.len() && (chars[j] != ')' || chars[j + 1] != ')') {
            j += 1;
        }

        if j + 1 >= chars.len() {
            return None;
        }

        let id: String = chars[i + 2..j].iter().collect();

        Some(BlockRef {
            id: id.clone(),
            file_path: self.current_file.clone().unwrap_or_default(),
            line: self.buffer.line_to_char(self.cursor_line),
            content: String::new(),
        })
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        match key.code {
            crossterm::event::KeyCode::Char(c) => {
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
                if let Some(block_ref) = self.block_refs.get(block_id) {
                    // Navigate to the block
                    self.cursor_line = block_ref.line;
                }
            }
            EditorAction::Undo => {
                // TODO: Implement undo
            }
            EditorAction::Redo => {
                // TODO: Implement redo
            }
            EditorAction::Scroll(delta) => {
                self.scroll_offset = (self.scroll_offset as i32 + delta).max(0) as usize;
            }
            _ => {}
        }
    }

    /// Set scroll offset (for sync scrolling)
    pub fn set_scroll_offset(&mut self, offset: usize) {
        self.scroll_offset = offset;
    }

    /// Get current scroll offset
    pub fn scroll_offset(&self) -> usize {
        self.scroll_offset
    }

    /// Insert a character at cursor
    fn insert_char(&mut self, c: char) {
        let pos = self.buffer.line_to_char(self.cursor_line) + self.cursor_col;
        self.buffer.insert(pos, c.to_string().as_str());
        self.cursor_col += 1;
        self.is_modified = true;
        self.parse_document();
    }

    /// Insert a newline
    fn insert_newline(&mut self) {
        let pos = self.buffer.line_to_char(self.cursor_line) + self.cursor_col;
        self.buffer.insert(pos, "\n");
        self.cursor_line += 1;
        self.cursor_col = 0;
        self.is_modified = true;
        self.parse_document();
    }

    /// Delete character backward
    fn delete_backward(&mut self) {
        if self.cursor_col > 0 {
            let pos = self.buffer.line_to_char(self.cursor_line) + self.cursor_col - 1;
            self.buffer.remove(pos..pos + 1);
            self.cursor_col -= 1;
            self.is_modified = true;
            self.parse_document();
        } else if self.cursor_line > 0 {
            let prev_line = self.cursor_line - 1;
            let prev_line_end = self.buffer.line_to_char(prev_line + 1) - 1;
            let current_line_start = self.buffer.line_to_char(self.cursor_line);
            self.buffer.remove(prev_line_end..current_line_start);
            self.cursor_line -= 1;
            self.cursor_col = self.buffer.line(self.cursor_line).len_chars();
            self.is_modified = true;
            self.parse_document();
        }
    }

    /// Delete character forward
    fn delete_forward(&mut self) {
        let pos = self.buffer.line_to_char(self.cursor_line) + self.cursor_col;
        if pos < self.buffer.len_chars() {
            self.buffer.remove(pos..pos + 1);
            self.is_modified = true;
            self.parse_document();
        }
    }

    /// Move cursor up
    fn move_cursor_up(&mut self) {
        if self.cursor_line > 0 {
            self.cursor_line -= 1;
            let line_len = self.buffer.line(self.cursor_line).len_chars();
            self.cursor_col = self.cursor_col.min(line_len);
        }
    }

    /// Move cursor down
    fn move_cursor_down(&mut self) {
        if self.cursor_line < self.buffer.len_lines() - 1 {
            self.cursor_line += 1;
            let line_len = self.buffer.line(self.cursor_line).len_chars();
            self.cursor_col = self.cursor_col.min(line_len);
        }
    }

    /// Move cursor left
    fn move_cursor_left(&mut self) {
        if self.cursor_col > 0 {
            self.cursor_col -= 1;
        } else if self.cursor_line > 0 {
            self.cursor_line -= 1;
            self.cursor_col = self.buffer.line(self.cursor_line).len_chars();
        }
    }

    /// Move cursor right
    fn move_cursor_right(&mut self) {
        let line_len = self.buffer.line(self.cursor_line).len_chars();
        if self.cursor_col < line_len {
            self.cursor_col += 1;
        } else if self.cursor_line < self.buffer.len_lines() - 1 {
            self.cursor_line += 1;
            self.cursor_col = 0;
        }
    }

    /// Insert tab
    fn insert_tab(&mut self) {
        for _ in 0..4 {
            self.insert_char(' ');
        }
    }

    /// Render the editor
    pub fn render(&self, f: &mut Frame<'_>, area: Rect) {
        let lines: Vec<Line> = self.buffer.lines().map(|line| {
            self.render_line(&line.to_string())
        }).collect();

        let text = Text::from(lines);

        let paragraph = Paragraph::new(text)
            .block(
                Block::default()
                    .title(self.current_file.as_deref().unwrap_or("Untitled"))
                    .borders(ratatui::widgets::Borders::ALL)
                    .title_style(Style::default().fg(Color::Cyan)),
            )
            .scroll((self.scroll_offset as u16, 0));

        f.render_widget(paragraph, area);

        // Render cursor with visible block
        let cursor_x = self.cursor_col as u16;
        let cursor_y = (self.cursor_line.saturating_sub(self.scroll_offset)) as u16;
        if cursor_y < area.height.saturating_sub(2) && cursor_x < area.width.saturating_sub(2) {
            // Draw cursor as a highlighted block using a canvas
            let cursor_area = ratatui::layout::Rect::new(
                area.x + 1 + cursor_x,
                area.y + 1 + cursor_y,
                1,
                1,
            );
            let cursor_line = Line::from(vec![Span::styled(
                " ",
                Style::default().bg(Color::White).fg(Color::Black),
            )]);
            let cursor_para = Paragraph::new(cursor_line)
                .style(Style::default().bg(Color::White));
            f.render_widget(cursor_para, cursor_area);
        }
    }

    /// Render a single line with syntax highlighting
    fn render_line(&self, text: &str) -> Line {
        let mut spans: Vec<Span> = Vec::new();
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;

        while i < chars.len() {
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
            if i + 1 < chars.len() && chars[i] == '#' && chars[i + 1] == '[' {
                let start = i;
                let mut j = i + 2;
                while j < chars.len() && chars[j] != ']' {
                    j += 1;
                }
                if j < chars.len() {
                    let tag_text: String = chars[start..j + 1].iter().collect();
                    spans.push(Span::styled(
                        tag_text,
                        Style::default()
                            .fg(Color::Yellow),
                    ));
                    i = j + 1;
                    continue;
                }
            }

            // Regular character
            spans.push(Span::raw(chars[i].to_string()));
            i += 1;
        }

        Line::from(spans)
    }

    /// Render the preview pane with Markdown rendering
    pub fn render_preview(&self, f: &mut Frame<'_>, area: Rect) {
        let md_text = self.buffer.to_string();

        // Parse Markdown and convert to styled spans
        let mut lines: Vec<Line> = Vec::new();
        let parser = Parser::new(&md_text);

        let mut current_line: Vec<Span> = Vec::new();
        let mut in_code_block = false;
        let mut heading_level: usize = 0;
        let mut in_blockquote = false;
        let mut in_list = false;

        for event in parser {
            match event {
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::Heading { level, .. }) => {
                    heading_level = match level {
                        pulldown_cmark::HeadingLevel::H1 => 1,
                        pulldown_cmark::HeadingLevel::H2 => 2,
                        pulldown_cmark::HeadingLevel::H3 => 3,
                        pulldown_cmark::HeadingLevel::H4 => 4,
                        pulldown_cmark::HeadingLevel::H5 => 5,
                        pulldown_cmark::HeadingLevel::H6 => 6,
                    };
                    let style = match heading_level {
                        1 => Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
                        2 => Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
                        _ => Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
                    };
                    if !current_line.is_empty() {
                        lines.push(Line::from(current_line.clone()));
                        current_line.clear();
                    }
                    current_line.push(Span::styled("#".repeat(heading_level) + " ", style));
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::Heading(_)) => {
                    lines.push(Line::from(current_line.clone()));
                    current_line.clear();
                    heading_level = 0;
                }
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::CodeBlock(_)) => {
                    in_code_block = true;
                    if !current_line.is_empty() {
                        lines.push(Line::from(current_line.clone()));
                        current_line.clear();
                    }
                    current_line.push(Span::styled("``` code ", Style::default().fg(Color::Magenta).add_modifier(Modifier::REVERSED)));
                    lines.push(Line::from(current_line.clone()));
                    current_line.clear();
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::CodeBlock) => {
                    in_code_block = false;
                    current_line.clear();
                    lines.push(Line::from(vec![Span::styled("```", Style::default().fg(Color::Magenta))]));
                }
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::Paragraph) => {
                    // Start of paragraph
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::Paragraph) => {
                    if !current_line.is_empty() {
                        lines.push(Line::from(current_line.clone()));
                        current_line.clear();
                    }
                    lines.push(Line::from(vec![Span::raw("")])); // Empty line between paragraphs
                }
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::BlockQuote(_)) => {
                    in_blockquote = true;
                    current_line.push(Span::styled("│ ", Style::default().fg(Color::DarkGray)));
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::BlockQuote(_)) => {
                    in_blockquote = false;
                    lines.push(Line::from(current_line.clone()));
                    current_line.clear();
                }
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::List(list_type)) => {
                    in_list = true;
                    // We'll handle list markers in the first text item
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::List(_)) => {
                    in_list = false;
                }
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::Item) => {
                    // List item start - we'll add bullet/number in text handler
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::Item) => {
                    lines.push(Line::from(current_line.clone()));
                    current_line.clear();
                }
                pulldown_cmark::Event::Text(text) => {
                    let text_owned = text.to_string();
                    let style = if in_code_block {
                        Style::default().fg(Color::White)
                    } else if in_blockquote {
                        Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC)
                    } else if heading_level > 0 {
                        match heading_level {
                            1 => Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
                            2 => Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
                            _ => Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
                        }
                    } else {
                        Style::default()
                    };

                    // Handle list markers at start of text
                    if in_list {
                        for line in text_owned.lines() {
                            if line.starts_with("- ") || line.starts_with("* ") {
                                current_line.push(Span::styled("• ", Style::default().fg(Color::Cyan)));
                                current_line.push(Span::styled(line[2..].to_string(), style));
                            } else if line.starts_with("1. ") {
                                current_line.push(Span::styled("1. ", Style::default().fg(Color::Cyan)));
                                current_line.push(Span::styled(line[3..].to_string(), style));
                            } else {
                                current_line.push(Span::styled(line.to_string(), style));
                            }
                            lines.push(Line::from(current_line.clone()));
                            current_line.clear();
                        }
                    } else {
                        current_line.push(Span::styled(text_owned, style));
                    }
                }
                pulldown_cmark::Event::Code(code) => {
                    current_line.push(Span::styled(code.to_string(), Style::default().fg(Color::Cyan).add_modifier(Modifier::REVERSED)));
                }
                pulldown_cmark::Event::SoftBreak | pulldown_cmark::Event::HardBreak => {
                    if !current_line.is_empty() && current_line != vec![Span::styled("│ ", Style::default().fg(Color::DarkGray))] {
                        lines.push(Line::from(current_line.clone()));
                        current_line.clear();
                        if in_blockquote {
                            current_line.push(Span::styled("│ ", Style::default().fg(Color::DarkGray)));
                        }
                    }
                }
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::Emphasis) => {
                    current_line.push(Span::styled("", Style::default().add_modifier(Modifier::ITALIC)));
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::Emphasis) => {}
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::Strong) => {
                    current_line.push(Span::styled("", Style::default().add_modifier(Modifier::BOLD)));
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::Strong) => {}
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::Link { dest_url, .. }) => {
                    current_line.push(Span::styled("[", Style::default().fg(Color::Blue).add_modifier(Modifier::UNDERLINED)));
                    // Store URL for later in a different way if needed
                    let _ = dest_url;
                }
                pulldown_cmark::Event::End(pulldown_cmark::TagEnd::Link) => {
                    current_line.push(Span::styled("]", Style::default().fg(Color::Blue).add_modifier(Modifier::UNDERLINED)));
                }
                _ => {}
            }
        }

        // Add any remaining content
        if !current_line.is_empty() {
            lines.push(Line::from(current_line));
        }

        // If no content, show placeholder
        if lines.is_empty() {
            lines.push(Line::from(vec![Span::raw("Nothing to preview")]));
        }

        let text = Text::from(lines);

        let preview = Paragraph::new(text)
            .block(
                Block::default()
                    .title(" Preview ")
                    .borders(ratatui::widgets::Borders::ALL)
                    .title_style(Style::default().fg(Color::Green)),
            )
            .scroll((self.scroll_offset as u16, 0));

        f.render_widget(preview, area);
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
            self.buffer = Rope::from_str("# New Document\n\nStart writing here...\n");
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
