//! Knowledge panel - semantic search and RAG

use crate::action::{Action, KnowledgeAction, SearchResult};
use crossterm::event::KeyEvent;
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span, Text},
    widgets::{Block, List, ListItem, Paragraph},
    Frame,
};

/// Knowledge panel state
pub struct KnowledgePanel {
    /// Is panel open
    is_open: bool,
    /// Search query
    query: String,
    /// Search results
    results: Vec<SearchResult>,
    /// Selected result index
    selected_index: usize,
    /// Is indexing
    is_indexing: bool,
    /// Index progress
    index_progress: f32,
    /// Index job handle for cancellation
    index_path: Option<String>,
}

impl KnowledgePanel {
    pub fn new() -> Self {
        Self {
            is_open: false,
            query: String::new(),
            results: Vec::new(),
            selected_index: 0,
            is_indexing: false,
            index_progress: 0.0,
            index_path: None,
        }
    }

    /// Check if panel is open
    pub fn is_open(&self) -> bool {
        self.is_open
    }

    /// Toggle panel visibility
    pub fn toggle(&mut self) {
        self.is_open = !self.is_open;
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        match key.code {
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
            crossterm::event::KeyCode::Enter => {
                if let Some(result) = self.results.get(self.selected_index) {
                    return Some(Action::File(crate::action::FileAction::Select(
                        result.file_path.clone(),
                    )));
                }
            }
            crossterm::event::KeyCode::Esc => {
                self.is_open = false;
            }
            _ => {}
        }
        None
    }

    /// Handle an action
    pub fn handle_action(&mut self, action: &KnowledgeAction) {
        match action {
            KnowledgeAction::Index(path) => {
                self.is_indexing = true;
                self.index_progress = 0.0;
                self.index_path = Some(path.clone());
                tracing::info!("Indexing: {}", path);
            }
            KnowledgeAction::Search(query) => {
                self.query = query.clone();
                tracing::info!("Semantic search: {}", query);
            }
            KnowledgeAction::SearchResults(results) => {
                self.results = results.clone();
                self.selected_index = 0;
                self.is_indexing = false;
                self.index_progress = 1.0;
            }
            KnowledgeAction::IndexProgress(progress) => {
                self.index_progress = *progress;
            }
            _ => {}
        }
    }
}

impl Default for KnowledgePanel {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for KnowledgePanel {
    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        self.handle_key_event(key)
    }

    fn handle_action(&mut self, action: &Action) {
        if let Action::Knowledge(knowledge_action) = action {
            self.handle_action(knowledge_action);
        }
    }

    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        if !self.is_open {
            return;
        }

        let title = if self.is_indexing {
            format!(" Knowledge (Indexing... {:.0}%) ", self.index_progress * 100.0)
        } else {
            format!(" Knowledge ({} results) ", self.results.len())
        };

        let block = Block::default()
            .title(title.as_str())
            .borders(ratatui::widgets::Borders::ALL);

        if self.results.is_empty() && !self.is_indexing {
            let empty = Paragraph::new("No results. Start typing to search.")
                .block(block);
            f.render_widget(empty, area);
        } else {
            let items: Vec<ListItem> = self
                .results
                .iter()
                .enumerate()
                .map(|(idx, result)| {
                    let style = if idx == self.selected_index {
                        Style::default().bg(Color::Blue).fg(Color::White)
                    } else {
                        Style::default()
                    };

                    let line = Line::from(vec![
                        Span::styled(
                            format!("[{:.*}] ", 2, result.score),
                            Style::default().fg(Color::Cyan),
                        ),
                        Span::raw(&result.file_path),
                        Span::raw(" - "),
                        Span::raw(&result.excerpt),
                    ]);

                    ListItem::new(line).style(style)
                })
                .collect();

            let list = List::new(items).block(block);
            f.render_widget(list, area);
        }
    }
}
