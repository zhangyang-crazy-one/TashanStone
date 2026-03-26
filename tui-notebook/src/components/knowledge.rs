//! Knowledge panel - semantic search and RAG

use crate::action::{Action, ComponentId, FileAction, KnowledgeAction, SearchAction, SearchResult};
use crate::i18n::{Language, TextKey};
use crate::services::workspace::{DocumentKnowledgeContext, KnowledgeReference};
use crossterm::event::KeyEvent;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};
use ropey::Rope;

#[derive(Debug, Clone, Copy)]
enum KnowledgeItemKind {
    Link,
    Backlink,
    TagMatch,
    Semantic,
}

#[derive(Debug, Clone)]
struct KnowledgeItem {
    kind: KnowledgeItemKind,
    title: String,
    relative_path: String,
    absolute_path: Option<String>,
    context: String,
    line_number: Option<usize>,
    score: Option<f32>,
}

/// Knowledge panel state
pub struct KnowledgePanel {
    /// Is panel open
    is_open: bool,
    /// Search query
    query: Rope,
    /// Semantic search results
    semantic_results: Vec<SearchResult>,
    /// Current document knowledge context
    document_context: DocumentKnowledgeContext,
    /// Selected result index
    selected_index: usize,
    /// Is indexing
    is_indexing: bool,
    /// Index progress
    index_progress: f32,
    /// Index job handle for cancellation
    index_path: Option<String>,
    /// Current UI language
    language: Language,
}

impl KnowledgePanel {
    pub fn new() -> Self {
        Self {
            is_open: false,
            query: Rope::new(),
            semantic_results: Vec::new(),
            document_context: DocumentKnowledgeContext::default(),
            selected_index: 0,
            is_indexing: false,
            index_progress: 0.0,
            index_path: None,
            language: Language::En,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
    }

    /// Check if panel is open
    pub fn is_open(&self) -> bool {
        self.is_open
    }

    /// Toggle panel visibility
    pub fn toggle(&mut self) {
        self.is_open = !self.is_open;
    }

    /// Set the current document context shown in the panel.
    pub fn set_document_context(&mut self, context: Option<DocumentKnowledgeContext>) {
        self.document_context = context.unwrap_or_default();
        self.selected_index = 0;
    }

    fn query_text(&self) -> String {
        self.query.to_string()
    }

    fn active_items(&self) -> Vec<KnowledgeItem> {
        if !self.query_text().trim().is_empty() {
            return self
                .semantic_results
                .iter()
                .map(|result| KnowledgeItem {
                    kind: KnowledgeItemKind::Semantic,
                    title: result
                        .file_path
                        .rsplit('/')
                        .next()
                        .unwrap_or(result.file_path.as_str())
                        .to_string(),
                    relative_path: result.file_path.clone(),
                    absolute_path: Some(result.file_path.clone()),
                    context: result.excerpt.clone(),
                    line_number: result.line_number,
                    score: Some(result.score),
                })
                .collect();
        }

        let mut items = Vec::new();
        items.extend(
            self.document_context
                .outgoing_links
                .iter()
                .cloned()
                .map(Self::link_item),
        );
        items.extend(
            self.document_context
                .backlinks
                .iter()
                .cloned()
                .map(Self::backlink_item),
        );
        items.extend(
            self.document_context
                .related_tags
                .iter()
                .cloned()
                .map(Self::tag_item),
        );
        items
    }

    fn link_item(reference: KnowledgeReference) -> KnowledgeItem {
        KnowledgeItem {
            kind: KnowledgeItemKind::Link,
            title: reference.title,
            relative_path: reference.relative_path,
            absolute_path: reference.absolute_path,
            context: reference.context,
            line_number: reference.line_number,
            score: None,
        }
    }

    fn backlink_item(reference: KnowledgeReference) -> KnowledgeItem {
        KnowledgeItem {
            kind: KnowledgeItemKind::Backlink,
            title: reference.title,
            relative_path: reference.relative_path,
            absolute_path: reference.absolute_path,
            context: reference.context,
            line_number: reference.line_number,
            score: None,
        }
    }

    fn tag_item(reference: KnowledgeReference) -> KnowledgeItem {
        KnowledgeItem {
            kind: KnowledgeItemKind::TagMatch,
            title: reference.title,
            relative_path: reference.relative_path,
            absolute_path: reference.absolute_path,
            context: reference.context,
            line_number: reference.line_number,
            score: None,
        }
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        let item_count = self.active_items().len();

        match key.code {
            crossterm::event::KeyCode::Up => {
                if self.selected_index > 0 {
                    self.selected_index -= 1;
                }
            }
            crossterm::event::KeyCode::Down => {
                if self.selected_index < item_count.saturating_sub(1) {
                    self.selected_index += 1;
                }
            }
            crossterm::event::KeyCode::Enter => {
                let query = self.query_text();
                if !query.trim().is_empty() && self.semantic_results.is_empty() {
                    return Some(Action::Knowledge(KnowledgeAction::Search(query)));
                }

                if let Some(item) = self.active_items().get(self.selected_index) {
                    if let Some(path) = item.absolute_path.clone() {
                        if let Some(line_number) = item.line_number {
                            return Some(Action::Search(SearchAction::OpenResult {
                                file_path: path,
                                line_number,
                            }));
                        }

                        return Some(Action::File(FileAction::Select(path)));
                    }
                }
            }
            crossterm::event::KeyCode::Char(c) => {
                let pos = self.query.len_chars();
                self.query.insert(pos, c.to_string().as_str());
                self.semantic_results.clear();
                self.selected_index = 0;
            }
            crossterm::event::KeyCode::Backspace => {
                if self.query.len_chars() > 0 {
                    let pos = self.query.len_chars() - 1;
                    self.query.remove(pos..pos + 1);
                    self.semantic_results.clear();
                    if self.query.len_chars() == 0 {
                        self.semantic_results.clear();
                    }
                    self.selected_index = 0;
                }
            }
            crossterm::event::KeyCode::Esc => {
                if self.query.len_chars() > 0 {
                    self.query = Rope::new();
                    self.semantic_results.clear();
                    self.selected_index = 0;
                } else {
                    self.is_open = false;
                    return Some(Action::Navigation(
                        crate::action::NavigationAction::FocusComponent(ComponentId::Editor),
                    ));
                }
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
                self.query = Rope::from_str(query);
                tracing::info!("Semantic search: {}", query);
            }
            KnowledgeAction::SearchResults(results) => {
                self.semantic_results = results.clone();
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

    fn selected_item_style(kind: KnowledgeItemKind, selected: bool) -> Style {
        if selected {
            return Style::default().bg(Color::Rgb(30, 58, 95)).fg(Color::White);
        }

        match kind {
            KnowledgeItemKind::Link => Style::default().fg(Color::Rgb(88, 166, 255)),
            KnowledgeItemKind::Backlink => Style::default().fg(Color::Rgb(63, 185, 80)),
            KnowledgeItemKind::TagMatch => Style::default().fg(Color::Rgb(255, 212, 59)),
            KnowledgeItemKind::Semantic => Style::default().fg(Color::Rgb(201, 209, 217)),
        }
    }

    fn item_prefix(&self, kind: KnowledgeItemKind) -> &'static str {
        match kind {
            KnowledgeItemKind::Link => self.language.translator().text(TextKey::KnowledgeBadgeLink),
            KnowledgeItemKind::Backlink => self
                .language
                .translator()
                .text(TextKey::KnowledgeBadgeBacklink),
            KnowledgeItemKind::TagMatch => self.language.translator().text(TextKey::KnowledgeBadgeTag),
            KnowledgeItemKind::Semantic => self.language.translator().text(TextKey::KnowledgeBadgeRag),
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
            self.language
                .translator()
                .knowledge_title_indexing(self.index_progress)
        } else if self.query.len_chars() > 0 {
            self.language
                .translator()
                .knowledge_title_search(self.semantic_results.len())
        } else {
            self.language.translator().knowledge_title_overview(
                self.document_context.outgoing_links.len(),
                self.document_context.backlinks.len(),
                self.document_context.related_tags.len(),
            )
        };

        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(4),
                Constraint::Length(3),
                Constraint::Min(1),
            ])
            .split(area);

        let header = Paragraph::new(vec![
            Line::from(vec![
                Span::styled(
                    self.document_context.title.as_str(),
                    Style::default().fg(Color::Rgb(201, 209, 217)),
                ),
                Span::raw("  "),
                Span::styled(
                    self.document_context.relative_path.as_str(),
                    Style::default().fg(Color::Rgb(110, 118, 129)),
                ),
            ]),
            Line::from(vec![Span::styled(
                self.language
                    .translator()
                    .knowledge_tags_line(&self.document_context.tags),
                Style::default().fg(Color::Rgb(255, 212, 59)),
            )]),
            Line::from(vec![Span::styled(
                self.language.translator().knowledge_counts_line(
                    self.document_context.outgoing_links.len(),
                    self.document_context.backlinks.len(),
                    self.document_context.related_tags.len(),
                ),
                Style::default().fg(Color::Rgb(139, 148, 158)),
            )]),
        ])
        .block(Block::default().title(title.as_str()).borders(Borders::ALL))
        .style(Style::default().bg(Color::Rgb(17, 24, 39)).fg(Color::White));
        f.render_widget(header, sections[0]);

        let query = if self.query.len_chars() == 0 {
            self.language
                .translator()
                .text(TextKey::KnowledgeQueryPlaceholder)
                .to_string()
        } else {
            self.query_text()
        };
        let query_style = if self.query.len_chars() == 0 {
            Style::default().fg(Color::Rgb(110, 118, 129))
        } else {
            Style::default().fg(Color::Rgb(201, 209, 217))
        };
        let query_box = Paragraph::new(query).style(query_style).block(
            Block::default()
                .title(format!(
                    " {} ",
                    self.language.translator().text(TextKey::KnowledgeQueryTitle)
                ))
                .borders(Borders::ALL)
                .style(Style::default().bg(Color::Rgb(22, 27, 34))),
        );
        f.render_widget(query_box, sections[1]);

        let items = self.active_items();
        if items.is_empty() && !self.is_indexing {
            let empty = Paragraph::new(
                self.language
                    .translator()
                    .text(TextKey::KnowledgeEmpty),
            )
                .block(
                    Block::default()
                        .title(format!(
                            " {} ",
                            self.language.translator().text(TextKey::KnowledgeItemsTitle)
                        ))
                        .borders(Borders::ALL),
                )
                .style(Style::default().bg(Color::Rgb(13, 17, 23)).fg(Color::White));
            f.render_widget(empty, sections[2]);
            return;
        }

        let rendered_items: Vec<ListItem> = items
            .iter()
            .enumerate()
            .map(|(idx, item)| {
                let style = Self::selected_item_style(item.kind, idx == self.selected_index);
                let badge_style = if idx == self.selected_index {
                    Style::default().bg(Color::Rgb(30, 58, 95)).fg(Color::White)
                } else {
                    Style::default().fg(Color::Rgb(139, 148, 158))
                };

                let title_line = Line::from(vec![
                    Span::styled(format!("[{}] ", self.item_prefix(item.kind)), badge_style),
                    Span::styled(item.title.as_str(), style),
                    Span::raw("  "),
                    Span::styled(
                        item.relative_path.as_str(),
                        Style::default().fg(Color::Rgb(110, 118, 129)),
                    ),
                    Span::raw("  "),
                    Span::styled(
                        item.line_number
                            .map(|line| self.language.translator().knowledge_line_number(line))
                            .or_else(|| item.score.map(|score| format!("{score:.2}")))
                            .unwrap_or_default(),
                        Style::default().fg(Color::Rgb(139, 148, 158)),
                    ),
                ]);

                let context_line = Line::from(vec![Span::styled(
                    item.context.as_str(),
                    Style::default().fg(Color::Rgb(139, 148, 158)),
                )]);

                ListItem::new(vec![title_line, context_line]).style(style)
            })
            .collect();

        let list = List::new(rendered_items)
            .block(
                Block::default()
                    .title(format!(
                        " {} ",
                        self.language.translator().text(TextKey::KnowledgeItemsTitle)
                    ))
                    .borders(Borders::ALL),
            )
            .style(Style::default().bg(Color::Rgb(13, 17, 23)).fg(Color::White));
        f.render_widget(list, sections[2]);
    }
}
