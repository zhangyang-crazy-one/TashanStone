//! Local graph explorer modal aligned with the Pencil popup design.

use crate::action::{Action, GraphAction, GraphFilter};
use crate::i18n::{Language, TextKey};
use crate::services::workspace::{GraphEdgeKind, GraphNodeRef, GraphRoot};
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    symbols::Marker,
    text::{Line as TextLine, Span},
    widgets::{
        canvas::{Canvas, Line as CanvasLine, Points},
        Block, Borders, Clear, Paragraph, Wrap,
    },
    Frame,
};
use std::cell::Cell;
use std::collections::{BTreeSet, HashMap};
use std::f64::consts::{FRAC_PI_2, PI};
use unicode_width::UnicodeWidthChar;

const OVERLAY_BG: Color = Color::Rgb(2, 5, 10);
const POPUP_BG: Color = Color::Rgb(26, 26, 46);
const SECTION_BG: Color = Color::Rgb(17, 22, 33);
const HEADER_BG: Color = Color::Rgb(22, 27, 34);
const CANVAS_BG: Color = Color::Rgb(9, 13, 22);
const PREVIEW_BG: Color = Color::Rgb(14, 18, 29);
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
const TAB_ACTIVE_BG: Color = Color::Rgb(38, 56, 88);
const TAB_INACTIVE_BG: Color = Color::Rgb(24, 30, 44);

#[derive(Debug, Clone)]
struct VisibleGraphRow {
    key: String,
    node: GraphNodeRef,
    depth: usize,
    parent_key: Option<String>,
    parent_relative_path: Option<String>,
    is_cycle: bool,
    is_expanded: bool,
    is_leaf: bool,
    can_expand: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GraphViewMode {
    Tree,
    Canvas,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CanvasZoomLevel {
    Detail,
    Standard,
    Macro,
}

impl CanvasZoomLevel {
    fn zoom_in(self) -> Self {
        match self {
            Self::Macro => Self::Standard,
            Self::Standard => Self::Detail,
            Self::Detail => Self::Detail,
        }
    }

    fn zoom_out(self) -> Self {
        match self {
            Self::Detail => Self::Standard,
            Self::Standard => Self::Macro,
            Self::Macro => Self::Macro,
        }
    }

    fn span(self) -> (f64, f64) {
        match self {
            Self::Detail => (30.0, 18.0),
            Self::Standard => (42.0, 24.0),
            Self::Macro => (58.0, 32.0),
        }
    }

    fn label_key(self) -> TextKey {
        match self {
            Self::Detail => TextKey::GraphCanvasZoomDetail,
            Self::Standard => TextKey::GraphCanvasZoomStandard,
            Self::Macro => TextKey::GraphCanvasZoomMacro,
        }
    }
}

#[derive(Debug, Clone)]
struct CanvasNode {
    id: String,
    title: String,
    relative_path: String,
    absolute_path: Option<String>,
    context: String,
    line_number: Option<usize>,
    kind: Option<GraphEdgeKind>,
    x: f64,
    y: f64,
    is_root: bool,
    is_cycle: bool,
    resolved: bool,
}

#[derive(Debug, Clone)]
struct CanvasEdge {
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    color: Color,
}

#[derive(Debug, Clone)]
struct CanvasGraphModel {
    nodes: Vec<CanvasNode>,
    edges: Vec<CanvasEdge>,
    focus_index: Option<usize>,
}

impl CanvasGraphModel {
    fn focused_node(&self) -> Option<&CanvasNode> {
        self.focus_index.and_then(|index| self.nodes.get(index))
    }
}

pub struct GraphExplorer {
    is_open: bool,
    language: Language,
    pinned: bool,
    filter: GraphFilter,
    view_mode: GraphViewMode,
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
    canvas_zoom: CanvasZoomLevel,
    canvas_center_x: f64,
    canvas_center_y: f64,
    canvas_focus_id: Option<String>,
    canvas_preview_open: bool,
}

impl GraphExplorer {
    pub fn new() -> Self {
        Self {
            is_open: false,
            language: Language::En,
            pinned: false,
            filter: GraphFilter::All,
            view_mode: GraphViewMode::Tree,
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
            canvas_zoom: CanvasZoomLevel::Standard,
            canvas_center_x: 0.0,
            canvas_center_y: 0.0,
            canvas_focus_id: None,
            canvas_preview_open: false,
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
        self.view_mode = GraphViewMode::Tree;
        self.canvas_zoom = CanvasZoomLevel::Standard;
        self.canvas_center_x = 0.0;
        self.canvas_center_y = 0.0;
        self.canvas_preview_open = false;
        self.set_root(root);
    }

    pub fn close(&mut self) {
        self.is_open = false;
        self.last_error = None;
        self.canvas_preview_open = false;
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
        self.canvas_preview_open = false;

        if let Some(root) = root {
            self.root_title = root.title;
            self.root_relative_path = Some(root.relative_path);
            self.root_absolute_path = root.absolute_path;
            self.root_children = root.children;
            if !self.visible_rows().is_empty() {
                self.selected_index = Some(0);
            }
        }

        self.sync_canvas_focus_from_selection();
        self.center_canvas_on_focus();
    }

    pub fn toggle_pin(&mut self) {
        self.pinned = !self.pinned;
    }

    pub fn set_filter(&mut self, filter: GraphFilter) {
        let previous_focus = self.canvas_focus_id.clone();
        self.filter = filter;
        self.clamp_selection();
        self.ensure_selection_visible();
        self.retain_or_sync_canvas_focus(previous_focus.as_deref());
    }

    pub fn move_selection(&mut self, delta: i32) {
        let visible_rows = self.visible_rows();
        if visible_rows.is_empty() {
            self.selected_index = None;
            self.scroll_offset = 0;
            self.sync_canvas_focus_from_selection();
            return;
        }

        let current = self.selected_index.unwrap_or(0) as i32;
        let next = (current + delta).clamp(0, visible_rows.len().saturating_sub(1) as i32);
        self.selected_index = Some(next as usize);
        self.ensure_selection_visible();
        self.sync_canvas_focus_from_selection();
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
            self.sync_canvas_focus_from_selection();
            return None;
        }

        Some(path)
    }

    pub fn set_loaded_children(&mut self, path: String, children: Vec<GraphNodeRef>) {
        let previous_focus = self.canvas_focus_id.clone();
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
        self.retain_or_sync_canvas_focus(previous_focus.as_deref());
    }

    pub fn collapse_selected(&mut self) {
        let previous_focus = self.canvas_focus_id.clone();
        let Some((selected_index, row)) = self.selected_row_with_index() else {
            return;
        };

        if self.expanded_paths.remove(&row.node.relative_path) {
            self.ensure_selection_visible();
            self.retain_or_sync_canvas_focus(previous_focus.as_deref());
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
            self.retain_or_sync_canvas_focus(previous_focus.as_deref());
        }
    }

    pub fn selected_absolute_path(&self) -> Option<String> {
        match self.view_mode {
            GraphViewMode::Tree => self.selected_row().and_then(|row| row.node.absolute_path),
            GraphViewMode::Canvas => self
                .focused_canvas_node()
                .and_then(|node| node.absolute_path),
        }
    }

    pub fn selected_line_number(&self) -> Option<usize> {
        match self.view_mode {
            GraphViewMode::Tree => self.selected_row().and_then(|row| row.node.line_number),
            GraphViewMode::Canvas => self.focused_canvas_node().and_then(|node| node.line_number),
        }
    }

    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        match self.view_mode {
            GraphViewMode::Tree => self.handle_tree_key_event(key),
            GraphViewMode::Canvas => self.handle_canvas_key_event(key),
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

    fn handle_tree_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        match key.code {
            KeyCode::Esc | KeyCode::Char('q') => Some(Action::Graph(GraphAction::Close)),
            KeyCode::Up | KeyCode::Char('k') => Some(Action::Graph(GraphAction::MoveSelection(-1))),
            KeyCode::Down | KeyCode::Char('j') => {
                Some(Action::Graph(GraphAction::MoveSelection(1)))
            }
            KeyCode::Left | KeyCode::Char('h') => {
                Some(Action::Graph(GraphAction::CollapseSelected))
            }
            KeyCode::Right | KeyCode::Char('l') => Some(Action::Graph(GraphAction::ExpandSelected)),
            KeyCode::Enter | KeyCode::Char('o') | KeyCode::Char('O') => {
                Some(Action::Graph(GraphAction::OpenSelected))
            }
            KeyCode::Char('p') | KeyCode::Char('P') => Some(Action::Graph(GraphAction::TogglePin)),
            KeyCode::Char('f') | KeyCode::Char('F') => Some(Action::Graph(GraphAction::SetFilter(
                Self::next_filter(self.filter),
            ))),
            KeyCode::Char('1') => Some(Action::Graph(GraphAction::SetFilter(GraphFilter::All))),
            KeyCode::Char('2') => Some(Action::Graph(GraphAction::SetFilter(
                GraphFilter::LinksOnly,
            ))),
            KeyCode::Char('3') => Some(Action::Graph(GraphAction::SetFilter(
                GraphFilter::BacklinksOnly,
            ))),
            KeyCode::Tab | KeyCode::BackTab | KeyCode::Char('v') | KeyCode::Char('V') => {
                self.switch_view_mode(GraphViewMode::Canvas);
                None
            }
            _ => None,
        }
    }

    fn handle_canvas_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        match key.code {
            KeyCode::Esc => {
                if self.canvas_preview_open {
                    self.canvas_preview_open = false;
                    None
                } else {
                    Some(Action::Graph(GraphAction::Close))
                }
            }
            KeyCode::Char('q') => Some(Action::Graph(GraphAction::Close)),
            KeyCode::Tab => {
                self.cycle_canvas_focus(1);
                None
            }
            KeyCode::BackTab => {
                self.cycle_canvas_focus(-1);
                None
            }
            KeyCode::Char('v') | KeyCode::Char('V') => {
                self.switch_view_mode(GraphViewMode::Tree);
                None
            }
            KeyCode::Up | KeyCode::Char('k') => {
                self.pan_canvas(0.0, Self::pan_step(self.canvas_zoom));
                None
            }
            KeyCode::Down | KeyCode::Char('j') => {
                self.pan_canvas(0.0, -Self::pan_step(self.canvas_zoom));
                None
            }
            KeyCode::Left | KeyCode::Char('h') => {
                self.pan_canvas(-Self::pan_step(self.canvas_zoom), 0.0);
                None
            }
            KeyCode::Right | KeyCode::Char('l') => {
                self.pan_canvas(Self::pan_step(self.canvas_zoom), 0.0);
                None
            }
            KeyCode::Char('+') | KeyCode::Char('=') => {
                self.zoom_canvas(true);
                None
            }
            KeyCode::Char('-') => {
                self.zoom_canvas(false);
                None
            }
            KeyCode::Char(' ') => {
                self.center_canvas_on_focus();
                None
            }
            KeyCode::Enter | KeyCode::Char('o') | KeyCode::Char('O') => {
                Some(Action::Graph(GraphAction::OpenSelected))
            }
            KeyCode::Char('p') | KeyCode::Char('P') => {
                self.toggle_canvas_preview();
                None
            }
            KeyCode::Char('f') | KeyCode::Char('F') => {
                self.toggle_pin();
                None
            }
            KeyCode::Char('1') => {
                self.set_filter(GraphFilter::All);
                None
            }
            KeyCode::Char('2') => {
                self.set_filter(GraphFilter::LinksOnly);
                None
            }
            KeyCode::Char('3') => {
                self.set_filter(GraphFilter::BacklinksOnly);
                None
            }
            _ => None,
        }
    }

    fn render_header(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        f.render_widget(Block::default().style(Style::default().bg(HEADER_BG)), area);

        let sections = Layout::new(
            Direction::Horizontal,
            [
                Constraint::Fill(1),
                Constraint::Length(26),
                Constraint::Length(26),
            ],
        )
        .split(area);

        let title = Paragraph::new(vec![
            TextLine::from(Span::styled(
                t.text(TextKey::GraphTitle),
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .add_modifier(Modifier::BOLD),
            )),
            TextLine::from(Span::styled(
                t.text(TextKey::GraphSubtitle),
                Style::default().fg(TEXT_MUTED),
            )),
        ]);
        f.render_widget(title, sections[0]);

        let tabs = Paragraph::new(TextLine::from(vec![
            self.view_tab_span(GraphViewMode::Tree),
            Span::raw(" "),
            self.view_tab_span(GraphViewMode::Canvas),
        ]))
        .alignment(Alignment::Center);
        f.render_widget(tabs, sections[1]);

        let pinned_style = if self.pinned {
            Style::default()
                .fg(Color::Rgb(201, 255, 210))
                .bg(Color::Rgb(19, 66, 40))
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(TEXT_SUBTLE).bg(TAB_INACTIVE_BG)
        };
        let badge_line = TextLine::from(vec![
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
        f.render_widget(badges, sections[2]);
    }

    fn render_body(&self, f: &mut Frame<'_>, area: Rect) {
        match self.view_mode {
            GraphViewMode::Tree => {
                let columns = Layout::new(
                    Direction::Horizontal,
                    [Constraint::Percentage(62), Constraint::Percentage(38)],
                )
                .split(area);
                self.render_tree_panel(f, columns[0]);
                self.render_details_panel(f, columns[1]);
            }
            GraphViewMode::Canvas => {
                let columns = Layout::new(
                    Direction::Horizontal,
                    [Constraint::Percentage(66), Constraint::Percentage(34)],
                )
                .split(area);
                self.render_canvas_panel(f, columns[0]);
                self.render_canvas_details_panel(f, columns[1]);
            }
        }
    }

    fn render_tree_panel(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        let block = Block::default()
            .title(format!(" {} ", t.text(TextKey::GraphTreeTitle)))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let inner = Self::inner_rect(area);
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
            TextLine::from(vec![
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
            TextLine::from(Span::styled(subtitle, Style::default().fg(TEXT_MUTED))),
        ];

        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(ROOT_CARD_BG));
        f.render_widget(block, area);
        f.render_widget(
            Paragraph::new(lines).wrap(Wrap { trim: false }),
            Self::inner_rect(area),
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
                Paragraph::new(
                    self.language
                        .translator()
                        .text(TextKey::GraphEmptyNoRelations),
                )
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
            .map(|(offset, row)| {
                self.tree_row_line(
                    row,
                    start + offset == self.selected_index.unwrap_or(usize::MAX),
                )
            })
            .collect::<Vec<_>>();

        f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }), area);
    }

    fn tree_row_line(&self, row: &VisibleGraphRow, selected: bool) -> TextLine<'static> {
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
            Style::default().fg(TEXT_PRIMARY).add_modifier(if selected {
                Modifier::BOLD
            } else {
                Modifier::empty()
            }),
        ));

        let mut line = TextLine::from(spans);
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

        let inner = Self::inner_rect(area);

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
            TextLine::from(Span::styled(
                row.node.title,
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .add_modifier(Modifier::BOLD),
            )),
            TextLine::from(vec![Span::styled(
                format!(" {} ", self.edge_label(row.node.kind)),
                Style::default()
                    .fg(Color::White)
                    .bg(Self::edge_color(row.node.kind))
                    .add_modifier(Modifier::BOLD),
            )]),
            TextLine::from(""),
            TextLine::from(Span::styled(path, Style::default().fg(TEXT_MUTED))),
        ];

        if let Some(line_number) = row.node.line_number {
            lines.push(TextLine::from(Span::styled(
                self.language
                    .translator()
                    .knowledge_line_number(line_number),
                Style::default().fg(TEXT_SUBTLE),
            )));
        }
        lines.push(TextLine::from(""));
        lines.push(TextLine::from(Span::styled(
            status_line,
            Style::default().fg(if row.is_cycle || !row.node.resolved {
                WARNING
            } else {
                TEXT_PRIMARY
            }),
        )));

        f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }), inner);
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
            TextLine::from(Span::styled(
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
            TextLine::from(Span::styled(
                format!("• {}", t.text(TextKey::GraphStatePressPin)),
                Style::default().fg(TEXT_MUTED),
            )),
            TextLine::from(Span::styled(
                format!("• {}", t.text(TextKey::GraphStateLazyExpand)),
                Style::default().fg(TEXT_MUTED),
            )),
            TextLine::from(Span::styled(
                format!(
                    "• {} {}",
                    t.text(TextKey::GraphStateFilter),
                    t.graph_filter_label(self.filter)
                ),
                Style::default().fg(TEXT_MUTED),
            )),
        ];

        if let Some(error) = &self.last_error {
            lines.push(TextLine::from(""));
            lines.push(TextLine::from(Span::styled(
                error.clone(),
                Style::default().fg(WARNING),
            )));
        }

        f.render_widget(
            Paragraph::new(lines).wrap(Wrap { trim: false }),
            Self::inner_rect(area),
        );
    }

    fn render_canvas_panel(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        let block = Block::default()
            .title(format!(" {} ", t.text(TextKey::GraphCanvasTitle)))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let inner = Self::inner_rect(area);
        let Some(model) = self.build_canvas_model() else {
            f.render_widget(
                Paragraph::new(t.text(TextKey::GraphEmptyNoFile))
                    .style(Style::default().fg(TEXT_MUTED))
                    .wrap(Wrap { trim: false }),
                inner,
            );
            return;
        };

        self.render_canvas_stage(f, inner, &model);
        if self.canvas_preview_open {
            self.render_canvas_preview_overlay(f, inner, &model);
        }
    }

    fn render_canvas_stage(&self, f: &mut Frame<'_>, area: Rect, model: &CanvasGraphModel) {
        let (span_x, span_y) = self.canvas_zoom.span();
        let x_bounds = [
            self.canvas_center_x - span_x / 2.0,
            self.canvas_center_x + span_x / 2.0,
        ];
        let y_bounds = [
            self.canvas_center_y - span_y / 2.0,
            self.canvas_center_y + span_y / 2.0,
        ];

        let edges = model.edges.clone();
        let nodes = model.nodes.clone();
        let focus_id = model.focused_node().map(|node| node.id.clone());
        let canvas = Canvas::default()
            .background_color(CANVAS_BG)
            .marker(Marker::Dot)
            .x_bounds(x_bounds)
            .y_bounds(y_bounds)
            .paint(move |ctx| {
                for edge in &edges {
                    ctx.draw(&CanvasLine::new(
                        edge.x1, edge.y1, edge.x2, edge.y2, edge.color,
                    ));
                }
                ctx.layer();

                for node in &nodes {
                    let coords = [(node.x, node.y)];
                    ctx.draw(&Points {
                        coords: &coords,
                        color: Self::canvas_node_color(
                            node,
                            focus_id.as_deref() == Some(node.id.as_str()),
                        ),
                    });
                }
                ctx.layer();

                for node in &nodes {
                    ctx.print(
                        node.x + 0.7,
                        node.y + 0.55,
                        Self::canvas_label_line(
                            node,
                            focus_id.as_deref() == Some(node.id.as_str()),
                        ),
                    );
                }
            });
        f.render_widget(canvas, area);

        if model.nodes.len() <= 1 && area.width > 8 && area.height > 3 {
            let notice = Rect::new(
                area.x + 1,
                area.y + area.height.saturating_sub(2),
                area.width.saturating_sub(2),
                1,
            );
            f.render_widget(
                Paragraph::new(self.language.translator().text(TextKey::GraphCanvasEmpty))
                    .style(Style::default().fg(TEXT_SUBTLE)),
                notice,
            );
        }
    }

    fn render_canvas_preview_overlay(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        model: &CanvasGraphModel,
    ) {
        if area.width < 28 || area.height < 8 {
            return;
        }

        let Some(node) = model.focused_node() else {
            return;
        };

        let width = (area.width.saturating_mul(42) / 100).clamp(26, area.width.saturating_sub(2));
        let height = 8.min(area.height.saturating_sub(2));
        let overlay = Rect::new(
            area.x + area.width.saturating_sub(width + 1),
            area.y + area.height.saturating_sub(height + 1),
            width,
            height,
        );

        let block = Block::default()
            .title(format!(
                " {} ",
                self.language
                    .translator()
                    .text(TextKey::GraphCanvasPreviewTitle)
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(PREVIEW_BG));
        f.render_widget(Clear, overlay);
        f.render_widget(block, overlay);
        f.render_widget(
            Paragraph::new(self.canvas_preview_lines(node)).wrap(Wrap { trim: false }),
            Self::inner_rect(overlay),
        );
    }

    fn render_canvas_details_panel(&self, f: &mut Frame<'_>, area: Rect) {
        let model = self.build_canvas_model();
        let chunks = Layout::new(
            Direction::Vertical,
            [
                Constraint::Length(10),
                Constraint::Length(9),
                Constraint::Min(6),
            ],
        )
        .split(area);

        self.render_canvas_focus_card(f, chunks[0], model.as_ref());
        self.render_canvas_session_card(f, chunks[1]);
        self.render_canvas_secondary_card(f, chunks[2], model.as_ref());
    }

    fn render_canvas_focus_card(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        model: Option<&CanvasGraphModel>,
    ) {
        let t = self.language.translator();
        let block = Block::default()
            .title(format!(
                " {} ",
                t.text(TextKey::GraphCanvasFocusedNodeTitle)
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let inner = Self::inner_rect(area);
        let Some(node) = model.and_then(CanvasGraphModel::focused_node) else {
            f.render_widget(
                Paragraph::new(t.text(TextKey::GraphNoSelection))
                    .style(Style::default().fg(TEXT_MUTED)),
                inner,
            );
            return;
        };

        let mut lines = vec![
            TextLine::from(Span::styled(
                node.title.clone(),
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .add_modifier(Modifier::BOLD),
            )),
            TextLine::from(vec![Span::styled(
                format!(" {} ", self.canvas_kind_badge(node)),
                Style::default()
                    .fg(Color::White)
                    .bg(Self::canvas_node_badge_color(node))
                    .add_modifier(Modifier::BOLD),
            )]),
            TextLine::from(""),
            TextLine::from(Span::styled(
                node.relative_path.clone(),
                Style::default().fg(TEXT_MUTED),
            )),
        ];

        if let Some(line_number) = node.line_number {
            lines.push(TextLine::from(Span::styled(
                t.knowledge_line_number(line_number),
                Style::default().fg(TEXT_SUBTLE),
            )));
        }

        lines.push(TextLine::from(""));
        lines.push(TextLine::from(Span::styled(
            self.canvas_context_line(node),
            Style::default().fg(if node.is_cycle || !node.resolved {
                WARNING
            } else {
                TEXT_PRIMARY
            }),
        )));

        f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }), inner);
    }

    fn render_canvas_session_card(&self, f: &mut Frame<'_>, area: Rect) {
        let t = self.language.translator();
        let block = Block::default()
            .title(format!(" {} ", t.text(TextKey::GraphCanvasSessionTitle)))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let lines = vec![
            TextLine::from(Span::styled(
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
            TextLine::from(Span::styled(
                format!(
                    "• {} {}",
                    t.text(TextKey::GraphCanvasZoom),
                    t.text(self.canvas_zoom.label_key())
                ),
                Style::default().fg(TEXT_MUTED),
            )),
            TextLine::from(Span::styled(
                format!(
                    "• {} {}",
                    t.text(TextKey::GraphStateFilter),
                    t.graph_filter_label(self.filter)
                ),
                Style::default().fg(TEXT_MUTED),
            )),
            TextLine::from(""),
            TextLine::from(Span::styled(
                t.text(TextKey::GraphCanvasSessionActions),
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .add_modifier(Modifier::BOLD),
            )),
            TextLine::from(Span::styled(
                t.text(TextKey::GraphFooterHintCanvas),
                Style::default().fg(TEXT_SUBTLE),
            )),
        ];

        f.render_widget(
            Paragraph::new(lines).wrap(Wrap { trim: false }),
            Self::inner_rect(area),
        );
    }

    fn render_canvas_secondary_card(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        model: Option<&CanvasGraphModel>,
    ) {
        let t = self.language.translator();
        let preview_open = self.canvas_preview_open;
        let title_key = if preview_open {
            TextKey::GraphCanvasPreviewTitle
        } else {
            TextKey::GraphCanvasFallbackTitle
        };

        let block = Block::default()
            .title(format!(" {} ", t.text(title_key)))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(BORDER))
            .style(Style::default().bg(SECTION_BG));
        f.render_widget(block, area);

        let inner = Self::inner_rect(area);
        if preview_open {
            if let Some(node) = model.and_then(CanvasGraphModel::focused_node) {
                f.render_widget(
                    Paragraph::new(self.canvas_preview_lines(node)).wrap(Wrap { trim: false }),
                    inner,
                );
                return;
            }
        }

        let body = if model
            .map(|canvas| canvas.nodes.len() <= 1)
            .unwrap_or_default()
        {
            t.text(TextKey::GraphCanvasEmpty)
        } else {
            t.text(TextKey::GraphCanvasFallbackBody)
        };
        f.render_widget(
            Paragraph::new(body)
                .style(Style::default().fg(TEXT_MUTED))
                .wrap(Wrap { trim: false }),
            inner,
        );
    }

    fn render_footer(&self, f: &mut Frame<'_>, area: Rect) {
        let footer_key = match self.view_mode {
            GraphViewMode::Tree => TextKey::GraphFooterHint,
            GraphViewMode::Canvas => TextKey::GraphFooterHintCanvas,
        };
        f.render_widget(
            Paragraph::new(self.language.translator().text(footer_key))
                .style(Style::default().fg(TEXT_SUBTLE))
                .alignment(Alignment::Left),
            area,
        );
    }

    fn visible_rows(&self) -> Vec<VisibleGraphRow> {
        let mut rows = Vec::new();
        let mut root_ancestors = BTreeSet::new();
        let root_key = self.root_relative_path.as_deref().map(Self::root_canvas_id);
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
                root_key.clone(),
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
        parent_key: Option<String>,
        rows: &mut Vec<VisibleGraphRow>,
    ) {
        let is_cycle = ancestors.contains(&node.relative_path);
        let is_leaf = self.leaf_paths.contains(&node.relative_path);
        let is_expanded = !is_cycle && self.expanded_paths.contains(&node.relative_path);
        let can_expand = node.resolved && !is_cycle && !is_leaf;
        let key = Self::row_key(parent_key.as_deref(), depth, node);

        rows.push(VisibleGraphRow {
            key: key.clone(),
            node: node.clone(),
            depth,
            parent_key: parent_key.clone(),
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

        for child in children
            .iter()
            .filter(|child| self.matches_filter(child.kind))
        {
            self.collect_visible_rows(
                child,
                depth + 1,
                &next_ancestors,
                Some(node.relative_path.clone()),
                Some(key.clone()),
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
        self.visible_rows()
            .into_iter()
            .nth(index)
            .map(|row| (index, row))
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

    fn focused_canvas_node(&self) -> Option<CanvasNode> {
        self.build_canvas_model()
            .and_then(|model| model.focused_node().cloned())
    }

    fn build_canvas_model(&self) -> Option<CanvasGraphModel> {
        let root_relative_path = self.root_relative_path.clone()?;
        let root_id = Self::root_canvas_id(&root_relative_path);
        let root_context = self.root_relative_path.clone().unwrap_or_else(|| {
            self.language
                .translator()
                .text(TextKey::GraphRootLabel)
                .to_string()
        });
        let root_node = CanvasNode {
            id: root_id.clone(),
            title: if self.root_title.trim().is_empty() {
                self.language
                    .translator()
                    .text(TextKey::GraphRootLabel)
                    .to_string()
            } else {
                self.root_title.clone()
            },
            relative_path: root_relative_path,
            absolute_path: self.root_absolute_path.clone(),
            context: root_context,
            line_number: None,
            kind: None,
            x: 0.0,
            y: 0.0,
            is_root: true,
            is_cycle: false,
            resolved: true,
        };

        let mut nodes = vec![root_node];
        let mut edges = Vec::new();
        let mut children_by_parent: HashMap<String, Vec<VisibleGraphRow>> = HashMap::new();
        for row in self.visible_rows() {
            let parent = row.parent_key.clone().unwrap_or_else(|| root_id.clone());
            children_by_parent.entry(parent).or_default().push(row);
        }

        self.populate_canvas_children(
            &root_id,
            0.0,
            0.0,
            0,
            &children_by_parent,
            &mut nodes,
            &mut edges,
        );

        let focus_index = self
            .canvas_focus_id
            .as_ref()
            .and_then(|focus_id| nodes.iter().position(|node| &node.id == focus_id))
            .or(Some(0));

        Some(CanvasGraphModel {
            nodes,
            edges,
            focus_index,
        })
    }

    fn populate_canvas_children(
        &self,
        parent_id: &str,
        parent_x: f64,
        parent_y: f64,
        depth: usize,
        children_by_parent: &HashMap<String, Vec<VisibleGraphRow>>,
        nodes: &mut Vec<CanvasNode>,
        edges: &mut Vec<CanvasEdge>,
    ) {
        let Some(children) = children_by_parent.get(parent_id) else {
            return;
        };

        for kind in [
            GraphEdgeKind::Tag,
            GraphEdgeKind::Link,
            GraphEdgeKind::Backlink,
        ] {
            let group = children
                .iter()
                .filter(|row| row.node.kind == kind)
                .collect::<Vec<_>>();
            if group.is_empty() {
                continue;
            }

            let base_angle = Self::canvas_base_angle(kind);
            let spread = Self::canvas_spread(group.len(), depth);
            let radius = Self::canvas_radius(depth + 1);

            let group_len = group.len();
            for (index, row) in group.into_iter().enumerate() {
                let angle = Self::fan_angle(base_angle, index, group_len, spread);
                let x = parent_x + radius * angle.cos();
                let y = parent_y + radius * angle.sin();

                nodes.push(CanvasNode {
                    id: row.key.clone(),
                    title: row.node.title.clone(),
                    relative_path: row.node.relative_path.clone(),
                    absolute_path: row.node.absolute_path.clone(),
                    context: row.node.context.clone(),
                    line_number: row.node.line_number,
                    kind: Some(row.node.kind),
                    x,
                    y,
                    is_root: false,
                    is_cycle: row.is_cycle,
                    resolved: row.node.resolved,
                });
                edges.push(CanvasEdge {
                    x1: parent_x,
                    y1: parent_y,
                    x2: x,
                    y2: y,
                    color: Self::edge_color(row.node.kind),
                });

                self.populate_canvas_children(
                    &row.key,
                    x,
                    y,
                    depth + 1,
                    children_by_parent,
                    nodes,
                    edges,
                );
            }
        }
    }

    fn retain_or_sync_canvas_focus(&mut self, preferred: Option<&str>) {
        if let Some(id) = preferred {
            if self
                .build_canvas_model()
                .map(|model| model.nodes.iter().any(|node| node.id == id))
                .unwrap_or(false)
            {
                self.canvas_focus_id = Some(id.to_string());
                return;
            }
        }
        self.sync_canvas_focus_from_selection();
    }

    fn sync_canvas_focus_from_selection(&mut self) {
        if let Some(row) = self.selected_row() {
            self.canvas_focus_id = Some(row.key);
        } else if let Some(root_path) = &self.root_relative_path {
            self.canvas_focus_id = Some(Self::root_canvas_id(root_path));
        } else {
            self.canvas_focus_id = None;
        }
    }

    fn sync_selection_from_canvas_focus(&mut self) {
        let Some(focus_id) = self.canvas_focus_id.clone() else {
            return;
        };
        if focus_id.starts_with("root::") {
            return;
        }

        let visible_rows = self.visible_rows();
        if let Some(index) = visible_rows.iter().position(|row| row.key == focus_id) {
            self.selected_index = Some(index);
            self.ensure_selection_visible();
            return;
        }

        let focused_relative_path = self.build_canvas_model().and_then(|model| {
            model
                .nodes
                .into_iter()
                .find(|node| node.id == focus_id)
                .map(|node| node.relative_path)
        });
        if let Some(relative_path) = focused_relative_path {
            if let Some(index) = visible_rows
                .iter()
                .position(|row| row.node.relative_path == relative_path)
            {
                self.selected_index = Some(index);
                self.ensure_selection_visible();
            }
        }
    }

    fn switch_view_mode(&mut self, mode: GraphViewMode) {
        if self.view_mode == mode {
            return;
        }

        match mode {
            GraphViewMode::Tree => {
                self.sync_selection_from_canvas_focus();
                self.canvas_preview_open = false;
            }
            GraphViewMode::Canvas => {
                self.sync_canvas_focus_from_selection();
                self.center_canvas_on_focus();
            }
        }

        self.view_mode = mode;
    }

    fn cycle_canvas_focus(&mut self, delta: i32) {
        let Some(model) = self.build_canvas_model() else {
            return;
        };
        if model.nodes.is_empty() {
            return;
        }

        let len = model.nodes.len() as i32;
        let current = self
            .canvas_focus_id
            .as_ref()
            .and_then(|focus_id| model.nodes.iter().position(|node| &node.id == focus_id))
            .unwrap_or(0) as i32;
        let next = (current + delta).rem_euclid(len) as usize;
        self.canvas_focus_id = model.nodes.get(next).map(|node| node.id.clone());
    }

    fn pan_canvas(&mut self, dx: f64, dy: f64) {
        self.canvas_center_x += dx;
        self.canvas_center_y += dy;
    }

    fn center_canvas_on_focus(&mut self) {
        if let Some(node) = self.focused_canvas_node() {
            self.canvas_center_x = node.x;
            self.canvas_center_y = node.y;
        } else {
            self.canvas_center_x = 0.0;
            self.canvas_center_y = 0.0;
        }
    }

    fn zoom_canvas(&mut self, zoom_in: bool) {
        self.canvas_zoom = if zoom_in {
            self.canvas_zoom.zoom_in()
        } else {
            self.canvas_zoom.zoom_out()
        };
    }

    fn toggle_canvas_preview(&mut self) {
        if self.focused_canvas_node().is_some() {
            self.canvas_preview_open = !self.canvas_preview_open;
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

    fn canvas_base_angle(kind: GraphEdgeKind) -> f64 {
        match kind {
            GraphEdgeKind::Link => 0.0,
            GraphEdgeKind::Backlink => PI,
            GraphEdgeKind::Tag => FRAC_PI_2,
        }
    }

    fn canvas_spread(count: usize, depth: usize) -> f64 {
        if count <= 1 {
            0.0
        } else if depth == 0 {
            1.1 + (count.saturating_sub(2) as f64) * 0.08
        } else {
            0.72 + (count.saturating_sub(2) as f64) * 0.06
        }
    }

    fn canvas_radius(depth: usize) -> f64 {
        match depth {
            1 => 17.0,
            2 => 12.0,
            3 => 10.5,
            _ => 9.0,
        }
    }

    fn fan_angle(base: f64, index: usize, count: usize, spread: f64) -> f64 {
        if count <= 1 {
            return base;
        }

        let start = base - spread / 2.0;
        let step = spread / (count.saturating_sub(1) as f64);
        start + step * index as f64
    }

    fn canvas_node_color(node: &CanvasNode, focused: bool) -> Color {
        if focused {
            Color::Rgb(248, 248, 248)
        } else if node.is_root {
            Color::Rgb(110, 184, 255)
        } else if node.is_cycle || !node.resolved {
            WARNING
        } else {
            node.kind.map(Self::edge_color).unwrap_or(ACCENT)
        }
    }

    fn canvas_node_badge_color(node: &CanvasNode) -> Color {
        if node.is_cycle || !node.resolved {
            WARNING
        } else if node.is_root {
            ACCENT
        } else {
            node.kind.map(Self::edge_color).unwrap_or(ACCENT)
        }
    }

    fn canvas_kind_badge(&self, node: &CanvasNode) -> &'static str {
        if node.is_root {
            self.language.translator().text(TextKey::GraphRootLabel)
        } else {
            node.kind
                .map(|kind| self.edge_label(kind))
                .unwrap_or_else(|| self.language.translator().text(TextKey::GraphRootLabel))
        }
    }

    fn canvas_context_line(&self, node: &CanvasNode) -> String {
        if node.is_cycle {
            self.language
                .translator()
                .text(TextKey::GraphCycleLabel)
                .to_string()
        } else if !node.resolved {
            self.language
                .translator()
                .text(TextKey::GraphUnresolvedLabel)
                .to_string()
        } else if node.context.trim().is_empty() {
            node.relative_path.clone()
        } else {
            node.context.clone()
        }
    }

    fn canvas_label_line(node: &CanvasNode, focused: bool) -> TextLine<'static> {
        let label = Self::truncate_label(&node.title, if node.is_root { 18 } else { 16 });
        let style = if focused {
            Style::default()
                .fg(Color::Black)
                .bg(Color::Rgb(166, 213, 255))
                .add_modifier(Modifier::BOLD)
        } else if node.is_root {
            Style::default()
                .fg(TEXT_PRIMARY)
                .bg(ROOT_CARD_BG)
                .add_modifier(Modifier::BOLD)
        } else if node.is_cycle || !node.resolved {
            Style::default()
                .fg(Color::White)
                .bg(Color::Rgb(92, 42, 32))
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(TEXT_PRIMARY)
        };

        let prefix = if node.is_root { "◆" } else { "•" };
        TextLine::from(Span::styled(format!("{prefix} {label}"), style))
    }

    fn canvas_preview_lines(&self, node: &CanvasNode) -> Vec<TextLine<'static>> {
        let mut lines = vec![
            TextLine::from(Span::styled(
                node.title.clone(),
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .add_modifier(Modifier::BOLD),
            )),
            TextLine::from(Span::styled(
                node.relative_path.clone(),
                Style::default().fg(TEXT_MUTED),
            )),
        ];

        if let Some(line_number) = node.line_number {
            lines.push(TextLine::from(Span::styled(
                self.language
                    .translator()
                    .knowledge_line_number(line_number),
                Style::default().fg(TEXT_SUBTLE),
            )));
        }

        lines.push(TextLine::from(""));
        lines.push(TextLine::from(Span::styled(
            self.canvas_context_line(node),
            Style::default().fg(TEXT_PRIMARY),
        )));
        lines
    }

    fn view_tab_span(&self, mode: GraphViewMode) -> Span<'static> {
        let t = self.language.translator();
        let (label_key, active) = match mode {
            GraphViewMode::Tree => (
                TextKey::GraphViewTree,
                self.view_mode == GraphViewMode::Tree,
            ),
            GraphViewMode::Canvas => (
                TextKey::GraphViewCanvas,
                self.view_mode == GraphViewMode::Canvas,
            ),
        };
        let style = if active {
            Style::default()
                .fg(TEXT_PRIMARY)
                .bg(TAB_ACTIVE_BG)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(TEXT_MUTED).bg(TAB_INACTIVE_BG)
        };
        Span::styled(format!(" {} ", t.text(label_key)), style)
    }

    fn truncate_label(label: &str, max_width: usize) -> String {
        let mut width = 0;
        let mut output = String::new();
        for ch in label.chars() {
            let char_width = UnicodeWidthChar::width(ch).unwrap_or(1);
            if width + char_width > max_width.saturating_sub(1) {
                output.push('…');
                return output;
            }
            output.push(ch);
            width += char_width;
        }
        output
    }

    fn row_key(parent_key: Option<&str>, depth: usize, node: &GraphNodeRef) -> String {
        format!(
            "{}>{}:{}:{}",
            parent_key.unwrap_or("root"),
            depth,
            Self::kind_token(node.kind),
            node.relative_path
        )
    }

    fn kind_token(kind: GraphEdgeKind) -> &'static str {
        match kind {
            GraphEdgeKind::Link => "link",
            GraphEdgeKind::Backlink => "backlink",
            GraphEdgeKind::Tag => "tag",
        }
    }

    fn root_canvas_id(path: &str) -> String {
        format!("root::{path}")
    }

    fn pan_step(zoom: CanvasZoomLevel) -> f64 {
        match zoom {
            CanvasZoomLevel::Detail => 3.0,
            CanvasZoomLevel::Standard => 4.5,
            CanvasZoomLevel::Macro => 6.0,
        }
    }

    fn inner_rect(area: Rect) -> Rect {
        Rect::new(
            area.x + 1,
            area.y + 1,
            area.width.saturating_sub(2),
            area.height.saturating_sub(2),
        )
    }

    fn centered_popup(area: Rect) -> Rect {
        let max_width = area.width.saturating_sub(4).max(1);
        let max_height = area.height.saturating_sub(2).max(1);
        let width = (area.width.saturating_mul(74) / 100)
            .clamp(64.min(max_width), 92.min(max_width))
            .min(max_width);
        let height = (area.height.saturating_mul(84) / 100)
            .clamp(20.min(max_height), 28.min(max_height))
            .min(max_height);

        Rect::new(
            area.x + area.width.saturating_sub(width) / 2,
            area.y + area.height.saturating_sub(height) / 2,
            width,
            height,
        )
    }
}
