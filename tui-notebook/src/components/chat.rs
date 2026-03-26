//! Chat component - AI conversation panel

use crate::action::{Action, ChatAction, ChatModel, ComponentId, NavigationAction};
use crate::services::ai::{AiProvider, ModelConfig};
use crate::services::config::ConfigService;
use crossterm::event::KeyEvent;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    symbols::border,
    text::{Line, Span, Text},
    widgets::{Block, Borders, Clear, Padding, Paragraph, Wrap},
    Frame,
};
use ropey::Rope;
use std::collections::VecDeque;
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

/// Chat message
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Message role
#[derive(Debug, Clone, Copy)]
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

/// Chat panel state
pub struct ChatPanel {
    /// Chat history
    messages: VecDeque<ChatMessage>,
    /// Current input
    input_buffer: Rope,
    /// Is streaming
    is_streaming: bool,
    /// Current model
    model: ChatModel,
    /// Is open
    is_open: bool,
    /// Config service for AI settings
    config_service: ConfigService,
}

impl ChatPanel {
    pub fn new() -> Self {
        Self {
            messages: VecDeque::with_capacity(100),
            input_buffer: Rope::new(),
            is_streaming: false,
            model: ChatModel::Gemini {
                model: "gemini-2.0-flash".to_string(),
            },
            is_open: false,
            config_service: ConfigService::new(),
        }
    }

    /// Check if chat panel is open
    pub fn is_open(&self) -> bool {
        self.is_open
    }

    /// Toggle chat panel visibility
    pub fn toggle(&mut self) {
        self.is_open = !self.is_open;
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        match key.code {
            crossterm::event::KeyCode::Enter => {
                let input = self.input_buffer.to_string();
                if !input.trim().is_empty() {
                    self.add_message(MessageRole::User, input.clone());
                    self.input_buffer = Rope::new();
                    self.is_streaming = true;
                    return Some(Action::Chat(ChatAction::Send(input)));
                }
            }
            crossterm::event::KeyCode::Char(c) => {
                let pos = self.input_buffer.len_chars();
                self.input_buffer.insert(pos, c.to_string().as_str());
            }
            crossterm::event::KeyCode::Backspace => {
                if self.input_buffer.len_chars() > 0 {
                    let pos = self.input_buffer.len_chars() - 1;
                    self.input_buffer.remove(pos..pos + 1);
                }
            }
            crossterm::event::KeyCode::Esc => {
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
            ChatAction::Send(_msg) => {
                // Note: is_streaming is already set to true in handle_key_event
                // User message is already added in handle_key_event
                // This handler just triggers the async AI call
            }
            ChatAction::StreamResponse(chunk) => {
                if self.is_streaming {
                    // First chunk - add new AI message
                    self.add_message(MessageRole::Assistant, chunk.clone());
                    self.is_streaming = false;
                } else {
                    // Subsequent chunks - append to last AI message
                    if let Some(last) = self.messages.back_mut() {
                        if matches!(last.role, MessageRole::Assistant) {
                            last.content.push_str(chunk);
                        }
                    }
                }
            }
            ChatAction::Clear => {
                self.messages.clear();
            }
            ChatAction::SetModel(model) => {
                self.model = model.clone();
            }
            _ => {}
        }
    }

    /// Add a message to the chat
    fn add_message(&mut self, role: MessageRole, content: String) {
        self.messages.push_back(ChatMessage {
            role,
            content,
            timestamp: chrono::Utc::now(),
        });

        // Keep history bounded
        if self.messages.len() > 100 {
            self.messages.pop_front();
        }
    }

    /// Get model configuration for AI service
    /// Note: Creates a new ConfigService each time to ensure latest settings are read
    pub fn get_model_config(&self) -> ModelConfig {
        // Create a fresh ConfigService to read latest settings from disk
        let config_service = ConfigService::new();
        let settings = config_service.settings();

        tracing::info!(
            "Reading AI config from disk: provider={}, model={}, api_key_set={}",
            settings.ai_provider,
            settings.ai_model,
            settings.ai_api_key.is_some()
        );

        // Parse provider from settings
        let provider = match settings.ai_provider.as_str() {
            "openai" => AiProvider::OpenAI,
            "gemini" => AiProvider::Gemini,
            "ollama" => AiProvider::Ollama,
            "anthropic" => AiProvider::Anthropic,
            _ => {
                tracing::warn!(
                    "Unknown provider '{}', defaulting to OpenAI",
                    settings.ai_provider
                );
                AiProvider::OpenAI
            }
        };

        // Use model from settings
        let model = settings.ai_model.clone();
        let api_key = settings.ai_api_key.clone();
        let base_url = settings.ai_base_url.clone();

        tracing::info!(
            "Using AI provider: {:?}, model: {}, base_url: {:?}",
            provider,
            model,
            base_url
        );

        ModelConfig {
            provider,
            model,
            api_key,
            base_url,
        }
    }

    /// Get all messages for AI service context
    pub fn get_messages(&self) -> &VecDeque<ChatMessage> {
        &self.messages
    }

    /// Get provider display name from current settings
    pub fn get_provider_display(&self) -> String {
        let settings = self.config_service.settings();
        format!("{} ({})", settings.ai_provider, settings.ai_model)
    }

    /// Add AI response message
    pub fn add_ai_message(&mut self, content: String) {
        self.is_streaming = false;
        self.add_message(MessageRole::Assistant, content);
    }

    fn panel_sections(area: Rect) -> [Rect; 3] {
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),
                Constraint::Min(1),
                Constraint::Length(5),
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

    fn input_shell_area(area: Rect) -> Rect {
        let sections = Self::panel_sections(area);
        Self::inset_rect(sections[2], 1, 0)
    }

    fn input_field_area(area: Rect) -> Rect {
        let shell = Self::input_shell_area(area);
        Self::inset_rect(shell, 1, 1)
    }

    fn wrap_text_lines(text: &str, max_width: usize) -> Vec<String> {
        if max_width == 0 {
            return Vec::new();
        }

        let mut wrapped = Vec::new();
        for raw_line in text.lines() {
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

        let mut all = Vec::new();
        for msg in &self.messages {
            all.push(Self::bubble_spec_for(
                msg.role,
                msg.content.clone(),
                area.width,
            ));
        }

        if self.is_streaming {
            all.push(Self::bubble_spec_for(
                MessageRole::Assistant,
                "thinking...".to_string(),
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

        let input_area = Self::input_field_area(area);
        let visible_width = input_area.width.saturating_sub(2) as usize;
        let display_width = UnicodeWidthStr::width(self.input_buffer.to_string().as_str());
        let cursor_x = display_width.min(visible_width.saturating_sub(1)) as u16;

        Some((input_area.x + 1 + cursor_x, input_area.y + 1))
    }
}

impl Default for ChatPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for ChatPanel {
    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        self.handle_key_event(key)
    }

    fn handle_action(&mut self, action: &Action) {
        if let Action::Chat(chat_action) = action {
            self.handle_action(chat_action);
        }
    }

    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        if !self.is_open {
            return;
        }

        let [header_area, messages_area, _input_area] = Self::panel_sections(area);
        let panel_bg = Color::Rgb(15, 15, 23);
        let header_bg = Color::Rgb(26, 26, 46);
        let user_bg = Color::Rgb(35, 134, 54);
        let assistant_bg = Color::Rgb(33, 38, 45);
        let system_bg = Color::Rgb(54, 92, 141);
        let input_shell_bg = Color::Rgb(22, 27, 34);
        let input_field_bg = Color::Rgb(13, 17, 23);
        let muted = Color::Rgb(110, 118, 129);
        let primary_text = Color::Rgb(201, 209, 217);

        f.render_widget(Clear, area);
        f.render_widget(Block::default().style(Style::default().bg(panel_bg)), area);

        let header = Paragraph::new(Line::from(vec![
            Span::styled("🤖", Style::default().fg(Color::Rgb(139, 148, 158))),
            Span::raw(" "),
            Span::styled(
                "AI 对话",
                Style::default()
                    .fg(primary_text)
                    .add_modifier(ratatui::style::Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled("●", Style::default().fg(Color::Rgb(63, 185, 80))),
        ]))
        .block(
            Block::default()
                .padding(Padding::new(1, 0, 0, 0))
                .style(Style::default().bg(header_bg)),
        )
        .style(Style::default().bg(header_bg).fg(primary_text));
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
                        .style(Style::default().bg(bubble_bg))
                        .padding(Padding::new(0, 0, 0, 0)),
                )
                .style(Style::default().bg(bubble_bg).fg(text_color));

            f.render_widget(bubble_widget, bubble_area);
            cursor_y = cursor_y.saturating_add(bubble_height.saturating_add(1));
        }

        let shell_area = Self::input_shell_area(area);
        let field_area = Self::input_field_area(area);
        let shell = Block::default()
            .borders(Borders::ALL)
            .border_set(border::ROUNDED)
            .border_style(Style::default().fg(input_shell_bg).bg(input_shell_bg))
            .style(Style::default().bg(input_shell_bg));
        f.render_widget(shell, shell_area);

        let input_text = if self.input_buffer.len_chars() == 0 {
            "输入消息...".to_string()
        } else {
            self.input_buffer.to_string()
        };
        let input_style = if self.input_buffer.len_chars() == 0 {
            Style::default().fg(muted)
        } else {
            Style::default().fg(primary_text)
        };
        let input = Paragraph::new(input_text)
            .style(input_style)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_set(border::ROUNDED)
                    .border_style(Style::default().fg(input_field_bg).bg(input_field_bg))
                    .style(Style::default().bg(input_field_bg)),
            )
            .wrap(Wrap { trim: false });

        f.render_widget(input, field_area);
    }
}
