//! Local graph explorer modal aligned with the Pencil popup design.

use crate::action::{Action, GraphAction, GraphFilter};
use crate::i18n::{Language, TextKey};
use crate::services::workspace::{GraphEdgeKind, GraphNodeRef, GraphRoot};
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};
use std::cell::Cell;
use std::collections::{BTreeSet, HashMap};

const OVERLAY_BG: Color = Color::Rgb(2, 5, 10);
const POPUP_BG: Color = Color::Rgb(26, 26, 46);
const SECTION_BG: Color = Color::Rgb(17, 22, 33);
const HEADER_BG: Color = Color::Rgb(22, 27, 34);
const BORDER: Color = Color::Rgb(48, 54, 61);
const TEXT_PRIMARY: Color = Color::Rgb(201, 209, 217);
const TEXT_MUTED: Color = Color::Rgb(139, 148, 158);
const TEXT_SUBTLE: Color = Color::Rgb(110, 118, 129);
const ACCENT: Color = Color::Rgb(88, 166, 255);
const SUCCESS: Color = Color::Rgb(63, 185, 80);
const TAG: Color = Color::Rgb(210, 153, 34);
const WARNING: Color = Color::Rgb(248, 81, 73);
const ROW_SELECTED_BG: Color = Color::Rgb(31, 43, 70);
const ROOT_CARD_BG: Color = Color::Rgb(20, 27, 42);

#[derive(Debug, Clone)]
struct VisibleGraphRow {
    node: GraphNodeRef,
    depth: usize,
    parent_relative_path: Option<String>,
    is_cycle: bool,
    is_expanded: bool,
    is_leaf: bool,
    can_expand: bool,
}

pub struct GraphExplorer {
    is_open: bool,
    language: Language,
    pinned: bool,
    filter: GraphFilter,
    root_title: String,
    root_relative_path: Option<String>,
    root_absolute_path: Option<String>,
    root_children: Vec<GraphNodeRef>,
    loaded_children: HashMap<String, Vec<GraphNodeRef>>,
    leaf_paths: BTreeSet<String>,
    expanded_paths: BTreeSet<String>,
    selected_index: Option<usize>,
    scroll_offset: usize,
    last_viewport_rows: Cell<usize>,
    last_error: Option<String>,
}

impl GraphExplorer {
    pub fn new() -> Self {
        Self {
            is_open: false,
            language: Language::En,
            pinned: false,
            filter: GraphFilter::All,
            root_title: String::new(),
            root_relative_path: None,
            root_absolute_path: None,
            root_children: Vec::new(),
            loaded_children: HashMap::new(),
            leaf_paths: BTreeSet::new(),
            expanded_paths: BTreeSet::new(),
            selected_index: None,
            scroll_offset: 0,
            last_viewport_rows: Cell::new(8),
            last_error: None,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
    }

    pub fn is_open(&self) -> bool {
        self.is_open
    }

    pub fn is_pinned(&self) -> bool {
        self.pinned
    }

    pub fn open(&mut self, root: Option<GraphRoot>) {
        self.is_open = true;
        self.pinned = false;
        self.last_error = None;
        self.set_root(root);
    }

    pub fn close(&mut self) {
        self.is_open = false;
        self.last_error = None;
    }

    pub fn set_root(&mut self, root: Option<GraphRoot>) {
        self.root_title.clear();
        self.root_relative_path = None;
        self.root_absolute_path = None;
        self.root_children.clear();
        self.loaded_children.clear();
        self.leaf_paths.clear();
        self.expanded_paths.clear();
        self.selected_index = None;
        self.scroll_offset = 0;

        if let Some(root) = root {
            self.root_title = root.title;
            self.root_relative_path = Some(root.relative_path);
            self.root_absolute_path = root.absolute_path;
            self.root_children = root.children;
            if !self.visible_rows().is_empty() {
                self.selected_index = Some(0);
            }
        }
    }

    pub fn toggle_pin(&mut self) {
        self.pinned = !self.pinned;
    }

    pub fn set_filter(&mut self, filter: GraphFilter) {
        self.filter = filter;
        self.clamp_selection();
        self.ensure_selection_visible();
    }

    pub fn move_selection(&mut self, delta: i32) {
        let visible_rows = self.visible_rows();
        if visible_rows.is_empty() {
            self.selected_index = None;
            self.scroll_offset = 0;
            return;
        }

        let current = self.selected_index.unwrap_or(0) as i32;
        let next = (current + delta).clamp(0, visible_rows.len().saturating_sub(1) as i32);
        self.selected_index = Some(next as usize);
        self.ensure_selection_visible();
    }

    pub fn request_expand_selected(&mut self) -> Option<String> {
        let Some(row) = self.selected_row() else {
            return None;
        };

        if !row.can_expand {
            return None;
        }

        let path = row.node.relative_path;
        if self.loaded_children.contains_key(&path) {
            self.expanded_paths.insert(path);
            self.ensure_selection_visible();
            return None;
        }

        Some(path)
    }

    pub fn set_loaded_children(&mut self, path: String, children: Vec<GraphNodeRef>) {
        if children.is_empty() {
            self.leaf_paths.insert(path.clone());
            self.loaded_children.remove(&path);
            self.expanded_paths.remove(&path);
        } else {
            self.leaf_paths.remove(&path);
            self.loaded_children.insert(path.clone(), children);
            self.expanded_paths.insert(path);
        }

        self.last_error = None;
        self.clamp_selection();
        self.ensure_selection_visible();
    }

    pub fn collapse_selected(&mut self) {
        let Some((selected_index, row)) = self.selected_row_with_index() else {
            return;
        };

        if self.expanded_paths.remove(&row.node.relative_path) {
            self.ensure_selection_visible();
            return;
        }

        let Some(parent_relative_path) = row.parent_relative_path else {
            return;
        };

        let visible_rows = self.visible_rows();
        if let Some(parent_index) = (0..selected_index).rev().find(|index| {
            visible_rows
                .get(*index)
                .map(|candidate| candidate.node.relative_path == parent_relative_path)
                .unwrap_or(false)
        }) {
            self.selected_index = Some(parent_index);
            self.ensure_selection_visible();
        }
    }

    pub fn selected_absolute_path(&self) -> Option<String> {
        self.selected_row().and_then(|row| row.node.absolute_path)
    }

    pub fn selected_line_number(&self) -> Option<usize> {
        self.selected_row().and_then(|row| row.node.line_number)
    }

    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        match key.code {
            KeyCode::Esc | KeyCode::Char('q') => Some(Action::Graph(GraphAction::Close)),
            KeyCode::Up | KeyCode::Char('k') => {
                Some(Action::Graph(GraphAction::MoveSelection(-1)))
            }
            KeyCode::Down | KeyCode::Char('j') => {
                Some(Action::Graph(GraphAction::MoveSelection(1)))
            }
            KeyCode::Left | KeyCode::Char('h') => Some(Action::Graph(GraphAction::CollapseSelected)),
            KeyCode::Right | KeyCode::Char('l') => {
                Some(Action::Graph(GraphAction::ExpandSelected))
            }
            KeyCode::Enter | KeyCode::Char('o') => {
                Some(Action::Graph(GraphAction::OpenSelected))
            }
            KeyCode::Char('p') | KeyCode::Char('P') => {
                Some(Action::Graph(GraphAction::TogglePin))
            }
            KeyCode::Char('f') | KeyCode::Char('F') => {
                Some(Action::Graph(GraphAction::SetFilter(Self::next_filter(self.filter))))
            }
            KeyCode::Char('1') => Some(Action::Graph(GraphAction::SetFilter(GraphFilter::All))),
            KeyCode::Char('2') => {
                Some(Action::Graph(GraphAction::SetFilter(GraphFilter::LinksOnly)))
            }
            KeyCode::Char('3') => {
                Some(Action::Graph(GraphAction::SetFilter(GraphFilter::BacklinksOnly)))
            }
            _ => None,
        }
    }

    pub fn render(&self, f: &mut Frame<'_>, area: Rect) {
        if !self.is_open {
            return;
        }

        f.render_widget(
            Block::default().style(Style::default().bg(OVERLAY_BG)),
            area,
        );

        let popup = Self::centered_popup(area);
        let popup_block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(POPUP_BG));
        f.render_widget(Clear, popup);
        f.render_widget(popup_block, popup);

        let vertical = Layout::new(
            Direction::Vertical,
            [
                Constraint::Length(3),
                Constraint::Min(12),
                Constraint::Length(1),
            ],
        )
        .split(Rect::new(
            popup.x + 1,
            popup.y + 1,
            popup.width.saturating_sub(2),
            popup.height.saturating_sub(2),
        ));

        self.render_header(f, vertical[0]);
        self.render_body(f, vertical[1]);
        self.render_footer(f, vertical[2]);
    }

    fn render_header(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        f.render_widget(
            Block::default().style(Style::default().bg(HEADER_BG)),
            area,
        );

        let sections = Layout::new(
            Direction::Horizontal,
            [Constraint::Fill(1), Constraint::Length(26)],
        )
        .split(area);

        let title = Paragraph::new(vec![
            Line::from(Span::styled(
                t.text(TextKey::GraphTitle),
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .add_modifier(Modifier::BOLD),
            )),
            Line::from(Span::styled(
                t.text(TextKey::GraphSubtitle),
                Style::default().fg(TEXT_MUTED),
            )),
        ]);
        f.render_widget(title, sections[0]);

        let pinned_style = if self.pinned {
            Style::default()
                .fg(Color::Rgb(201, 255, 210))
                .bg(Color::Rgb(19, 66, 40))
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(TEXT_SUBTLE).bg(Color::Rgb(24, 30, 44))
        };
        let badge_line = Line::from(vec![
            Span::styled(
                format!(" {} ", t.text(TextKey::GraphBadgeLocal)),
                Style::default()
                    .fg(Color::Rgb(255, 201, 92))
                    .bg(Color::Rgb(65, 46, 20))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled(
                format!(" {} ", t.text(TextKey::GraphBadgePinned)),
                pinned_style,
            ),
        ]);
        let badges = Paragraph::new(badge_line).alignment(Alignment::Right);
        f.render_widget(badges, sections[1]);
    }

    fn render_body(&self, f: &mut Frame<'_>, area: Rect) {
        let columns = Layout::new(
            Direction::Horizontal,
            [Constraint::Percentage(62), Constraint::Percentage(38)],
        )
        .split(area);

        self.render_tree_panel(f, columns[0]);
        self.render_details_panel(f, columns[1]);
    }

    fn render_tree_panel(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        let block = Block::default()
            .title(format!(" {} ", t.text(TextKey::GraphTreeTitle)))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let inner = Rect::new(
            area.x + 1,
            area.y + 1,
            area.width.saturating_sub(2),
            area.height.saturating_sub(2),
        );
        let rows = Layout::new(
            Direction::Vertical,
            [Constraint::Length(3), Constraint::Min(4)],
        )
        .split(inner);

        self.render_root_card(f, rows[0]);
        self.render_tree_rows(f, rows[1]);
    }

    fn render_root_card(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        let title = if self.root_title.trim().is_empty() {
            t.text(TextKey::GraphEmptyNoFile).to_string()
        } else {
            self.root_title.clone()
        };
        let subtitle = self
            .root_relative_path
            .clone()
            .unwrap_or_else(|| t.text(TextKey::GraphEmptyNoFile).to_string());

        let lines = vec![
            Line::from(vec![
                Span::styled("↺ ", Style::default().fg(ACCENT)),
                Span::styled(
                    format!("[{}] ", t.text(TextKey::GraphRootLabel)),
                    Style::default().fg(TEXT_SUBTLE),
                ),
                Span::styled(
                    title,
                    Style::default()
                        .fg(TEXT_PRIMARY)
                        .add_modifier(Modifier::BOLD),
                ),
            ]),
            Line::from(Span::styled(subtitle, Style::default().fg(TEXT_MUTED))),
        ];

        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(ROOT_CARD_BG));
        f.render_widget(block, area);
        f.render_widget(
            Paragraph::new(lines).wrap(Wrap { trim: false }),
            Rect::new(
                area.x + 1,
                area.y + 1,
                area.width.saturating_sub(2),
                area.height.saturating_sub(2),
            ),
        );
    }

    fn render_tree_rows(&self, f: &mut Frame<'_>, area: Rect) {
        let visible_rows = self.visible_rows();
        let viewport_rows = area.height as usize;
        self.last_viewport_rows.set(viewport_rows.max(1));

        if self.root_relative_path.is_none() {
            f.render_widget(
                Paragraph::new(self.language.translator().text(TextKey::GraphEmptyNoFile))
                    .style(Style::default().fg(TEXT_MUTED)),
                area,
            );
            return;
        }

        if visible_rows.is_empty() {
            f.render_widget(
                Paragraph::new(self.language.translator().text(TextKey::GraphEmptyNoRelations))
                    .style(Style::default().fg(TEXT_MUTED))
                    .wrap(Wrap { trim: false }),
                area,
            );
            return;
        }

        let start = self.scroll_offset.min(visible_rows.len().saturating_sub(1));
        let end = (start + viewport_rows).min(visible_rows.len());
        let lines = visible_rows[start..end]
            .iter()
            .enumerate()
            .map(|(offset, row)| self.tree_row_line(row, start + offset == self.selected_index.unwrap_or(usize::MAX)))
            .collect::<Vec<_>>();

        f.render_widget(
            Paragraph::new(lines).wrap(Wrap { trim: false }),
            area,
        );
    }

    fn tree_row_line(&self, row: &VisibleGraphRow, selected: bool) -> Line<'static> {
        let mut spans = Vec::new();
        spans.push(Span::raw(" ".repeat(row.depth.saturating_mul(2))));
        spans.push(Span::styled(
            format!("{} ", Self::branch_symbol(row)),
            Style::default().fg(Self::branch_color(row)),
        ));
        spans.push(Span::styled(
            format!("[{}] ", self.edge_label(row.node.kind)),
            Style::default()
                .fg(Self::edge_color(row.node.kind))
                .add_modifier(Modifier::BOLD),
        ));
        spans.push(Span::styled(
            row.node.title.clone(),
            Style::default()
                .fg(TEXT_PRIMARY)
                .add_modifier(if selected {
                    Modifier::BOLD
                } else {
                    Modifier::empty()
                }),
        ));

        let mut line = Line::from(spans);
        if selected {
            line = line.style(Style::default().bg(ROW_SELECTED_BG));
        }
        line
    }

    fn render_details_panel(&self, f: &mut Frame<'_>, area: Rect) {
        let chunks = Layout::new(
            Direction::Vertical,
            [Constraint::Length(10), Constraint::Min(6)],
        )
        .split(area);

        self.render_selected_card(f, chunks[0]);
        self.render_state_card(f, chunks[1]);
    }

    fn render_selected_card(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        let block = Block::default()
            .title(format!(" {} ", t.text(TextKey::GraphSelectedNodeTitle)))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let inner = Rect::new(
            area.x + 1,
            area.y + 1,
            area.width.saturating_sub(2),
            area.height.saturating_sub(2),
        );

        let Some(row) = self.selected_row() else {
            f.render_widget(
                Paragraph::new(t.text(TextKey::GraphNoSelection))
                    .style(Style::default().fg(TEXT_MUTED))
                    .wrap(Wrap { trim: false }),
                inner,
            );
            return;
        };

        let status_line = if row.is_cycle {
            t.text(TextKey::GraphCycleLabel).to_string()
        } else if !row.node.resolved {
            t.text(TextKey::GraphUnresolvedLabel).to_string()
        } else {
            row.node.context.clone()
        };

        let path = row.node.relative_path.clone();
        let mut lines = vec![
            Line::from(Span::styled(
                row.node.title,
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .add_modifier(Modifier::BOLD),
            )),
            Line::from(vec![Span::styled(
                format!(" {} ", self.edge_label(row.node.kind)),
                Style::default()
                    .fg(Color::White)
                    .bg(Self::edge_color(row.node.kind))
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(Span::styled(path, Style::default().fg(TEXT_MUTED))),
        ];

        if let Some(line_number) = row.node.line_number {
            lines.push(Line::from(Span::styled(
                self.language.translator().knowledge_line_number(line_number),
                Style::default().fg(TEXT_SUBTLE),
            )));
        }
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            status_line,
            Style::default().fg(if row.is_cycle || !row.node.resolved {
                WARNING
            } else {
                TEXT_PRIMARY
            }),
        )));

        f.render_widget(
            Paragraph::new(lines).wrap(Wrap { trim: false }),
            inner,
        );
    }

    fn render_state_card(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        let block = Block::default()
            .title(format!(" {} ", t.text(TextKey::GraphExplorerStateTitle)))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let mut lines = vec![
            Line::from(Span::styled(
                format!(
                    "• {}",
                    if self.pinned {
                        t.text(TextKey::GraphStatePinned)
                    } else {
                        t.text(TextKey::GraphStateFollowCurrent)
                    }
                ),
                Style::default().fg(TEXT_MUTED),
            )),
            Line::from(Span::styled(
                format!("• {}", t.text(TextKey::GraphStatePressPin)),
                Style::default().fg(TEXT_MUTED),
            )),
            Line::from(Span::styled(
                format!("• {}", t.text(TextKey::GraphStateLazyExpand)),
                Style::default().fg(TEXT_MUTED),
            )),
            Line::from(Span::styled(
                format!(
                    "• {} {}",
                    t.text(TextKey::GraphStateFilter),
                    t.graph_filter_label(self.filter)
                ),
                Style::default().fg(TEXT_MUTED),
            )),
        ];

        if let Some(error) = &self.last_error {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                error.clone(),
                Style::default().fg(WARNING),
            )));
        }

        f.render_widget(
            Paragraph::new(lines).wrap(Wrap { trim: false }),
            Rect::new(
                area.x + 1,
                area.y + 1,
                area.width.saturating_sub(2),
                area.height.saturating_sub(2),
            ),
        );
    }

    fn render_footer(&self, f: &mut Frame<'_>, area: Rect) {
        f.render_widget(
            Paragraph::new(self.language.translator().text(TextKey::GraphFooterHint))
                .style(Style::default().fg(TEXT_SUBTLE))
                .alignment(Alignment::Left),
            area,
        );
    }

    fn visible_rows(&self) -> Vec<VisibleGraphRow> {
        let mut rows = Vec::new();
        let mut root_ancestors = BTreeSet::new();
        if let Some(root_path) = &self.root_relative_path {
            root_ancestors.insert(root_path.clone());
        }

        for node in self
            .root_children
            .iter()
            .filter(|node| self.matches_filter(node.kind))
        {
            self.collect_visible_rows(
                node,
                0,
                &root_ancestors,
                self.root_relative_path.clone(),
                &mut rows,
            );
        }

        rows
    }

    fn collect_visible_rows(
        &self,
        node: &GraphNodeRef,
        depth: usize,
        ancestors: &BTreeSet<String>,
        parent_relative_path: Option<String>,
        rows: &mut Vec<VisibleGraphRow>,
    ) {
        let is_cycle = ancestors.contains(&node.relative_path);
        let is_leaf = self.leaf_paths.contains(&node.relative_path);
        let is_expanded = !is_cycle && self.expanded_paths.contains(&node.relative_path);
        let can_expand = node.resolved && !is_cycle && !is_leaf;

        rows.push(VisibleGraphRow {
            node: node.clone(),
            depth,
            parent_relative_path: parent_relative_path.clone(),
            is_cycle,
            is_expanded,
            is_leaf,
            can_expand,
        });

        if !is_expanded {
            return;
        }

        let Some(children) = self.loaded_children.get(&node.relative_path) else {
            return;
        };

        let mut next_ancestors = ancestors.clone();
        next_ancestors.insert(node.relative_path.clone());

        for child in children.iter().filter(|child| self.matches_filter(child.kind)) {
            self.collect_visible_rows(
                child,
                depth + 1,
                &next_ancestors,
                Some(node.relative_path.clone()),
                rows,
            );
        }
    }

    fn selected_row(&self) -> Option<VisibleGraphRow> {
        self.selected_index
            .and_then(|index| self.visible_rows().into_iter().nth(index))
    }

    fn selected_row_with_index(&self) -> Option<(usize, VisibleGraphRow)> {
        let index = self.selected_index?;
        self.visible_rows().into_iter().nth(index).map(|row| (index, row))
    }

    fn clamp_selection(&mut self) {
        let len = self.visible_rows().len();
        if len == 0 {
            self.selected_index = None;
            self.scroll_offset = 0;
            return;
        }

        let selected = self.selected_index.unwrap_or(0).min(len.saturating_sub(1));
        self.selected_index = Some(selected);
        let max_scroll = len.saturating_sub(self.last_viewport_rows.get().max(1));
        self.scroll_offset = self.scroll_offset.min(max_scroll);
    }

    fn ensure_selection_visible(&mut self) {
        let Some(selected_index) = self.selected_index else {
            self.scroll_offset = 0;
            return;
        };

        let viewport_rows = self.last_viewport_rows.get().max(1);
        if selected_index < self.scroll_offset {
            self.scroll_offset = selected_index;
        } else if selected_index >= self.scroll_offset + viewport_rows {
            self.scroll_offset = selected_index + 1 - viewport_rows;
        }
    }

    fn matches_filter(&self, kind: GraphEdgeKind) -> bool {
        match self.filter {
            GraphFilter::All => true,
            GraphFilter::LinksOnly => kind == GraphEdgeKind::Link,
            GraphFilter::BacklinksOnly => kind == GraphEdgeKind::Backlink,
        }
    }

    fn edge_label(&self, kind: GraphEdgeKind) -> &'static str {
        let t = self.language.translator();
        match kind {
            GraphEdgeKind::Link => t.text(TextKey::KnowledgeBadgeLink),
            GraphEdgeKind::Backlink => t.text(TextKey::KnowledgeBadgeBacklink),
            GraphEdgeKind::Tag => t.text(TextKey::KnowledgeBadgeTag),
        }
    }

    fn edge_color(kind: GraphEdgeKind) -> Color {
        match kind {
            GraphEdgeKind::Link => ACCENT,
            GraphEdgeKind::Backlink => SUCCESS,
            GraphEdgeKind::Tag => TAG,
        }
    }

    fn branch_symbol(row: &VisibleGraphRow) -> &'static str {
        if row.is_cycle {
            "↺"
        } else if !row.node.resolved {
            "!"
        } else if row.is_expanded {
            "▾"
        } else if row.can_expand {
            "▸"
        } else if row.is_leaf {
            "•"
        } else {
            "·"
        }
    }

    fn branch_color(row: &VisibleGraphRow) -> Color {
        if row.is_cycle || !row.node.resolved {
            WARNING
        } else if row.can_expand {
            TEXT_MUTED
        } else {
            TEXT_SUBTLE
        }
    }

    fn next_filter(filter: GraphFilter) -> GraphFilter {
        match filter {
            GraphFilter::All => GraphFilter::LinksOnly,
            GraphFilter::LinksOnly => GraphFilter::BacklinksOnly,
            GraphFilter::BacklinksOnly => GraphFilter::All,
        }
    }

    fn centered_popup(area: Rect) -> Rect {
        let max_width = area.width.saturating_sub(4).max(1);
        let max_height = area.height.saturating_sub(2).max(1);
        let width = (area.width.saturating_mul(68) / 100)
            .clamp(60.min(max_width), 78.min(max_width))
            .min(max_width);
        let height = (area.height.saturating_mul(82) / 100)
            .clamp(20.min(max_height), 26.min(max_height))
            .min(max_height);

        Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        )
    }
}
