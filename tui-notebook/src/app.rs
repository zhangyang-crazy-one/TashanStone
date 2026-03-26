//! Main application structure and event loop
//!
//! Implements the TEA (The Elm Architecture) pattern with component-based architecture.

use anyhow::Result;
use crossterm::event::{
    Event as CrosstermEvent, KeyCode, KeyEvent, KeyModifiers, MouseButton, MouseEvent,
    MouseEventKind,
};
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};
use regex::RegexBuilder;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};

pub use crate::action::{Action, ChatAction, ComponentId};
use crate::app::focus::FocusManager;
use crate::components::editor::{EditorLink, EditorLinkKind, PreviewHit, PreviewTargetKind};
use crate::components::{
    chat::ChatPanel,
    confirm::ConfirmDialog,
    editor::Editor,
    graph_explorer::GraphExplorer,
    knowledge::KnowledgePanel,
    new_file::NewFileDialog,
    search::SearchPanel,
    settings::SettingsModal,
    sidebar::Sidebar,
    status::{StatusBar, StatusMode},
    Component,
};
use crate::i18n::{Language, TextKey};
use crate::services::ai::{AiService, ChatMessage, MessageRole};
use crate::services::config::{AppSettings, ConfigService, ShortcutProfile};
use crate::services::vector::VectorService;
use crate::services::workspace::{GraphRoot, WorkspaceIndex, WorkspaceLinkPreview};
use crate::theme::{Theme, ThemeManager};
use crate::tui::Tui;
use std::path::{Path, PathBuf};
use std::sync::{mpsc as std_mpsc, Arc};

/// Container for all UI components (to separate borrows)
struct Components<'a> {
    focused: ComponentId,
    editor_mode: EditorMode,
    sidebar: &'a Sidebar,
    editor: &'a Editor,
    search: &'a SearchPanel,
    chat: &'a ChatPanel,
    knowledge: &'a KnowledgePanel,
    graph: &'a GraphExplorer,
    status: &'a StatusBar,
    settings: &'a SettingsModal,
    new_file: &'a NewFileDialog,
    confirm: &'a ConfirmDialog,
    link_preview: Option<&'a LinkPreviewState>,
    shortcut_profile: ShortcutProfile,
    shortcut_help_open: bool,
    language: Language,
}

struct LinkPreviewState {
    preview: WorkspaceLinkPreview,
    anchor: (u16, u16),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditorMode {
    Insert,
    Normal,
    Preview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShortcutCommand {
    CycleFocus(bool),
    Focus(ComponentId),
    OpenSearch,
    OpenSettings,
    Save,
    ToggleChat,
    ToggleKnowledge,
    OpenGraphExplorer,
    IndexCurrentFile,
    ToggleHelp,
    OpenQuitDialog,
    EnterInsert,
    AppendInsert,
    OpenLineBelow,
    MoveLeft,
    MoveRight,
    MoveUp,
    MoveDown,
    MoveWordForward,
    MoveWordBackward,
    MoveLineStart,
    MoveLineEnd,
    MoveDocStart,
    MoveDocEnd,
    MoveHalfPageUp,
    MoveHalfPageDown,
    ActivateCursorTarget,
    ShowCursorPreview,
    EnterPreview,
    ExitPreview,
    PreviewScroll(i32),
    PreviewSelectNext(bool),
    PreviewOpenSelection,
}

/// Application state
pub struct App {
    /// TUI handle
    tui: Tui,

    /// Components
    sidebar: Sidebar,
    editor: Editor,
    search: SearchPanel,
    chat: ChatPanel,
    knowledge: KnowledgePanel,
    graph_explorer: GraphExplorer,
    status: StatusBar,
    settings_modal: SettingsModal,
    new_file_dialog: NewFileDialog,
    confirm_dialog: ConfirmDialog,

    /// Focus management
    focus_manager: FocusManager,

    /// Persistent app settings
    config_service: ConfigService,

    /// Workspace root path
    workspace_root: PathBuf,

    /// Workspace metadata index for links, backlinks, and tags
    workspace_index: WorkspaceIndex,
    /// Background workspace index reload receiver
    workspace_index_rx: Option<std_mpsc::Receiver<(u64, WorkspaceIndex)>>,
    /// Monotonic id used to ignore stale background indexing results
    workspace_index_request_id: u64,
    /// Whether the workspace index is currently rebuilding
    workspace_index_loading: bool,

    /// Vector service for knowledge base
    vector_service: Arc<VectorService>,

    /// Theme manager
    theme_manager: ThemeManager,

    /// Active shortcut profile
    shortcut_profile: ShortcutProfile,

    /// Current UI language
    language: Language,

    /// Whether the status bar should show shortcut hints
    show_shortcut_hints: bool,

    /// Whether preview focus should sync to the editor cursor context
    preview_focus_follows_editor: bool,

    /// Preview overlay for links under the mouse or current cursor
    link_preview: Option<LinkPreviewState>,

    /// Current editor interaction mode
    editor_mode: EditorMode,

    /// Mode to restore when leaving preview focus
    preview_return_mode: EditorMode,

    /// Terminal leader-key state
    leader_pending: bool,

    /// Pending `g` sequence for normal mode
    normal_g_pending: bool,

    /// Independent preview scroll when Preview is focused
    preview_scroll_offset: usize,

    /// Selected interactive target inside Preview
    preview_selected_target: Option<usize>,

    /// Shortcut help overlay state
    shortcut_help_open: bool,

    /// Should quit
    should_quit: bool,

    /// Action channel for async events
    action_tx: mpsc::UnboundedSender<Action>,
    action_rx: mpsc::UnboundedReceiver<Action>,
}

impl App {
    /// Create a new application
    pub fn new() -> Result<Self> {
        let tui = Tui::new()?;

        // Create action channel for async communication
        let (action_tx, action_rx) = mpsc::unbounded_channel();

        let mut app = Self {
            tui,
            sidebar: Sidebar::new(),
            editor: Editor::new(),
            search: SearchPanel::new(),
            chat: ChatPanel::new(),
            knowledge: KnowledgePanel::new(),
            graph_explorer: GraphExplorer::new(),
            status: StatusBar::new(),
            settings_modal: SettingsModal::new(),
            new_file_dialog: NewFileDialog::new(),
            confirm_dialog: ConfirmDialog::new(),
            focus_manager: focus::FocusManager::new(),
            config_service: ConfigService::new(),
            workspace_root: PathBuf::from("."),
            workspace_index: WorkspaceIndex::empty(PathBuf::from(".")),
            workspace_index_rx: None,
            workspace_index_request_id: 0,
            workspace_index_loading: false,
            vector_service: Arc::new(VectorService::new()),
            theme_manager: ThemeManager::new(),
            shortcut_profile: ShortcutProfile::TerminalLeader,
            language: Language::En,
            show_shortcut_hints: true,
            preview_focus_follows_editor: true,
            link_preview: None,
            editor_mode: EditorMode::Insert,
            preview_return_mode: EditorMode::Normal,
            leader_pending: false,
            normal_g_pending: false,
            preview_scroll_offset: 0,
            preview_selected_target: None,
            shortcut_help_open: false,
            should_quit: false,
            action_tx,
            action_rx,
        };

        let initial_settings = app.config_service.settings().clone();

        // Initialize components
        app.apply_runtime_settings(&initial_settings);
        app.editor.init();
        app.search.init();
        app.chat.init();
        app.knowledge.init();
        app.status.init();
        app.settings_modal.set_theme(app.theme_manager.theme());

        // Set initial focus
        app.focus_manager.set_focus(ComponentId::Sidebar);

        Ok(app)
    }

    /// Apply runtime settings that impact loaded workspace and UI state.
    fn apply_runtime_settings(&mut self, settings: &AppSettings) {
        self.language = Language::from_code(&settings.language);
        self.workspace_root = PathBuf::from(&settings.workspace_path);
        if !self.workspace_root.exists() {
            self.workspace_root = PathBuf::from(".");
        }
        self.editor.set_workspace_root(self.workspace_root.clone());
        self.sidebar.set_language(self.language);
        self.editor.set_language(self.language);
        self.search.set_language(self.language);
        self.chat.set_language(self.language);
        self.knowledge.set_language(self.language);
        self.graph_explorer.set_language(self.language);
        self.status.set_language(self.language);
        self.settings_modal.set_language(self.language);
        self.new_file_dialog.set_language(self.language);
        self.confirm_dialog.set_language(self.language);

        self.sidebar
            .load_directory(self.workspace_root.to_string_lossy().as_ref());
        self.workspace_index = WorkspaceIndex::empty(self.workspace_root.clone());
        self.sync_knowledge_panel();
        self.request_workspace_index_reload();

        let theme = if settings.theme == "light" {
            Theme::Light
        } else {
            Theme::Dark
        };
        self.theme_manager.set_theme(theme);
        self.settings_modal.set_theme(theme);
        self.shortcut_profile = settings.shortcut_profile;
        self.show_shortcut_hints = settings.show_shortcut_hints;
        self.preview_focus_follows_editor = settings.preview_focus_follows_editor;
        self.preview_scroll_offset = 0;
        self.preview_selected_target = None;
        self.leader_pending = false;
        self.normal_g_pending = false;
        self.clear_link_preview();
    }

    /// Keep derived status bar data aligned with the current editor state.
    fn sync_status_bar(&mut self) {
        let t = self.language.translator();
        self.status.set_editor_state(
            self.editor.cursor_line_number(),
            self.editor.cursor_column_number(),
            t.text(TextKey::StatusMarkdown),
        );
        self.status.set_mode(self.status_mode());

        let ai_status = if self.chat.is_open() {
            let provider = self.chat.get_provider_display();
            if provider.trim().is_empty() {
                t.text(TextKey::StatusAiReady).to_string()
            } else {
                format!("● {provider}")
            }
        } else {
            t.text(TextKey::StatusAiIdle).to_string()
        };
        self.status.set_ai_status(ai_status);
        self.status
            .set_focus_state(self.focus_label(), self.focus_shortcut_hint());

        if let Some(path) = self.editor.current_file() {
            if let Some(context) = self
                .workspace_index
                .document_context_for_path(Path::new(&path))
            {
                self.status.set_message(Some(t.status_document_summary(
                    context.tags.len(),
                    context.outgoing_links.len(),
                    context.backlinks.len(),
                )));
                return;
            }
        }

        let workspace_summary = t.status_workspace_summary(
            self.workspace_index.document_count(),
            self.workspace_index.tag_count(),
            self.workspace_index_loading,
        );
        self.status.set_message(Some(workspace_summary));
    }

    fn reload_workspace_index(&mut self) {
        self.request_workspace_index_reload();
    }

    fn sync_knowledge_panel(&mut self) {
        let context = self.editor.current_file().as_deref().and_then(|path| {
            self.workspace_index
                .document_context_for_path(Path::new(path))
        });
        self.knowledge.set_document_context(context);
    }

    fn graph_root_for_current_file(&self) -> Option<GraphRoot> {
        let current_file = self.editor.current_file()?;
        let current_path = PathBuf::from(&current_file);

        if let Some(root) = self.workspace_index.graph_root_for_path(&current_path) {
            return Some(root);
        }

        let relative_path = self.workspace_relative_path(&current_file);
        let title = self.editor.current_file_name();
        Some(GraphRoot {
            title,
            relative_path: if relative_path.is_empty() {
                current_file
            } else {
                relative_path
            },
            absolute_path: Some(current_path.to_string_lossy().to_string()),
            children: Vec::new(),
        })
    }

    fn sync_graph_explorer_root_from_current_file(&mut self) {
        if self.graph_explorer.is_open() && !self.graph_explorer.is_pinned() {
            self.graph_explorer.set_root(self.graph_root_for_current_file());
        }
    }

    fn request_workspace_index_reload(&mut self) {
        self.workspace_index_request_id = self.workspace_index_request_id.wrapping_add(1);
        let request_id = self.workspace_index_request_id;
        let root = self.workspace_root.clone();
        let (tx, rx) = std_mpsc::channel();
        self.workspace_index_rx = Some(rx);
        self.workspace_index_loading = true;

        std::thread::spawn(move || {
            let index = WorkspaceIndex::build(&root);
            let _ = tx.send((request_id, index));
        });
    }

    fn poll_workspace_index_reload(&mut self) {
        let mut should_clear_receiver = false;
        let mut next_index = None;

        if let Some(rx) = self.workspace_index_rx.as_ref() {
            loop {
                match rx.try_recv() {
                    Ok((request_id, index)) => {
                        if request_id == self.workspace_index_request_id {
                            next_index = Some(index);
                            should_clear_receiver = true;
                        }
                    }
                    Err(std_mpsc::TryRecvError::Empty) => break,
                    Err(std_mpsc::TryRecvError::Disconnected) => {
                        should_clear_receiver = true;
                        break;
                    }
                }
            }
        }

        let received_latest_index = next_index.is_some();

        if let Some(index) = next_index {
            self.workspace_index = index;
            self.workspace_index_loading = false;
            self.sync_knowledge_panel();
            self.sync_graph_explorer_root_from_current_file();
        }

        if should_clear_receiver {
            self.workspace_index_rx = None;
            if !received_latest_index {
                self.workspace_index_loading = false;
            }
        }
    }

    fn status_mode(&self) -> StatusMode {
        if self.has_modal_open() || self.search.is_open() {
            return StatusMode::Command;
        }

        match self.focus_manager.focused() {
            ComponentId::Editor => match self.editor_mode {
                EditorMode::Insert => StatusMode::Insert,
                EditorMode::Normal => StatusMode::Normal,
                EditorMode::Preview => StatusMode::Preview,
            },
            ComponentId::Preview => StatusMode::Preview,
            _ => StatusMode::Normal,
        }
    }

    fn focus_shortcut_hint(&self) -> String {
        if !self.show_shortcut_hints {
            return String::new();
        }

        let t = self.language.translator();
        match self.shortcut_profile {
            ShortcutProfile::TerminalLeader => match self.focus_manager.focused() {
                ComponentId::Editor => match self.editor_mode {
                    EditorMode::Insert => t.text(TextKey::ShortcutHintInsertLeader).to_string(),
                    EditorMode::Normal => t.text(TextKey::ShortcutHintNormalLeader).to_string(),
                    EditorMode::Preview => t.text(TextKey::ShortcutHintPreview).to_string(),
                },
                ComponentId::Preview => t.text(TextKey::ShortcutHintPreview).to_string(),
                _ => t.text(TextKey::ShortcutHintGlobalLeader).to_string(),
            },
            ShortcutProfile::IdeCompatible => t.text(TextKey::ShortcutHintIde).to_string(),
        }
    }

    fn clear_pending_sequences(&mut self) {
        self.leader_pending = false;
        self.normal_g_pending = false;
    }

    fn focusable_components(&self) -> Vec<ComponentId> {
        let mut components = vec![ComponentId::Sidebar, ComponentId::Editor];
        if self.editor.has_content() {
            components.push(ComponentId::Preview);
        }
        if self.chat.is_open() {
            components.push(ComponentId::Chat);
        }
        if self.knowledge.is_open() {
            components.push(ComponentId::Knowledge);
        }
        components
    }

    fn focus_label(&self) -> String {
        self.language
            .translator()
            .component_label(self.focus_manager.focused())
            .to_string()
    }

    fn focus_component(&mut self, component: ComponentId) {
        let previous = self.focus_manager.focused();

        if previous == ComponentId::Preview && component != ComponentId::Preview {
            self.editor_mode = self.preview_return_mode;
            self.preview_selected_target = None;
        }

        match component {
            ComponentId::Chat if !self.chat.is_open() => {
                self.chat.toggle();
            }
            ComponentId::Knowledge if !self.knowledge.is_open() => {
                self.knowledge.toggle();
            }
            ComponentId::Editor if previous != ComponentId::Preview => {
                self.editor_mode = EditorMode::Insert;
            }
            ComponentId::Preview => {
                if !self.editor.has_content() {
                    return;
                }
                self.preview_return_mode = match self.editor_mode {
                    EditorMode::Preview => self.preview_return_mode,
                    mode => mode,
                };
                self.editor_mode = EditorMode::Preview;
                self.sync_preview_navigation_to_editor();
            }
            _ => {}
        }

        self.clear_pending_sequences();
        self.focus_manager.set_focus(component);
    }

    fn cycle_focus(&mut self, forward: bool) {
        let components = self.focusable_components();
        if components.is_empty() {
            return;
        }

        let current = self.focus_manager.focused();
        let current_idx = components
            .iter()
            .position(|item| *item == current)
            .unwrap_or(0);
        let next_idx = if forward {
            (current_idx + 1) % components.len()
        } else if current_idx == 0 {
            components.len() - 1
        } else {
            current_idx - 1
        };
        self.focus_manager.set_focus(components[next_idx]);
    }

    fn has_modal_open(&self) -> bool {
        self.settings_modal.is_open()
            || self.graph_explorer.is_open()
            || self.new_file_dialog.is_open()
            || self.confirm_dialog.is_open()
    }

    fn clear_link_preview(&mut self) {
        self.link_preview = None;
    }

    fn apply_settings_update_if_needed(&mut self) {
        if let Some(settings) = self.settings_modal.take_applied_settings() {
            self.config_service.update(settings.clone());
            self.apply_runtime_settings(&settings);
        }
    }

    fn open_settings_modal(&mut self) {
        self.clear_link_preview();
        self.settings_modal.open();
    }

    fn workspace_relative_path(&self, path: &str) -> String {
        let path = Path::new(path);
        path.strip_prefix(&self.workspace_root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
            .trim_matches('/')
            .to_string()
    }

    fn open_create_dialog(&mut self, directory: Option<String>) {
        let relative_directory = directory
            .as_deref()
            .map(|value| self.workspace_relative_path(value))
            .filter(|value| !value.is_empty());

        self.clear_link_preview();
        self.new_file_dialog.open(relative_directory);
    }

    fn open_delete_dialog(&mut self, path: String) {
        let display_path = self.workspace_relative_path(&path);
        let label = if display_path.is_empty() {
            Path::new(&path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(path.as_str())
                .to_string()
        } else {
            display_path
        };

        self.clear_link_preview();
        self.confirm_dialog.open(
            self.language.translator().text(TextKey::ConfirmDeleteTitle),
            self.language.translator().delete_file_message(&label),
            self.language
                .translator()
                .text(TextKey::ConfirmDeleteWarning),
            self.language
                .translator()
                .text(TextKey::ConfirmDeleteButton),
            Action::File(crate::action::FileAction::Delete(path)),
        );
    }

    fn sync_editor_link_preview(&mut self, editor_area: Rect) {
        if self.has_modal_open() || self.focus_manager.focused() != ComponentId::Editor {
            self.clear_link_preview();
            return;
        }

        self.editor.set_viewport(editor_area);

        let Some(link) = self.editor.link_at_cursor() else {
            self.clear_link_preview();
            return;
        };

        let Some(anchor) = self.editor.cursor_screen_position(editor_area) else {
            self.clear_link_preview();
            return;
        };

        let preview = self.editor_preview_state_for_link(&link);

        self.link_preview = Some(LinkPreviewState { preview, anchor });
    }

    fn sync_hover_link_preview(&mut self, editor_area: Rect, x: u16, y: u16) {
        if self.has_modal_open() {
            self.clear_link_preview();
            return;
        }

        self.editor.set_viewport(editor_area);

        let Some(link) = self.editor.link_at_screen_position(editor_area, x, y) else {
            self.clear_link_preview();
            return;
        };

        let preview = self.editor_preview_state_for_link(&link);

        self.link_preview = Some(LinkPreviewState {
            preview,
            anchor: (x, y),
        });
    }

    fn image_preview_state(&self, target: &str, label: &str) -> WorkspaceLinkPreview {
        let trimmed = target.trim();
        let t = self.language.translator();
        let title = t.image_preview_title(label);

        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return WorkspaceLinkPreview {
                title,
                subtitle: trimmed.to_string(),
                body: vec![
                    t.text(TextKey::PreviewRemoteImageDetected).to_string(),
                    t.text(TextKey::PreviewLocalImagesOnly).to_string(),
                ],
                absolute_path: None,
                line_number: None,
                resolved: false,
            };
        }

        if let Some(path) = self.editor.resolve_image_path(trimmed) {
            let path_string = path.to_string_lossy().to_string();
            let subtitle = self.workspace_relative_path(&path_string);
            return WorkspaceLinkPreview {
                title,
                subtitle: if subtitle.is_empty() {
                    path_string
                } else {
                    subtitle
                },
                body: vec![
                    t.text(TextKey::PreviewLocalImageResolved).to_string(),
                    t.text(TextKey::PreviewStandaloneImageRenders).to_string(),
                ],
                absolute_path: None,
                line_number: None,
                resolved: true,
            };
        }

        WorkspaceLinkPreview {
            title,
            subtitle: trimmed.to_string(),
            body: vec![
                t.text(TextKey::PreviewLocalImageUnresolved).to_string(),
                t.text(TextKey::PreviewCheckRelativePath).to_string(),
            ],
            absolute_path: None,
            line_number: None,
            resolved: false,
        }
    }

    fn editor_preview_state_for_link(&self, link: &EditorLink) -> WorkspaceLinkPreview {
        match link.kind {
            EditorLinkKind::Wiki | EditorLinkKind::Markdown => {
                self.workspace_index.preview_reference(
                    self.language,
                    self.editor.current_file().as_deref(),
                    &link.target,
                )
            }
            EditorLinkKind::Image => self.image_preview_state(
                &link.target,
                link.label
                    .as_deref()
                    .unwrap_or(self.language.translator().text(TextKey::PreviewImage)),
            ),
        }
    }

    fn preview_state_for_hit(&self, hit: &PreviewHit) -> WorkspaceLinkPreview {
        match hit.kind {
            PreviewTargetKind::MarkdownLink | PreviewTargetKind::WikiLink => {
                self.workspace_index.preview_reference(
                    self.language,
                    self.editor.current_file().as_deref(),
                    &hit.target,
                )
            }
            PreviewTargetKind::BlockRef => {
                if let Some(reference) = self.editor.block_ref_by_id(&hit.target) {
                    let subtitle = self
                        .editor
                        .current_file()
                        .map(|path| self.workspace_relative_path(&path))
                        .filter(|path| !path.is_empty())
                        .unwrap_or_else(|| {
                            self.language
                                .translator()
                                .text(TextKey::PreviewCurrentFile)
                                .to_string()
                        });

                    WorkspaceLinkPreview {
                        title: self
                            .language
                            .translator()
                            .block_preview_title(&reference.id),
                        subtitle,
                        body: vec![reference.content],
                        absolute_path: self.editor.current_file(),
                        line_number: Some(reference.line + 1),
                        resolved: true,
                    }
                } else {
                    WorkspaceLinkPreview {
                        title: self
                            .language
                            .translator()
                            .text(TextKey::PreviewMissingBlock)
                            .to_string(),
                        subtitle: hit.target.clone(),
                        body: vec![self
                            .language
                            .translator()
                            .text(TextKey::PreviewNoMatchingBlock)
                            .to_string()],
                        absolute_path: None,
                        line_number: None,
                        resolved: false,
                    }
                }
            }
            PreviewTargetKind::Image => self.image_preview_state(&hit.target, &hit.label),
        }
    }

    fn sync_hover_preview_reference(&mut self, preview_area: Rect, x: u16, y: u16) {
        if self.has_modal_open() {
            self.clear_link_preview();
            return;
        }

        let preview_scroll = if self.focus_manager.focused() == ComponentId::Preview {
            self.preview_scroll_offset
        } else {
            self.editor.synced_preview_scroll(preview_area)
        };

        let Some(hit) = self.editor.preview_hit_at_screen_position_with_scroll(
            preview_area,
            x,
            y,
            preview_scroll,
        ) else {
            self.clear_link_preview();
            return;
        };

        if self.focus_manager.focused() == ComponentId::Preview {
            let targets = self.editor.preview_targets(preview_area);
            self.preview_selected_target = targets.iter().position(|candidate| {
                candidate.line == hit.line
                    && candidate.kind == hit.kind
                    && candidate.target == hit.target
                    && candidate.label == hit.label
            });
        }

        self.link_preview = Some(LinkPreviewState {
            preview: self.preview_state_for_hit(&hit),
            anchor: (x, y),
        });
    }

    fn open_workspace_preview(&mut self, preview: WorkspaceLinkPreview) -> bool {
        let Some(path) = preview.absolute_path else {
            return false;
        };

        self.editor.load_file(&path);
        self.editor
            .set_cursor_position(preview.line_number.unwrap_or(1).saturating_sub(1), 0);
        self.sync_knowledge_panel();
        self.sync_graph_explorer_root_from_current_file();
        self.focus_component(ComponentId::Editor);
        self.clear_link_preview();
        true
    }

    fn activate_preview_hit(&mut self, hit: PreviewHit, anchor: (u16, u16)) -> bool {
        match hit.kind {
            PreviewTargetKind::BlockRef => {
                if let Some(reference) = self.editor.block_ref_by_id(&hit.target) {
                    self.editor.set_cursor_position(reference.line, 0);
                    self.focus_component(ComponentId::Editor);
                    self.clear_link_preview();
                    true
                } else {
                    self.link_preview = Some(LinkPreviewState {
                        preview: self.preview_state_for_hit(&hit),
                        anchor,
                    });
                    false
                }
            }
            PreviewTargetKind::MarkdownLink | PreviewTargetKind::WikiLink => {
                let preview = self.preview_state_for_hit(&hit);
                if self.open_workspace_preview(preview.clone()) {
                    true
                } else {
                    self.link_preview = Some(LinkPreviewState { preview, anchor });
                    false
                }
            }
            PreviewTargetKind::Image => {
                self.link_preview = Some(LinkPreviewState {
                    preview: self.preview_state_for_hit(&hit),
                    anchor,
                });
                false
            }
        }
    }

    fn activate_preview_reference(&mut self, preview_area: Rect, x: u16, y: u16) -> bool {
        let preview_scroll = if self.focus_manager.focused() == ComponentId::Preview {
            self.preview_scroll_offset
        } else {
            self.editor.synced_preview_scroll(preview_area)
        };
        let Some(hit) = self.editor.preview_hit_at_screen_position_with_scroll(
            preview_area,
            x,
            y,
            preview_scroll,
        ) else {
            return false;
        };
        self.activate_preview_hit(hit, (x, y))
    }

    /// Run the main event loop
    pub fn run(&mut self) -> Result<()> {
        self.tui.enter()?;
        self.editor.init_preview_images();

        // Spawn async event handler
        let action_tx = self.action_tx.clone();
        tokio::spawn(async move {
            Self::async_event_loop(action_tx).await;
        });

        // Main render loop
        loop {
            self.poll_workspace_index_reload();

            // Handle pending actions first
            while let Ok(action) = self.action_rx.try_recv() {
                self.handle_action(action);
            }

            // Handle terminal events
            if let Some(event) = self.tui.next_event()? {
                self.handle_event(event);
            }

            // Render
            let size = self.tui.size();
            let has_content = self.editor.has_content();
            let chat_open = self.chat.is_open();
            let knowledge_open = self.knowledge.is_open();

            let layout = Self::compute_layout(size, has_content, chat_open, knowledge_open);
            if let Some(area) = layout.get("editor").copied() {
                self.editor.set_viewport(area);
            }
            self.sync_status_bar();

            let scroll_offset = self.editor.scroll_offset();
            let components = Components {
                focused: self.focus_manager.focused(),
                editor_mode: self.editor_mode,
                sidebar: &self.sidebar,
                editor: &self.editor,
                search: &self.search,
                chat: &self.chat,
                knowledge: &self.knowledge,
                graph: &self.graph_explorer,
                status: &self.status,
                settings: &self.settings_modal,
                new_file: &self.new_file_dialog,
                confirm: &self.confirm_dialog,
                link_preview: self.link_preview.as_ref(),
                shortcut_profile: self.shortcut_profile,
                shortcut_help_open: self.shortcut_help_open,
                language: self.language,
            };
            self.tui.draw(|f| {
                let preview_scroll = if components.focused == ComponentId::Preview {
                    self.preview_scroll_offset
                } else {
                    layout
                        .get("preview")
                        .copied()
                        .map(|area| self.editor.synced_preview_scroll(area))
                        .unwrap_or(scroll_offset)
                };
                Self::render_with_components(f, &layout, components, preview_scroll);
            })?;

            // Check quit
            if self.should_quit {
                break;
            }
        }

        self.tui.exit()?;
        Ok(())
    }

    /// Async event loop for background tasks
    async fn async_event_loop(action_tx: mpsc::UnboundedSender<Action>) {
        let mut tick_interval = interval(Duration::from_millis(50));
        let mut render_interval = interval(Duration::from_secs(1) / 60);

        loop {
            tokio::select! {
                _ = tick_interval.tick() => {
                    let _ = action_tx.send(Action::Tick);
                }
                _ = render_interval.tick() => {
                    let _ = action_tx.send(Action::Render);
                }
            }
        }
    }

    /// Handle a terminal event
    fn handle_event(&mut self, event: crossterm::event::Event) {
        let action = match event {
            CrosstermEvent::Key(key) => self.handle_key_event(key),
            CrosstermEvent::Mouse(mouse) => self.handle_mouse_event(mouse),
            CrosstermEvent::Resize(width, height) => Some(Action::Resize { width, height }),
            _ => None,
        };

        if let Some(action) = action {
            self.handle_action(action);
        }
    }

    fn execute_shortcut_command(&mut self, command: ShortcutCommand) -> Option<Action> {
        match command {
            ShortcutCommand::CycleFocus(forward) => {
                return Some(Action::Navigation(if forward {
                    crate::action::NavigationAction::FocusNext
                } else {
                    crate::action::NavigationAction::FocusPrev
                }));
            }
            ShortcutCommand::Focus(component) => {
                return Some(Action::Navigation(
                    crate::action::NavigationAction::FocusComponent(component),
                ));
            }
            ShortcutCommand::OpenSearch => {
                return Some(Action::Search(crate::action::SearchAction::Open));
            }
            ShortcutCommand::OpenSettings => {
                self.clear_pending_sequences();
                self.open_settings_modal();
            }
            ShortcutCommand::Save => {
                return Some(Action::File(crate::action::FileAction::Save));
            }
            ShortcutCommand::ToggleChat => {
                self.chat.toggle();
                if self.chat.is_open() {
                    self.focus_component(ComponentId::Chat);
                } else if self.focus_manager.focused() == ComponentId::Chat {
                    self.focus_component(ComponentId::Editor);
                }
            }
            ShortcutCommand::ToggleKnowledge => {
                self.knowledge.toggle();
                if self.knowledge.is_open() {
                    self.focus_component(ComponentId::Knowledge);
                } else if self.focus_manager.focused() == ComponentId::Knowledge {
                    self.focus_component(ComponentId::Editor);
                }
            }
            ShortcutCommand::OpenGraphExplorer => {
                self.clear_pending_sequences();
                return Some(Action::Graph(crate::action::GraphAction::Open));
            }
            ShortcutCommand::IndexCurrentFile => {
                if let Some(path) = self.editor.current_file() {
                    return Some(Action::Knowledge(crate::action::KnowledgeAction::Index(
                        path,
                    )));
                }
            }
            ShortcutCommand::ToggleHelp => {
                self.clear_pending_sequences();
                self.shortcut_help_open = !self.shortcut_help_open;
            }
            ShortcutCommand::OpenQuitDialog => {
                self.clear_pending_sequences();
                self.open_quit_dialog();
            }
            ShortcutCommand::EnterInsert => {
                self.editor_mode = EditorMode::Insert;
            }
            ShortcutCommand::AppendInsert => {
                self.editor.move_cursor_right_command();
                self.editor_mode = EditorMode::Insert;
            }
            ShortcutCommand::OpenLineBelow => {
                self.editor.open_line_below();
                self.editor_mode = EditorMode::Insert;
            }
            ShortcutCommand::MoveLeft => self.editor.move_cursor_left_command(),
            ShortcutCommand::MoveRight => self.editor.move_cursor_right_command(),
            ShortcutCommand::MoveUp => self.editor.move_cursor_up_command(),
            ShortcutCommand::MoveDown => self.editor.move_cursor_down_command(),
            ShortcutCommand::MoveWordForward => self.editor.move_cursor_word_forward(),
            ShortcutCommand::MoveWordBackward => self.editor.move_cursor_word_backward(),
            ShortcutCommand::MoveLineStart => self.editor.move_cursor_to_line_start(),
            ShortcutCommand::MoveLineEnd => self.editor.move_cursor_to_line_end(),
            ShortcutCommand::MoveDocStart => self.editor.move_cursor_to_document_start(),
            ShortcutCommand::MoveDocEnd => self.editor.move_cursor_to_document_end(),
            ShortcutCommand::MoveHalfPageUp => self.editor.move_half_page_up(),
            ShortcutCommand::MoveHalfPageDown => self.editor.move_half_page_down(),
            ShortcutCommand::ActivateCursorTarget => self.activate_cursor_target(),
            ShortcutCommand::ShowCursorPreview => self.show_cursor_preview(),
            ShortcutCommand::EnterPreview => self.focus_component(ComponentId::Preview),
            ShortcutCommand::ExitPreview => self.focus_component(ComponentId::Editor),
            ShortcutCommand::PreviewScroll(delta) => self.scroll_preview(delta),
            ShortcutCommand::PreviewSelectNext(forward) => self.move_preview_selection(forward),
            ShortcutCommand::PreviewOpenSelection => self.activate_selected_preview_target(),
        }

        self.refresh_link_preview_for_focus();
        None
    }

    fn refresh_link_preview_for_focus(&mut self) {
        if self.shortcut_help_open || self.has_modal_open() {
            self.clear_link_preview();
            return;
        }

        match self.focus_manager.focused() {
            ComponentId::Editor => {
                if let Some(area) = self.current_editor_area() {
                    self.sync_editor_link_preview(area);
                }
            }
            ComponentId::Preview => {
                self.sync_preview_selection_overlay();
            }
            _ => self.clear_link_preview(),
        }
    }

    fn in_text_input_context(&self) -> bool {
        match self.focus_manager.focused() {
            ComponentId::Editor => self.editor_mode == EditorMode::Insert,
            ComponentId::Chat | ComponentId::Knowledge | ComponentId::Search => true,
            _ => false,
        }
    }

    fn route_global_shortcut(&self, key: KeyEvent) -> Option<ShortcutCommand> {
        match (key.modifiers, key.code) {
            (KeyModifiers::CONTROL, KeyCode::Char('q')) => Some(ShortcutCommand::OpenQuitDialog),
            (KeyModifiers::CONTROL, KeyCode::Char('k')) => Some(ShortcutCommand::ToggleChat),
            (KeyModifiers::CONTROL, KeyCode::Char('g')) => Some(ShortcutCommand::ToggleHelp),
            (_, KeyCode::F(1)) => Some(ShortcutCommand::Focus(ComponentId::Sidebar)),
            (_, KeyCode::F(2)) => Some(ShortcutCommand::Focus(ComponentId::Editor)),
            (_, KeyCode::F(3)) => Some(ShortcutCommand::Focus(ComponentId::Preview)),
            (_, KeyCode::F(4)) => Some(ShortcutCommand::ToggleChat),
            (_, KeyCode::F(5)) => Some(ShortcutCommand::ToggleKnowledge),
            (_, KeyCode::F(6)) => Some(ShortcutCommand::OpenSearch),
            (_, KeyCode::F(7)) => Some(ShortcutCommand::OpenGraphExplorer),
            (_, KeyCode::F(8)) => Some(ShortcutCommand::EnterPreview),
            (_, KeyCode::F(9)) => Some(ShortcutCommand::Save),
            (_, KeyCode::F(10)) => Some(ShortcutCommand::OpenSettings),
            (_, KeyCode::F(11)) => Some(ShortcutCommand::IndexCurrentFile),
            (_, KeyCode::F(12)) => Some(ShortcutCommand::OpenQuitDialog),
            (KeyModifiers::NONE, KeyCode::Tab) if !self.in_text_input_context() => {
                Some(ShortcutCommand::CycleFocus(true))
            }
            (KeyModifiers::SHIFT, KeyCode::BackTab) | (KeyModifiers::SHIFT, KeyCode::Tab)
                if !self.in_text_input_context() =>
            {
                Some(ShortcutCommand::CycleFocus(false))
            }
            _ => None,
        }
    }

    fn route_terminal_leader_sequence(&mut self, key: KeyEvent) -> Option<ShortcutCommand> {
        if !self.leader_pending {
            return None;
        }

        self.leader_pending = false;
        match key.code {
            KeyCode::Char('1') => Some(ShortcutCommand::Focus(ComponentId::Sidebar)),
            KeyCode::Char('2') => Some(ShortcutCommand::Focus(ComponentId::Editor)),
            KeyCode::Char('3') => Some(ShortcutCommand::Focus(ComponentId::Preview)),
            KeyCode::Char('4') => Some(ShortcutCommand::Focus(ComponentId::Chat)),
            KeyCode::Char('5') => Some(ShortcutCommand::Focus(ComponentId::Knowledge)),
            KeyCode::Char('s') | KeyCode::Char('S') => Some(ShortcutCommand::Save),
            KeyCode::Char('/') => Some(ShortcutCommand::OpenSearch),
            KeyCode::Char(',') => Some(ShortcutCommand::OpenSettings),
            KeyCode::Char('k') | KeyCode::Char('K') => Some(ShortcutCommand::ToggleChat),
            KeyCode::Char('l') | KeyCode::Char('L') => Some(ShortcutCommand::ToggleKnowledge),
            KeyCode::Char('g') | KeyCode::Char('G') => Some(ShortcutCommand::OpenGraphExplorer),
            KeyCode::Char('i') | KeyCode::Char('I') => Some(ShortcutCommand::IndexCurrentFile),
            KeyCode::Char('q') | KeyCode::Char('Q') => Some(ShortcutCommand::OpenQuitDialog),
            _ => None,
        }
    }

    fn route_editor_normal_shortcut(&mut self, key: KeyEvent) -> Option<ShortcutCommand> {
        if self.normal_g_pending {
            self.normal_g_pending = false;
            if matches!(key.code, KeyCode::Char('g')) {
                return Some(ShortcutCommand::MoveDocStart);
            }
        }

        match key.code {
            KeyCode::Char(' ') => {
                self.leader_pending = true;
                None
            }
            KeyCode::Char('i') => Some(ShortcutCommand::EnterInsert),
            KeyCode::Char('a') => Some(ShortcutCommand::AppendInsert),
            KeyCode::Char('o') => Some(ShortcutCommand::OpenLineBelow),
            KeyCode::Char('h') | KeyCode::Left => Some(ShortcutCommand::MoveLeft),
            KeyCode::Char('j') | KeyCode::Down => Some(ShortcutCommand::MoveDown),
            KeyCode::Char('k') | KeyCode::Up => Some(ShortcutCommand::MoveUp),
            KeyCode::Char('l') | KeyCode::Right => Some(ShortcutCommand::MoveRight),
            KeyCode::Char('w') => Some(ShortcutCommand::MoveWordForward),
            KeyCode::Char('b') => Some(ShortcutCommand::MoveWordBackward),
            KeyCode::Char('0') => Some(ShortcutCommand::MoveLineStart),
            KeyCode::Char('$') => Some(ShortcutCommand::MoveLineEnd),
            KeyCode::Char('g') => {
                self.normal_g_pending = true;
                None
            }
            KeyCode::Char('G') => Some(ShortcutCommand::MoveDocEnd),
            KeyCode::Char('p') => Some(ShortcutCommand::EnterPreview),
            KeyCode::Char('K') => Some(ShortcutCommand::ShowCursorPreview),
            KeyCode::Char('/') => Some(ShortcutCommand::OpenSearch),
            KeyCode::Char('?') => Some(ShortcutCommand::ToggleHelp),
            KeyCode::Enter => Some(ShortcutCommand::ActivateCursorTarget),
            KeyCode::PageUp => Some(ShortcutCommand::MoveHalfPageUp),
            KeyCode::PageDown => Some(ShortcutCommand::MoveHalfPageDown),
            KeyCode::Char('u') if key.modifiers == KeyModifiers::CONTROL => {
                Some(ShortcutCommand::MoveHalfPageUp)
            }
            KeyCode::Char('d') if key.modifiers == KeyModifiers::CONTROL => {
                Some(ShortcutCommand::MoveHalfPageDown)
            }
            _ => None,
        }
    }

    fn route_preview_shortcut(&mut self, key: KeyEvent) -> Option<ShortcutCommand> {
        if let Some(command) = self.route_terminal_leader_sequence(key) {
            return Some(command);
        }

        match key.code {
            KeyCode::Esc | KeyCode::Char('q') => Some(ShortcutCommand::ExitPreview),
            KeyCode::Char(' ') => {
                self.leader_pending = true;
                None
            }
            KeyCode::Char('j') | KeyCode::Down => Some(ShortcutCommand::PreviewScroll(1)),
            KeyCode::Char('k') | KeyCode::Up => Some(ShortcutCommand::PreviewScroll(-1)),
            KeyCode::PageUp => Some(ShortcutCommand::PreviewScroll(-6)),
            KeyCode::PageDown => Some(ShortcutCommand::PreviewScroll(6)),
            KeyCode::Tab => Some(ShortcutCommand::PreviewSelectNext(true)),
            KeyCode::BackTab => Some(ShortcutCommand::PreviewSelectNext(false)),
            KeyCode::Char('?') => Some(ShortcutCommand::ToggleHelp),
            KeyCode::Enter | KeyCode::Char('o') => Some(ShortcutCommand::PreviewOpenSelection),
            _ => None,
        }
    }

    /// Handle key events
    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if self.confirm_dialog.is_open() {
            return self.confirm_dialog.handle_key_event(key);
        }

        if self.new_file_dialog.is_open() {
            return self.new_file_dialog.handle_key_event(key);
        }

        // Handle settings modal first if open
        if self.settings_modal.is_open() {
            if self.settings_modal.handle_key_event(key) {
                self.apply_settings_update_if_needed();
                return None;
            }
        }

        if self.graph_explorer.is_open() {
            return self.graph_explorer.handle_key_event(key);
        }

        if self.shortcut_help_open {
            match (key.modifiers, key.code) {
                (KeyModifiers::CONTROL, KeyCode::Char('g'))
                | (_, KeyCode::Esc)
                | (_, KeyCode::Char('?')) => {
                    self.shortcut_help_open = false;
                    self.refresh_link_preview_for_focus();
                }
                _ => {}
            }
            return None;
        }

        if matches!(self.shortcut_profile, ShortcutProfile::IdeCompatible) {
            if let Some(command) = self.route_global_shortcut(key) {
                return self.execute_shortcut_command(command);
            }
        } else if let Some(command) = self.route_global_shortcut(key) {
            return self.execute_shortcut_command(command);
        }

        match self.focus_manager.focused() {
            ComponentId::Preview => {
                if let Some(command) = self.route_preview_shortcut(key) {
                    return self.execute_shortcut_command(command);
                }
            }
            ComponentId::Editor if self.editor_mode == EditorMode::Insert => {
                if key.code == KeyCode::Esc {
                    self.editor_mode = EditorMode::Normal;
                    self.refresh_link_preview_for_focus();
                    return None;
                }
            }
            ComponentId::Editor => {
                if self.shortcut_profile == ShortcutProfile::TerminalLeader {
                    if let Some(command) = self.route_terminal_leader_sequence(key) {
                        return self.execute_shortcut_command(command);
                    }
                }
                if let Some(command) = self.route_editor_normal_shortcut(key) {
                    return self.execute_shortcut_command(command);
                }
            }
            ComponentId::Sidebar if self.shortcut_profile == ShortcutProfile::TerminalLeader => {
                if let Some(command) = self.route_terminal_leader_sequence(key) {
                    return self.execute_shortcut_command(command);
                }
                if key.code == KeyCode::Char(' ') {
                    self.leader_pending = true;
                    return None;
                }
            }
            _ if self.shortcut_profile == ShortcutProfile::TerminalLeader => {
                if let Some(command) = self.route_terminal_leader_sequence(key) {
                    return self.execute_shortcut_command(command);
                }
            }
            _ => {}
        }

        let focused = self.focus_manager.focused();
        let action = match focused {
            ComponentId::Sidebar if self.shortcut_profile == ShortcutProfile::TerminalLeader => {
                let remapped = match key.code {
                    KeyCode::Char('j') => KeyEvent::new(KeyCode::Down, KeyModifiers::NONE),
                    KeyCode::Char('k') => KeyEvent::new(KeyCode::Up, KeyModifiers::NONE),
                    KeyCode::Char('h') => KeyEvent::new(KeyCode::Left, KeyModifiers::NONE),
                    KeyCode::Char('l') => KeyEvent::new(KeyCode::Right, KeyModifiers::NONE),
                    _ => key,
                };
                self.sidebar.handle_key_event(remapped)
            }
            ComponentId::Sidebar => self.sidebar.handle_key_event(key),
            ComponentId::Editor => self.editor.handle_key_event(key),
            ComponentId::Chat => self.chat.handle_key_event(key),
            ComponentId::Knowledge => self.knowledge.handle_key_event(key),
            ComponentId::Search => self.search.handle_key_event(key),
            _ => None,
        };

        self.refresh_link_preview_for_focus();
        action
    }

    /// Handle mouse events
    fn handle_mouse_event(&mut self, mouse: MouseEvent) -> Option<Action> {
        let size = self.tui.size();
        let has_content = self.editor.has_content();
        let chat_open = self.chat.is_open();
        let knowledge_open = self.knowledge.is_open();
        let layout = Self::compute_layout(size, has_content, chat_open, knowledge_open);

        if self.confirm_dialog.is_open() {
            return self.confirm_dialog.handle_mouse_event(mouse, size);
        }

        if self.new_file_dialog.is_open() {
            return self.new_file_dialog.handle_mouse_event(mouse, size);
        }

        if self.settings_modal.is_open() {
            let handled = self.settings_modal.handle_mouse_event(mouse, size);
            self.apply_settings_update_if_needed();
            if handled {
                return None;
            }
        }

        if self.graph_explorer.is_open() {
            return None;
        }

        // Handle mouse wheel scrolling
        if let MouseEventKind::ScrollUp = mouse.kind {
            if let Some(area) = layout.get("preview").copied() {
                if Self::point_in_rect(area, mouse.column, mouse.row) {
                    self.scroll_preview(-3);
                    return None;
                }
            }
            self.editor.scroll_by(-3);
            self.refresh_link_preview_for_focus();
            return None;
        }
        if let MouseEventKind::ScrollDown = mouse.kind {
            if let Some(area) = layout.get("preview").copied() {
                if Self::point_in_rect(area, mouse.column, mouse.row) {
                    self.scroll_preview(3);
                    return None;
                }
            }
            self.editor.scroll_by(3);
            self.refresh_link_preview_for_focus();
            return None;
        }

        if matches!(mouse.kind, MouseEventKind::Moved) {
            if let Some(area) = layout.get("editor").copied() {
                if Self::point_in_rect(area, mouse.column, mouse.row) {
                    self.sync_hover_link_preview(area, mouse.column, mouse.row);
                    return None;
                }
            }

            if let Some(area) = layout.get("preview").copied() {
                if Self::point_in_rect(area, mouse.column, mouse.row) {
                    self.sync_hover_preview_reference(area, mouse.column, mouse.row);
                    return None;
                }
            }

            self.clear_link_preview();
            return None;
        }

        // Handle click to focus components and place the editor cursor.
        if matches!(mouse.kind, MouseEventKind::Down(MouseButton::Left)) {
            let mouse_x = mouse.column;
            let mouse_y = mouse.row;

            if self.search.is_open()
                && layout
                    .get("search")
                    .copied()
                    .is_some_and(|area| Self::point_in_rect(area, mouse_x, mouse_y))
            {
                self.focus_manager.set_focus(ComponentId::Search);
                self.clear_link_preview();
                return None;
            }

            if let Some(area) = layout.get("sidebar").copied() {
                if Self::point_in_rect(area, mouse_x, mouse_y) {
                    self.focus_component(ComponentId::Sidebar);
                    self.clear_link_preview();
                    return None;
                }
            }

            if let Some(area) = layout.get("editor").copied() {
                if Self::point_in_rect(area, mouse_x, mouse_y) {
                    self.focus_component(ComponentId::Editor);
                    self.editor_mode = EditorMode::Insert;
                    if self
                        .editor
                        .set_cursor_from_screen_position(area, mouse_x, mouse_y)
                    {
                        self.sync_editor_link_preview(area);
                    } else {
                        self.clear_link_preview();
                    }
                    return None;
                }
            }

            if let Some(area) = layout.get("preview").copied() {
                if Self::point_in_rect(area, mouse_x, mouse_y) {
                    self.focus_component(ComponentId::Preview);
                    if !self.activate_preview_reference(area, mouse_x, mouse_y) {
                        self.sync_hover_preview_reference(area, mouse_x, mouse_y);
                    }
                    return None;
                }
            }

            if self.chat.is_open() {
                if let Some(area) = layout.get("chat").copied() {
                    if Self::point_in_rect(area, mouse_x, mouse_y) {
                        self.focus_component(ComponentId::Chat);
                        self.clear_link_preview();
                        return None;
                    }
                }
            }

            if self.knowledge.is_open() {
                if let Some(area) = layout.get("knowledge").copied() {
                    if Self::point_in_rect(area, mouse_x, mouse_y) {
                        self.focus_component(ComponentId::Knowledge);
                        self.clear_link_preview();
                        return None;
                    }
                }
            }

            self.clear_link_preview();
        }
        None
    }

    /// Handle an action
    fn handle_action(&mut self, action: Action) {
        tracing::debug!(action = action.name(), "Handling action");

        match action {
            Action::Navigation(nav) => {
                self.handle_navigation(nav);
            }
            Action::File(file) => {
                self.handle_file_action(file);
            }
            Action::Editor(editor) => {
                let previous_file = self.editor.current_file();
                self.editor.handle_action(&editor);
                if self.editor.current_file() != previous_file {
                    self.sync_knowledge_panel();
                    self.sync_graph_explorer_root_from_current_file();
                }
            }
            Action::Search(search) => match &search {
                crate::action::SearchAction::Open => {
                    self.focus_component(ComponentId::Search);
                    self.clear_link_preview();
                    self.search.handle_action(&search);
                }
                crate::action::SearchAction::Close => {
                    self.search.handle_action(&search);
                    self.focus_component(ComponentId::Editor);
                    if let Some(area) = self.current_editor_area() {
                        self.sync_editor_link_preview(area);
                    }
                }
                crate::action::SearchAction::SetQuery(query) => {
                    let results = self.search_workspace(query);
                    self.search
                        .handle_action(&crate::action::SearchAction::SearchResults(results));
                }
                crate::action::SearchAction::OpenResult {
                    file_path,
                    line_number,
                } => {
                    self.editor.load_file(file_path);
                    self.editor
                        .set_cursor_position(line_number.saturating_sub(1), 0);
                    self.sync_knowledge_panel();
                    self.sync_graph_explorer_root_from_current_file();
                    self.focus_component(ComponentId::Editor);
                    self.clear_link_preview();
                    self.search
                        .handle_action(&crate::action::SearchAction::Close);
                }
                _ => {
                    self.search.handle_action(&search);
                }
            },
            Action::Chat(chat) => {
                match &chat {
                    ChatAction::Send(msg) => {
                        // Get current chat model config
                        let model_config = self.chat.get_model_config();
                        let user_message = msg.clone();

                        // Build messages from chat history
                        let messages: Vec<ChatMessage> = self
                            .chat
                            .get_messages()
                            .iter()
                            .map(|m| ChatMessage {
                                role: match m.role {
                                    crate::components::chat::MessageRole::User => MessageRole::User,
                                    crate::components::chat::MessageRole::Assistant => {
                                        MessageRole::Assistant
                                    }
                                    crate::components::chat::MessageRole::System => {
                                        MessageRole::System
                                    }
                                },
                                content: m.content.clone(),
                            })
                            .collect();

                        // Search knowledge base for context
                        let vector_service = Arc::clone(&self.vector_service);
                        let action_tx = self.action_tx.clone();

                        tracing::info!("AI chat: Starting for message: {}", user_message);

                        // Run the async AI call in a blocking way using tokio::runtime
                        // We need to use spawn_blocking or block_on properly
                        let messages = messages;
                        let model_config = model_config;

                        std::thread::spawn(move || {
                            // Create a new runtime for this thread
                            let rt2 = tokio::runtime::Runtime::new().unwrap();
                            rt2.block_on(async move {
                                tracing::info!("AI chat: Searching knowledge base");

                                // Search knowledge base for relevant context
                                let context = match vector_service.search(&user_message, 5).await {
                                    Ok(results) if !results.is_empty() => {
                                        let context_text: String = results
                                            .iter()
                                            .map(|r| {
                                                format!(
                                                    "From {}:\n{}\n---\n",
                                                    r.file_path, r.content
                                                )
                                            })
                                            .collect();
                                        Some(context_text)
                                    }
                                    _ => None,
                                };

                                tracing::info!(
                                    "AI chat: Context search done, context: {}",
                                    context.is_some()
                                );

                                // Build final message with context
                                let final_message = if let Some(ctx) = context {
                                    format!(
                                        "Context from knowledge base:\n{}\n\nUser question: {}",
                                        ctx, user_message
                                    )
                                } else {
                                    user_message
                                };

                                // messages already contains all history including the user message
                                // We just need to update the last user message with context
                                let mut final_messages = messages;
                                if let Some(last_msg) = final_messages.last_mut() {
                                    if matches!(last_msg.role, MessageRole::User) {
                                        last_msg.content = final_message;
                                    } else {
                                        final_messages.push(ChatMessage {
                                            role: MessageRole::User,
                                            content: final_message,
                                        });
                                    }
                                }

                                tracing::info!(
                                    "AI chat: Calling AI service with {} messages",
                                    final_messages.len()
                                );

                                let ai_service = AiService::with_config(model_config);
                                match ai_service.chat(final_messages).await {
                                    Ok(response) => {
                                        tracing::info!(
                                            "AI chat: Got response, length: {}",
                                            response.content.len()
                                        );
                                        if action_tx
                                            .send(Action::Chat(ChatAction::StreamResponse(
                                                response.content,
                                            )))
                                            .is_err()
                                        {
                                            tracing::error!(
                                                "AI chat: Failed to send chat response to UI"
                                            );
                                        }
                                    }
                                    Err(e) => {
                                        tracing::error!("AI chat: Error: {}", e);
                                        if action_tx
                                            .send(Action::Chat(ChatAction::StreamResponse(
                                                format!("Error: {}", e),
                                            )))
                                            .is_err()
                                        {
                                            tracing::error!(
                                                "AI chat: Failed to send error response to UI"
                                            );
                                        }
                                    }
                                }
                            });
                        });
                    }
                    _ => {
                        self.chat.handle_action(&chat);
                    }
                }
            }
            Action::Knowledge(knowledge) => {
                match &knowledge {
                    crate::action::KnowledgeAction::Search(query) => {
                        let query = query.clone();
                        let vector_service = Arc::clone(&self.vector_service);
                        let action_tx = self.action_tx.clone();
                        tokio::spawn(async move {
                            match vector_service.search(&query, 10).await {
                                Ok(results) => {
                                    let search_results: Vec<crate::action::SearchResult> = results
                                        .into_iter()
                                        .map(|r| crate::action::SearchResult {
                                            file_path: r.file_path,
                                            score: r.score,
                                            excerpt: r.content.chars().take(200).collect(),
                                            block_id: Some(r.chunk_id),
                                            line_number: Some(r.start_line),
                                        })
                                        .collect();
                                    let _ = action_tx.send(Action::Knowledge(
                                        crate::action::KnowledgeAction::SearchResults(
                                            search_results,
                                        ),
                                    ));
                                }
                                Err(e) => {
                                    tracing::error!("Search error: {}", e);
                                }
                            }
                        });
                    }
                    crate::action::KnowledgeAction::Index(path) => {
                        let path = path.clone();
                        let vector_service = Arc::clone(&self.vector_service);
                        let action_tx = self.action_tx.clone();

                        // Notify indexing started
                        self.knowledge.handle_action(&knowledge);

                        tokio::spawn(async move {
                            // Read file content
                            match tokio::fs::read_to_string(&path).await {
                                Ok(content) => {
                                    let chunks = vector_service.chunk_text(&content, 50);
                                    let total = chunks.len();

                                    for (i, chunk) in chunks.into_iter().enumerate() {
                                        let mut chunk_with_path = chunk;
                                        chunk_with_path.file_path = path.clone();
                                        vector_service
                                            .add_chunks(&path, vec![chunk_with_path])
                                            .await;

                                        let progress = (i + 1) as f32 / total as f32;
                                        let _ = action_tx.send(Action::Knowledge(
                                            crate::action::KnowledgeAction::IndexProgress(progress),
                                        ));
                                    }

                                    tracing::info!("Indexed file: {}", path);
                                }
                                Err(e) => {
                                    tracing::error!("Failed to read file for indexing: {}", e);
                                }
                            }
                        });
                    }
                    _ => {}
                }
                self.knowledge.handle_action(&knowledge);
            }
            Action::Graph(graph) => {
                self.handle_graph_action(graph);
            }
            Action::Learning(learning) => {
                self.handle_learning_action(learning);
            }
            Action::Settings(settings) => match settings {
                crate::action::SettingsAction::Open => {
                    self.open_settings_modal();
                }
                crate::action::SettingsAction::Close => {
                    self.settings_modal.close();
                    self.apply_settings_update_if_needed();
                }
            },
            Action::Resize { width, height } => {
                self.status.set_size(width, height);
            }
            Action::Tick => {
                let latest_settings = self.config_service.settings().clone();
                let configured_root = PathBuf::from(&latest_settings.workspace_path);
                if configured_root != self.workspace_root && configured_root.exists() {
                    self.apply_runtime_settings(&latest_settings);
                }
            }
            Action::Render => {
                // Trigger re-render (handled automatically in the loop)
            }
            Action::Quit => {
                self.should_quit = true;
            }
        }
    }

    /// Handle navigation actions
    fn handle_navigation(&mut self, nav: crate::action::NavigationAction) {
        match nav {
            crate::action::NavigationAction::FocusNext => {
                self.cycle_focus(true);
            }
            crate::action::NavigationAction::FocusPrev => {
                self.cycle_focus(false);
            }
            crate::action::NavigationAction::FocusMove(idx) => {
                self.focus_manager.focus_nth(idx);
            }
            crate::action::NavigationAction::FocusComponent(id) => {
                self.focus_component(id);
            }
        }

        self.refresh_link_preview_for_focus();
    }

    /// Handle file actions
    fn handle_file_action(&mut self, file: crate::action::FileAction) {
        match file {
            crate::action::FileAction::OpenCreateDialog { directory } => {
                self.open_create_dialog(directory);
            }
            crate::action::FileAction::OpenDeleteDialog(path) => {
                self.open_delete_dialog(path);
            }
            crate::action::FileAction::Select(path) => {
                self.editor.load_file(&path);
                self.sync_knowledge_panel();
                self.sync_graph_explorer_root_from_current_file();
                self.focus_component(ComponentId::Editor);
                self.clear_link_preview();
            }
            crate::action::FileAction::Create(name) => {
                let path = self.workspace_root.join(name);
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Err(error) = std::fs::write(&path, "") {
                    tracing::error!("Failed to create file {}: {}", path.display(), error);
                } else {
                    self.sidebar.reload();
                    self.editor.load_file(path.to_string_lossy().as_ref());
                    self.sync_knowledge_panel();
                    self.reload_workspace_index();
                    self.sync_graph_explorer_root_from_current_file();
                    self.focus_component(ComponentId::Editor);
                    self.clear_link_preview();
                }
            }
            crate::action::FileAction::Delete(path) => {
                self.sidebar.delete_file(&path);
                if self.editor.current_file().as_deref() == Some(path.as_str()) {
                    let fallback = self.workspace_root.join("notes.md");
                    self.editor.create_file(fallback.to_string_lossy().as_ref());
                    self.sync_knowledge_panel();
                    self.sync_graph_explorer_root_from_current_file();
                }
                self.reload_workspace_index();
                self.clear_link_preview();
            }
            crate::action::FileAction::Rename { old, new } => {
                self.sidebar.rename_file(&old, &new);
                if self.editor.current_file().as_deref() == Some(old.as_str()) {
                    self.editor.load_file(&new);
                    self.sync_knowledge_panel();
                    self.sync_graph_explorer_root_from_current_file();
                }
                self.reload_workspace_index();
                self.clear_link_preview();
            }
            crate::action::FileAction::Save => {
                if let Some(path) = self.editor.current_file() {
                    self.editor.save_file(&path);
                    self.reload_workspace_index();
                    self.clear_link_preview();
                }
            }
            crate::action::FileAction::SaveAll => {
                self.editor.save_all();
                self.reload_workspace_index();
                self.clear_link_preview();
            }
        }
    }

    fn handle_graph_action(&mut self, graph: crate::action::GraphAction) {
        match graph {
            crate::action::GraphAction::Open => {
                self.clear_link_preview();
                self.graph_explorer.open(self.graph_root_for_current_file());
            }
            crate::action::GraphAction::Close => {
                self.graph_explorer.close();
                self.refresh_link_preview_for_focus();
            }
            crate::action::GraphAction::SyncRootFromCurrentFile => {
                self.sync_graph_explorer_root_from_current_file();
            }
            crate::action::GraphAction::TogglePin => {
                self.graph_explorer.toggle_pin();
            }
            crate::action::GraphAction::MoveSelection(delta) => {
                self.graph_explorer.move_selection(delta);
            }
            crate::action::GraphAction::ExpandSelected => {
                if let Some(path) = self.graph_explorer.request_expand_selected() {
                    let children = self.workspace_index.graph_children_for_relative_path(&path);
                    self.graph_explorer.set_loaded_children(path, children);
                }
            }
            crate::action::GraphAction::CollapseSelected => {
                self.graph_explorer.collapse_selected();
            }
            crate::action::GraphAction::OpenSelected => {
                if let Some(path) = self.graph_explorer.selected_absolute_path() {
                    self.editor.load_file(&path);
                    if let Some(line_number) = self.graph_explorer.selected_line_number() {
                        self.editor
                            .set_cursor_position(line_number.saturating_sub(1), 0);
                    }
                    self.sync_knowledge_panel();
                    self.sync_graph_explorer_root_from_current_file();
                    self.focus_component(ComponentId::Editor);
                    self.clear_link_preview();
                }
            }
            crate::action::GraphAction::SetFilter(filter) => {
                self.graph_explorer.set_filter(filter);
            }
        }
    }

    fn current_editor_area(&self) -> Option<Rect> {
        let layout = Self::compute_layout(
            self.tui.size(),
            self.editor.has_content(),
            self.chat.is_open(),
            self.knowledge.is_open(),
        );
        layout.get("editor").copied()
    }

    fn current_preview_area(&self) -> Option<Rect> {
        let layout = Self::compute_layout(
            self.tui.size(),
            self.editor.has_content(),
            self.chat.is_open(),
            self.knowledge.is_open(),
        );
        layout.get("preview").copied()
    }

    fn preview_target_anchor(&self, area: Rect, hit: &PreviewHit) -> (u16, u16) {
        let visible_line = hit.line.saturating_sub(self.preview_scroll_offset);
        let max_x = area.width.saturating_sub(3) as usize;
        let x = area.x + 1 + hit.start_col.min(max_x) as u16;
        let y = area.y + 1 + visible_line.min(area.height.saturating_sub(3) as usize) as u16;
        (x, y)
    }

    fn sync_preview_navigation_to_editor(&mut self) {
        let Some(area) = self.current_preview_area() else {
            self.preview_selected_target = None;
            self.preview_scroll_offset = 0;
            self.clear_link_preview();
            return;
        };

        let hits = self.editor.preview_targets(area);
        let max_scroll = self.editor.preview_max_scroll(area);
        if self.preview_focus_follows_editor || self.preview_scroll_offset > max_scroll {
            self.preview_scroll_offset = self.editor.synced_preview_scroll(area).min(max_scroll);
        } else {
            self.preview_scroll_offset = self.preview_scroll_offset.min(max_scroll);
        }

        let current_link = self.editor.link_at_cursor();
        let current_block = self.editor.block_ref_at_cursor();
        self.preview_selected_target = if hits.is_empty() {
            None
        } else if let Some(link) = current_link {
            hits.iter().position(|hit| {
                hit.target == link.target
                    && matches!(
                        (hit.kind, link.kind),
                        (PreviewTargetKind::WikiLink, EditorLinkKind::Wiki)
                            | (PreviewTargetKind::MarkdownLink, EditorLinkKind::Markdown)
                            | (PreviewTargetKind::Image, EditorLinkKind::Image)
                    )
            })
        } else if let Some(block) = current_block {
            hits.iter()
                .position(|hit| hit.kind == PreviewTargetKind::BlockRef && hit.target == block.id)
        } else {
            hits.iter()
                .position(|hit| hit.line >= self.preview_scroll_offset)
                .or(Some(0))
        };

        self.ensure_preview_selection_visible();
        self.sync_preview_selection_overlay();
    }

    fn ensure_preview_selection_visible(&mut self) {
        let Some(area) = self.current_preview_area() else {
            return;
        };
        let Some(selected_index) = self.preview_selected_target else {
            return;
        };

        let hits = self.editor.preview_targets(area);
        let Some(hit) = hits.get(selected_index) else {
            self.preview_selected_target = None;
            return;
        };

        let body_height = area.height.saturating_sub(2) as usize;
        if hit.line < self.preview_scroll_offset {
            self.preview_scroll_offset = hit.line;
        } else if hit.line >= self.preview_scroll_offset + body_height {
            self.preview_scroll_offset = hit.line + 1 - body_height.max(1);
        }
        self.preview_scroll_offset = self
            .preview_scroll_offset
            .min(self.editor.preview_max_scroll(area));
    }

    fn sync_preview_selection_overlay(&mut self) {
        if self.focus_manager.focused() != ComponentId::Preview || self.has_modal_open() {
            return;
        }

        let Some(area) = self.current_preview_area() else {
            self.clear_link_preview();
            return;
        };

        let hits = self.editor.preview_targets(area);
        let Some(selected_index) = self.preview_selected_target else {
            self.clear_link_preview();
            return;
        };
        let Some(hit) = hits.get(selected_index) else {
            self.preview_selected_target = None;
            self.clear_link_preview();
            return;
        };

        self.link_preview = Some(LinkPreviewState {
            preview: self.preview_state_for_hit(hit),
            anchor: self.preview_target_anchor(area, hit),
        });
    }

    fn scroll_preview(&mut self, delta: i32) {
        let Some(area) = self.current_preview_area() else {
            return;
        };
        let max_scroll = self.editor.preview_max_scroll(area) as i32;
        let next = (self.preview_scroll_offset as i32 + delta).clamp(0, max_scroll);
        self.preview_scroll_offset = next as usize;

        let hits = self.editor.preview_targets(area);
        self.preview_selected_target = hits
            .iter()
            .position(|hit| hit.line >= self.preview_scroll_offset)
            .or_else(|| hits.len().checked_sub(1));
        self.sync_preview_selection_overlay();
    }

    fn move_preview_selection(&mut self, forward: bool) {
        let Some(area) = self.current_preview_area() else {
            return;
        };
        let hits = self.editor.preview_targets(area);
        if hits.is_empty() {
            self.preview_selected_target = None;
            self.clear_link_preview();
            return;
        }

        let next = match self.preview_selected_target {
            Some(current) if forward => (current + 1) % hits.len(),
            Some(current) if current == 0 => hits.len() - 1,
            Some(current) => current - 1,
            None if forward => 0,
            None => hits.len() - 1,
        };
        self.preview_selected_target = Some(next);
        self.ensure_preview_selection_visible();
        self.sync_preview_selection_overlay();
    }

    fn activate_selected_preview_target(&mut self) {
        let Some(area) = self.current_preview_area() else {
            return;
        };
        let hits = self.editor.preview_targets(area);
        let Some(selected_index) = self.preview_selected_target else {
            return;
        };
        let Some(hit) = hits.get(selected_index).cloned() else {
            return;
        };

        let anchor = self.preview_target_anchor(area, &hit);
        self.activate_preview_hit(hit, anchor);
    }

    fn show_cursor_preview(&mut self) {
        let Some(area) = self.current_editor_area() else {
            return;
        };

        if let Some(link) = self.editor.link_at_cursor() {
            if let Some(anchor) = self.editor.cursor_screen_position(area) {
                self.link_preview = Some(LinkPreviewState {
                    preview: self.editor_preview_state_for_link(&link),
                    anchor,
                });
            }
            return;
        }

        let Some(block_ref) = self.editor.block_ref_at_cursor() else {
            self.clear_link_preview();
            return;
        };
        let Some(anchor) = self.editor.cursor_screen_position(area) else {
            self.clear_link_preview();
            return;
        };

        let hit = PreviewHit {
            line: self.editor.cursor_line_number().saturating_sub(1),
            start_col: 0,
            end_col: 0,
            kind: PreviewTargetKind::BlockRef,
            target: block_ref.id,
            label: block_ref.content,
        };
        self.link_preview = Some(LinkPreviewState {
            preview: self.preview_state_for_hit(&hit),
            anchor,
        });
    }

    fn activate_cursor_target(&mut self) {
        if let Some(link) = self.editor.link_at_cursor() {
            let preview = self.editor_preview_state_for_link(&link);
            if !self.open_workspace_preview(preview.clone()) {
                self.show_cursor_preview();
            }
            return;
        }

        let Some(block_ref) = self.editor.block_ref_at_cursor() else {
            return;
        };

        self.editor.set_cursor_position(block_ref.line, 0);
        self.focus_component(ComponentId::Editor);
        self.clear_link_preview();
    }

    fn open_quit_dialog(&mut self) {
        self.clear_link_preview();
        self.confirm_dialog.open(
            self.language.translator().text(TextKey::ConfirmQuitTitle),
            self.language.translator().text(TextKey::ConfirmQuitMessage),
            self.language.translator().text(TextKey::ConfirmQuitWarning),
            self.language.translator().text(TextKey::ConfirmQuitButton),
            Action::Quit,
        );
    }

    fn point_in_rect(rect: Rect, x: u16, y: u16) -> bool {
        x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
    }

    /// Search markdown files in the current workspace.
    fn search_workspace(&self, query: &str) -> Vec<crate::action::SearchResult> {
        let is_regex = self.search.is_regex();
        let is_case_sensitive = self.search.is_case_sensitive();

        let regex = if is_regex {
            RegexBuilder::new(query)
                .case_insensitive(!is_case_sensitive)
                .build()
                .ok()
        } else {
            None
        };

        let normalized_query = if is_case_sensitive {
            query.to_string()
        } else {
            query.to_lowercase()
        };

        let mut results = Vec::new();
        self.search_directory(
            &self.workspace_root,
            &normalized_query,
            regex.as_ref(),
            is_case_sensitive,
            &mut results,
        );

        results.truncate(200);
        results
    }

    fn search_directory(
        &self,
        dir: &Path,
        normalized_query: &str,
        regex: Option<&regex::Regex>,
        is_case_sensitive: bool,
        results: &mut Vec<crate::action::SearchResult>,
    ) {
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(error) => {
                tracing::warn!("Failed to read directory {}: {}", dir.display(), error);
                return;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();
            let is_hidden = file_name
                .to_str()
                .map(|name| name.starts_with('.'))
                .unwrap_or(false);

            if is_hidden {
                continue;
            }

            if path.is_dir() {
                self.search_directory(&path, normalized_query, regex, is_case_sensitive, results);
                continue;
            }

            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }

            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };

            for (line_index, line) in content.lines().enumerate() {
                let is_match = if let Some(compiled) = regex {
                    compiled.is_match(line)
                } else if is_case_sensitive {
                    line.contains(normalized_query)
                } else {
                    line.to_lowercase().contains(normalized_query)
                };

                if is_match {
                    results.push(crate::action::SearchResult {
                        file_path: path.to_string_lossy().to_string(),
                        score: 1.0,
                        excerpt: line.trim().to_string(),
                        block_id: None,
                        line_number: Some(line_index + 1),
                    });
                }

                if results.len() >= 200 {
                    return;
                }
            }
        }
    }

    /// Handle learning actions
    fn handle_learning_action(&mut self, _learning: crate::action::LearningAction) {
        // Forward to learning component
    }

    /// Render all components
    fn render(&self, f: &mut Frame<'_>) {
        let has_content = self.editor.has_content();
        let chat_open = self.chat.is_open();
        let knowledge_open = self.knowledge.is_open();
        let layout = Self::compute_layout(f.area(), has_content, chat_open, knowledge_open);
        let components = Components {
            focused: self.focus_manager.focused(),
            editor_mode: self.editor_mode,
            sidebar: &self.sidebar,
            editor: &self.editor,
            search: &self.search,
            chat: &self.chat,
            knowledge: &self.knowledge,
            graph: &self.graph_explorer,
            status: &self.status,
            settings: &self.settings_modal,
            new_file: &self.new_file_dialog,
            confirm: &self.confirm_dialog,
            link_preview: self.link_preview.as_ref(),
            shortcut_profile: self.shortcut_profile,
            shortcut_help_open: self.shortcut_help_open,
            language: self.language,
        };
        let preview_scroll = layout
            .get("preview")
            .copied()
            .map(|area| {
                if components.focused == ComponentId::Preview {
                    self.preview_scroll_offset
                } else {
                    self.editor.synced_preview_scroll(area)
                }
            })
            .unwrap_or_else(|| self.editor.scroll_offset());
        Self::render_with_components(f, &layout, components, preview_scroll);
    }

    /// Render with components
    fn render_with_components(
        f: &mut Frame<'_>,
        layout: &std::collections::HashMap<String, ratatui::layout::Rect>,
        components: Components<'_>,
        preview_scroll: usize,
    ) {
        // Render sidebar
        if let Some(area) = layout.get("sidebar") {
            components.sidebar.render(f, *area);
        }

        if let Some(area) = layout.get("title_bar") {
            Self::render_title_bar(
                f,
                *area,
                components.editor,
                components.focused == ComponentId::Editor,
                components.language,
            );
        }

        // Render editor
        if let Some(area) = layout.get("editor") {
            components.editor.render(f, *area);
        }

        // Render preview
        if let Some(area) = layout.get("preview") {
            components.editor.render_preview(f, *area, preview_scroll);
        }

        // Render chat
        if let Some(area) = layout.get("chat") {
            components.chat.render(f, *area);
        }

        // Render knowledge panel
        if let Some(area) = layout.get("knowledge") {
            components.knowledge.render(f, *area);
        }

        Self::render_focus_highlight(f, layout, components.focused);

        // Render search overlay
        if components.search.is_open() {
            if let Some(area) = layout.get("search") {
                components.search.render(f, *area);
            }
        }

        // Render status bar
        if let Some(area) = layout.get("status") {
            components.status.render(f, *area);
        }

        if components.graph.is_open() {
            components.graph.render(f, f.area());
        }

        if let Some(preview) = components.link_preview {
            if !components.settings.is_open()
                && !components.graph.is_open()
                && !components.new_file.is_open()
                && !components.confirm.is_open()
                && !components.shortcut_help_open
            {
                Self::render_link_preview(f, f.area(), preview);
            }
        }

        // Render settings modal
        if components.settings.is_open() {
            components.settings.render(f, f.area());
        }

        if components.new_file.is_open() {
            components.new_file.render(f, f.area());
        }

        if components.confirm.is_open() {
            components.confirm.render(f, f.area());
        }

        if !components.settings.is_open()
            && !components.graph.is_open()
            && !components.new_file.is_open()
            && !components.confirm.is_open()
            && components.shortcut_help_open
        {
            Self::render_shortcut_help(
                f,
                f.area(),
                components.shortcut_profile,
                components.language,
            );
        }

        if !components.settings.is_open()
            && !components.graph.is_open()
            && !components.new_file.is_open()
            && !components.confirm.is_open()
            && !components.shortcut_help_open
        {
            Self::render_focus_cursor(f, layout, &components);
        }
    }

    fn render_link_preview(f: &mut Frame<'_>, screen: Rect, state: &LinkPreviewState) {
        let max_body_width = state
            .preview
            .body
            .iter()
            .map(|line| line.chars().count())
            .max()
            .unwrap_or(0);
        let title_width = state.preview.title.chars().count();
        let subtitle_width = state.preview.subtitle.chars().count();
        let content_width = max_body_width.max(title_width).max(subtitle_width);
        let width = (content_width as u16 + 4)
            .max(28)
            .min(54)
            .min(screen.width.saturating_sub(2).max(1));
        let height = (state.preview.body.len() as u16 + 4)
            .max(6)
            .min(screen.height.saturating_sub(2).max(1));

        let mut x = state.anchor.0.saturating_add(2);
        if x + width >= screen.width {
            x = state
                .anchor
                .0
                .saturating_sub(width.saturating_add(1))
                .max(1);
        }

        let mut y = state.anchor.1.saturating_add(1);
        if y + height >= screen.height.saturating_sub(1) {
            y = state
                .anchor
                .1
                .saturating_sub(height.saturating_add(1))
                .max(1);
        }

        let area = Rect::new(
            x.min(screen.width.saturating_sub(width)),
            y.min(screen.height.saturating_sub(height)),
            width,
            height,
        );

        let border = if state.preview.resolved {
            Color::Rgb(35, 134, 54)
        } else {
            Color::Rgb(218, 54, 51)
        };
        let block = Block::default()
            .title(format!(" {} ", state.preview.title))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border))
            .style(Style::default().bg(Color::Rgb(15, 20, 28)));

        let subtitle = match state.preview.line_number {
            Some(line) => format!("{}:{}", state.preview.subtitle, line),
            None => state.preview.subtitle.clone(),
        };

        let mut lines = vec![
            Line::from(Span::styled(
                subtitle,
                Style::default().fg(Color::Rgb(139, 148, 158)),
            )),
            Line::from(""),
        ];
        lines.extend(state.preview.body.iter().map(|line| {
            Line::from(Span::styled(
                line.clone(),
                Style::default().fg(Color::Rgb(201, 209, 217)),
            ))
        }));

        f.render_widget(Clear, area);
        f.render_widget(Paragraph::new(lines).block(block), area);
    }

    fn render_focus_highlight(
        f: &mut Frame<'_>,
        layout: &std::collections::HashMap<String, ratatui::layout::Rect>,
        focused: ComponentId,
    ) {
        let Some(area) = (match focused {
            ComponentId::Sidebar => layout.get("sidebar").copied(),
            ComponentId::Editor => layout.get("editor").copied(),
            ComponentId::Preview => layout.get("preview").copied(),
            ComponentId::Chat => layout.get("chat").copied(),
            ComponentId::Knowledge => layout.get("knowledge").copied(),
            _ => None,
        }) else {
            return;
        };

        let borders = match focused {
            ComponentId::Chat => Borders::LEFT | Borders::RIGHT | Borders::BOTTOM,
            _ => Borders::ALL,
        };
        let highlight = Block::default()
            .borders(borders)
            .border_style(Style::default().fg(Color::Rgb(88, 166, 255)));
        f.render_widget(highlight, area);
    }

    fn render_focus_cursor(
        f: &mut Frame<'_>,
        layout: &std::collections::HashMap<String, ratatui::layout::Rect>,
        components: &Components<'_>,
    ) {
        match components.focused {
            ComponentId::Editor => {
                if let Some(area) = layout.get("editor").copied() {
                    if components.editor_mode != EditorMode::Preview {
                        if let Some((x, y)) = components.editor.cursor_screen_position(area) {
                            f.set_cursor_position((x, y));
                        }
                    }
                }
            }
            ComponentId::Preview => {
                if let Some(area) = layout.get("preview").copied() {
                    let label = Line::from(vec![Span::styled(
                        format!(
                            " {} ",
                            components
                                .language
                                .translator()
                                .text(TextKey::AppKeyboardPreview)
                        ),
                        Style::default().fg(Color::Rgb(88, 166, 255)),
                    )]);
                    f.render_widget(Paragraph::new(label), Rect::new(area.x + 2, area.y, 20, 1));
                }
            }
            ComponentId::Chat => {
                if let Some(area) = layout.get("chat").copied() {
                    if let Some((x, y)) = components.chat.input_cursor_screen_position(area) {
                        f.set_cursor_position((x, y));
                    }
                }
            }
            _ => {}
        }
    }

    fn render_shortcut_help(
        f: &mut Frame<'_>,
        screen: Rect,
        profile: ShortcutProfile,
        language: Language,
    ) {
        let width = {
            let available = screen.width.saturating_sub(2);
            if available >= 40 {
                available.min(56)
            } else {
                available.max(1)
            }
        };
        let height = {
            let available = screen.height.saturating_sub(2);
            if available >= 12 {
                available.min(16)
            } else {
                available.max(1)
            }
        };
        let area = Rect::new(
            screen.x + screen.width.saturating_sub(width) / 2,
            screen.y + screen.height.saturating_sub(height) / 2,
            width,
            height,
        );
        let lines = language
            .translator()
            .shortcut_help_lines(profile)
            .into_iter()
            .map(Line::from)
            .collect::<Vec<_>>();

        f.render_widget(Clear, area);
        f.render_widget(
            Paragraph::new(lines).block(
                Block::default()
                    .title(format!(
                        " {} ",
                        language.translator().text(TextKey::AppShortcutHelpTitle)
                    ))
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(Color::Rgb(88, 166, 255)))
                    .style(Style::default().bg(Color::Rgb(15, 20, 28))),
            ),
            area,
        );
    }

    fn render_title_bar(
        f: &mut Frame<'_>,
        area: ratatui::layout::Rect,
        editor: &Editor,
        focused: bool,
        language: Language,
    ) {
        let file_name = editor.current_file_name();
        let status_fill = if editor.is_modified() {
            Color::Rgb(218, 54, 51)
        } else {
            Color::Rgb(35, 134, 54)
        };
        let status_text = if editor.is_modified() {
            language.translator().text(TextKey::TitleModified)
        } else {
            language.translator().text(TextKey::TitleSaved)
        };

        let line = Line::from(vec![
            Span::styled(
                format!(" {} ", file_name),
                Style::default().fg(Color::Rgb(201, 209, 217)),
            ),
            Span::raw("  "),
            Span::styled(
                format!(" {} ", status_text),
                Style::default().bg(status_fill).fg(Color::White),
            ),
        ]);

        let title_bar = Paragraph::new(line).block(Block::default()).style(
            Style::default()
                .bg(if focused {
                    Color::Rgb(24, 32, 46)
                } else {
                    Color::Rgb(22, 27, 34)
                })
                .fg(Color::White),
        );
        f.render_widget(title_bar, area);
    }

    /// Compute the layout based on terminal size
    fn compute_layout(
        area: ratatui::layout::Rect,
        has_content: bool,
        chat_open: bool,
        knowledge_open: bool,
    ) -> std::collections::HashMap<String, ratatui::layout::Rect> {
        use ratatui::layout::{Constraint, Constraint::*, Direction, Layout};

        let mut layout = std::collections::HashMap::new();

        // Status bar at bottom
        let status_height = 1;
        let knowledge_height = if knowledge_open { 20 } else { 0 };
        let main_area = ratatui::layout::Rect::new(
            area.x,
            area.y,
            area.width,
            area.height - status_height - knowledge_height,
        );

        // Calculate chat panel width (0 if not open)
        let chat_width = if chat_open { 40 } else { 0 };

        // Main layout: sidebar (20%) + main content (80% - chat if open)
        let sidebar_width = (area.width - chat_width) * 20 / 100;
        let content_width = area.width - chat_width - sidebar_width;

        let main_split = Layout::new(
            Direction::Horizontal,
            [
                Constraint::Length(sidebar_width),
                Constraint::Length(content_width),
            ],
        )
        .split(main_area);

        // Sidebar
        layout.insert("sidebar".to_string(), main_split[0]);

        // Main content area: title bar + editor/preview body
        let content_area = main_split[1];
        let content_split = Layout::new(
            Direction::Vertical,
            [Constraint::Length(1), Constraint::Min(1)],
        )
        .split(content_area);
        layout.insert("title_bar".to_string(), content_split[0]);
        let content_body = content_split[1];

        // Check if we should show preview
        if has_content {
            let content_split =
                Layout::new(Direction::Horizontal, [Percentage(58), Percentage(42)])
                    .split(content_body);

            layout.insert("editor".to_string(), content_split[0]);
            layout.insert("preview".to_string(), content_split[1]);
        } else {
            layout.insert("editor".to_string(), content_body);
        }

        // Status bar at bottom
        let status_area = ratatui::layout::Rect::new(
            area.x,
            area.height - status_height,
            area.width,
            status_height,
        );
        layout.insert("status".to_string(), status_area);

        // Chat panel (on right side, only if open)
        if chat_open {
            let chat_area = ratatui::layout::Rect::new(
                area.width - chat_width,
                0,
                chat_width,
                area.height - status_height - knowledge_height,
            );
            layout.insert("chat".to_string(), chat_area);
        }

        // Knowledge panel (bottom, only if open)
        if knowledge_open {
            let knowledge_area = ratatui::layout::Rect::new(
                area.x,
                area.height - status_height - knowledge_height,
                area.width,
                knowledge_height,
            );
            layout.insert("knowledge".to_string(), knowledge_area);
        }

        // Search overlay (centered)
        let search_width = 60;
        let search_height = 20;
        let search_area = ratatui::layout::Rect::new(
            (area.width - search_width) / 2,
            (area.height - search_height) / 2,
            search_width,
            search_height,
        );
        layout.insert("search".to_string(), search_area);

        layout
    }
}

pub mod focus {
    use crate::action::ComponentId;

    /// Focus manager for handling component focus
    pub struct FocusManager {
        components: Vec<ComponentId>,
        current_index: usize,
    }

    impl FocusManager {
        pub fn new() -> Self {
            Self {
                components: vec![
                    ComponentId::Sidebar,
                    ComponentId::Editor,
                    ComponentId::Preview,
                    ComponentId::Chat,
                    ComponentId::Knowledge,
                ],
                current_index: 0,
            }
        }

        pub fn focused(&self) -> ComponentId {
            self.components[self.current_index].clone()
        }

        pub fn set_focus(&mut self, id: ComponentId) {
            if let Some(idx) = self.components.iter().position(|&c| c == id) {
                self.current_index = idx;
            }
        }

        pub fn focus_next(&mut self) {
            self.current_index = (self.current_index + 1) % self.components.len();
        }

        pub fn focus_prev(&mut self) {
            if self.current_index == 0 {
                self.current_index = self.components.len() - 1;
            } else {
                self.current_index -= 1;
            }
        }

        pub fn focus_nth(&mut self, n: usize) {
            if n < self.components.len() {
                self.current_index = n;
            }
        }
    }
}
