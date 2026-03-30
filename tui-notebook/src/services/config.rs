//! Configuration service - stores app settings persistently.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ShortcutProfile {
    #[default]
    TerminalLeader,
    IdeCompatible,
}

impl ShortcutProfile {
    pub fn label(self) -> &'static str {
        match self {
            Self::TerminalLeader => "Terminal Leader",
            Self::IdeCompatible => "IDE Compatible",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RuntimeSettings {
    pub enable_local_runtime: bool,
    pub enable_channel_runtime: bool,
    pub notebook_context_mode: String,
    pub session_policy: String,
}

impl Default for RuntimeSettings {
    fn default() -> Self {
        Self {
            enable_local_runtime: true,
            enable_channel_runtime: false,
            notebook_context_mode: "workspace_scoped".to_string(),
            session_policy: "main_and_isolated".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ModelsSettings {
    pub primary_provider: String,
    pub primary_model: String,
    pub primary_api_key: Option<String>,
    pub primary_base_url: Option<String>,
    pub visual_provider: String,
    pub visual_model: String,
    pub embedding_provider: String,
    pub embedding_model: String,
    pub reasoning_level: String,
    pub streaming_enabled: bool,
}

impl Default for ModelsSettings {
    fn default() -> Self {
        Self {
            primary_provider: "openai".to_string(),
            primary_model: "gpt-4".to_string(),
            primary_api_key: None,
            primary_base_url: None,
            visual_provider: "openai".to_string(),
            visual_model: "gpt-4o-mini".to_string(),
            embedding_provider: "openai".to_string(),
            embedding_model: "text-embedding-3-small".to_string(),
            reasoning_level: "balanced".to_string(),
            streaming_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FallbackSettings {
    pub enable_model_fallback: bool,
    pub failover_policy: String,
    pub fallback_chain: String,
    pub local_backup_model: String,
    pub auth_rotation_mode: String,
}

impl Default for FallbackSettings {
    fn default() -> Self {
        Self {
            enable_model_fallback: false,
            failover_policy: "sequential".to_string(),
            fallback_chain: "primary -> local".to_string(),
            local_backup_model: "llama3.2".to_string(),
            auth_rotation_mode: "manual".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ToolSettings {
    pub enable_mcp_tools: bool,
    pub enable_file_tools: bool,
    pub enable_search_tools: bool,
    pub enable_browser_tools: bool,
    pub enable_exec_tools: bool,
    pub enable_skills_registry: bool,
}

impl Default for ToolSettings {
    fn default() -> Self {
        Self {
            enable_mcp_tools: true,
            enable_file_tools: true,
            enable_search_tools: true,
            enable_browser_tools: false,
            enable_exec_tools: false,
            enable_skills_registry: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AgentSettings {
    pub enable_sub_agents: bool,
    pub delegation_policy: String,
    pub default_model_tier: String,
    pub allow_agent_to_agent: bool,
    pub workspace_isolation: String,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enable_sub_agents: false,
            delegation_policy: "manual".to_string(),
            default_model_tier: "balanced".to_string(),
            allow_agent_to_agent: false,
            workspace_isolation: "workspace_scoped".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SchedulingSettings {
    pub enable_cron: bool,
    pub enable_heartbeat: bool,
    pub timezone: String,
    pub enable_auto_indexing_job: bool,
    pub enable_digest_job: bool,
}

impl Default for SchedulingSettings {
    fn default() -> Self {
        Self {
            enable_cron: false,
            enable_heartbeat: false,
            timezone: "Asia/Shanghai".to_string(),
            enable_auto_indexing_job: false,
            enable_digest_job: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ChannelAdapterSettings {
    pub enabled: bool,
    pub auth_mode: String,
    pub activation_mode: String,
    pub text_chunk_limit: u16,
    pub media_max_mb: u16,
    pub allowlist_mode: String,
}

impl Default for ChannelAdapterSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auth_mode: "pairing".to_string(),
            activation_mode: "mention".to_string(),
            text_chunk_limit: 4000,
            media_max_mb: 50,
            allowlist_mode: "pairing".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ChannelSettings {
    pub whatsapp: ChannelAdapterSettings,
    pub qq_channel: ChannelAdapterSettings,
}

impl Default for ChannelSettings {
    fn default() -> Self {
        Self {
            whatsapp: ChannelAdapterSettings::default(),
            qq_channel: ChannelAdapterSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct MediaSettings {
    pub enable_vision: bool,
    pub enable_audio_transcription: bool,
    pub enable_document_ingest: bool,
    pub inbound_media_limit_mb: u16,
    pub outbound_media_limit_mb: u16,
    pub image_detail_mode: String,
}

impl Default for MediaSettings {
    fn default() -> Self {
        Self {
            enable_vision: false,
            enable_audio_transcription: false,
            enable_document_ingest: true,
            inbound_media_limit_mb: 50,
            outbound_media_limit_mb: 50,
            image_detail_mode: "balanced".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SafetySettings {
    pub dm_pairing_policy: String,
    pub sandbox_mode: String,
    pub trusted_local_tools: bool,
    pub restrict_non_main_sessions: bool,
    pub confirm_destructive_tools: bool,
}

impl Default for SafetySettings {
    fn default() -> Self {
        Self {
            dm_pairing_policy: "pairing".to_string(),
            sandbox_mode: "non_main".to_string(),
            trusted_local_tools: true,
            restrict_non_main_sessions: true,
            confirm_destructive_tools: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ObservabilitySettings {
    pub show_usage_footer: bool,
    pub enable_health_checks: bool,
    pub log_level: String,
    pub enable_session_diagnostics: bool,
    pub enable_delivery_debug: bool,
}

impl Default for ObservabilitySettings {
    fn default() -> Self {
        Self {
            show_usage_footer: false,
            enable_health_checks: true,
            log_level: "info".to_string(),
            enable_session_diagnostics: false,
            enable_delivery_debug: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct UiSettings {
    pub theme: String,
    pub font_size: u8,
    pub workspace_path: String,
    pub language: String,
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_size: 14,
            workspace_path: ".".to_string(),
            language: "en".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct KeyboardSettings {
    pub shortcut_profile: ShortcutProfile,
    pub show_shortcut_hints: bool,
    pub preview_focus_follows_editor: bool,
}

impl Default for KeyboardSettings {
    fn default() -> Self {
        Self {
            shortcut_profile: ShortcutProfile::TerminalLeader,
            show_shortcut_hints: true,
            preview_focus_follows_editor: true,
        }
    }
}

/// Application settings grouped by subsystem.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub runtime: RuntimeSettings,
    pub models: ModelsSettings,
    pub fallback: FallbackSettings,
    pub tools: ToolSettings,
    pub agents: AgentSettings,
    pub scheduling: SchedulingSettings,
    pub channels: ChannelSettings,
    pub media: MediaSettings,
    pub safety: SafetySettings,
    pub observability: ObservabilitySettings,
    pub ui: UiSettings,
    pub keyboard: KeyboardSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            runtime: RuntimeSettings::default(),
            models: ModelsSettings::default(),
            fallback: FallbackSettings::default(),
            tools: ToolSettings::default(),
            agents: AgentSettings::default(),
            scheduling: SchedulingSettings::default(),
            channels: ChannelSettings::default(),
            media: MediaSettings::default(),
            safety: SafetySettings::default(),
            observability: ObservabilitySettings::default(),
            ui: UiSettings::default(),
            keyboard: KeyboardSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct LegacyAppSettings {
    pub ai_provider: String,
    pub ai_model: String,
    pub ai_api_key: Option<String>,
    pub ai_base_url: Option<String>,
    pub theme: String,
    pub font_size: u8,
    pub workspace_path: String,
    pub language: String,
    pub shortcut_profile: ShortcutProfile,
    pub show_shortcut_hints: bool,
    pub preview_focus_follows_editor: bool,
}

impl Default for LegacyAppSettings {
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
            shortcut_profile: ShortcutProfile::TerminalLeader,
            show_shortcut_hints: true,
            preview_focus_follows_editor: true,
        }
    }
}

impl AppSettings {
    pub fn load_compatible(raw: &str) -> Option<Self> {
        let value: serde_json::Value = serde_json::from_str(raw).ok()?;

        if value.get("runtime").is_some() || value.get("models").is_some() {
            serde_json::from_value(value).ok()
        } else {
            let legacy: LegacyAppSettings = serde_json::from_value(value).ok()?;
            Some(Self::from_legacy(legacy))
        }
    }

    fn from_legacy(legacy: LegacyAppSettings) -> Self {
        let mut settings = Self::default();
        settings.models.primary_provider = legacy.ai_provider;
        settings.models.primary_model = legacy.ai_model;
        settings.models.primary_api_key = legacy.ai_api_key;
        settings.models.primary_base_url = legacy.ai_base_url;
        settings.ui.theme = legacy.theme;
        settings.ui.font_size = legacy.font_size;
        settings.ui.workspace_path = legacy.workspace_path;
        settings.ui.language = legacy.language;
        settings.keyboard.shortcut_profile = legacy.shortcut_profile;
        settings.keyboard.show_shortcut_hints = legacy.show_shortcut_hints;
        settings.keyboard.preview_focus_follows_editor = legacy.preview_focus_follows_editor;
        settings
    }
}

/// Config service for persistent storage.
pub struct ConfigService {
    config_path: PathBuf,
    settings: AppSettings,
}

impl ConfigService {
    /// Create a new config service.
    pub fn new() -> Self {
        let config_dir = dirs_config_dir();
        let config_path = config_dir.join("settings.json");

        let settings = if config_path.exists() {
            std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|raw| AppSettings::load_compatible(&raw))
                .unwrap_or_default()
        } else {
            AppSettings::default()
        };

        Self {
            config_path,
            settings,
        }
    }

    /// Get current settings.
    pub fn settings(&self) -> &AppSettings {
        &self.settings
    }

    /// Update settings.
    pub fn update(&mut self, settings: AppSettings) {
        self.settings = settings;
        self.save();
    }

    /// Save settings to disk.
    pub fn save(&self) {
        if let Some(parent) = self.config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(s) = serde_json::to_string_pretty(&self.settings) {
            let _ = std::fs::write(&self.config_path, s);
        }
    }

    /// Get config directory.
    pub fn config_dir() -> PathBuf {
        dirs_config_dir()
    }
}

impl Default for ConfigService {
    fn default() -> Self {
        Self::new()
    }
}

/// Get config directory cross-platform.
fn dirs_config_dir() -> PathBuf {
    if let Some(dir) = dirs::config_dir() {
        dir.join("tui-notebook")
    } else {
        PathBuf::from(".").join(".config").join("tui-notebook")
    }
}

#[cfg(test)]
mod tests {
    use super::{AppSettings, ShortcutProfile};

    #[test]
    fn load_compatible_maps_legacy_flat_settings() {
        let raw = r#"{
            "ai_provider": "gemini",
            "ai_model": "gemini-2.0-flash",
            "ai_api_key": "secret",
            "ai_base_url": "https://example.test/v1",
            "theme": "light",
            "font_size": 18,
            "workspace_path": "/tmp/notebooks",
            "language": "zh",
            "shortcut_profile": "ide_compatible",
            "show_shortcut_hints": false,
            "preview_focus_follows_editor": false
        }"#;

        let settings = AppSettings::load_compatible(raw).expect("legacy config should parse");

        assert_eq!(settings.models.primary_provider, "gemini");
        assert_eq!(settings.models.primary_model, "gemini-2.0-flash");
        assert_eq!(
            settings.models.primary_base_url.as_deref(),
            Some("https://example.test/v1")
        );
        assert_eq!(settings.ui.theme, "light");
        assert_eq!(settings.ui.font_size, 18);
        assert_eq!(settings.ui.workspace_path, "/tmp/notebooks");
        assert_eq!(settings.ui.language, "zh");
        assert_eq!(settings.keyboard.shortcut_profile, ShortcutProfile::IdeCompatible);
        assert!(!settings.keyboard.show_shortcut_hints);
        assert!(!settings.keyboard.preview_focus_follows_editor);
    }

    #[test]
    fn load_compatible_preserves_grouped_settings() {
        let raw = r#"{
            "runtime": {
                "enable_local_runtime": false,
                "enable_channel_runtime": true,
                "notebook_context_mode": "selection_only",
                "session_policy": "direct_only"
            },
            "models": {
                "primary_provider": "anthropic",
                "primary_model": "claude-3-5-sonnet",
                "primary_api_key": null,
                "primary_base_url": null,
                "visual_provider": "openai",
                "visual_model": "gpt-4o-mini",
                "embedding_provider": "openai",
                "embedding_model": "text-embedding-3-small",
                "reasoning_level": "high",
                "streaming_enabled": false
            },
            "ui": {
                "theme": "dark",
                "font_size": 16,
                "workspace_path": ".",
                "language": "en"
            },
            "keyboard": {
                "shortcut_profile": "terminal_leader",
                "show_shortcut_hints": true,
                "preview_focus_follows_editor": true
            }
        }"#;

        let settings = AppSettings::load_compatible(raw).expect("grouped config should parse");

        assert!(!settings.runtime.enable_local_runtime);
        assert!(settings.runtime.enable_channel_runtime);
        assert_eq!(settings.runtime.notebook_context_mode, "selection_only");
        assert_eq!(settings.runtime.session_policy, "direct_only");
        assert_eq!(settings.models.primary_provider, "anthropic");
        assert_eq!(settings.models.reasoning_level, "high");
        assert!(!settings.models.streaming_enabled);
        assert_eq!(settings.ui.font_size, 16);
        assert_eq!(
            settings.keyboard.shortcut_profile,
            ShortcutProfile::TerminalLeader
        );
    }
}
