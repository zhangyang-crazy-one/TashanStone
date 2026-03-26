//! Status bar component

use crate::i18n::{Language, TextKey};
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span, Text},
    widgets::Block,
    Frame,
};

/// Status bar state
pub struct StatusBar {
    /// Terminal size
    width: u16,
    height: u16,
    /// Current mode
    mode: StatusMode,
    /// Message
    message: Option<String>,
    /// Current file line
    line: usize,
    /// Current file column
    column: usize,
    /// Current document label
    document_kind: String,
    /// AI connectivity label
    ai_status: String,
    /// Current focus region label
    focus_label: String,
    /// Focus shortcut hint
    focus_shortcuts: String,
    /// Current UI language
    language: Language,
}

/// Status mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusMode {
    Normal,
    Insert,
    Visual,
    Command,
    Preview,
}

impl StatusBar {
    pub fn new() -> Self {
        Self {
            width: 80,
            height: 24,
            mode: StatusMode::Normal,
            message: None,
            line: 1,
            column: 1,
            document_kind: "Markdown".to_string(),
            ai_status: "● AI ready".to_string(),
            focus_label: "Editor".to_string(),
            focus_shortcuts: "Ctrl+1 Files  Ctrl+2 Editor  Ctrl+3 AI  Ctrl+Tab Cycle".to_string(),
            language: Language::En,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
    }

    /// Set terminal size
    pub fn set_size(&mut self, width: u16, height: u16) {
        self.width = width;
        self.height = height;
    }

    /// Set status message
    pub fn set_message(&mut self, message: Option<String>) {
        self.message = message;
    }

    /// Set mode
    pub fn set_mode(&mut self, mode: StatusMode) {
        self.mode = mode;
    }

    /// Set editor status details.
    pub fn set_editor_state(&mut self, line: usize, column: usize, document_kind: &str) {
        self.line = line;
        self.column = column;
        self.document_kind = document_kind.to_string();
    }

    /// Set AI service status text.
    pub fn set_ai_status(&mut self, ai_status: impl Into<String>) {
        self.ai_status = ai_status.into();
    }

    /// Set current focus label and shortcut hint.
    pub fn set_focus_state(
        &mut self,
        focus_label: impl Into<String>,
        focus_shortcuts: impl Into<String>,
    ) {
        self.focus_label = focus_label.into();
        self.focus_shortcuts = focus_shortcuts.into();
    }
}

impl Default for StatusBar {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for StatusBar {
    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        let mode_str = match self.mode {
            StatusMode::Normal => self.language.translator().text(TextKey::StatusModeNormal),
            StatusMode::Insert => self.language.translator().text(TextKey::StatusModeInsert),
            StatusMode::Visual => self.language.translator().text(TextKey::StatusModeVisual),
            StatusMode::Command => self.language.translator().text(TextKey::StatusModeCommand),
            StatusMode::Preview => self.language.translator().text(TextKey::StatusModePreview),
        };

        let mode_style = match self.mode {
            StatusMode::Normal => Style::default().fg(Color::Green),
            StatusMode::Insert => Style::default().fg(Color::Yellow),
            StatusMode::Visual => Style::default().fg(Color::Blue),
            StatusMode::Command => Style::default().fg(Color::Magenta),
            StatusMode::Preview => Style::default().fg(Color::Cyan),
        };

        let left = vec![
            Span::styled(
                self.document_kind.as_str(),
                Style::default().fg(Color::Gray),
            ),
            Span::raw("  "),
            Span::styled(
                format!(
                    "{} {}",
                    self.language.translator().text(TextKey::StatusLine),
                    self.line
                ),
                Style::default().fg(Color::DarkGray),
            ),
            Span::raw("  "),
            Span::styled(
                format!(
                    "{} {}",
                    self.language.translator().text(TextKey::StatusColumn),
                    self.column
                ),
                Style::default().fg(Color::DarkGray),
            ),
            Span::raw("  "),
            Span::styled("UTF-8", Style::default().fg(Color::DarkGray)),
        ];

        let right = vec![
            Span::styled(
                format!(
                    "{} {}",
                    self.language.translator().text(TextKey::StatusFocus),
                    self.focus_label
                ),
                Style::default().fg(Color::Rgb(88, 166, 255)),
            ),
            Span::raw("  "),
            Span::styled(
                self.focus_shortcuts.as_str(),
                Style::default().fg(Color::DarkGray),
            ),
            Span::raw("  "),
            Span::styled(self.ai_status.as_str(), Style::default().fg(Color::Green)),
            Span::raw("  "),
            Span::styled(mode_str, mode_style),
        ];

        // Calculate padding before consuming left
        let left_len = left.iter().map(|s| s.content.len() as u16).sum::<u16>();
        let right_len = right.iter().map(|s| s.content.len() as u16).sum::<u16>();

        let mut line = Line::default();
        line.spans.extend(left);

        // Add message if present
        if let Some(msg) = &self.message {
            line.spans.push(Span::raw(" | "));
            line.spans
                .push(Span::styled(msg, Style::default().fg(Color::Cyan)));
        }

        // Pad to align right content
        let padding = area.width.saturating_sub(left_len + right_len + 4);

        for _ in 0..padding {
            line.spans.push(Span::raw(" "));
        }

        line.spans.extend(right);

        let text = Text::from(vec![line]);

        let paragraph = ratatui::widgets::Paragraph::new(text)
            .block(Block::default())
            .style(Style::default().bg(Color::Rgb(26, 26, 46)).fg(Color::White));

        f.render_widget(paragraph, area);
    }
}
