//! AI service - LLM integration
//!
//! Supports OpenAI, Gemini, Ollama, and Anthropic providers.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// AI provider type
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum AiProvider {
    OpenAI,
    Gemini,
    Ollama,
    Anthropic,
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
    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatCompletionResponse, AiError> {
        let config = self.config.read().await;

        tracing::info!(
            "AI chat called with provider: {:?}, model: {}",
            config.provider,
            config.model
        );

        match config.provider {
            AiProvider::OpenAI => self.openai_chat(&config, messages).await,
            AiProvider::Gemini => self.gemini_chat(&config, messages).await,
            AiProvider::Ollama => self.ollama_chat(&config, messages).await,
            AiProvider::Anthropic => self.anthropic_chat(&config, messages).await,
        }
    }

    /// OpenAI chat implementation
    async fn openai_chat(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatCompletionResponse, AiError> {
        let api_key = config
            .api_key
            .as_ref()
            .ok_or_else(|| AiError::Config("OpenAI API key not set".to_string()))?;

        let client = reqwest::Client::new();
        let base_url = config
            .base_url
            .as_deref()
            .unwrap_or("https://api.openai.com");

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

        let choice = openai_resp
            .choices
            .first()
            .ok_or_else(|| AiError::Parse("No choices in response".to_string()))?;

        Ok(ChatCompletionResponse {
            content: choice.message.content.clone(),
            model: config.model.clone(),
            finish_reason: choice.finish_reason.clone(),
        })
    }

    /// Gemini chat implementation
    async fn gemini_chat(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatCompletionResponse, AiError> {
        let api_key = config
            .api_key
            .as_ref()
            .ok_or_else(|| AiError::Config("Gemini API key not set".to_string()))?;

        let client = reqwest::Client::new();
        let base_url = config
            .base_url
            .as_deref()
            .unwrap_or("https://generativelanguage.googleapis.com");

        // Convert messages to Gemini format
        let contents: Vec<serde_json::Value> = messages
            .into_iter()
            .filter(|m| m.role != MessageRole::System)
            .map(|m| {
                let role = match m.role {
                    MessageRole::User => "user",
                    MessageRole::Assistant => "model",
                    MessageRole::System => "user", // Gemini doesn't have system role
                };
                serde_json::json!({
                    "role": role,
                    "parts": [{"text": m.content}]
                })
            })
            .collect();

        let request_body = serde_json::json!({
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048,
            }
        });

        let url = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            base_url, config.model, api_key
        );

        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AiError::Api(format!("{}: {}", status, body)));
        }

        #[derive(Deserialize)]
        struct GeminiResponse {
            candidates: Vec<GeminiCandidate>,
        }

        #[derive(Deserialize)]
        struct GeminiCandidate {
            content: GeminiContent,
        }

        #[derive(Deserialize)]
        struct GeminiContent {
            parts: Vec<GeminiPart>,
        }

        #[derive(Deserialize)]
        struct GeminiPart {
            text: String,
        }

        let gemini_resp: GeminiResponse = response
            .json()
            .await
            .map_err(|e| AiError::Parse(e.to_string()))?;

        let content = gemini_resp
            .candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.clone())
            .ok_or_else(|| AiError::Parse("No content in response".to_string()))?;

        Ok(ChatCompletionResponse {
            content,
            model: config.model.clone(),
            finish_reason: "stop".to_string(),
        })
    }

    /// Ollama chat implementation
    async fn ollama_chat(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatCompletionResponse, AiError> {
        let client = reqwest::Client::new();
        let base_url = config
            .base_url
            .as_deref()
            .unwrap_or("http://localhost:11434");

        // Convert messages to Ollama format
        let ollama_messages: Vec<serde_json::Value> = messages
            .into_iter()
            .map(|m| {
                let role = match m.role {
                    MessageRole::System => "system",
                    MessageRole::User => "user",
                    MessageRole::Assistant => "assistant",
                };
                serde_json::json!({
                    "role": role,
                    "content": m.content
                })
            })
            .collect();

        let request_body = serde_json::json!({
            "model": config.model,
            "messages": ollama_messages,
            "stream": false,
        });

        let url = format!("{}/api/chat", base_url);

        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AiError::Api(format!("{}: {}", status, body)));
        }

        #[derive(Deserialize)]
        struct OllamaResponse {
            message: OllamaMessage,
        }

        #[derive(Deserialize)]
        struct OllamaMessage {
            content: String,
        }

        let ollama_resp: OllamaResponse = response
            .json()
            .await
            .map_err(|e| AiError::Parse(e.to_string()))?;

        Ok(ChatCompletionResponse {
            content: ollama_resp.message.content,
            model: config.model.clone(),
            finish_reason: "stop".to_string(),
        })
    }

    /// Anthropic chat implementation
    async fn anthropic_chat(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatCompletionResponse, AiError> {
        let api_key = config
            .api_key
            .as_ref()
            .ok_or_else(|| AiError::Config("Anthropic API key not set".to_string()))?;

        let client = reqwest::Client::new();
        let base_url = config
            .base_url
            .as_deref()
            .unwrap_or("https://api.anthropic.com");

        // Convert messages to Anthropic format
        let anthropic_messages: Vec<serde_json::Value> = messages
            .into_iter()
            .filter(|m| m.role != MessageRole::System)
            .map(|m| {
                let role = match m.role {
                    MessageRole::User => "user",
                    MessageRole::Assistant => "assistant",
                    MessageRole::System => "user", // Anthropic doesn't have system role
                };
                serde_json::json!({
                    "role": role,
                    "content": m.content
                })
            })
            .collect();

        let request_body = serde_json::json!({
            "model": config.model,
            "messages": anthropic_messages,
            "max_tokens": 1024,
        });

        let url = format!("{}/v1/messages", base_url);

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AiError::Api(format!("{}: {}", status, body)));
        }

        #[derive(Deserialize)]
        struct AnthropicResponse {
            content: Vec<serde_json::Value>,
            stop_reason: String,
        }

        let anthropic_resp: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| AiError::Parse(e.to_string()))?;

        // Extract text content from response, handling MiniMax's thinking blocks
        let content = anthropic_resp
            .content
            .iter()
            .find(|c| c.get("type").and_then(|t| t.as_str()) == Some("text"))
            .and_then(|c| c.get("text").and_then(|t| t.as_str()))
            .map(|s| s.to_string())
            .ok_or_else(|| AiError::Parse("No text content in response".to_string()))?;

        Ok(ChatCompletionResponse {
            content,
            model: config.model.clone(),
            finish_reason: anthropic_resp.stop_reason,
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
