//! Chat component - AI conversation panel

use crate::action::{Action, ChatAction, ChatModel};
use crate::services::ai::{AiProvider, ModelConfig};
use crossterm::event::KeyEvent;
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span, Text},
    widgets::{Block, Paragraph},
    Frame,
};
use ropey::Rope;
use std::collections::VecDeque;

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
            }
            _ => {}
        }
        None
    }

    /// Handle an action
    pub fn handle_action(&mut self, action: &ChatAction) {
        match action {
            ChatAction::Send(msg) => {
                self.is_streaming = true;
                // Add user message
                self.add_message(MessageRole::User, msg.clone());
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
    pub fn get_model_config(&self) -> ModelConfig {
        match &self.model {
            ChatModel::OpenAI { model } => ModelConfig {
                provider: AiProvider::OpenAI,
                model: model.clone(),
                api_key: None, // Should be loaded from environment
                base_url: None,
            },
            ChatModel::Gemini { model } => ModelConfig {
                provider: AiProvider::Gemini,
                model: model.clone(),
                api_key: None, // Should be loaded from environment
                base_url: None,
            },
            ChatModel::Ollama { model, base_url } => ModelConfig {
                provider: AiProvider::Ollama,
                model: model.clone(),
                api_key: None,
                base_url: Some(base_url.clone()),
            },
        }
    }

    /// Get all messages for AI service context
    pub fn get_messages(&self) -> &VecDeque<ChatMessage> {
        &self.messages
    }

    /// Add AI response message
    pub fn add_ai_message(&mut self, content: String) {
        self.is_streaming = false;
        self.add_message(MessageRole::Assistant, content);
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

        let mut text = Text::default();

        // Render messages
        for msg in &self.messages {
            let role_str = match msg.role {
                MessageRole::User => "You: ",
                MessageRole::Assistant => "AI: ",
                MessageRole::System => "System: ",
            };

            let style = match msg.role {
                MessageRole::User => Style::default().fg(Color::Green),
                MessageRole::Assistant => Style::default().fg(Color::Blue),
                MessageRole::System => Style::default().fg(Color::Yellow),
            };

            text.lines.push(Line::from(vec![
                Span::styled(role_str, style),
                Span::raw(&msg.content),
            ]));
        }

        let messages = Paragraph::new(text)
            .block(
                Block::default()
                    .title(format!(" AI Chat ({:?}) ", self.model))
                    .borders(ratatui::widgets::Borders::ALL),
            );

        f.render_widget(messages, area);

        // Render input area at bottom
        let input_area = Rect::new(
            area.x,
            area.y + area.height - 3,
            area.width,
            3,
        );

        let input_text = self.input_buffer.to_string();
        let input = Paragraph::new(input_text)
            .block(
                Block::default()
                    .title(" Message ")
                    .borders(ratatui::widgets::Borders::ALL),
            );

        f.render_widget(input, input_area);

        // Set cursor position
        if self.is_open {
            f.set_cursor(
                input_area.x + 1 + self.input_buffer.len_chars() as u16,
                input_area.y + 1,
            );
        }
    }
}
