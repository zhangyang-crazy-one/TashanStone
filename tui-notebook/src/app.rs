//! Main application structure and event loop
//!
//! Implements the TEA (The Elm Architecture) pattern with component-based architecture.

use anyhow::Result;
use crossterm::event::{Event as CrosstermEvent, KeyEvent, MouseEvent};
use ratatui::Frame;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};

pub use crate::action::{Action, ComponentId, ChatAction};
use crate::components::{chat::ChatPanel, editor::Editor, knowledge::KnowledgePanel, search::SearchPanel, sidebar::Sidebar, status::StatusBar, Component};
use crate::services::ai::{AiService, ChatMessage, MessageRole};
use crate::services::vector::VectorService;
use crate::theme::ThemeManager;
use crate::tui::Tui;
use crate::app::focus::FocusManager;
use std::sync::Arc;

/// Container for all UI components (to separate borrows)
struct Components<'a> {
    sidebar: &'a Sidebar,
    editor: &'a Editor,
    search: &'a SearchPanel,
    chat: &'a ChatPanel,
    knowledge: &'a KnowledgePanel,
    status: &'a StatusBar,
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
    status: StatusBar,

    /// Focus management
    focus_manager: FocusManager,

    /// AI service
    ai_service: AiService,

    /// Vector service for knowledge base
    vector_service: Arc<VectorService>,

    /// Theme manager
    theme_manager: ThemeManager,

    /// Shared scroll offset for synchronized scrolling
    scroll_offset: usize,

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
            status: StatusBar::new(),
            focus_manager: focus::FocusManager::new(),
            ai_service: AiService::new(),
            vector_service: Arc::new(VectorService::new()),
            theme_manager: ThemeManager::new(),
            scroll_offset: 0,
            should_quit: false,
            action_tx,
            action_rx,
        };

        // Initialize components
        app.sidebar.init();
        app.editor.init();
        app.search.init();
        app.chat.init();
        app.knowledge.init();
        app.status.init();

        // Set initial focus
        app.focus_manager.set_focus(ComponentId::Sidebar);

        Ok(app)
    }

    /// Run the main event loop
    pub fn run(&mut self) -> Result<()> {
        self.tui.enter()?;

        // Spawn async event handler
        let action_tx = self.action_tx.clone();
        tokio::spawn(async move {
            Self::async_event_loop(action_tx).await;
        });

        // Main render loop
        loop {
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

            // Sync scroll offset to editor for synchronized scrolling
            self.editor.set_scroll_offset(self.scroll_offset);

            let layout = Self::compute_layout(size, has_content, chat_open, knowledge_open);
            let components = Components {
                sidebar: &self.sidebar,
                editor: &self.editor,
                search: &self.search,
                chat: &self.chat,
                knowledge: &self.knowledge,
                status: &self.status,
            };
            self.tui.draw(|f| {
                Self::render_with_components(f, &layout, components);
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

    /// Handle key events
    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        // Global shortcuts
        match (key.modifiers, key.code) {
            // Quit
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Char('c')) => {
                return Some(Action::Quit);
            }
            // Tab to cycle focus
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Tab) => {
                return Some(Action::Navigation(crate::action::NavigationAction::FocusNext));
            }
            // Shift+Tab to cycle focus backwards
            (crossterm::event::KeyModifiers::SHIFT, crossterm::event::KeyCode::Tab) => {
                return Some(Action::Navigation(crate::action::NavigationAction::FocusPrev));
            }
            // Search
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Char('f')) => {
                return Some(Action::Search(crate::action::SearchAction::Open));
            }
            // Save
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Char('s')) => {
                return Some(Action::File(crate::action::FileAction::Save));
            }
            // Toggle chat panel
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Char('k')) => {
                self.chat.toggle();
                return None;
            }
            // Toggle knowledge panel
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Char('l')) => {
                self.knowledge.toggle();
                return None;
            }
            // Toggle theme
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Char('t')) => {
                self.theme_manager.toggle();
                return None;
            }
            // Index current file
            (crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::SHIFT, crossterm::event::KeyCode::Char('k')) => {
                if let Some(path) = self.editor.current_file() {
                    self.handle_action(Action::Knowledge(crate::action::KnowledgeAction::Index(path)));
                }
                return None;
            }
            // Scroll up
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Up) => {
                self.scroll_offset = self.scroll_offset.saturating_sub(3);
                return None;
            }
            // Scroll down
            (crossterm::event::KeyModifiers::CONTROL, crossterm::event::KeyCode::Down) => {
                self.scroll_offset += 3;
                return None;
            }
            _ => {}
        }

        // Pass to focused component
        let focused = self.focus_manager.focused();
        match focused {
            ComponentId::Sidebar => self.sidebar.handle_key_event(key),
            ComponentId::Editor => self.editor.handle_key_event(key),
            ComponentId::Chat => self.chat.handle_key_event(key),
            ComponentId::Search => self.search.handle_key_event(key),
            _ => None,
        }
    }

    /// Handle mouse events
    fn handle_mouse_event(&mut self, mouse: MouseEvent) -> Option<Action> {
        // Handle mouse wheel scrolling
        if let crossterm::event::MouseEventKind::ScrollUp = mouse.kind {
            self.scroll_offset = self.scroll_offset.saturating_sub(3);
            return None;
        }
        if let crossterm::event::MouseEventKind::ScrollDown = mouse.kind {
            self.scroll_offset += 3;
            return None;
        }

        // Handle click to focus components
        if matches!(mouse.kind, crossterm::event::MouseEventKind::Down(_)) {
            let size = self.tui.size();
            let has_content = self.editor.has_content();
            let chat_open = self.chat.is_open();
            let knowledge_open = self.knowledge.is_open();
            let layout = Self::compute_layout(size, has_content, chat_open, knowledge_open);

            let mouse_x = mouse.column;
            let mouse_y = mouse.row;

            // Check which component was clicked
            if let Some(area) = layout.get("sidebar") {
                if mouse_x >= area.x && mouse_x < area.x + area.width
                    && mouse_y >= area.y && mouse_y < area.y + area.height {
                    return Some(Action::Navigation(
                        crate::action::NavigationAction::FocusComponent(ComponentId::Sidebar)
                    ));
                }
            }

            if let Some(area) = layout.get("editor") {
                if mouse_x >= area.x && mouse_x < area.x + area.width
                    && mouse_y >= area.y && mouse_y < area.y + area.height {
                    return Some(Action::Navigation(
                        crate::action::NavigationAction::FocusComponent(ComponentId::Editor)
                    ));
                }
            }

            if self.chat.is_open() {
                if let Some(area) = layout.get("chat") {
                    if mouse_x >= area.x && mouse_x < area.x + area.width
                        && mouse_y >= area.y && mouse_y < area.y + area.height {
                        return Some(Action::Navigation(
                            crate::action::NavigationAction::FocusComponent(ComponentId::Chat)
                        ));
                    }
                }
            }
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
                self.editor.handle_action(&editor);
            }
            Action::Search(search) => {
                self.search.handle_action(&search);
            }
            Action::Chat(chat) => {
                match &chat {
                    ChatAction::Send(msg) => {
                        // Get current chat model config
                        let model_config = self.chat.get_model_config();
                        let user_message = msg.clone();

                        // Build messages from chat history
                        let mut messages: Vec<ChatMessage> = self.chat.get_messages()
                            .iter()
                            .map(|m| ChatMessage {
                                role: match m.role {
                                    crate::components::chat::MessageRole::User => MessageRole::User,
                                    crate::components::chat::MessageRole::Assistant => MessageRole::Assistant,
                                    crate::components::chat::MessageRole::System => MessageRole::System,
                                },
                                content: m.content.clone(),
                            })
                            .collect();

                        // Search knowledge base for context
                        let vector_service = Arc::clone(&self.vector_service);
                        let action_tx = self.action_tx.clone();

                        // Spawn async task for AI call with RAG
                        tokio::spawn(async move {
                            // Search knowledge base for relevant context
                            let context = match vector_service.search(&user_message, 5).await {
                                Ok(results) if !results.is_empty() => {
                                    let context_text: String = results
                                        .iter()
                                        .map(|r| format!("From {}:\n{}\n---\n", r.file_path, r.content))
                                        .collect();
                                    Some(context_text)
                                }
                                _ => None,
                            };

                            // Build final message with context
                            let final_message = if let Some(ctx) = context {
                                format!("Context from knowledge base:\n{}\n\nUser question: {}", ctx, user_message)
                            } else {
                                user_message
                            };

                            // Create messages with context included
                            let mut final_messages = messages;
                            final_messages.push(ChatMessage {
                                role: MessageRole::User,
                                content: final_message,
                            });

                            let ai_service = AiService::with_config(model_config);
                            match ai_service.chat(final_messages).await {
                                Ok(response) => {
                                    let _ = action_tx.send(Action::Chat(ChatAction::StreamResponse(response.content)));
                                }
                                Err(e) => {
                                    tracing::error!("AI chat error: {}", e);
                                    let _ = action_tx.send(Action::Chat(ChatAction::StreamResponse(format!("Error: {}", e))));
                                }
                            }
                        });
                        self.chat.handle_action(&chat);
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
                                        })
                                        .collect();
                                    let _ = action_tx.send(Action::Knowledge(
                                        crate::action::KnowledgeAction::SearchResults(search_results)
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
                                        vector_service.add_chunks(&path, vec![chunk_with_path]).await;

                                        let progress = (i + 1) as f32 / total as f32;
                                        let _ = action_tx.send(Action::Knowledge(
                                            crate::action::KnowledgeAction::IndexProgress(progress)
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
            Action::Learning(learning) => {
                self.handle_learning_action(learning);
            }
            Action::Resize { width, height } => {
                self.status.set_size(width, height);
            }
            Action::Tick => {
                // Handle tick for animations, blinking cursors, etc.
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
                self.focus_manager.focus_next();
            }
            crate::action::NavigationAction::FocusPrev => {
                self.focus_manager.focus_prev();
            }
            crate::action::NavigationAction::FocusMove(idx) => {
                self.focus_manager.focus_nth(idx);
            }
            crate::action::NavigationAction::FocusComponent(id) => {
                self.focus_manager.set_focus(id);
            }
        }
    }

    /// Handle file actions
    fn handle_file_action(&mut self, file: crate::action::FileAction) {
        match file {
            crate::action::FileAction::Select(path) => {
                self.editor.load_file(&path);
            }
            crate::action::FileAction::Create(name) => {
                self.editor.create_file(&name);
            }
            crate::action::FileAction::Delete(path) => {
                self.sidebar.delete_file(&path);
            }
            crate::action::FileAction::Rename { old, new } => {
                self.sidebar.rename_file(&old, &new);
            }
            crate::action::FileAction::Save => {
                if let Some(path) = self.editor.current_file() {
                    self.editor.save_file(&path);
                }
            }
            crate::action::FileAction::SaveAll => {
                self.editor.save_all();
            }
        }
    }

    /// Handle learning actions
    fn handle_learning_action(&mut self, learning: crate::action::LearningAction) {
        // Forward to learning component
    }

    /// Render all components
    fn render(&self, f: &mut Frame<'_>) {
        let has_content = self.editor.has_content();
        let chat_open = self.chat.is_open();
        let knowledge_open = self.knowledge.is_open();
        let layout = Self::compute_layout(f.size(), has_content, chat_open, knowledge_open);
        let components = Components {
            sidebar: &self.sidebar,
            editor: &self.editor,
            search: &self.search,
            chat: &self.chat,
            knowledge: &self.knowledge,
            status: &self.status,
        };
        Self::render_with_components(f, &layout, components);
    }

    /// Render with components
    fn render_with_components(f: &mut Frame<'_>, layout: &std::collections::HashMap<String, ratatui::layout::Rect>, components: Components<'_>) {
        // Render sidebar
        if let Some(area) = layout.get("sidebar") {
            components.sidebar.render(f, *area);
        }

        // Render editor
        if let Some(area) = layout.get("editor") {
            components.editor.render(f, *area);
        }

        // Render preview
        if let Some(area) = layout.get("preview") {
            components.editor.render_preview(f, *area);
        }

        // Render chat
        if let Some(area) = layout.get("chat") {
            components.chat.render(f, *area);
        }

        // Render knowledge panel
        if let Some(area) = layout.get("knowledge") {
            components.knowledge.render(f, *area);
        }

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
    }

    /// Compute the layout based on terminal size
    fn compute_layout(area: ratatui::layout::Rect, has_content: bool, chat_open: bool, knowledge_open: bool) -> std::collections::HashMap<String, ratatui::layout::Rect> {
        use ratatui::layout::{Constraint, Direction, Layout, Direction::*, Constraint::*};

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

        let main_split = Layout::new(Direction::Horizontal, [
            Constraint::Length(sidebar_width),
            Constraint::Length(content_width),
        ])
        .split(main_area);

        // Sidebar
        layout.insert("sidebar".to_string(), main_split[0]);

        // Main content area: editor (50%) + preview (50%) or full editor
        let content_area = main_split[1];

        // Check if we should show preview
        if has_content {
            let content_split = Layout::new(Direction::Horizontal, [
                Percentage(50),
                Percentage(50),
            ])
            .split(content_area);

            layout.insert("editor".to_string(), content_split[0]);
            layout.insert("preview".to_string(), content_split[1]);
        } else {
            layout.insert("editor".to_string(), content_area);
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
