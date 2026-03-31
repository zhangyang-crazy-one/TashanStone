//! Chat component - AI conversation panel

use crate::action::{Action, ChatAction, ChatModel, ComponentId, NavigationAction};
use crate::i18n::{Language, TextKey};
use crate::services::ai::{AiProvider, ModelConfig};
use crate::services::config::ConfigService;
use chrono::{DateTime, Utc};
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    symbols::border,
    text::{Line, Span, Text},
    widgets::{Block, Borders, Clear, Padding, Paragraph, Wrap},
    Frame,
};
use ropey::Rope;
use std::collections::VecDeque;
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};
use uuid::Uuid;

const CHAT_HISTORY_LIMIT: usize = 100;
const COMPACT_KEEP_RECENT: usize = 4;
const MAX_VISIBLE_INPUT_LINES: usize = 4;

/// Chat message
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

/// Message role
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone)]
struct ChatBubbleSpec {
    role: MessageRole,
    content: String,
    width: u16,
    height: u16,
    align_right: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum SessionStatus {
    Idle,
    Searching,
    Streaming,
    Cancelled,
    Error(String),
}

#[derive(Debug, Clone)]
struct ChatSession {
    id: String,
    title: String,
    messages: VecDeque<ChatMessage>,
    is_streaming: bool,
    status: SessionStatus,
}

impl ChatSession {
    fn main(language: Language) -> Self {
        Self {
            id: "main".to_string(),
            title: ChatPanel::main_session_title(language),
            messages: VecDeque::with_capacity(CHAT_HISTORY_LIMIT),
            is_streaming: false,
            status: SessionStatus::Idle,
        }
    }
}

/// Chat panel state
pub struct ChatPanel {
    sessions: Vec<ChatSession>,
    active_session_index: usize,
    input_buffer: Rope,
    model: ChatModel,
    is_open: bool,
    language: Language,
    session_policy: String,
    streaming_enabled: bool,
}

impl ChatPanel {
    pub fn new() -> Self {
        let language = Language::En;
        Self {
            sessions: vec![ChatSession::main(language)],
            active_session_index: 0,
            input_buffer: Rope::new(),
            model: ChatModel::Gemini {
                model: "gemini-2.0-flash".to_string(),
            },
            is_open: false,
            language,
            session_policy: "main_and_isolated".to_string(),
            streaming_enabled: true,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
        if let Some(main) = self.sessions.first_mut() {
            main.title = Self::main_session_title(language);
        }
    }

    pub fn set_runtime_preferences(&mut self, session_policy: String, streaming_enabled: bool) {
        self.session_policy = session_policy;
        self.streaming_enabled = streaming_enabled;
        if !self.sessions_enabled() && self.sessions.len() > 1 {
            self.sessions.truncate(1);
            self.active_session_index = 0;
        }
    }

    pub fn streaming_enabled(&self) -> bool {
        self.streaming_enabled
    }

    /// Check if chat panel is open
    pub fn is_open(&self) -> bool {
        self.is_open
    }

    /// Toggle chat panel visibility
    pub fn toggle(&mut self) {
        self.is_open = !self.is_open;
    }

    pub fn insert_text(&mut self, text: &str) {
        let pos = self.input_buffer.len_chars();
        self.input_buffer.insert(pos, text);
    }

    pub fn active_session_id(&self) -> String {
        self.active_session().id.clone()
    }

    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    pub fn session_ids(&self) -> Vec<String> {
        self.sessions.iter().map(|session| session.id.clone()).collect()
    }

    pub fn active_session_label(&self) -> String {
        self.active_session().title.clone()
    }

    pub fn active_message_count(&self) -> usize {
        self.active_session().messages.len()
    }

    pub fn runtime_status_label(&self) -> String {
        self.localized_status(&self.active_session().status)
    }

    pub fn input_value(&self) -> String {
        self.input_buffer.to_string()
    }

    pub fn get_messages_for_session(&self, session_id: &str) -> VecDeque<ChatMessage> {
        self.session(session_id)
            .map(|session| session.messages.clone())
            .unwrap_or_default()
    }

    pub fn session_contents(&self, session_id: &str) -> Vec<String> {
        self.session(session_id)
            .map(|session| {
                session
                    .messages
                    .iter()
                    .map(|message| message.content.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn session_roles(&self, session_id: &str) -> Vec<MessageRole> {
        self.session(session_id)
            .map(|session| session.messages.iter().map(|message| message.role).collect())
            .unwrap_or_default()
    }

    pub fn get_messages(&self) -> &VecDeque<ChatMessage> {
        &self.active_session().messages
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        if matches!(key.code, KeyCode::Enter) && key.modifiers.contains(KeyModifiers::SHIFT) {
            self.insert_text("\n");
            return None;
        }

        if key.modifiers.contains(KeyModifiers::CONTROL) {
            match key.code {
                KeyCode::Char('n') | KeyCode::Char('N') if self.sessions_enabled() => {
                    return Some(Action::Chat(ChatAction::CreateSession));
                }
                KeyCode::Char('l') | KeyCode::Char('L') => {
                    return Some(Action::Chat(ChatAction::Clear {
                        session_id: self.active_session_id(),
                    }));
                }
                KeyCode::Char('b') | KeyCode::Char('B') => {
                    return Some(Action::Chat(ChatAction::Compact {
                        session_id: self.active_session_id(),
                    }));
                }
                KeyCode::Char('.') if self.active_session().is_streaming => {
                    return Some(Action::Chat(ChatAction::Cancel {
                        session_id: self.active_session_id(),
                    }));
                }
                _ => {}
            }
        }

        if key.modifiers.contains(KeyModifiers::ALT) {
            match key.code {
                KeyCode::Char(',') if self.sessions_enabled() => {
                    return Some(Action::Chat(ChatAction::SelectPrevSession));
                }
                KeyCode::Char('.') if self.sessions_enabled() => {
                    return Some(Action::Chat(ChatAction::SelectNextSession));
                }
                _ => {}
            }
        }

        match key.code {
            KeyCode::Enter => {
                if self.active_session().is_streaming {
                    return None;
                }

                let input = self.input_buffer.to_string();
                if !input.trim().is_empty() {
                    let session_id = self.active_session_id();
                    self.add_message_to_session(&session_id, MessageRole::User, input.clone());
                    if let Some(session) = self.session_mut(&session_id) {
                        session.is_streaming = true;
                        session.status = SessionStatus::Searching;
                    }
                    self.input_buffer = Rope::new();
                    return Some(Action::Chat(ChatAction::Send {
                        session_id,
                        message: input,
                    }));
                }
            }
            KeyCode::Char(c)
                if key.modifiers.is_empty() || key.modifiers == KeyModifiers::SHIFT =>
            {
                let pos = self.input_buffer.len_chars();
                self.input_buffer.insert(pos, c.to_string().as_str());
            }
            KeyCode::Backspace => {
                if self.input_buffer.len_chars() > 0 {
                    let pos = self.input_buffer.len_chars() - 1;
                    self.input_buffer.remove(pos..pos + 1);
                }
            }
            KeyCode::Esc => {
                self.is_open = false;
                return Some(Action::Navigation(NavigationAction::FocusComponent(
                    ComponentId::Editor,
                )));
            }
            _ => {}
        }
        None
    }

    /// Handle an action
    pub fn handle_action(&mut self, action: &ChatAction) {
        match action {
            ChatAction::Send { .. } | ChatAction::LoadHistory => {}
            ChatAction::CreateSession => {
                if self.sessions_enabled() {
                    self.create_session();
                }
            }
            ChatAction::SelectNextSession => {
                self.cycle_session(true);
            }
            ChatAction::SelectPrevSession => {
                self.cycle_session(false);
            }
            ChatAction::StreamStarted { session_id } => {
                if let Some(session) = self.session_mut(session_id) {
                    session.is_streaming = true;
                    session.status = SessionStatus::Streaming;
                }
            }
            ChatAction::StreamResponse { session_id, chunk } => {
                if let Some(session) = self.session_mut(session_id) {
                    if !session.is_streaming {
                        session.is_streaming = true;
                    }
                    session.status = SessionStatus::Streaming;
                    if let Some(last) = session.messages.back_mut() {
                        if matches!(last.role, MessageRole::Assistant) {
                            last.content.push_str(chunk);
                            return;
                        }
                    }

                    session.messages.push_back(ChatMessage {
                        role: MessageRole::Assistant,
                        content: chunk.clone(),
                        timestamp: Utc::now(),
                    });
                    Self::trim_history(&mut session.messages);
                }
            }
            ChatAction::StreamFinished { session_id } => {
                if let Some(session) = self.session_mut(session_id) {
                    if session.is_streaming {
                        session.is_streaming = false;
                        session.status = SessionStatus::Idle;
                    }
                }
            }
            ChatAction::StreamFailed { session_id, error } => {
                if let Some(session) = self.session_mut(session_id) {
                    session.is_streaming = false;
                    session.status = SessionStatus::Error(error.clone());
                    session.messages.push_back(ChatMessage {
                        role: MessageRole::System,
                        content: format!("Error: {error}"),
                        timestamp: Utc::now(),
                    });
                    Self::trim_history(&mut session.messages);
                }
            }
            ChatAction::Cancel { session_id } => {
                if let Some(session) = self.session_mut(session_id) {
                    session.is_streaming = false;
                    session.status = SessionStatus::Cancelled;
                }
            }
            ChatAction::Clear { session_id } => {
                if let Some(session) = self.session_mut(session_id) {
                    session.messages.clear();
                    session.is_streaming = false;
                    session.status = SessionStatus::Idle;
                }
            }
            ChatAction::Compact { session_id } => {
                self.compact_session(session_id);
            }
            ChatAction::SetModel(model) => {
                self.model = model.clone();
            }
        }
    }

    /// Get model configuration for AI service
    /// Note: Creates a new ConfigService each time to ensure latest settings are read
    pub fn get_model_config(&self) -> ModelConfig {
        let config_service = ConfigService::new();
        let settings = config_service.settings();

        tracing::info!(
            "Reading AI config from disk: provider={}, model={}, api_key_set={}",
            settings.models.primary_provider,
            settings.models.primary_model,
            settings.models.primary_api_key.is_some()
        );

        let provider = match settings.models.primary_provider.as_str() {
            "openai" => AiProvider::OpenAI,
            "gemini" => AiProvider::Gemini,
            "ollama" => AiProvider::Ollama,
            "anthropic" => AiProvider::Anthropic,
            _ => {
                tracing::warn!(
                    "Unknown provider '{}', defaulting to OpenAI",
                    settings.models.primary_provider
                );
                AiProvider::OpenAI
            }
        };

        tracing::info!(
            "Using AI provider: {:?}, model: {}, base_url: {:?}",
            provider,
            settings.models.primary_model,
            settings.models.primary_base_url
        );

        ModelConfig {
            provider,
            model: settings.models.primary_model.clone(),
            api_key: settings.models.primary_api_key.clone(),
            base_url: settings.models.primary_base_url.clone(),
        }
    }

    /// Get provider display name from current settings
    pub fn get_provider_display(&self) -> String {
        let config_service = ConfigService::new();
        let settings = config_service.settings();
        format!(
            "{} ({})",
            settings.models.primary_provider, settings.models.primary_model
        )
    }

    fn trim_history(messages: &mut VecDeque<ChatMessage>) {
        while messages.len() > CHAT_HISTORY_LIMIT {
            messages.pop_front();
        }
    }

    fn active_session(&self) -> &ChatSession {
        &self.sessions[self.active_session_index]
    }

    fn session(&self, session_id: &str) -> Option<&ChatSession> {
        self.sessions.iter().find(|session| session.id == session_id)
    }

    fn session_mut(&mut self, session_id: &str) -> Option<&mut ChatSession> {
        self.sessions
            .iter_mut()
            .find(|session| session.id == session_id)
    }

    fn sessions_enabled(&self) -> bool {
        self.session_policy != "direct_only"
    }

    fn create_session(&mut self) {
        let next_number = self.sessions.len();
        let session = ChatSession {
            id: format!("session-{}", Uuid::new_v4()),
            title: self.localized_isolated_session_title(next_number),
            messages: VecDeque::with_capacity(CHAT_HISTORY_LIMIT),
            is_streaming: false,
            status: SessionStatus::Idle,
        };
        self.sessions.push(session);
        self.active_session_index = self.sessions.len().saturating_sub(1);
    }

    fn cycle_session(&mut self, forward: bool) {
        if !self.sessions_enabled() || self.sessions.len() <= 1 {
            return;
        }

        self.active_session_index = if forward {
            (self.active_session_index + 1) % self.sessions.len()
        } else if self.active_session_index == 0 {
            self.sessions.len() - 1
        } else {
            self.active_session_index - 1
        };
    }

    fn add_message_to_session(&mut self, session_id: &str, role: MessageRole, content: String) {
        if let Some(session) = self.session_mut(session_id) {
            session.messages.push_back(ChatMessage {
                role,
                content,
                timestamp: Utc::now(),
            });
            Self::trim_history(&mut session.messages);
        }
    }

    fn compact_session(&mut self, session_id: &str) {
        let language = self.language;
        let Some(session) = self.session_mut(session_id) else {
            return;
        };

        if session.messages.len() <= COMPACT_KEEP_RECENT {
            return;
        }

        let older_count = session.messages.len().saturating_sub(COMPACT_KEEP_RECENT);
        let older_messages: Vec<_> = session
            .messages
            .iter()
            .take(older_count)
            .cloned()
            .collect();
        let recent_messages: Vec<_> = session
            .messages
            .iter()
            .skip(older_count)
            .cloned()
            .collect();

        session.messages.clear();
        session.messages.push_back(ChatMessage {
            role: MessageRole::System,
            content: Self::compact_summary(language, &older_messages),
            timestamp: Utc::now(),
        });
        for message in recent_messages {
            session.messages.push_back(message);
        }
        session.status = SessionStatus::Idle;
    }

    fn compact_summary(language: Language, older_messages: &[ChatMessage]) -> String {
        let mut lines = vec![match language {
            Language::En => "Compacted summary of earlier turns:".to_string(),
            Language::Zh => "较早对话已压缩为摘要：".to_string(),
        }];

        for message in older_messages.iter().take(6) {
            let role = match (language, message.role) {
                (Language::En, MessageRole::User) => "User",
                (Language::En, MessageRole::Assistant) => "Assistant",
                (Language::En, MessageRole::System) => "System",
                (Language::Zh, MessageRole::User) => "用户",
                (Language::Zh, MessageRole::Assistant) => "助手",
                (Language::Zh, MessageRole::System) => "系统",
            };
            let excerpt: String = message.content.chars().take(80).collect();
            lines.push(format!("- {role}: {}", excerpt.replace('\n', " / ")));
        }

        lines.join("\n")
    }

    fn desired_input_height(&self, total_width: u16) -> u16 {
        let usable_width = total_width.saturating_sub(4).max(8) as usize;
        let line_count = self
            .wrapped_input_lines(usable_width)
            .len()
            .clamp(1, MAX_VISIBLE_INPUT_LINES);
        (line_count as u16).saturating_add(2)
    }

    fn panel_sections(area: Rect, input_height: u16) -> [Rect; 3] {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(4),
                Constraint::Min(1),
                Constraint::Length(input_height.max(3)),
            ])
            .split(area);

        [sections[0], sections[1], sections[2]]
    }

    fn inset_rect(area: Rect, horizontal: u16, vertical: u16) -> Rect {
        let width = area.width.saturating_sub(horizontal.saturating_mul(2));
        let height = area.height.saturating_sub(vertical.saturating_mul(2));
        Rect::new(
            area.x.saturating_add(horizontal),
            area.y.saturating_add(vertical),
            width,
            height,
        )
    }

    fn wrap_text_lines(text: &str, max_width: usize) -> Vec<String> {
        if max_width == 0 {
            return Vec::new();
        }

        let mut wrapped = Vec::new();
        for raw_line in text.split('\n') {
            if raw_line.is_empty() {
                wrapped.push(String::new());
                continue;
            }

            let mut current = String::new();
            let mut current_width = 0usize;
            for ch in raw_line.chars() {
                let ch_width = UnicodeWidthChar::width(ch).unwrap_or(1).max(1);
                if current_width + ch_width > max_width && !current.is_empty() {
                    wrapped.push(std::mem::take(&mut current));
                    current_width = 0;
                }

                current.push(ch);
                current_width += ch_width;
            }

            if current.is_empty() {
                wrapped.push(String::new());
            } else {
                wrapped.push(current);
            }
        }

        if wrapped.is_empty() {
            wrapped.push(String::new());
        }

        wrapped
    }

    fn wrapped_input_lines(&self, max_width: usize) -> Vec<String> {
        let input = self.input_buffer.to_string();
        if input.is_empty() {
            vec![String::new()]
        } else {
            Self::wrap_text_lines(&input, max_width)
        }
    }

    fn visible_input_lines(&self, max_width: usize, max_lines: usize) -> Vec<String> {
        let wrapped = self.wrapped_input_lines(max_width);
        let start = wrapped.len().saturating_sub(max_lines);
        wrapped.into_iter().skip(start).collect()
    }

    fn bubble_spec_for(role: MessageRole, content: String, available_width: u16) -> ChatBubbleSpec {
        let max_ratio = match role {
            MessageRole::User => 80usize,
            MessageRole::Assistant | MessageRole::System => 76usize,
        };
        let max_bubble_width = ((available_width as usize * max_ratio) / 100)
            .max(14)
            .min(available_width as usize);
        let text_width_limit = max_bubble_width.saturating_sub(2).max(8);
        let natural_width = content
            .lines()
            .map(UnicodeWidthStr::width)
            .max()
            .unwrap_or(0)
            .max(1);
        let text_width = natural_width.min(text_width_limit).max(8);
        let wrapped_lines = Self::wrap_text_lines(&content, text_width);
        let bubble_width = (text_width + 2) as u16;
        let bubble_height = (wrapped_lines.len() as u16).saturating_add(2).max(3);

        ChatBubbleSpec {
            role,
            content,
            width: bubble_width,
            height: bubble_height,
            align_right: matches!(role, MessageRole::User),
        }
    }

    fn visible_bubbles(&self, area: Rect) -> Vec<ChatBubbleSpec> {
        if area.width < 12 || area.height < 3 {
            return Vec::new();
        }

        let session = self.active_session();
        let mut all = Vec::new();
        for msg in &session.messages {
            all.push(Self::bubble_spec_for(msg.role, msg.content.clone(), area.width));
        }

        let has_assistant_tail = session
            .messages
            .back()
            .map(|message| matches!(message.role, MessageRole::Assistant))
            .unwrap_or(false);

        if session.is_streaming && !has_assistant_tail {
            all.push(Self::bubble_spec_for(
                MessageRole::Assistant,
                self.language
                    .translator()
                    .text(TextKey::ChatThinking)
                    .to_string(),
                area.width,
            ));
        }

        let max_height = area.height as usize;
        let mut total_height = 0usize;
        let mut kept = Vec::new();

        for bubble in all.into_iter().rev() {
            let bubble_height = bubble.height as usize;
            let next_height = if kept.is_empty() {
                bubble_height
            } else {
                bubble_height + 1
            };

            if total_height + next_height > max_height && !kept.is_empty() {
                break;
            }

            total_height += next_height;
            kept.push(bubble);
        }

        kept.reverse();
        kept
    }

    pub fn input_cursor_screen_position(&self, area: Rect) -> Option<(u16, u16)> {
        if !self.is_open {
            return None;
        }

        let input_height = self.desired_input_height(area.width);
        let input_area = Self::panel_sections(area, input_height)[2];
        let visible_width = input_area.width.saturating_sub(2) as usize;
        let visible_height = input_area.height.saturating_sub(2) as usize;
        let visible_lines = self.visible_input_lines(visible_width, visible_height.max(1));
        let last_line = visible_lines.last().cloned().unwrap_or_default();
        let cursor_x = UnicodeWidthStr::width(last_line.as_str())
            .min(visible_width.saturating_sub(1)) as u16;
        let cursor_y = visible_lines.len().saturating_sub(1) as u16;

        Some((input_area.x + 1 + cursor_x, input_area.y + 1 + cursor_y))
    }

    fn main_session_title(language: Language) -> String {
        match language {
            Language::En => "Main thread".to_string(),
            Language::Zh => "主线程".to_string(),
        }
    }

    fn localized_isolated_session_title(&self, index: usize) -> String {
        match self.language {
            Language::En => format!("Isolated {}", index),
            Language::Zh => format!("隔离 {}", index),
        }
    }

    fn localized_status(&self, status: &SessionStatus) -> String {
        match (self.language, status) {
            (Language::En, SessionStatus::Idle) => "idle".to_string(),
            (Language::En, SessionStatus::Searching) => "assembling context".to_string(),
            (Language::En, SessionStatus::Streaming) => {
                if self.streaming_enabled {
                    "streaming".to_string()
                } else {
                    "delivering".to_string()
                }
            }
            (Language::En, SessionStatus::Cancelled) => "stopped".to_string(),
            (Language::En, SessionStatus::Error(message)) => format!("error: {message}"),
            (Language::Zh, SessionStatus::Idle) => "空闲".to_string(),
            (Language::Zh, SessionStatus::Searching) => "正在整理上下文".to_string(),
            (Language::Zh, SessionStatus::Streaming) => {
                if self.streaming_enabled {
                    "流式输出中".to_string()
                } else {
                    "正在逐段输出".to_string()
                }
            }
            (Language::Zh, SessionStatus::Cancelled) => "已停止".to_string(),
            (Language::Zh, SessionStatus::Error(message)) => format!("错误：{message}"),
        }
    }

    fn controls_hint(&self) -> String {
        match self.language {
            Language::En => {
                if self.sessions_enabled() {
                    "Ctrl+N new  Alt+,/Alt+. switch  Ctrl+L clear  Ctrl+B compact  Ctrl+. stop  Shift+Enter newline"
                        .to_string()
                } else {
                    "Ctrl+L clear  Ctrl+B compact  Ctrl+. stop  Shift+Enter newline".to_string()
                }
            }
            Language::Zh => {
                if self.sessions_enabled() {
                    "Ctrl+N 新线程  Alt+,/Alt+. 切换  Ctrl+L 清空  Ctrl+B 压缩  Ctrl+. 停止  Shift+Enter 换行"
                        .to_string()
                } else {
                    "Ctrl+L 清空  Ctrl+B 压缩  Ctrl+. 停止  Shift+Enter 换行".to_string()
                }
            }
        }
    }

    fn session_hint(&self) -> String {
        let session = self.active_session();
        match self.language {
            Language::En => format!(
                "Session {}/{} · {}",
                self.active_session_index + 1,
                self.sessions.len(),
                session.title
            ),
            Language::Zh => format!(
                "会话 {}/{} · {}",
                self.active_session_index + 1,
                self.sessions.len(),
                session.title
            ),
        }
    }
}

impl Default for ChatPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for ChatPanel {
    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        ChatPanel::handle_key_event(self, key)
    }

    fn handle_action(&mut self, action: &Action) {
        if let Action::Chat(chat_action) = action {
            ChatPanel::handle_action(self, chat_action);
        }
    }

    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        if !self.is_open {
            return;
        }

        let input_height = self.desired_input_height(area.width);
        let [header_area, messages_area, input_area] = Self::panel_sections(area, input_height);
        let panel_bg = Color::Rgb(15, 15, 23);
        let header_bg = Color::Rgb(26, 26, 46);
        let user_bg = Color::Rgb(35, 134, 54);
        let assistant_bg = Color::Rgb(33, 38, 45);
        let system_bg = Color::Rgb(54, 92, 141);
        let input_bg = Color::Rgb(13, 17, 23);
        let muted = Color::Rgb(110, 118, 129);
        let primary_text = Color::Rgb(201, 209, 217);
        let accent = if matches!(self.active_session().status, SessionStatus::Error(_)) {
            Color::Rgb(248, 81, 73)
        } else if self.active_session().is_streaming {
            Color::Rgb(210, 153, 34)
        } else {
            Color::Rgb(63, 185, 80)
        };

        f.render_widget(Clear, area);
        f.render_widget(Block::default().style(Style::default().bg(panel_bg)), area);

        let header_text = Text::from(vec![
            Line::from(vec![
                Span::styled("🤖", Style::default().fg(Color::Rgb(139, 148, 158))),
                Span::raw(" "),
                Span::styled(
                    self.language.translator().text(TextKey::ChatTitle),
                    Style::default().fg(primary_text).add_modifier(Modifier::BOLD),
                ),
                Span::raw(" "),
                Span::styled("●", Style::default().fg(accent)),
            ]),
            Line::from(vec![
                Span::styled(self.session_hint(), Style::default().fg(primary_text)),
                Span::raw("  "),
                Span::styled(
                    self.localized_status(&self.active_session().status),
                    Style::default().fg(accent),
                ),
            ]),
            Line::from(vec![Span::styled(
                self.controls_hint(),
                Style::default().fg(muted),
            )]),
        ]);
        let header = Paragraph::new(header_text)
            .block(
                Block::default()
                    .padding(Padding::new(1, 0, 0, 0))
                    .style(Style::default().bg(header_bg)),
            )
            .style(Style::default().bg(header_bg).fg(primary_text))
            .wrap(Wrap { trim: false });
        f.render_widget(header, header_area);

        let message_canvas = Self::inset_rect(messages_area, 1, 1);
        f.render_widget(
            Block::default().style(Style::default().bg(panel_bg)),
            messages_area,
        );

        let bubbles = self.visible_bubbles(message_canvas);
        let mut cursor_y = message_canvas.y;
        for bubble in bubbles {
            if cursor_y >= message_canvas.y + message_canvas.height {
                break;
            }

            let remaining_height = message_canvas
                .y
                .saturating_add(message_canvas.height)
                .saturating_sub(cursor_y);
            if remaining_height < 3 {
                break;
            }

            let bubble_height = bubble.height.min(remaining_height);
            let bubble_width = bubble.width.min(message_canvas.width.saturating_sub(1));
            let bubble_x = if bubble.align_right {
                message_canvas
                    .x
                    .saturating_add(message_canvas.width.saturating_sub(bubble_width))
            } else {
                message_canvas.x
            };
            let bubble_area = Rect::new(bubble_x, cursor_y, bubble_width, bubble_height);

            let (bubble_bg, text_color) = match bubble.role {
                MessageRole::User => (user_bg, Color::White),
                MessageRole::Assistant => (assistant_bg, primary_text),
                MessageRole::System => (system_bg, Color::White),
            };

            let bubble_widget = Paragraph::new(Text::from(bubble.content))
                .wrap(Wrap { trim: false })
                .block(
                    Block::default()
                        .borders(Borders::ALL)
                        .border_set(border::ROUNDED)
                        .border_style(Style::default().fg(bubble_bg).bg(bubble_bg))
                        .style(Style::default().bg(bubble_bg)),
                )
                .style(Style::default().bg(bubble_bg).fg(text_color));

            f.render_widget(bubble_widget, bubble_area);
            cursor_y = cursor_y.saturating_add(bubble_height.saturating_add(1));
        }

        let visible_width = input_area.width.saturating_sub(2) as usize;
        let visible_height = input_area.height.saturating_sub(2) as usize;
        let input_lines = if self.input_buffer.len_chars() == 0 {
            vec![
                self.language
                    .translator()
                    .text(TextKey::ChatPlaceholder)
                    .to_string(),
            ]
        } else {
            self.visible_input_lines(visible_width.max(1), visible_height.max(1))
        };
        let input_style = if self.input_buffer.len_chars() == 0 {
            Style::default().fg(muted)
        } else {
            Style::default().fg(primary_text)
        };
        let input = Paragraph::new(input_lines.join("\n"))
            .style(input_style)
            .wrap(Wrap { trim: false })
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_set(border::ROUNDED)
                    .border_style(Style::default().fg(input_bg).bg(input_bg))
                    .style(Style::default().bg(input_bg)),
            );
        f.render_widget(input, input_area);
    }
}
