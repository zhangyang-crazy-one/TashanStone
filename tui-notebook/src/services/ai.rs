//! AI service - LLM integration
//!
//! Supports OpenAI, Gemini, and Ollama providers.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// AI provider type
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum AiProvider {
    OpenAI,
    Gemini,
    Ollama,
}

/// AI model configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub provider: AiProvider,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            provider: AiProvider::OpenAI,
            model: "gpt-4".to_string(),
            api_key: None,
            base_url: None,
        }
    }
}

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
}

/// Message role
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

/// Chat completion request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: f32,
    pub max_tokens: Option<usize>,
    pub stream: bool,
}

/// Chat completion response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub content: String,
    pub model: String,
    pub finish_reason: String,
}

/// AI service error
#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("API error: {0}")]
    Api(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Config error: {0}")]
    Config(String),
}

/// AI service for LLM interactions
pub struct AiService {
    config: RwLock<ModelConfig>,
}

impl AiService {
    /// Create a new AI service
    pub fn new() -> Self {
        Self {
            config: RwLock::new(ModelConfig::default()),
        }
    }

    /// Create with custom config
    pub fn with_config(config: ModelConfig) -> Self {
        Self {
            config: RwLock::new(config),
        }
    }

    /// Update configuration
    pub async fn set_config(&self, config: ModelConfig) {
        let mut cfg = self.config.write().await;
        *cfg = config;
    }

    /// Get current configuration
    pub async fn get_config(&self) -> ModelConfig {
        let cfg = self.config.read().await;
        cfg.clone()
    }

    /// Send a chat completion request
    pub async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatCompletionResponse, AiError> {
        let config = self.config.read().await;

        match config.provider {
            AiProvider::OpenAI => self.openai_chat(&config, messages).await,
            AiProvider::Gemini => Err(AiError::Config("Gemini not implemented".to_string())),
            AiProvider::Ollama => Err(AiError::Config("Ollama not implemented".to_string())),
        }
    }

    /// OpenAI chat implementation
    async fn openai_chat(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatCompletionResponse, AiError> {
        let api_key = config.api_key.as_ref()
            .ok_or_else(|| AiError::Config("OpenAI API key not set".to_string()))?;

        let client = reqwest::Client::new();
        let base_url = config.base_url.as_deref().unwrap_or("https://api.openai.com");

        let request = ChatCompletionRequest {
            model: config.model.clone(),
            messages,
            temperature: 0.7,
            max_tokens: None,
            stream: false,
        };

        let response = client
            .post(format!("{}/v1/chat/completions", base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AiError::Api(format!("{}: {}", status, body)));
        }

        #[derive(Deserialize)]
        struct OpenAIResponse {
            choices: Vec<OpenAIChoice>,
        }

        #[derive(Deserialize)]
        struct OpenAIChoice {
            message: OpenAIMessage,
            finish_reason: String,
        }

        #[derive(Deserialize)]
        struct OpenAIMessage {
            content: String,
        }

        let openai_resp: OpenAIResponse = response
            .json()
            .await
            .map_err(|e| AiError::Parse(e.to_string()))?;

        let choice = openai_resp.choices.first()
            .ok_or_else(|| AiError::Parse("No choices in response".to_string()))?;

        Ok(ChatCompletionResponse {
            content: choice.message.content.clone(),
            model: config.model.clone(),
            finish_reason: choice.finish_reason.clone(),
        })
    }

    /// Stream chat completion (placeholder - streaming implementation is complex)
    pub async fn chat_streaming(
        &self,
        _messages: Vec<ChatMessage>,
    ) -> Result<Box<dyn tokio::io::AsyncRead + Send>, AiError> {
        Err(AiError::Config("Streaming not implemented".to_string()))
    }
}

impl Default for AiService {
    fn default() -> Self {
        Self::new()
    }
}
