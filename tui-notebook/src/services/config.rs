//! Configuration service - stores app settings persistently

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// AI provider configuration
    pub ai_provider: String,
    pub ai_model: String,
    pub ai_api_key: Option<String>,
    pub ai_base_url: Option<String>,
    /// UI settings
    pub theme: String,
    pub font_size: u8,
    /// Workspace
    pub workspace_path: String,
    /// Language setting (en/zh)
    pub language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ai_provider: "openai".to_string(),
            ai_model: "gpt-4".to_string(),
            ai_api_key: None,
            ai_base_url: None,
            theme: "dark".to_string(),
            font_size: 14,
            workspace_path: ".".to_string(),
            language: "en".to_string(),
        }
    }
}

/// Config service for persistent storage
pub struct ConfigService {
    config_path: PathBuf,
    settings: AppSettings,
}

impl ConfigService {
    /// Create a new config service
    pub fn new() -> Self {
        let config_dir = dirs_config_dir();
        let config_path = config_dir.join("settings.json");

        let settings = if config_path.exists() {
            std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            AppSettings::default()
        };

        Self {
            config_path,
            settings,
        }
    }

    /// Get current settings
    pub fn settings(&self) -> &AppSettings {
        &self.settings
    }

    /// Update settings
    pub fn update(&mut self, settings: AppSettings) {
        self.settings = settings;
        self.save();
    }

    /// Save settings to disk
    pub fn save(&self) {
        if let Some(parent) = self.config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(s) = serde_json::to_string_pretty(&self.settings) {
            let _ = std::fs::write(&self.config_path, s);
        }
    }

    /// Get config directory
    fn config_dir() -> PathBuf {
        dirs_config_dir()
    }
}

impl Default for ConfigService {
    fn default() -> Self {
        Self::new()
    }
}

/// Get config directory cross-platform
fn dirs_config_dir() -> PathBuf {
    if let Some(dir) = dirs::config_dir() {
        dir.join("tui-notebook")
    } else {
        PathBuf::from(".").join(".config").join("tui-notebook")
    }
}
