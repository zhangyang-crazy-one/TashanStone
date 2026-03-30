//! Local graph explorer modal aligned with the Pencil popup design.

use crate::action::{Action, GraphAction, GraphFilter};
use crate::i18n::{Language, TextKey};
use crate::services::workspace::{GraphEdgeKind, GraphNodeRef, GraphRoot};
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line as TextLine, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};
use std::cell::Cell;
use std::collections::{BTreeSet, HashMap, HashSet};
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
const WARNING: Color = Color::Rgb(248, 81, 73);
const ROW_SELECTED_BG: Color = Color::Rgb(31, 43, 70);
const ROOT_CARD_BG: Color = Color::Rgb(20, 27, 42);
const TAB_ACTIVE_BG: Color = Color::Rgb(38, 56, 88);
const TAB_INACTIVE_BG: Color = Color::Rgb(24, 30, 44);
const NODE_ROOT_BG: Color = Color::Rgb(15, 23, 42);
const NODE_LINK_BG: Color = Color::Rgb(29, 53, 87);
const NODE_BACKLINK_BG: Color = Color::Rgb(19, 42, 30);
const NODE_TAG_BG: Color = Color::Rgb(43, 33, 17);
const NODE_FOCUS_BG: Color = Color::Rgb(23, 46, 79);
const NODE_DANGER_BG: Color = Color::Rgb(104, 44, 39);
const POINT_FOCUS_BG: Color = Color::Rgb(28, 54, 92);
const EDGE_TAG: Color = Color::Rgb(225, 183, 85);

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CanvasNodeRenderMode {
    Point,
    Card,
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

    fn viewport_factor(self) -> f64 {
        match self {
            Self::Detail => 0.46,
            Self::Standard => 0.76,
            Self::Macro => 1.0,
        }
    }

    fn graph_padding(self) -> (f64, f64) {
        match self {
            Self::Detail => (8.0, 6.0),
            Self::Standard => (10.0, 8.0),
            Self::Macro => (12.0, 10.0),
        }
    }

    fn node_render_mode(self) -> CanvasNodeRenderMode {
        match self {
            Self::Macro => CanvasNodeRenderMode::Point,
            Self::Detail | Self::Standard => CanvasNodeRenderMode::Card,
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
    from_id: String,
    to_id: String,
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

#[derive(Debug, Clone, Copy, Default)]
struct ScreenLineCell {
    up: bool,
    down: bool,
    left: bool,
    right: bool,
    color: Option<Color>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScreenAnchor {
    Left,
    Right,
    Top,
    Bottom,
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
            canvas_zoom: CanvasZoomLevel::Macro,
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
        self.canvas_zoom = CanvasZoomLevel::Macro;
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
        self.center_canvas_on_graph();
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
        if Self::is_canvas_switch_key(key) {
            self.switch_view_mode(GraphViewMode::Canvas);
            return None;
        }

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
            KeyCode::Char('v') | KeyCode::Char('V') => {
                self.switch_view_mode(GraphViewMode::Canvas);
                None
            }
            _ => None,
        }
    }

    fn handle_canvas_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if Self::is_cycle_forward_key(key) {
            self.cycle_canvas_focus(1);
            return None;
        }
        if Self::is_cycle_backward_key(key) {
            self.cycle_canvas_focus(-1);
            return None;
        }

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
            KeyCode::Char('0') => {
                self.canvas_zoom = CanvasZoomLevel::Macro;
                self.center_canvas_on_graph();
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
                    [Constraint::Percentage(72), Constraint::Percentage(28)],
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
        let render_mode = self.canvas_zoom.node_render_mode();
        let (x_bounds, y_bounds) = self.canvas_view_bounds(model);
        let card_rects = self.canvas_node_rects(area, model, x_bounds, y_bounds);
        f.render_widget(Block::default().style(Style::default().bg(CANVAS_BG)), area);
        if render_mode == CanvasNodeRenderMode::Point {
            self.render_canvas_screen_edges(f, area, model, &card_rects);
            self.render_canvas_node_shells(f, model, &card_rects);
            self.render_canvas_point_focus_label(f, area, model, &card_rects);
        } else {
            self.render_canvas_node_shells(f, model, &card_rects);
            self.render_canvas_screen_edges(f, area, model, &card_rects);
            self.render_canvas_node_labels(f, model, &card_rects);
        }

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

    fn render_canvas_screen_edges(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        model: &CanvasGraphModel,
        card_rects: &HashMap<String, Rect>,
    ) {
        let mut cells: HashMap<(u16, u16), ScreenLineCell> = HashMap::new();

        for edge in &model.edges {
            let Some(source_rect) = card_rects.get(&edge.from_id).copied() else {
                continue;
            };
            let Some(target_rect) = card_rects.get(&edge.to_id).copied() else {
                continue;
            };
            let Some(source_node) = model.nodes.iter().find(|node| node.id == edge.from_id) else {
                continue;
            };
            let Some(target_node) = model.nodes.iter().find(|node| node.id == edge.to_id) else {
                continue;
            };

            let polyline = Self::screen_edge_polyline(
                area,
                source_rect,
                target_rect,
                source_node,
                target_node,
            );
            let anchors = polyline
                .first()
                .copied()
                .into_iter()
                .chain(polyline.last().copied())
                .collect::<HashSet<_>>();
            Self::accumulate_screen_polyline(
                &mut cells, &polyline, edge.color, area, card_rects, &anchors,
            );
        }

        let buffer = f.buffer_mut();
        for ((x, y), cell) in cells {
            let Some(color) = cell.color else {
                continue;
            };
            if let Some(buffer_cell) = buffer.cell_mut((x, y)) {
                buffer_cell
                    .set_char(Self::screen_line_glyph(cell))
                    .set_fg(color);
            }
        }
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

    fn render_canvas_point_focus_label(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        model: &CanvasGraphModel,
        card_rects: &HashMap<String, Rect>,
    ) {
        let Some(node) = model.focused_node() else {
            return;
        };
        let Some(&point_rect) = card_rects.get(&node.id) else {
            return;
        };

        let point_x = point_rect.x;
        let point_y = point_rect.y;
        let accent = if node.is_cycle || !node.resolved {
            WARNING
        } else {
            node.kind.map(Self::edge_color).unwrap_or(ACCENT)
        };
        let buffer = f.buffer_mut();

        for dx in -1i16..=1 {
            for dy in -1i16..=1 {
                let x = point_x as i16 + dx;
                let y = point_y as i16 + dy;
                if x < 0 || y < 0 {
                    continue;
                }
                let x = x as u16;
                let y = y as u16;
                if Self::point_in_rect(area, x, y) {
                    if let Some(cell) = buffer.cell_mut((x, y)) {
                        cell.set_bg(POINT_FOCUS_BG);
                    }
                }
            }
        }

        if point_x > area.x {
            if let Some(cell) = buffer.cell_mut((point_x - 1, point_y)) {
                cell.set_char('─').set_fg(accent).set_bg(POINT_FOCUS_BG);
            }
        }
        if point_x + 1 < area.x.saturating_add(area.width) {
            if let Some(cell) = buffer.cell_mut((point_x + 1, point_y)) {
                cell.set_char('─').set_fg(accent).set_bg(POINT_FOCUS_BG);
            }
        }
        if point_y > area.y {
            if let Some(cell) = buffer.cell_mut((point_x, point_y - 1)) {
                cell.set_char('│').set_fg(accent).set_bg(POINT_FOCUS_BG);
            }
        }
        if point_y + 1 < area.y.saturating_add(area.height) {
            if let Some(cell) = buffer.cell_mut((point_x, point_y + 1)) {
                cell.set_char('│').set_fg(accent).set_bg(POINT_FOCUS_BG);
            }
        }

        if let Some(cell) = buffer.cell_mut((point_x, point_y)) {
            cell.set_style(
                Style::default()
                    .fg(Color::White)
                    .bg(POINT_FOCUS_BG)
                    .add_modifier(Modifier::BOLD),
            )
            .set_char(Self::canvas_point_char(node, true));
        }

        let label = Self::truncate_label(&self.canvas_card_label(node, true), 18);
        let chip = format!(" {} ", label);
        let chip_width = Self::display_width(&chip) as u16;
        let area_right = area.x.saturating_add(area.width);
        let prefer_right = point_x.saturating_add(2).saturating_add(chip_width) < area_right;
        let chip_x = if prefer_right {
            point_x.saturating_add(2)
        } else {
            point_x
                .saturating_sub(chip_width.saturating_add(2))
                .max(area.x)
        };
        let chip_y = point_y.saturating_sub(1).max(area.y);
        let chip_width = chip_width.min(area_right.saturating_sub(chip_x));
        if chip_width == 0 {
            return;
        }

        let style = Style::default()
            .fg(TEXT_PRIMARY)
            .bg(NODE_FOCUS_BG)
            .add_modifier(Modifier::BOLD);
        f.render_widget(
            Paragraph::new(TextLine::from(Span::styled(chip, style))),
            Rect::new(chip_x, chip_y, chip_width, 1),
        );
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
        let model = self.build_canvas_model();
        let focus_line = model.as_ref().and_then(|canvas| {
            let total = canvas.nodes.len();
            if total == 0 {
                return None;
            }
            let focused = canvas.focus_index.unwrap_or(0).saturating_add(1);
            let label = canvas
                .focused_node()
                .map(|node| Self::truncate_label(&node.title, 18))
                .unwrap_or_else(|| t.text(TextKey::GraphRootLabel).to_string());
            Some(format!(
                "• {} {focused}/{total} · {label}",
                t.text(TextKey::StatusFocus)
            ))
        });

        let block = Block::default()
            .title(format!(" {} ", t.text(TextKey::GraphCanvasSessionTitle)))
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
                format!(
                    "• {} {}",
                    t.text(TextKey::GraphCanvasZoom),
                    t.text(self.canvas_zoom.label_key())
                ),
                Style::default().fg(TEXT_MUTED),
            )),
        ];
        if let Some(line) = focus_line {
            lines.push(TextLine::from(Span::styled(
                line,
                Style::default().fg(TEXT_MUTED),
            )));
        }
        lines.extend([
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
        ]);

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

    fn canvas_rows(&self) -> Vec<VisibleGraphRow> {
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
            self.collect_canvas_rows(
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
        for row in self.canvas_rows() {
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
                    from_id: parent_id.to_string(),
                    to_id: row.key.clone(),
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

    fn collect_canvas_rows(
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
        let key = Self::row_key(parent_key.as_deref(), depth, node);

        rows.push(VisibleGraphRow {
            key: key.clone(),
            node: node.clone(),
            depth,
            parent_key: parent_key.clone(),
            parent_relative_path: parent_relative_path.clone(),
            is_cycle,
            is_expanded: self.loaded_children.contains_key(&node.relative_path),
            is_leaf,
            can_expand: node.resolved && !is_cycle && !is_leaf,
        });

        if is_cycle {
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
            self.collect_canvas_rows(
                child,
                depth + 1,
                &next_ancestors,
                Some(node.relative_path.clone()),
                Some(key.clone()),
                rows,
            );
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

        let canvas_rows = self.canvas_rows();
        let row_by_key: HashMap<&str, &VisibleGraphRow> =
            canvas_rows.iter().map(|row| (row.key.as_str(), row)).collect();
        let mut current_key = Some(focus_id.as_str());
        while let Some(key) = current_key {
            if let Some(index) = visible_rows.iter().position(|row| row.key == key) {
                self.selected_index = Some(index);
                self.ensure_selection_visible();
                return;
            }

            current_key = row_by_key.get(key).and_then(|row| row.parent_key.as_deref());
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
                self.canvas_zoom = CanvasZoomLevel::Macro;
                self.center_canvas_on_graph();
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
        self.sync_selection_from_canvas_focus();
        if self.canvas_zoom == CanvasZoomLevel::Macro {
            self.center_canvas_on_graph();
        } else {
            self.center_canvas_on_focus();
        }
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

    fn center_canvas_on_graph(&mut self) {
        if let Some(model) = self.build_canvas_model() {
            if let Some((min_x, max_x, min_y, max_y)) = Self::canvas_graph_bounds(&model) {
                self.canvas_center_x = (min_x + max_x) / 2.0;
                self.canvas_center_y = (min_y + max_y) / 2.0;
                return;
            }
        }

        self.center_canvas_on_focus();
    }

    fn zoom_canvas(&mut self, zoom_in: bool) {
        let next = if zoom_in {
            self.canvas_zoom.zoom_in()
        } else {
            self.canvas_zoom.zoom_out()
        };
        if next == self.canvas_zoom {
            return;
        }

        self.canvas_zoom = next;
        if self.canvas_zoom == CanvasZoomLevel::Macro {
            self.center_canvas_on_graph();
        } else if zoom_in {
            self.center_canvas_on_focus();
        }
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
            GraphEdgeKind::Tag => EDGE_TAG,
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

    fn canvas_view_bounds(&self, model: &CanvasGraphModel) -> ([f64; 2], [f64; 2]) {
        let (base_span_x, base_span_y) = self.canvas_zoom.span();
        let Some((min_x, max_x, min_y, max_y)) = Self::canvas_graph_bounds(model) else {
            return (
                [
                    self.canvas_center_x - base_span_x / 2.0,
                    self.canvas_center_x + base_span_x / 2.0,
                ],
                [
                    self.canvas_center_y - base_span_y / 2.0,
                    self.canvas_center_y + base_span_y / 2.0,
                ],
            );
        };

        let (pad_x, pad_y) = self.canvas_zoom.graph_padding();
        let fit_span_x = (max_x - min_x + pad_x * 2.0).max(base_span_x);
        let fit_span_y = (max_y - min_y + pad_y * 2.0).max(base_span_y);
        let span_x = (fit_span_x * self.canvas_zoom.viewport_factor()).max(base_span_x);
        let span_y = (fit_span_y * self.canvas_zoom.viewport_factor()).max(base_span_y);

        (
            [
                self.canvas_center_x - span_x / 2.0,
                self.canvas_center_x + span_x / 2.0,
            ],
            [
                self.canvas_center_y - span_y / 2.0,
                self.canvas_center_y + span_y / 2.0,
            ],
        )
    }

    fn render_canvas_node_shells(
        &self,
        f: &mut Frame<'_>,
        model: &CanvasGraphModel,
        card_rects: &HashMap<String, Rect>,
    ) {
        let focus_id = model.focused_node().map(|node| node.id.as_str());

        for node in model
            .nodes
            .iter()
            .filter(|node| !node.is_root && focus_id != Some(node.id.as_str()))
        {
            self.render_canvas_node_shell(f, node, false, card_rects);
        }

        if let Some(root) = model.nodes.iter().find(|node| node.is_root) {
            self.render_canvas_node_shell(f, root, focus_id == Some(root.id.as_str()), card_rects);
        }

        if let Some(node) = model.focused_node().filter(|node| !node.is_root) {
            self.render_canvas_node_shell(f, node, true, card_rects);
        }
    }

    fn render_canvas_node_labels(
        &self,
        f: &mut Frame<'_>,
        model: &CanvasGraphModel,
        card_rects: &HashMap<String, Rect>,
    ) {
        let focus_id = model.focused_node().map(|node| node.id.as_str());

        for node in model
            .nodes
            .iter()
            .filter(|node| !node.is_root && focus_id != Some(node.id.as_str()))
        {
            self.render_canvas_node_label(f, node, false, card_rects);
        }

        if let Some(root) = model.nodes.iter().find(|node| node.is_root) {
            self.render_canvas_node_label(f, root, focus_id == Some(root.id.as_str()), card_rects);
        }

        if let Some(node) = model.focused_node().filter(|node| !node.is_root) {
            self.render_canvas_node_label(f, node, true, card_rects);
        }
    }

    fn render_canvas_node_shell(
        &self,
        f: &mut Frame<'_>,
        node: &CanvasNode,
        focused: bool,
        card_rects: &HashMap<String, Rect>,
    ) {
        let Some(&card_rect) = card_rects.get(&node.id) else {
            return;
        };

        if self.canvas_zoom.node_render_mode() == CanvasNodeRenderMode::Point {
            let point = (card_rect.x, card_rect.y);
            let style = self.canvas_point_style(node, focused);
            if let Some(cell) = f.buffer_mut().cell_mut(point) {
                cell.set_char(Self::canvas_point_char(node, focused))
                    .set_style(style);
            }
            return;
        }

        let (block_style, border_style, _) = self.canvas_card_styles(node, focused);
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(border_style)
            .style(block_style);
        f.render_widget(block, card_rect);
    }

    fn render_canvas_node_label(
        &self,
        f: &mut Frame<'_>,
        node: &CanvasNode,
        focused: bool,
        card_rects: &HashMap<String, Rect>,
    ) {
        let Some(&card_rect) = card_rects.get(&node.id) else {
            return;
        };
        if self.canvas_zoom.node_render_mode() == CanvasNodeRenderMode::Point {
            return;
        }
        let (_, _, text_style) = self.canvas_card_styles(node, focused);
        let inner = Self::inner_rect(card_rect);
        if inner.width == 0 || inner.height == 0 {
            return;
        }

        f.render_widget(
            Paragraph::new(TextLine::from(Span::styled(
                self.canvas_card_label(node, focused),
                text_style,
            )))
            .alignment(Alignment::Center),
            inner,
        );
    }

    fn canvas_node_rects(
        &self,
        area: Rect,
        model: &CanvasGraphModel,
        x_bounds: [f64; 2],
        y_bounds: [f64; 2],
    ) -> HashMap<String, Rect> {
        let focus_id = model.focused_node().map(|node| node.id.as_str());
        let mut rects = HashMap::new();

        for node in &model.nodes {
            let focused = focus_id == Some(node.id.as_str());
            if let Some(rect) =
                self.canvas_node_screen_rect(area, node, focused, x_bounds, y_bounds)
            {
                rects.insert(node.id.clone(), rect);
            }
        }

        rects
    }

    fn canvas_node_screen_rect(
        &self,
        area: Rect,
        node: &CanvasNode,
        focused: bool,
        x_bounds: [f64; 2],
        y_bounds: [f64; 2],
    ) -> Option<Rect> {
        let (screen_x, screen_y) = Self::world_to_screen(area, node.x, node.y, x_bounds, y_bounds)?;
        if self.canvas_zoom.node_render_mode() == CanvasNodeRenderMode::Point {
            return Some(Rect::new(screen_x as u16, screen_y as u16, 1, 1));
        }

        let (width_u16, height_u16) = self.canvas_card_size(node, focused);
        let width = width_u16.min(area.width.saturating_sub(1)).max(8) as i32;
        let height = height_u16.min(area.height.saturating_sub(1).max(1)) as i32;
        let area_left = area.x as i32;
        let area_right = area.x as i32 + area.width as i32;
        let area_top = area.y as i32;
        let area_bottom = area.y as i32 + area.height as i32;

        let mut x = if node.is_root {
            screen_x - width / 2
        } else {
            match node.kind.unwrap_or(GraphEdgeKind::Link) {
                GraphEdgeKind::Link => screen_x + 2,
                GraphEdgeKind::Backlink => screen_x - width,
                GraphEdgeKind::Tag => screen_x - width / 2,
            }
        };

        let mut y = if node.is_root {
            screen_y - height / 2
        } else {
            match node.kind.unwrap_or(GraphEdgeKind::Link) {
                GraphEdgeKind::Tag => screen_y - height - 1,
                _ => screen_y - height / 2,
            }
        };

        if x + width <= area_left || x >= area_right || y + height <= area_top || y >= area_bottom {
            return None;
        }

        x = x.clamp(area_left, area_right - width.max(1));
        y = y.clamp(area_top, area_bottom - height.max(1));

        Some(Rect::new(x as u16, y as u16, width as u16, height as u16))
    }

    fn world_to_screen(
        area: Rect,
        world_x: f64,
        world_y: f64,
        x_bounds: [f64; 2],
        y_bounds: [f64; 2],
    ) -> Option<(i32, i32)> {
        let x_span = x_bounds[1] - x_bounds[0];
        let y_span = y_bounds[1] - y_bounds[0];
        if x_span <= f64::EPSILON || y_span <= f64::EPSILON {
            return None;
        }

        let x_ratio = (world_x - x_bounds[0]) / x_span;
        let y_ratio = (world_y - y_bounds[0]) / y_span;
        if !(0.0..=1.0).contains(&x_ratio) || !(0.0..=1.0).contains(&y_ratio) {
            return None;
        }

        let screen_x = area.x as f64 + x_ratio * area.width.saturating_sub(1) as f64;
        let screen_y = area.y as f64 + (1.0 - y_ratio) * area.height.saturating_sub(1) as f64;
        Some((screen_x.round() as i32, screen_y.round() as i32))
    }

    fn canvas_card_styles(&self, node: &CanvasNode, focused: bool) -> (Style, Style, Style) {
        if focused {
            return (
                Style::default().bg(NODE_FOCUS_BG),
                Style::default()
                    .fg(ACCENT)
                    .bg(NODE_FOCUS_BG)
                    .add_modifier(Modifier::BOLD),
                Style::default()
                    .fg(TEXT_PRIMARY)
                    .bg(NODE_FOCUS_BG)
                    .add_modifier(Modifier::BOLD),
            );
        }

        if node.is_cycle || !node.resolved {
            return (
                Style::default().bg(NODE_DANGER_BG),
                Style::default()
                    .fg(WARNING)
                    .bg(NODE_DANGER_BG)
                    .add_modifier(Modifier::BOLD),
                Style::default()
                    .fg(Color::White)
                    .bg(NODE_DANGER_BG)
                    .add_modifier(Modifier::BOLD),
            );
        }

        let background = if node.is_root {
            NODE_ROOT_BG
        } else {
            match node.kind.unwrap_or(GraphEdgeKind::Link) {
                GraphEdgeKind::Link => NODE_LINK_BG,
                GraphEdgeKind::Backlink => NODE_BACKLINK_BG,
                GraphEdgeKind::Tag => NODE_TAG_BG,
            }
        };
        (
            Style::default().bg(background),
            Style::default()
                .fg(if node.is_root {
                    ACCENT
                } else {
                    node.kind.map(Self::edge_color).unwrap_or(ACCENT)
                })
                .bg(background)
                .add_modifier(Modifier::BOLD),
            Style::default()
                .fg(TEXT_PRIMARY)
                .bg(background)
                .add_modifier(Modifier::BOLD),
        )
    }

    fn canvas_point_style(&self, node: &CanvasNode, focused: bool) -> Style {
        let mut style = Style::default().bg(CANVAS_BG);
        style = if focused {
            style
                .fg(Color::White)
                .bg(POINT_FOCUS_BG)
                .add_modifier(Modifier::BOLD)
        } else if node.is_cycle || !node.resolved {
            style.fg(WARNING).add_modifier(Modifier::BOLD)
        } else if node.is_root {
            style.fg(ACCENT).add_modifier(Modifier::BOLD)
        } else {
            style.fg(node.kind.map(Self::edge_color).unwrap_or(ACCENT))
        };

        style
    }

    fn canvas_point_char(node: &CanvasNode, focused: bool) -> char {
        if focused && node.is_root {
            '◈'
        } else if focused {
            '◉'
        } else if node.is_cycle || !node.resolved {
            '!'
        } else if node.is_root {
            '◆'
        } else {
            '•'
        }
    }

    fn canvas_card_label(&self, node: &CanvasNode, focused: bool) -> String {
        let label = if node.is_root {
            format!(
                "[{}] {}",
                self.language.translator().text(TextKey::GraphRootLabel),
                node.title
            )
        } else {
            node.title.clone()
        };
        let max_width = if node.is_root || focused { 22 } else { 20 };
        Self::truncate_label(&label, max_width)
    }

    fn canvas_card_size(&self, node: &CanvasNode, focused: bool) -> (u16, u16) {
        if self.canvas_zoom.node_render_mode() == CanvasNodeRenderMode::Point {
            return (1, 1);
        }

        let label = self.canvas_card_label(node, focused);
        let width = (Self::display_width(&label) + 4).clamp(
            if node.is_root || focused { 16 } else { 14 },
            if node.is_root || focused { 28 } else { 22 },
        ) as u16;
        (width, 3)
    }

    fn screen_edge_polyline(
        area: Rect,
        source_rect: Rect,
        target_rect: Rect,
        source_node: &CanvasNode,
        target_node: &CanvasNode,
    ) -> Vec<(u16, u16)> {
        let source_center = Self::rect_center(source_rect);
        let target_center = Self::rect_center(target_rect);
        let preferred_source =
            Self::preferred_source_anchor(source_rect, target_rect, source_node, target_node);
        let preferred_target =
            Self::preferred_target_anchor(source_rect, target_rect, source_node, target_node);

        let source_side = Self::resolve_anchor(
            area,
            source_rect,
            preferred_source,
            target_center.0 as i32 - source_center.0 as i32,
            target_center.1 as i32 - source_center.1 as i32,
        );
        let target_side = Self::resolve_anchor(
            area,
            target_rect,
            preferred_target,
            source_center.0 as i32 - target_center.0 as i32,
            source_center.1 as i32 - target_center.1 as i32,
        );

        let start = Self::screen_anchor_point(source_rect, source_side);
        let end = Self::screen_anchor_point(target_rect, target_side);
        let start_out = Self::screen_anchor_step(area, start, source_side);
        let end_out = Self::screen_anchor_step(area, end, target_side);

        let mut points = Vec::with_capacity(6);
        Self::push_polyline_point(&mut points, start);
        Self::push_polyline_point(&mut points, start_out);

        if start_out.0 == end_out.0 || start_out.1 == end_out.1 {
            Self::push_polyline_point(&mut points, end_out);
        } else if Self::anchor_is_horizontal(source_side) && Self::anchor_is_horizontal(target_side)
        {
            let mid_x = ((start_out.0 as i32 + end_out.0 as i32) / 2) as u16;
            Self::push_polyline_point(&mut points, (mid_x, start_out.1));
            Self::push_polyline_point(&mut points, (mid_x, end_out.1));
            Self::push_polyline_point(&mut points, end_out);
        } else if Self::anchor_is_vertical(source_side) && Self::anchor_is_vertical(target_side) {
            let mid_y = ((start_out.1 as i32 + end_out.1 as i32) / 2) as u16;
            Self::push_polyline_point(&mut points, (start_out.0, mid_y));
            Self::push_polyline_point(&mut points, (end_out.0, mid_y));
            Self::push_polyline_point(&mut points, end_out);
        } else if Self::anchor_is_horizontal(source_side) {
            Self::push_polyline_point(&mut points, (end_out.0, start_out.1));
            Self::push_polyline_point(&mut points, end_out);
        } else {
            Self::push_polyline_point(&mut points, (start_out.0, end_out.1));
            Self::push_polyline_point(&mut points, end_out);
        }

        Self::push_polyline_point(&mut points, end);
        points
    }

    fn preferred_source_anchor(
        source_rect: Rect,
        target_rect: Rect,
        source_node: &CanvasNode,
        target_node: &CanvasNode,
    ) -> ScreenAnchor {
        if source_node.is_root {
            return match target_node.kind.unwrap_or(GraphEdgeKind::Link) {
                GraphEdgeKind::Link => ScreenAnchor::Right,
                GraphEdgeKind::Backlink => ScreenAnchor::Left,
                GraphEdgeKind::Tag => ScreenAnchor::Top,
            };
        }

        Self::relative_anchor(source_rect, target_rect)
    }

    fn preferred_target_anchor(
        source_rect: Rect,
        target_rect: Rect,
        _source_node: &CanvasNode,
        target_node: &CanvasNode,
    ) -> ScreenAnchor {
        if matches!(target_node.kind, Some(GraphEdgeKind::Tag)) {
            return ScreenAnchor::Bottom;
        }

        match Self::relative_anchor(target_rect, source_rect) {
            ScreenAnchor::Left => ScreenAnchor::Left,
            ScreenAnchor::Right => ScreenAnchor::Right,
            ScreenAnchor::Top => ScreenAnchor::Top,
            ScreenAnchor::Bottom => ScreenAnchor::Bottom,
        }
    }

    fn relative_anchor(from: Rect, to: Rect) -> ScreenAnchor {
        let from_center = Self::rect_center(from);
        let to_center = Self::rect_center(to);
        let dx = to_center.0 as i32 - from_center.0 as i32;
        let dy = to_center.1 as i32 - from_center.1 as i32;

        if dx.abs() >= dy.abs() {
            if dx >= 0 {
                ScreenAnchor::Right
            } else {
                ScreenAnchor::Left
            }
        } else if dy >= 0 {
            ScreenAnchor::Bottom
        } else {
            ScreenAnchor::Top
        }
    }

    fn rect_center(rect: Rect) -> (u16, u16) {
        (
            rect.x.saturating_add(rect.width.saturating_sub(1) / 2),
            rect.y.saturating_add(rect.height.saturating_sub(1) / 2),
        )
    }

    fn resolve_anchor(
        area: Rect,
        rect: Rect,
        preferred: ScreenAnchor,
        dx: i32,
        dy: i32,
    ) -> ScreenAnchor {
        let mut candidates = vec![preferred];
        if dx >= 0 {
            candidates.push(ScreenAnchor::Right);
        } else {
            candidates.push(ScreenAnchor::Left);
        }
        if dy >= 0 {
            candidates.push(ScreenAnchor::Bottom);
        } else {
            candidates.push(ScreenAnchor::Top);
        }
        candidates.extend([
            ScreenAnchor::Left,
            ScreenAnchor::Right,
            ScreenAnchor::Top,
            ScreenAnchor::Bottom,
        ]);

        candidates
            .into_iter()
            .find(|anchor| Self::anchor_has_space(area, rect, *anchor))
            .unwrap_or(preferred)
    }

    fn anchor_has_space(area: Rect, rect: Rect, anchor: ScreenAnchor) -> bool {
        match anchor {
            ScreenAnchor::Left => rect.x > area.x,
            ScreenAnchor::Right => {
                rect.x.saturating_add(rect.width) < area.x.saturating_add(area.width)
            }
            ScreenAnchor::Top => rect.y > area.y,
            ScreenAnchor::Bottom => {
                rect.y.saturating_add(rect.height) < area.y.saturating_add(area.height)
            }
        }
    }

    fn screen_anchor_point(rect: Rect, anchor: ScreenAnchor) -> (u16, u16) {
        match anchor {
            ScreenAnchor::Left => (rect.x, rect.y.saturating_add(rect.height / 2)),
            ScreenAnchor::Right => (
                rect.x.saturating_add(rect.width.saturating_sub(1)),
                rect.y.saturating_add(rect.height / 2),
            ),
            ScreenAnchor::Top => (rect.x.saturating_add(rect.width / 2), rect.y),
            ScreenAnchor::Bottom => (
                rect.x.saturating_add(rect.width / 2),
                rect.y.saturating_add(rect.height.saturating_sub(1)),
            ),
        }
    }

    fn screen_anchor_step(area: Rect, point: (u16, u16), anchor: ScreenAnchor) -> (u16, u16) {
        match anchor {
            ScreenAnchor::Left if point.0 > area.x => (point.0 - 1, point.1),
            ScreenAnchor::Right if point.0 + 1 < area.x.saturating_add(area.width) => {
                (point.0 + 1, point.1)
            }
            ScreenAnchor::Top if point.1 > area.y => (point.0, point.1 - 1),
            ScreenAnchor::Bottom if point.1 + 1 < area.y.saturating_add(area.height) => {
                (point.0, point.1 + 1)
            }
            _ => point,
        }
    }

    fn anchor_is_horizontal(anchor: ScreenAnchor) -> bool {
        matches!(anchor, ScreenAnchor::Left | ScreenAnchor::Right)
    }

    fn anchor_is_vertical(anchor: ScreenAnchor) -> bool {
        matches!(anchor, ScreenAnchor::Top | ScreenAnchor::Bottom)
    }

    fn push_polyline_point(points: &mut Vec<(u16, u16)>, point: (u16, u16)) {
        if points.last().copied() != Some(point) {
            points.push(point);
        }
    }

    fn accumulate_screen_polyline(
        cells: &mut HashMap<(u16, u16), ScreenLineCell>,
        points: &[(u16, u16)],
        color: Color,
        area: Rect,
        card_rects: &HashMap<String, Rect>,
        anchors: &HashSet<(u16, u16)>,
    ) {
        for segment in points.windows(2) {
            let (x1, y1) = segment[0];
            let (x2, y2) = segment[1];
            Self::accumulate_screen_segment(
                cells, x1, y1, x2, y2, color, area, card_rects, anchors,
            );
        }
    }

    fn accumulate_screen_segment(
        cells: &mut HashMap<(u16, u16), ScreenLineCell>,
        x1: u16,
        y1: u16,
        x2: u16,
        y2: u16,
        color: Color,
        area: Rect,
        card_rects: &HashMap<String, Rect>,
        anchors: &HashSet<(u16, u16)>,
    ) {
        if x1 == x2 {
            let min_y = y1.min(y2);
            let max_y = y1.max(y2);
            for y in min_y..=max_y {
                if !Self::point_in_rect(area, x1, y)
                    || Self::point_covered_by_card(card_rects, x1, y, anchors)
                {
                    continue;
                }
                let cell = cells.entry((x1, y)).or_default();
                cell.color = Some(color);
                if y > min_y {
                    cell.up = true;
                }
                if y < max_y {
                    cell.down = true;
                }
            }
        } else if y1 == y2 {
            let min_x = x1.min(x2);
            let max_x = x1.max(x2);
            for x in min_x..=max_x {
                if !Self::point_in_rect(area, x, y1)
                    || Self::point_covered_by_card(card_rects, x, y1, anchors)
                {
                    continue;
                }
                let cell = cells.entry((x, y1)).or_default();
                cell.color = Some(color);
                if x > min_x {
                    cell.left = true;
                }
                if x < max_x {
                    cell.right = true;
                }
            }
        }
    }

    fn screen_line_glyph(cell: ScreenLineCell) -> char {
        match (cell.up, cell.down, cell.left, cell.right) {
            (true, true, true, true) => '┼',
            (true, true, true, false) => '┤',
            (true, true, false, true) => '├',
            (true, false, true, true) => '┴',
            (false, true, true, true) => '┬',
            (true, true, false, false) => '│',
            (false, false, true, true) => '─',
            (false, true, false, true) => '┌',
            (false, true, true, false) => '┐',
            (true, false, false, true) => '└',
            (true, false, true, false) => '┘',
            (true, false, false, false) | (false, true, false, false) => '│',
            (false, false, true, false) | (false, false, false, true) => '─',
            _ => '·',
        }
    }

    fn point_in_rect(area: Rect, x: u16, y: u16) -> bool {
        x >= area.x
            && x < area.x.saturating_add(area.width)
            && y >= area.y
            && y < area.y.saturating_add(area.height)
    }

    fn point_covered_by_card(
        card_rects: &HashMap<String, Rect>,
        x: u16,
        y: u16,
        anchors: &HashSet<(u16, u16)>,
    ) -> bool {
        if anchors.contains(&(x, y)) {
            return false;
        }

        card_rects
            .values()
            .any(|rect| Self::point_in_rect(*rect, x, y))
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

    fn display_width(text: &str) -> usize {
        text.chars()
            .map(|ch| UnicodeWidthChar::width(ch).unwrap_or(1))
            .sum()
    }

    fn is_canvas_switch_key(key: KeyEvent) -> bool {
        matches!(key.code, KeyCode::Tab | KeyCode::BackTab | KeyCode::Char('v') | KeyCode::Char('V'))
            || Self::is_ctrl_i(key)
    }

    fn is_cycle_forward_key(key: KeyEvent) -> bool {
        matches!(key.code, KeyCode::Tab | KeyCode::Char('n'))
            || Self::is_ctrl_i(key)
    }

    fn is_cycle_backward_key(key: KeyEvent) -> bool {
        matches!(key.code, KeyCode::BackTab | KeyCode::Char('N'))
    }

    fn is_ctrl_i(key: KeyEvent) -> bool {
        key.code == KeyCode::Char('i') && key.modifiers.contains(KeyModifiers::CONTROL)
    }

    fn canvas_graph_bounds(model: &CanvasGraphModel) -> Option<(f64, f64, f64, f64)> {
        let mut nodes = model.nodes.iter();
        let first = nodes.next()?;
        let mut min_x = first.x;
        let mut max_x = first.x;
        let mut min_y = first.y;
        let mut max_y = first.y;

        for node in nodes {
            min_x = min_x.min(node.x);
            max_x = max_x.max(node.x);
            min_y = min_y.min(node.y);
            max_y = max_y.max(node.y);
        }

        Some((min_x, max_x, min_y, max_y))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn node(kind: Option<GraphEdgeKind>, is_root: bool) -> CanvasNode {
        CanvasNode {
            id: "node".to_string(),
            title: "notes.md".to_string(),
            relative_path: "notes.md".to_string(),
            absolute_path: None,
            context: String::new(),
            line_number: None,
            kind,
            x: 0.0,
            y: 0.0,
            is_root,
            is_cycle: false,
            resolved: true,
        }
    }

    fn graph_child(title: &str, relative_path: &str, kind: GraphEdgeKind) -> GraphNodeRef {
        GraphNodeRef {
            kind,
            title: title.to_string(),
            relative_path: relative_path.to_string(),
            absolute_path: Some(format!("/tmp/{relative_path}")),
            context: String::new(),
            line_number: None,
            resolved: true,
        }
    }

    #[test]
    fn screen_edge_polyline_stays_inside_canvas_for_clamped_cards() {
        let area = Rect::new(0, 0, 40, 12);
        let root_rect = Rect::new(10, 5, 14, 3);
        let target_rect = Rect::new(26, 0, 14, 3);
        let root = node(None, true);
        let target = node(Some(GraphEdgeKind::Link), false);

        let polyline =
            GraphExplorer::screen_edge_polyline(area, root_rect, target_rect, &root, &target);

        assert!(polyline.len() >= 2);
        assert!(polyline
            .iter()
            .all(|(x, y)| *x < area.width && *y < area.height));
    }

    #[test]
    fn secondary_canvas_nodes_render_as_box_cards() {
        let mut explorer = GraphExplorer::new();
        explorer.canvas_zoom = CanvasZoomLevel::Standard;
        let node = node(Some(GraphEdgeKind::Backlink), false);

        assert_eq!(explorer.canvas_card_size(&node, false), (14, 3));
    }

    #[test]
    fn macro_canvas_nodes_render_as_points() {
        let explorer = GraphExplorer::new();
        let node = node(Some(GraphEdgeKind::Link), false);

        assert_eq!(explorer.canvas_card_size(&node, false), (1, 1));
    }

    #[test]
    fn canvas_tab_cycle_wraps_across_all_nodes() {
        let mut explorer = GraphExplorer::new();
        explorer.set_root(Some(GraphRoot {
            title: "Root".to_string(),
            relative_path: "root.md".to_string(),
            absolute_path: Some("/tmp/root.md".to_string()),
            children: vec![
                graph_child("Link Child", "link.md", GraphEdgeKind::Link),
                graph_child("Backlink Child", "back.md", GraphEdgeKind::Backlink),
            ],
        }));
        explorer.switch_view_mode(GraphViewMode::Canvas);

        let initial = explorer.canvas_focus_id.clone();
        let root_id = Some("root::root.md".to_string());
        assert_ne!(initial, root_id);

        explorer.cycle_canvas_focus(1);
        let second = explorer.canvas_focus_id.clone();
        assert_ne!(second, initial);

        explorer.cycle_canvas_focus(1);
        let third = explorer.canvas_focus_id.clone();
        assert_ne!(third, second);
        assert_ne!(third, initial);
        assert_eq!(third, root_id);

        explorer.cycle_canvas_focus(1);
        assert_eq!(explorer.canvas_focus_id, initial);
    }

    #[test]
    fn canvas_tab_cycle_keeps_loaded_descendants_after_tree_collapse() {
        let mut explorer = GraphExplorer::new();
        explorer.set_root(Some(GraphRoot {
            title: "Root".to_string(),
            relative_path: "root.md".to_string(),
            absolute_path: Some("/tmp/root.md".to_string()),
            children: vec![
                graph_child("Link Child", "link.md", GraphEdgeKind::Link),
                graph_child("Backlink Child", "back.md", GraphEdgeKind::Backlink),
            ],
        }));

        explorer.set_loaded_children(
            "link.md".to_string(),
            vec![graph_child("Grand Child", "grand.md", GraphEdgeKind::Link)],
        );
        explorer.collapse_selected();
        explorer.switch_view_mode(GraphViewMode::Canvas);

        let model = explorer.build_canvas_model().expect("canvas model");
        assert_eq!(model.nodes.len(), 4);
        assert!(
            model
                .nodes
                .iter()
                .any(|node| node.relative_path == "grand.md"),
            "collapsed descendants should remain available in canvas"
        );

        let initial = explorer.canvas_focus_id.clone();
        explorer.cycle_canvas_focus(1);
        assert_eq!(
            explorer
                .focused_canvas_node()
                .map(|node| node.relative_path),
            Some("grand.md".to_string())
        );

        explorer.cycle_canvas_focus(1);
        assert_eq!(
            explorer
                .focused_canvas_node()
                .map(|node| node.relative_path),
            Some("back.md".to_string())
        );

        explorer.cycle_canvas_focus(1);
        assert_eq!(explorer.canvas_focus_id, Some("root::root.md".to_string()));

        explorer.cycle_canvas_focus(1);
        assert_eq!(explorer.canvas_focus_id, initial);
    }

    #[test]
    fn canvas_cycle_accepts_ctrl_i_as_tab_fallback() {
        let mut explorer = GraphExplorer::new();
        explorer.open(Some(GraphRoot {
            title: "Root".to_string(),
            relative_path: "root.md".to_string(),
            absolute_path: Some("/tmp/root.md".to_string()),
            children: vec![
                graph_child("Link Child", "link.md", GraphEdgeKind::Link),
                graph_child("Backlink Child", "back.md", GraphEdgeKind::Backlink),
            ],
        }));
        explorer.switch_view_mode(GraphViewMode::Canvas);

        let initial = explorer.canvas_focus_id.clone();
        explorer.handle_key_event(KeyEvent::new(
            KeyCode::Char('i'),
            KeyModifiers::CONTROL,
        ));

        assert_ne!(explorer.canvas_focus_id, initial);
    }

    #[test]
    fn canvas_cycle_accepts_n_shortcuts() {
        let mut explorer = GraphExplorer::new();
        explorer.open(Some(GraphRoot {
            title: "Root".to_string(),
            relative_path: "root.md".to_string(),
            absolute_path: Some("/tmp/root.md".to_string()),
            children: vec![
                graph_child("Link Child", "link.md", GraphEdgeKind::Link),
                graph_child("Backlink Child", "back.md", GraphEdgeKind::Backlink),
            ],
        }));
        explorer.switch_view_mode(GraphViewMode::Canvas);

        let initial = explorer.canvas_focus_id.clone();
        explorer.handle_key_event(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
        let after_forward = explorer.canvas_focus_id.clone();
        assert_ne!(after_forward, initial);

        explorer.handle_key_event(KeyEvent::new(KeyCode::Char('N'), KeyModifiers::SHIFT));
        assert_eq!(explorer.canvas_focus_id, initial);
    }
}
