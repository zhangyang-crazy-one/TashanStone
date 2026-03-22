//! Search panel component

use crate::action::{Action, SearchAction};
use crossterm::event::KeyEvent;
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span, Text},
    widgets::{Block, List, ListItem, Paragraph},
    Frame,
};
use ropey::Rope;

/// Search panel state
pub struct SearchPanel {
    /// Is search open
    is_open: bool,
    /// Search query
    query: Rope,
    /// Search results
    results: Vec<SearchResult>,
    /// Selected result index
    selected_index: usize,
    /// Is regex enabled
    is_regex: bool,
    /// Is case sensitive
    is_case_sensitive: bool,
}

/// Search result
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

impl SearchPanel {
    pub fn new() -> Self {
        Self {
            is_open: false,
            query: Rope::new(),
            results: Vec::new(),
            selected_index: 0,
            is_regex: false,
            is_case_sensitive: false,
        }
    }

    /// Check if search is open
    pub fn is_open(&self) -> bool {
        self.is_open
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        match key.code {
            crossterm::event::KeyCode::Enter => {
                if !self.query.to_string().is_empty() {
                    return Some(Action::Search(SearchAction::SetQuery(
                        self.query.to_string(),
                    )));
                }
            }
            crossterm::event::KeyCode::Char('r') if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) => {
                self.is_regex = !self.is_regex;
                return Some(Action::Search(SearchAction::ToggleRegex));
            }
            crossterm::event::KeyCode::Char('c') if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) => {
                self.is_case_sensitive = !self.is_case_sensitive;
                return Some(Action::Search(SearchAction::ToggleCaseSensitive));
            }
            crossterm::event::KeyCode::Char(c) => {
                let pos = self.query.len_chars();
                self.query.insert(pos, c.to_string().as_str());
            }
            crossterm::event::KeyCode::Backspace => {
                if self.query.len_chars() > 0 {
                    let pos = self.query.len_chars() - 1;
                    self.query.remove(pos..pos + 1);
                }
            }
            crossterm::event::KeyCode::Esc => {
                self.is_open = false;
                return Some(Action::Search(SearchAction::Close));
            }
            crossterm::event::KeyCode::Up => {
                if self.selected_index > 0 {
                    self.selected_index -= 1;
                }
            }
            crossterm::event::KeyCode::Down => {
                if self.selected_index < self.results.len().saturating_sub(1) {
                    self.selected_index += 1;
                }
            }
            crossterm::event::KeyCode::Tab => {
                if key.modifiers.contains(crossterm::event::KeyModifiers::SHIFT) {
                    return Some(Action::Search(SearchAction::Previous));
                } else {
                    return Some(Action::Search(SearchAction::Next));
                }
            }
            _ => {}
        }
        None
    }

    /// Handle an action
    pub fn handle_action(&mut self, action: &SearchAction) {
        match action {
            SearchAction::Open => {
                self.is_open = true;
            }
            SearchAction::Close => {
                self.is_open = false;
                self.query = Rope::new();
                self.results.clear();
            }
            SearchAction::SetQuery(query) => {
                // TODO: Perform search
                tracing::info!("Searching for: {}", query);
            }
            SearchAction::Next => {
                if self.selected_index < self.results.len().saturating_sub(1) {
                    self.selected_index += 1;
                }
            }
            SearchAction::Previous => {
                if self.selected_index > 0 {
                    self.selected_index -= 1;
                }
            }
            SearchAction::ToggleRegex => {
                self.is_regex = !self.is_regex;
            }
            SearchAction::ToggleCaseSensitive => {
                self.is_case_sensitive = !self.is_case_sensitive;
            }
            SearchAction::SearchResults(results) => {
                // Convert from action::SearchResult to search::SearchResult
                self.results = results.iter().map(|r| SearchResult {
                    file_path: r.file_path.clone(),
                    line_number: 0,
                    line_content: r.excerpt.clone(),
                    match_start: 0,
                    match_end: 0,
                }).collect();
                self.selected_index = 0;
            }
        }
    }
}

impl Default for SearchPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for SearchPanel {
    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        self.handle_key_event(key)
    }

    fn handle_action(&mut self, action: &Action) {
        if let Action::Search(search_action) = action {
            self.handle_action(search_action);
        }
    }

    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        if !self.is_open {
            return;
        }

        // Render search box
        let query_text = self.query.to_string();
        let search_box = Paragraph::new(format!(
            "/{} {}",
            query_text,
            if self.is_regex { " (regex)" } else { "" }
        ))
        .block(
            Block::default()
                .title(" Search ")
                .borders(ratatui::widgets::Borders::ALL),
        );

        f.render_widget(search_box, area);

        // Render results below
        if !self.results.is_empty() {
            let results_area = Rect::new(
                area.x,
                area.y + 3,
                area.width,
                area.height - 3,
            );

            let items: Vec<ListItem> = self
                .results
                .iter()
                .enumerate()
                .map(|(idx, result)| {
                    let prefix = if idx == self.selected_index {
                        "> "
                    } else {
                        "  "
                    };
                    let line = format!(
                        "{}{}:{}: {}",
                        prefix,
                        result.file_path,
                        result.line_number,
                        result.line_content
                    );
                    let style = if idx == self.selected_index {
                        Style::default().bg(Color::Blue).fg(Color::White)
                    } else {
                        Style::default()
                    };
                    ListItem::new(Line::from(vec![Span::styled(line, style)]))
                })
                .collect();

            let list = List::new(items).block(
                Block::default()
                    .title(format!(" Results ({} found) ", self.results.len()))
                    .borders(ratatui::widgets::Borders::ALL),
            );

            f.render_widget(list, results_area);
        }
    }
}
