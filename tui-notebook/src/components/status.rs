//! Status bar component

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
}

/// Status mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusMode {
    Normal,
    Insert,
    Visual,
    Command,
}

impl StatusBar {
    pub fn new() -> Self {
        Self {
            width: 80,
            height: 24,
            mode: StatusMode::Normal,
            message: None,
        }
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
}

impl Default for StatusBar {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for StatusBar {
    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        let mode_str = match self.mode {
            StatusMode::Normal => "NORMAL",
            StatusMode::Insert => "INSERT",
            StatusMode::Visual => "VISUAL",
            StatusMode::Command => "COMMAND",
        };

        let mode_style = match self.mode {
            StatusMode::Normal => Style::default().fg(Color::Green),
            StatusMode::Insert => Style::default().fg(Color::Yellow),
            StatusMode::Visual => Style::default().fg(Color::Blue),
            StatusMode::Command => Style::default().fg(Color::Magenta),
        };

        let left = vec![
            Span::styled(mode_str, mode_style),
            Span::raw(" | "),
            Span::raw("tui-notebook"),
        ];

        let right = vec![
            Span::raw(format!("{}x{}", self.width, self.height)),
            Span::raw(" | "),
        ];

        // Calculate padding before consuming left
        let left_len = left.iter().map(|s| s.content.len() as u16).sum::<u16>();
        let right_len = right.iter().map(|s| s.content.len() as u16).sum::<u16>();

        let mut line = Line::default();
        line.spans.extend(left);

        // Add message if present
        if let Some(msg) = &self.message {
            line.spans.push(Span::raw(" | "));
            line.spans.push(Span::styled(msg, Style::default().fg(Color::Cyan)));
        }

        // Pad to align right content
        let padding = area.width.saturating_sub(left_len + right_len + 4);

        for _ in 0..padding {
            line.spans.push(Span::raw(" "));
        }

        line.spans.extend(right);

        let text = Text::from(vec![line]);

        let paragraph = ratatui::widgets::Paragraph::new(text)
            .block(Block::default().borders(ratatui::widgets::Borders::TOP))
            .style(Style::default().bg(Color::DarkGray).fg(Color::White));

        f.render_widget(paragraph, area);
    }
}
