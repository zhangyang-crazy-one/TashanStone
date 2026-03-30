//! Settings modal for the notebook-native assistant control console.

use crate::i18n::{Language, TextKey};
use crate::services::config::{
    AppSettings, ConfigService, ShortcutProfile, ToolSettings,
};
use crate::theme::{Theme, ThemeManager};
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers, MouseButton, MouseEvent, MouseEventKind};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SettingsPage {
    Runtime,
    Models,
    Fallback,
    Tools,
    Plugins,
    Skills,
    Agents,
    Scheduling,
    Channels,
    Media,
    Safety,
    Observability,
    Ui,
    Keyboard,
    About,
}

impl SettingsPage {
    const ALL: [SettingsPage; 15] = [
        SettingsPage::Runtime,
        SettingsPage::Models,
        SettingsPage::Fallback,
        SettingsPage::Tools,
        SettingsPage::Plugins,
        SettingsPage::Skills,
        SettingsPage::Agents,
        SettingsPage::Scheduling,
        SettingsPage::Channels,
        SettingsPage::Media,
        SettingsPage::Safety,
        SettingsPage::Observability,
        SettingsPage::Ui,
        SettingsPage::Keyboard,
        SettingsPage::About,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PageAvailability {
    Active,
    Planned,
    Experimental,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FieldKind {
    Input,
    Select,
    Toggle,
    Info,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FooterAction {
    Cancel,
    Save,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FieldId {
    RuntimeLocal,
    RuntimeNotebookContext,
    RuntimeSessionPolicy,
    RuntimeChannelRuntime,
    ModelsPrimaryProvider,
    ModelsPrimaryModel,
    ModelsPrimaryApiKey,
    ModelsPrimaryBaseUrl,
    ModelsReasoningLevel,
    ModelsStreaming,
    UiWorkspace,
    UiFontSize,
    UiTheme,
    UiLanguage,
    KeyboardProfile,
    KeyboardHints,
    KeyboardPreviewFollow,
}

#[derive(Debug, Clone)]
struct SettingField {
    id: FieldId,
    label: String,
    value: String,
    kind: FieldKind,
    enabled: bool,
}

#[derive(Debug, Clone)]
struct PageView {
    page: SettingsPage,
    description: String,
    availability: PageAvailability,
    fields: Vec<SettingField>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CursorTarget {
    Field(usize),
    Footer(FooterAction),
}

pub struct SettingsModal {
    config_service: ConfigService,
    theme_manager: ThemeManager,
    draft: AppSettings,
    selected_page: usize,
    cursor_target: CursorTarget,
    is_open: bool,
    is_editing: bool,
    editing_field: String,
    is_dirty: bool,
    applied_settings: Option<AppSettings>,
    ui_language: Language,
}

impl SettingsModal {
    pub fn new() -> Self {
        let config_service = ConfigService::new();
        let draft = config_service.settings().clone();
        Self {
            config_service,
            theme_manager: ThemeManager::new(),
            draft,
            selected_page: 0,
            cursor_target: CursorTarget::Field(0),
            is_open: false,
            is_editing: false,
            editing_field: String::new(),
            is_dirty: false,
            applied_settings: None,
            ui_language: Language::En,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.ui_language = language;
    }

    pub fn set_theme(&mut self, theme: Theme) {
        self.theme_manager.set_theme(theme);
        self.draft.ui.theme = theme.to_string();
    }

    pub fn open(&mut self) {
        self.config_service = ConfigService::new();
        self.draft = self.config_service.settings().clone();
        self.ui_language = Language::from_code(&self.draft.ui.language);
        self.theme_manager.set_theme(if self.draft.ui.theme == "light" {
            Theme::Light
        } else {
            Theme::Dark
        });
        self.selected_page = 0;
        self.cursor_target = CursorTarget::Field(0);
        self.is_open = true;
        self.is_editing = false;
        self.editing_field.clear();
        self.is_dirty = false;
        self.applied_settings = None;
    }

    pub fn close(&mut self) {
        self.is_open = false;
        self.is_editing = false;
        self.editing_field.clear();
        self.is_dirty = false;
    }

    pub fn is_open(&self) -> bool {
        self.is_open
    }

    pub fn take_applied_settings(&mut self) -> Option<AppSettings> {
        self.applied_settings.take()
    }

    pub fn handle_key_event(&mut self, key: KeyEvent) -> bool {
        if !self.is_open {
            return false;
        }

        if self.is_editing {
            if key.modifiers.contains(KeyModifiers::CONTROL) {
                if let KeyCode::Char('s') = key.code {
                    self.commit_edit();
                    self.save(false);
                    return true;
                }
            }
            match key.code {
                KeyCode::Esc => {
                    self.is_editing = false;
                    self.editing_field.clear();
                    return true;
                }
                KeyCode::Enter => {
                    self.commit_edit();
                    return true;
                }
                KeyCode::Backspace => {
                    self.editing_field.pop();
                    return true;
                }
                KeyCode::Char(c) => {
                    self.editing_field.push(c);
                    return true;
                }
                _ => return true,
            }
        }

        if key.modifiers.contains(KeyModifiers::CONTROL) {
            match key.code {
                KeyCode::Char('s') => {
                    self.save(false);
                    return true;
                }
                KeyCode::Char('r') => {
                    self.reset_current_page_defaults();
                    return true;
                }
                _ => {}
            }
        }

        match key.code {
            KeyCode::Esc => {
                self.close();
                true
            }
            KeyCode::Tab => {
                self.select_page(true);
                true
            }
            KeyCode::BackTab => {
                self.select_page(false);
                true
            }
            KeyCode::Up => {
                self.move_cursor(false);
                true
            }
            KeyCode::Down => {
                self.move_cursor(true);
                true
            }
            KeyCode::Left => {
                self.adjust_current(-1);
                true
            }
            KeyCode::Right => {
                self.adjust_current(1);
                true
            }
            KeyCode::Enter => {
                self.activate_current();
                true
            }
            KeyCode::Char(c) if c.is_ascii_digit() => {
                let index = (c as u8).saturating_sub(b'1') as usize;
                if index < SettingsPage::ALL.len() {
                    self.selected_page = index;
                    self.cursor_target = CursorTarget::Field(0);
                }
                true
            }
            _ => false,
        }
    }

    pub fn handle_mouse_event(&mut self, mouse: MouseEvent, area: Rect) -> bool {
        if !self.is_open || !matches!(mouse.kind, MouseEventKind::Down(MouseButton::Left)) {
            return false;
        }

        let layout = self.layout(area);
        let point = (mouse.column, mouse.row);

        if Self::contains(layout.close_button, point) {
            self.close();
            return true;
        }

        for (index, rect) in layout.nav_items.iter().enumerate() {
            if Self::contains(*rect, point) {
                self.selected_page = index;
                self.cursor_target = CursorTarget::Field(0);
                self.is_editing = false;
                self.editing_field.clear();
                return true;
            }
        }

        for (index, rect) in layout.field_items.iter().enumerate() {
            if Self::contains(*rect, point) {
                self.cursor_target = CursorTarget::Field(index);
                self.activate_current();
                return true;
            }
        }

        if Self::contains(layout.cancel_button, point) {
            self.cursor_target = CursorTarget::Footer(FooterAction::Cancel);
            self.activate_current();
            return true;
        }

        if Self::contains(layout.save_button, point) {
            self.cursor_target = CursorTarget::Footer(FooterAction::Save);
            self.activate_current();
            return true;
        }

        false
    }

    pub fn render(&self, f: &mut Frame<'_>, area: Rect) {
        if !self.is_open {
            return;
        }

        let layout = self.layout(area);
        let page_view = self.current_page_view();

        f.render_widget(
            Block::default().style(Style::default().bg(Color::Rgb(3, 8, 18))),
            area,
        );
        f.render_widget(Clear, layout.modal);
        f.render_widget(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Rgb(48, 54, 61)))
                .style(Style::default().bg(Color::Rgb(13, 17, 23))),
            layout.modal,
        );

        let dirty_suffix = if self.is_dirty {
            self.text_dirty_suffix()
        } else {
            ""
        };
        let header = Paragraph::new(Line::from(vec![
            Span::styled(
                self.ui_language.translator().text(TextKey::SettingsTitle),
                Style::default()
                    .fg(Color::Rgb(201, 209, 217))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                format!(" / {}{}", self.page_label(page_view.page), dirty_suffix),
                Style::default().fg(Color::Rgb(201, 209, 217)),
            ),
            Span::raw(" "),
            Span::styled(
                self.text_close_hint(),
                Style::default().fg(Color::Rgb(110, 118, 129)),
            ),
        ]))
        .style(Style::default().bg(Color::Rgb(22, 27, 34)));
        f.render_widget(header, layout.header);

        for (index, page) in SettingsPage::ALL.iter().enumerate() {
            let active = index == self.selected_page;
            self.render_nav_item(f, layout.nav_items[index], *page, active);
        }

        let title = Paragraph::new(self.page_title(page_view.page))
            .style(
                Style::default()
                    .fg(Color::Rgb(201, 209, 217))
                    .add_modifier(Modifier::BOLD),
            );
        f.render_widget(title, layout.page_title);
        self.render_status_badge(f, layout.page_status, page_view.availability);
        let desc = Paragraph::new(page_view.description)
            .wrap(Wrap { trim: true })
            .style(Style::default().fg(Color::Rgb(139, 148, 158)));
        f.render_widget(desc, layout.page_description);

        for (index, field) in page_view.fields.iter().enumerate() {
            self.render_field(
                f,
                layout.field_items[index],
                field,
                self.cursor_target == CursorTarget::Field(index),
            );
        }

        let cancel_focused = self.cursor_target == CursorTarget::Footer(FooterAction::Cancel);
        let save_focused = self.cursor_target == CursorTarget::Footer(FooterAction::Save);
        self.render_footer_button(
            f,
            layout.cancel_button,
            self.ui_language.translator().text(TextKey::DialogCancel),
            cancel_focused,
            false,
        );
        self.render_footer_button(
            f,
            layout.save_button,
            self.ui_language.translator().text(TextKey::SettingsSave),
            save_focused,
            true,
        );

        let footer_status = Paragraph::new(self.page_footer_hint(page_view.availability))
            .style(Style::default().fg(Color::Rgb(110, 118, 129)));
        f.render_widget(footer_status, layout.footer_hint);

        if self.is_editing {
            if let CursorTarget::Field(index) = self.cursor_target {
                if let Some(rect) = layout.field_items.get(index) {
                    let width = rect.width.saturating_sub(4);
                    let cursor_x = rect.x + 2 + (self.editing_field.chars().count() as u16).min(width);
                    f.set_cursor_position((cursor_x, rect.y + 1));
                }
            }
        }
    }

    fn current_page_view(&self) -> PageView {
        let page = SettingsPage::ALL[self.selected_page];
        let availability = self.page_availability(page);
        let fields = match page {
            SettingsPage::Runtime => vec![
                self.toggle_field(
                    FieldId::RuntimeLocal,
                    self.text_runtime_local(),
                    self.bool_label(self.draft.runtime.enable_local_runtime),
                    true,
                ),
                self.select_field(
                    FieldId::RuntimeNotebookContext,
                    self.text_runtime_context(),
                    self.localized_context_mode(&self.draft.runtime.notebook_context_mode),
                    true,
                ),
                self.select_field(
                    FieldId::RuntimeSessionPolicy,
                    self.text_runtime_session_policy(),
                    self.localized_session_policy(&self.draft.runtime.session_policy),
                    true,
                ),
                self.toggle_field(
                    FieldId::RuntimeChannelRuntime,
                    self.text_runtime_channel_runtime(),
                    self.bool_label(self.draft.runtime.enable_channel_runtime),
                    false,
                ),
            ],
            SettingsPage::Models => vec![
                self.select_field(
                    FieldId::ModelsPrimaryProvider,
                    self.ui_language.translator().text(TextKey::SettingsProvider).to_string(),
                    self.draft.models.primary_provider.clone(),
                    true,
                ),
                self.input_field(
                    FieldId::ModelsPrimaryModel,
                    self.ui_language.translator().text(TextKey::SettingsModel).to_string(),
                    self.draft.models.primary_model.clone(),
                    true,
                ),
                self.input_field(
                    FieldId::ModelsPrimaryApiKey,
                    self.ui_language.translator().text(TextKey::SettingsApiKey).to_string(),
                    self.mask_secret(self.draft.models.primary_api_key.as_deref()),
                    true,
                ),
                self.input_field(
                    FieldId::ModelsPrimaryBaseUrl,
                    self.ui_language.translator().text(TextKey::SettingsBaseUrl).to_string(),
                    self.draft.models.primary_base_url.clone().unwrap_or_default(),
                    true,
                ),
                self.select_field(
                    FieldId::ModelsReasoningLevel,
                    self.text_models_reasoning(),
                    self.localized_reasoning_level(&self.draft.models.reasoning_level),
                    true,
                ),
                self.toggle_field(
                    FieldId::ModelsStreaming,
                    self.text_models_streaming(),
                    self.bool_label(self.draft.models.streaming_enabled),
                    true,
                ),
                self.planned_field(
                    self.text_models_vision_stack(),
                    format!(
                        "{} / {}",
                        self.draft.models.visual_provider, self.draft.models.visual_model
                    ),
                ),
                self.planned_field(
                    self.text_models_embedding_stack(),
                    format!(
                        "{} / {}",
                        self.draft.models.embedding_provider, self.draft.models.embedding_model
                    ),
                ),
            ],
            SettingsPage::Fallback => vec![
                self.planned_field(self.text_fallback_enabled(), self.bool_label(self.draft.fallback.enable_model_fallback)),
                self.planned_field(self.text_fallback_policy(), self.draft.fallback.failover_policy.clone()),
                self.planned_field(self.text_fallback_chain(), self.draft.fallback.fallback_chain.clone()),
                self.planned_field(self.text_fallback_backup(), self.draft.fallback.local_backup_model.clone()),
                self.planned_field(self.text_fallback_rotation(), self.draft.fallback.auth_rotation_mode.clone()),
            ],
            SettingsPage::Tools => self.tool_page_fields(&self.draft.tools),
            SettingsPage::Plugins => vec![
                self.planned_field(self.text_plugins_runtime(), self.text_planned_value()),
                self.planned_field(self.text_plugins_workspace(), self.text_planned_value()),
                self.planned_field(self.text_plugins_source(), self.text_plugins_source_value()),
                self.planned_field(self.text_plugins_approval(), self.text_plugins_approval_value()),
                self.planned_field(self.text_plugins_sandbox(), self.text_plugins_sandbox_value()),
            ],
            SettingsPage::Skills => vec![
                self.planned_field(
                    self.text_skills_registry(),
                    self.bool_label(self.draft.tools.enable_skills_registry),
                ),
                self.planned_field(self.text_skills_project(), self.text_skills_project_value()),
                self.planned_field(self.text_skills_source(), self.text_skills_source_value()),
                self.planned_field(self.text_skills_binding(), self.text_skills_binding_value()),
                self.planned_field(self.text_skills_scope(), self.draft.agents.workspace_isolation.clone()),
            ],
            SettingsPage::Agents => vec![
                self.planned_field(self.text_agents_enabled(), self.bool_label(self.draft.agents.enable_sub_agents)),
                self.planned_field(self.text_agents_policy(), self.draft.agents.delegation_policy.clone()),
                self.planned_field(self.text_agents_tier(), self.draft.agents.default_model_tier.clone()),
                self.planned_field(self.text_agents_coordination(), self.bool_label(self.draft.agents.allow_agent_to_agent)),
                self.planned_field(self.text_agents_isolation(), self.draft.agents.workspace_isolation.clone()),
            ],
            SettingsPage::Scheduling => vec![
                self.planned_field(self.text_sched_cron(), self.bool_label(self.draft.scheduling.enable_cron)),
                self.planned_field(self.text_sched_heartbeat(), self.bool_label(self.draft.scheduling.enable_heartbeat)),
                self.planned_field(self.text_sched_timezone(), self.draft.scheduling.timezone.clone()),
                self.planned_field(self.text_sched_indexing(), self.bool_label(self.draft.scheduling.enable_auto_indexing_job)),
                self.planned_field(self.text_sched_digest(), self.bool_label(self.draft.scheduling.enable_digest_job)),
            ],
            SettingsPage::Channels => vec![
                self.planned_field(self.text_channel_whatsapp(), self.channel_summary("WhatsApp", &self.draft.channels.whatsapp)),
                self.planned_field(self.text_channel_whatsapp_delivery(), self.channel_delivery_summary(&self.draft.channels.whatsapp)),
                self.planned_field(self.text_channel_qq(), self.channel_summary("QQ Channel", &self.draft.channels.qq_channel)),
                self.planned_field(self.text_channel_qq_delivery(), self.channel_delivery_summary(&self.draft.channels.qq_channel)),
            ],
            SettingsPage::Media => vec![
                self.planned_field(self.text_media_vision(), self.bool_label(self.draft.media.enable_vision)),
                self.planned_field(self.text_media_audio(), self.bool_label(self.draft.media.enable_audio_transcription)),
                self.planned_field(self.text_media_docs(), self.bool_label(self.draft.media.enable_document_ingest)),
                self.planned_field(
                    self.text_media_limits(),
                    format!(
                        "{} / {} MB",
                        self.draft.media.inbound_media_limit_mb, self.draft.media.outbound_media_limit_mb
                    ),
                ),
                self.planned_field(self.text_media_detail(), self.draft.media.image_detail_mode.clone()),
            ],
            SettingsPage::Safety => vec![
                self.planned_field(self.text_safety_pairing(), self.draft.safety.dm_pairing_policy.clone()),
                self.planned_field(self.text_safety_sandbox(), self.draft.safety.sandbox_mode.clone()),
                self.planned_field(self.text_safety_trusted(), self.bool_label(self.draft.safety.trusted_local_tools)),
                self.planned_field(
                    self.text_safety_non_main(),
                    self.bool_label(self.draft.safety.restrict_non_main_sessions),
                ),
                self.planned_field(
                    self.text_safety_destructive(),
                    self.bool_label(self.draft.safety.confirm_destructive_tools),
                ),
            ],
            SettingsPage::Observability => vec![
                self.planned_field(
                    self.text_obsv_usage(),
                    self.bool_label(self.draft.observability.show_usage_footer),
                ),
                self.planned_field(
                    self.text_obsv_health(),
                    self.bool_label(self.draft.observability.enable_health_checks),
                ),
                self.planned_field(self.text_obsv_log_level(), self.draft.observability.log_level.clone()),
                self.planned_field(
                    self.text_obsv_sessions(),
                    self.bool_label(self.draft.observability.enable_session_diagnostics),
                ),
                self.planned_field(
                    self.text_obsv_delivery(),
                    self.bool_label(self.draft.observability.enable_delivery_debug),
                ),
            ],
            SettingsPage::Ui => vec![
                self.input_field(
                    FieldId::UiWorkspace,
                    self.ui_language.translator().text(TextKey::SettingsWorkspace).to_string(),
                    self.draft.ui.workspace_path.clone(),
                    true,
                ),
                self.input_field(
                    FieldId::UiFontSize,
                    self.ui_language.translator().text(TextKey::SettingsFontSize).to_string(),
                    self.draft.ui.font_size.to_string(),
                    true,
                ),
                self.select_field(
                    FieldId::UiTheme,
                    self.ui_language.translator().text(TextKey::SettingsTheme).to_string(),
                    self.localized_theme(&self.draft.ui.theme),
                    true,
                ),
                self.select_field(
                    FieldId::UiLanguage,
                    self.ui_language.translator().text(TextKey::SettingsLanguage).to_string(),
                    self
                        .ui_language
                        .translator()
                        .language_name(Language::from_code(&self.draft.ui.language))
                        .to_string(),
                    true,
                ),
            ],
            SettingsPage::Keyboard => vec![
                self.select_field(
                    FieldId::KeyboardProfile,
                    self.ui_language.translator().text(TextKey::SettingsProfile).to_string(),
                    self
                        .ui_language
                        .translator()
                        .shortcut_profile_label(self.draft.keyboard.shortcut_profile)
                        .to_string(),
                    true,
                ),
                self.toggle_field(
                    FieldId::KeyboardHints,
                    self.ui_language.translator().text(TextKey::SettingsStatusHints).to_string(),
                    self.bool_label(self.draft.keyboard.show_shortcut_hints),
                    true,
                ),
                self.select_field(
                    FieldId::KeyboardPreviewFollow,
                    self.ui_language.translator().text(TextKey::SettingsPreviewFollow).to_string(),
                    if self.draft.keyboard.preview_focus_follows_editor {
                        self.ui_language
                            .translator()
                            .text(TextKey::SettingsFollowEditor)
                            .to_string()
                    } else {
                        self.ui_language
                            .translator()
                            .text(TextKey::SettingsKeepPreviewScroll)
                            .to_string()
                    },
                    true,
                ),
            ],
            SettingsPage::About => vec![
                self.info_field(self.text_about_build(), self.text_about_build_value()),
                self.info_field(self.text_about_focus(), self.text_about_focus_value()),
                self.info_field(self.text_about_roadmap(), self.text_about_roadmap_value()),
            ],
        };

        let description = match page {
            SettingsPage::About => self.about_description(),
            _ => self.page_description(page),
        };

        PageView {
            page,
            description,
            availability,
            fields,
        }
    }

    fn page_availability(&self, page: SettingsPage) -> PageAvailability {
        match page {
            SettingsPage::Runtime
            | SettingsPage::Models
            | SettingsPage::Ui
            | SettingsPage::Keyboard
            | SettingsPage::About => PageAvailability::Active,
            SettingsPage::Channels | SettingsPage::Media => PageAvailability::Experimental,
            SettingsPage::Fallback
            | SettingsPage::Tools
            | SettingsPage::Plugins
            | SettingsPage::Skills
            | SettingsPage::Agents
            | SettingsPage::Scheduling
            | SettingsPage::Safety
            | SettingsPage::Observability => PageAvailability::Planned,
        }
    }

    fn tool_page_fields(&self, tools: &ToolSettings) -> Vec<SettingField> {
        vec![
            self.planned_field(self.text_tools_mcp(), self.bool_label(tools.enable_mcp_tools)),
            self.planned_field(self.text_tools_files(), self.bool_label(tools.enable_file_tools)),
            self.planned_field(self.text_tools_search(), self.bool_label(tools.enable_search_tools)),
            self.planned_field(self.text_tools_browser(), self.bool_label(tools.enable_browser_tools)),
            self.planned_field(self.text_tools_exec(), self.bool_label(tools.enable_exec_tools)),
        ]
    }

    fn input_field(&self, id: FieldId, label: String, value: String, enabled: bool) -> SettingField {
        SettingField {
            id,
            label,
            value,
            kind: FieldKind::Input,
            enabled,
        }
    }

    fn select_field(
        &self,
        id: FieldId,
        label: impl Into<String>,
        value: String,
        enabled: bool,
    ) -> SettingField {
        SettingField {
            id,
            label: label.into(),
            value,
            kind: FieldKind::Select,
            enabled,
        }
    }

    fn toggle_field(
        &self,
        id: FieldId,
        label: impl Into<String>,
        value: String,
        enabled: bool,
    ) -> SettingField {
        SettingField {
            id,
            label: label.into(),
            value,
            kind: FieldKind::Toggle,
            enabled,
        }
    }

    fn planned_field(&self, label: impl Into<String>, value: String) -> SettingField {
        SettingField {
            id: FieldId::RuntimeLocal,
            label: label.into(),
            value,
            kind: FieldKind::Info,
            enabled: false,
        }
    }

    fn info_field(&self, label: impl Into<String>, value: String) -> SettingField {
        SettingField {
            id: FieldId::RuntimeLocal,
            label: label.into(),
            value,
            kind: FieldKind::Info,
            enabled: true,
        }
    }

    fn select_page(&mut self, forward: bool) {
        let len = SettingsPage::ALL.len();
        if forward {
            self.selected_page = (self.selected_page + 1) % len;
        } else if self.selected_page == 0 {
            self.selected_page = len - 1;
        } else {
            self.selected_page -= 1;
        }
        self.cursor_target = CursorTarget::Field(0);
        self.is_editing = false;
        self.editing_field.clear();
    }

    fn move_cursor(&mut self, forward: bool) {
        let max = self.max_cursor_index();
        let current = self.cursor_index();
        let next = if forward {
            (current + 1) % (max + 1)
        } else if current == 0 {
            max
        } else {
            current - 1
        };
        self.cursor_target = self.cursor_from_index(next);
    }

    fn activate_current(&mut self) {
        match self.cursor_target {
            CursorTarget::Field(index) => {
                let fields = self.current_page_view().fields;
                let Some(field) = fields.get(index) else {
                    return;
                };
                if !field.enabled {
                    return;
                }
                match field.kind {
                    FieldKind::Input => self.begin_edit(field.id),
                    FieldKind::Select | FieldKind::Toggle => self.adjust_field(field.id, 1),
                    FieldKind::Info => {}
                }
            }
            CursorTarget::Footer(FooterAction::Cancel) => self.close(),
            CursorTarget::Footer(FooterAction::Save) => self.save(true),
        }
    }

    fn adjust_current(&mut self, direction: i32) {
        if let CursorTarget::Field(index) = self.cursor_target {
            let fields = self.current_page_view().fields;
            let Some(field) = fields.get(index) else {
                return;
            };
            if field.enabled && matches!(field.kind, FieldKind::Select | FieldKind::Toggle) {
                self.adjust_field(field.id, direction);
            }
        }
    }

    fn adjust_field(&mut self, id: FieldId, direction: i32) {
        match id {
            FieldId::RuntimeLocal => {
                self.draft.runtime.enable_local_runtime = !self.draft.runtime.enable_local_runtime;
            }
            FieldId::RuntimeNotebookContext => {
                let values = ["workspace_scoped", "active_note", "selection_only"];
                self.draft.runtime.notebook_context_mode =
                    Self::cycle_string(&self.draft.runtime.notebook_context_mode, &values, direction)
                        .to_string();
            }
            FieldId::RuntimeSessionPolicy => {
                let values = ["main_and_isolated", "workspace_scoped", "direct_only"];
                self.draft.runtime.session_policy =
                    Self::cycle_string(&self.draft.runtime.session_policy, &values, direction)
                        .to_string();
            }
            FieldId::ModelsPrimaryProvider => {
                let values = ["openai", "gemini", "ollama", "anthropic"];
                self.draft.models.primary_provider =
                    Self::cycle_string(&self.draft.models.primary_provider, &values, direction)
                        .to_string();
                let supported_models =
                    self.get_models_for_provider(&self.draft.models.primary_provider);
                if self.draft.models.primary_model.trim().is_empty()
                    || !supported_models.contains(&self.draft.models.primary_model.as_str())
                {
                    self.draft.models.primary_model = supported_models[0].to_string();
                }
            }
            FieldId::ModelsReasoningLevel => {
                let values = ["minimal", "low", "balanced", "high"];
                self.draft.models.reasoning_level =
                    Self::cycle_string(&self.draft.models.reasoning_level, &values, direction)
                        .to_string();
            }
            FieldId::ModelsStreaming => {
                self.draft.models.streaming_enabled = !self.draft.models.streaming_enabled;
            }
            FieldId::UiTheme => {
                let values = ["dark", "light"];
                self.draft.ui.theme =
                    Self::cycle_string(&self.draft.ui.theme, &values, direction).to_string();
                self.theme_manager.set_theme(if self.draft.ui.theme == "light" {
                    Theme::Light
                } else {
                    Theme::Dark
                });
            }
            FieldId::UiLanguage => {
                let values = ["en", "zh"];
                self.draft.ui.language =
                    Self::cycle_string(&self.draft.ui.language, &values, direction).to_string();
                self.ui_language = Language::from_code(&self.draft.ui.language);
            }
            FieldId::KeyboardProfile => {
                self.draft.keyboard.shortcut_profile = match self.draft.keyboard.shortcut_profile {
                    ShortcutProfile::TerminalLeader => ShortcutProfile::IdeCompatible,
                    ShortcutProfile::IdeCompatible => ShortcutProfile::TerminalLeader,
                };
            }
            FieldId::KeyboardHints => {
                self.draft.keyboard.show_shortcut_hints = !self.draft.keyboard.show_shortcut_hints;
            }
            FieldId::KeyboardPreviewFollow => {
                self.draft.keyboard.preview_focus_follows_editor =
                    !self.draft.keyboard.preview_focus_follows_editor;
            }
            _ => return,
        }
        self.is_dirty = true;
    }

    fn begin_edit(&mut self, id: FieldId) {
        self.editing_field = match id {
            FieldId::ModelsPrimaryModel => self.draft.models.primary_model.clone(),
            FieldId::ModelsPrimaryApiKey => self.draft.models.primary_api_key.clone().unwrap_or_default(),
            FieldId::ModelsPrimaryBaseUrl => {
                self.draft.models.primary_base_url.clone().unwrap_or_default()
            }
            FieldId::UiWorkspace => self.draft.ui.workspace_path.clone(),
            FieldId::UiFontSize => self.draft.ui.font_size.to_string(),
            _ => return,
        };
        self.is_editing = true;
    }

    fn commit_edit(&mut self) {
        if let CursorTarget::Field(index) = self.cursor_target {
            let fields = self.current_page_view().fields;
            if let Some(field) = fields.get(index) {
                match field.id {
                    FieldId::ModelsPrimaryModel => {
                        self.draft.models.primary_model = self.editing_field.clone();
                    }
                    FieldId::ModelsPrimaryApiKey => {
                        self.draft.models.primary_api_key = if self.editing_field.trim().is_empty() {
                            None
                        } else {
                            Some(self.editing_field.clone())
                        };
                    }
                    FieldId::ModelsPrimaryBaseUrl => {
                        self.draft.models.primary_base_url = if self.editing_field.trim().is_empty() {
                            None
                        } else {
                            Some(self.editing_field.clone())
                        };
                    }
                    FieldId::UiWorkspace => {
                        self.draft.ui.workspace_path = self.editing_field.clone();
                    }
                    FieldId::UiFontSize => {
                        if let Ok(size) = self.editing_field.parse::<u8>() {
                            self.draft.ui.font_size = size.clamp(10, 32);
                        }
                    }
                    _ => {}
                }
                self.is_dirty = true;
            }
        }
        self.is_editing = false;
        self.editing_field.clear();
    }

    fn save(&mut self, close_after: bool) {
        self.applied_settings = Some(self.draft.clone());
        self.is_dirty = false;
        self.is_editing = false;
        self.editing_field.clear();
        if close_after {
            self.is_open = false;
        }
    }

    fn reset_current_page_defaults(&mut self) {
        match SettingsPage::ALL[self.selected_page] {
            SettingsPage::Runtime => self.draft.runtime = AppSettings::default().runtime,
            SettingsPage::Models => self.draft.models = AppSettings::default().models,
            SettingsPage::Fallback => self.draft.fallback = AppSettings::default().fallback,
            SettingsPage::Tools => self.draft.tools = AppSettings::default().tools,
            SettingsPage::Plugins => {}
            SettingsPage::Skills => {}
            SettingsPage::Agents => self.draft.agents = AppSettings::default().agents,
            SettingsPage::Scheduling => self.draft.scheduling = AppSettings::default().scheduling,
            SettingsPage::Channels => self.draft.channels = AppSettings::default().channels,
            SettingsPage::Media => self.draft.media = AppSettings::default().media,
            SettingsPage::Safety => self.draft.safety = AppSettings::default().safety,
            SettingsPage::Observability => {
                self.draft.observability = AppSettings::default().observability
            }
            SettingsPage::Ui => self.draft.ui = AppSettings::default().ui,
            SettingsPage::Keyboard => self.draft.keyboard = AppSettings::default().keyboard,
            SettingsPage::About => {}
        }
        self.is_dirty = true;
    }

    fn layout(&self, area: Rect) -> SettingsLayout {
        let available_width = area.width.saturating_sub(2).max(1);
        let available_height = area.height.saturating_sub(2).max(1);
        let width = if available_width >= 72 {
            available_width.min(104)
        } else {
            available_width
        };
        let height = if available_height >= 24 {
            available_height.min(34)
        } else {
            available_height
        };
        let modal = Rect::new(
            area.x + (area.width.saturating_sub(width)) / 2,
            area.y + (area.height.saturating_sub(height)) / 2,
            width,
            height,
        );

        let inner = Rect::new(
            modal.x + 1,
            modal.y + 1,
            modal.width.saturating_sub(2),
            modal.height.saturating_sub(2),
        );
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(2),
                Constraint::Min(10),
                Constraint::Length(3),
            ])
            .split(inner);
        let body = chunks[1];
        let footer = chunks[2];
        let nav_width = body.width.min(22).max(16);
        let body_chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(nav_width), Constraint::Min(20)])
            .split(body);

        let nav = body_chunks[0];
        let content = body_chunks[1];
        let nav_item_height = if nav.height >= (SettingsPage::ALL.len() as u16).saturating_mul(2) {
            2
        } else {
            1
        };
        let nav_items = (0..SettingsPage::ALL.len())
            .map(|index| {
                Rect::new(
                    nav.x,
                    nav.y + index as u16 * nav_item_height,
                    nav.width.saturating_sub(1),
                    nav_item_height,
                )
            })
            .collect::<Vec<_>>();

        let page_chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Length(2),
                Constraint::Min(6),
            ])
            .split(content);

        let field_count = self.current_page_view().fields.len() as u16;
        let field_items = (0..field_count)
            .map(|index| Rect::new(page_chunks[2].x, page_chunks[2].y + index * 3, page_chunks[2].width, 3))
            .collect::<Vec<_>>();

        let cancel_width = footer.width.min(11);
        let save_width = footer.width.min(14);
        let button_gap = 3.min(footer.width.saturating_sub(cancel_width + save_width));
        let buttons_total = cancel_width + save_width + button_gap;
        let buttons_x = footer.x + footer.width.saturating_sub(buttons_total);
        let cancel_button = Rect::new(buttons_x, footer.y, cancel_width, footer.height.min(3));
        let save_button = Rect::new(
            cancel_button.x + cancel_width + button_gap,
            footer.y,
            save_width,
            footer.height.min(3),
        );
        let footer_hint_width = cancel_button.x.saturating_sub(footer.x).saturating_sub(2);

        SettingsLayout {
            modal,
            header: chunks[0],
            close_button: Rect::new(inner.x + inner.width.saturating_sub(9), chunks[0].y, 8, 1),
            nav_items,
            page_title: page_chunks[0],
            page_status: Rect::new(content.x + content.width.saturating_sub(16), page_chunks[0].y, 16, 1),
            page_description: page_chunks[1],
            field_items,
            cancel_button,
            save_button,
            footer_hint: Rect::new(footer.x, footer.y, footer_hint_width, 1),
        }
    }

    fn render_nav_item(&self, f: &mut Frame<'_>, area: Rect, page: SettingsPage, active: bool) {
        if area.height == 1 {
            let fill = if active {
                Color::Rgb(35, 134, 54)
            } else {
                Color::Rgb(31, 37, 54)
            };
            let fg = if active {
                Color::Rgb(240, 255, 244)
            } else {
                Color::Rgb(139, 148, 158)
            };
            f.render_widget(
                Paragraph::new(format!("{} {}", self.page_number(page), self.page_label(page)))
                    .style(Style::default().fg(fg).bg(fill)),
                area,
            );
            return;
        }

        let fill = if active {
            Color::Rgb(35, 134, 54)
        } else {
            Color::Rgb(31, 37, 54)
        };
        let fg = if active {
            Color::Rgb(240, 255, 244)
        } else {
            Color::Rgb(139, 148, 158)
        };
        f.render_widget(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(fill))
                .style(Style::default().bg(fill)),
            area,
        );
        let text = Paragraph::new(format!("{} {}", self.page_number(page), self.page_label(page)))
            .style(Style::default().fg(fg))
            .alignment(Alignment::Left);
        f.render_widget(text, Rect::new(area.x + 1, area.y, area.width.saturating_sub(2), area.height));
    }

    fn render_status_badge(&self, f: &mut Frame<'_>, area: Rect, availability: PageAvailability) {
        let (label, fill, fg) = match availability {
            PageAvailability::Active => (
                self.text_status_active(),
                Color::Rgb(15, 31, 20),
                Color::Rgb(141, 219, 140),
            ),
            PageAvailability::Planned => (
                self.text_status_planned(),
                Color::Rgb(33, 38, 45),
                Color::Rgb(139, 148, 158),
            ),
            PageAvailability::Experimental => (
                self.text_status_experimental(),
                Color::Rgb(39, 29, 11),
                Color::Rgb(255, 184, 108),
            ),
        };
        f.render_widget(
            Paragraph::new(label)
                .style(Style::default().fg(fg).bg(fill))
                .alignment(Alignment::Center),
            area,
        );
    }

    fn render_field(&self, f: &mut Frame<'_>, area: Rect, field: &SettingField, focused: bool) {
        let (border, background, text_color) = if focused {
            (
                Color::Rgb(88, 166, 255),
                Color::Rgb(16, 21, 29),
                Color::Rgb(201, 209, 217),
            )
        } else if field.enabled {
            (
                Color::Rgb(48, 54, 61),
                Color::Rgb(16, 21, 29),
                Color::Rgb(201, 209, 217),
            )
        } else {
            (
                Color::Rgb(48, 54, 61),
                Color::Rgb(16, 21, 29),
                Color::Rgb(110, 118, 129),
            )
        };
        f.render_widget(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(border))
                .style(Style::default().bg(background)),
            area,
        );

        let mut spans = vec![Span::styled(
            format!("{}: ", field.label),
            Style::default()
                .fg(Color::Rgb(139, 148, 158))
                .add_modifier(Modifier::BOLD),
        )];
        spans.push(Span::styled(
            if self.is_editing && focused {
                self.editing_field.clone()
            } else {
                field.value.clone()
            },
            Style::default().fg(text_color),
        ));
        if matches!(field.kind, FieldKind::Select) {
            spans.push(Span::styled("  v", Style::default().fg(Color::Rgb(110, 118, 129))));
        }
        if !field.enabled {
            spans.push(Span::styled(
                format!("  [{}]", self.text_status_planned()),
                Style::default().fg(Color::Rgb(110, 118, 129)),
            ));
        }

        let paragraph = Paragraph::new(Line::from(spans))
            .style(Style::default().bg(background))
            .wrap(Wrap { trim: true });
        f.render_widget(
            paragraph,
            Rect::new(
                area.x + 1,
                area.y + area.height.saturating_sub(2).min(1),
                area.width.saturating_sub(2),
                1,
            ),
        );
    }

    fn render_footer_button(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        label: &str,
        focused: bool,
        primary: bool,
    ) {
        let fill = if primary {
            Color::Rgb(35, 134, 54)
        } else {
            Color::Rgb(31, 37, 54)
        };
        let border = if focused {
            Color::Rgb(88, 166, 255)
        } else {
            fill
        };
        let fg = if primary {
            Color::Rgb(240, 255, 244)
        } else {
            Color::Rgb(139, 148, 158)
        };
        f.render_widget(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(border))
                .style(Style::default().bg(fill)),
            area,
        );
        f.render_widget(
            Paragraph::new(label)
                .style(Style::default().fg(fg).add_modifier(if primary {
                    Modifier::BOLD
                } else {
                    Modifier::empty()
                }))
                .alignment(Alignment::Center),
            area,
        );
    }

    fn cursor_index(&self) -> usize {
        match self.cursor_target {
            CursorTarget::Field(index) => index,
            CursorTarget::Footer(FooterAction::Cancel) => self.current_page_view().fields.len(),
            CursorTarget::Footer(FooterAction::Save) => self.current_page_view().fields.len() + 1,
        }
    }

    fn max_cursor_index(&self) -> usize {
        self.current_page_view().fields.len() + 1
    }

    fn cursor_from_index(&self, index: usize) -> CursorTarget {
        let fields_len = self.current_page_view().fields.len();
        match index {
            i if i < fields_len => CursorTarget::Field(i),
            i if i == fields_len => CursorTarget::Footer(FooterAction::Cancel),
            _ => CursorTarget::Footer(FooterAction::Save),
        }
    }

    fn get_models_for_provider(&self, provider: &str) -> Vec<&'static str> {
        match provider {
            "openai" => vec!["gpt-4", "gpt-4.1", "gpt-4o"],
            "gemini" => vec!["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
            "ollama" => vec!["llama3.2", "qwen2.5", "mistral"],
            "anthropic" => vec!["claude-3-5-sonnet", "claude-3-opus", "claude-3-haiku"],
            _ => vec!["gpt-4"],
        }
    }

    fn cycle_string<'a>(current: &str, values: &'a [&'a str], direction: i32) -> &'a str {
        if values.is_empty() {
            return "";
        }
        let current_index = values.iter().position(|value| *value == current).unwrap_or(0);
        if direction >= 0 {
            values[(current_index + 1) % values.len()]
        } else if current_index == 0 {
            values[values.len() - 1]
        } else {
            values[current_index - 1]
        }
    }

    fn contains(rect: Rect, point: (u16, u16)) -> bool {
        point.0 >= rect.x
            && point.0 < rect.x + rect.width
            && point.1 >= rect.y
            && point.1 < rect.y + rect.height
    }

    fn bool_label(&self, enabled: bool) -> String {
        if enabled {
            self.ui_language.translator().text(TextKey::SettingsOn).to_string()
        } else {
            self.ui_language.translator().text(TextKey::SettingsOff).to_string()
        }
    }

    fn mask_secret(&self, value: Option<&str>) -> String {
        match value {
            Some(secret) if !secret.trim().is_empty() => "sk-********".to_string(),
            _ => String::new(),
        }
    }

    fn channel_summary(
        &self,
        label: &str,
        channel: &crate::services::config::ChannelAdapterSettings,
    ) -> String {
        format!(
            "{label}: {} / {}",
            self.bool_label(channel.enabled),
            channel.auth_mode
        )
    }

    fn channel_delivery_summary(
        &self,
        channel: &crate::services::config::ChannelAdapterSettings,
    ) -> String {
        format!(
            "{} / {} chars / {} MB",
            channel.activation_mode, channel.text_chunk_limit, channel.media_max_mb
        )
    }

    fn localized_context_mode(&self, value: &str) -> String {
        match (self.ui_language, value) {
            (Language::Zh, "workspace_scoped") => "工作区上下文".to_string(),
            (Language::Zh, "active_note") => "当前笔记".to_string(),
            (Language::Zh, "selection_only") => "仅选择内容".to_string(),
            (_, "workspace_scoped") => "Workspace scoped".to_string(),
            (_, "active_note") => "Active note".to_string(),
            (_, "selection_only") => "Selection only".to_string(),
            _ => value.to_string(),
        }
    }

    fn localized_session_policy(&self, value: &str) -> String {
        match (self.ui_language, value) {
            (Language::Zh, "main_and_isolated") => "主会话 + 隔离分支".to_string(),
            (Language::Zh, "workspace_scoped") => "工作区隔离".to_string(),
            (Language::Zh, "direct_only") => "仅直连主会话".to_string(),
            (_, "main_and_isolated") => "Main + isolated".to_string(),
            (_, "workspace_scoped") => "Workspace scoped".to_string(),
            (_, "direct_only") => "Direct only".to_string(),
            _ => value.to_string(),
        }
    }

    fn localized_reasoning_level(&self, value: &str) -> String {
        match (self.ui_language, value) {
            (Language::Zh, "minimal") => "最少".to_string(),
            (Language::Zh, "low") => "低".to_string(),
            (Language::Zh, "balanced") => "平衡".to_string(),
            (Language::Zh, "high") => "高".to_string(),
            (_, "minimal") => "Minimal".to_string(),
            (_, "low") => "Low".to_string(),
            (_, "balanced") => "Balanced".to_string(),
            (_, "high") => "High".to_string(),
            _ => value.to_string(),
        }
    }

    fn localized_theme(&self, value: &str) -> String {
        match value {
            "light" => self.ui_language.translator().text(TextKey::SettingsThemeLight).to_string(),
            _ => self.ui_language.translator().text(TextKey::SettingsThemeDark).to_string(),
        }
    }

    fn page_number(&self, page: SettingsPage) -> usize {
        SettingsPage::ALL
            .iter()
            .position(|item| *item == page)
            .map(|index| index + 1)
            .unwrap_or(1)
    }

    fn page_label(&self, page: SettingsPage) -> &'static str {
        match (self.ui_language, page) {
            (Language::Zh, SettingsPage::Runtime) => "运行时",
            (Language::Zh, SettingsPage::Models) => "模型",
            (Language::Zh, SettingsPage::Fallback) => "降级",
            (Language::Zh, SettingsPage::Tools) => "工具",
            (Language::Zh, SettingsPage::Plugins) => "插件",
            (Language::Zh, SettingsPage::Skills) => "技能",
            (Language::Zh, SettingsPage::Agents) => "子代理",
            (Language::Zh, SettingsPage::Scheduling) => "定时任务",
            (Language::Zh, SettingsPage::Channels) => "通道",
            (Language::Zh, SettingsPage::Media) => "多模态",
            (Language::Zh, SettingsPage::Safety) => "安全",
            (Language::Zh, SettingsPage::Observability) => "观测",
            (Language::Zh, SettingsPage::Ui) => "界面",
            (Language::Zh, SettingsPage::Keyboard) => "键盘",
            (Language::Zh, SettingsPage::About) => "关于",
            (_, SettingsPage::Runtime) => "Runtime",
            (_, SettingsPage::Models) => "Models",
            (_, SettingsPage::Fallback) => "Fallback",
            (_, SettingsPage::Tools) => "Tools",
            (_, SettingsPage::Plugins) => "Plugins",
            (_, SettingsPage::Skills) => "Skills",
            (_, SettingsPage::Agents) => "Agents",
            (_, SettingsPage::Scheduling) => "Scheduling",
            (_, SettingsPage::Channels) => "Channels",
            (_, SettingsPage::Media) => "Media",
            (_, SettingsPage::Safety) => "Safety",
            (_, SettingsPage::Observability) => "Observability",
            (_, SettingsPage::Ui) => "UI",
            (_, SettingsPage::Keyboard) => "Keyboard",
            (_, SettingsPage::About) => "About",
        }
    }

    fn page_title(&self, page: SettingsPage) -> &'static str {
        match (self.ui_language, page) {
            (Language::Zh, SettingsPage::Runtime) => "共享运行时",
            (Language::Zh, SettingsPage::Models) => "模型与推理",
            (Language::Zh, SettingsPage::Fallback) => "模型降级链",
            (Language::Zh, SettingsPage::Tools) => "工具权限与注册",
            (Language::Zh, SettingsPage::Plugins) => "插件与扩展",
            (Language::Zh, SettingsPage::Skills) => "技能与工作流",
            (Language::Zh, SettingsPage::Agents) => "子代理与委派",
            (Language::Zh, SettingsPage::Scheduling) => "定时任务与唤醒",
            (Language::Zh, SettingsPage::Channels) => "外部消息通道",
            (Language::Zh, SettingsPage::Media) => "视觉与多模态",
            (Language::Zh, SettingsPage::Safety) => "安全边界",
            (Language::Zh, SettingsPage::Observability) => "观测与诊断",
            (Language::Zh, SettingsPage::Ui) => "界面与工作区",
            (Language::Zh, SettingsPage::Keyboard) => "快捷键与焦点流",
            (Language::Zh, SettingsPage::About) => "产品信息",
            (_, SettingsPage::Runtime) => "Shared runtime",
            (_, SettingsPage::Models) => "Models and reasoning",
            (_, SettingsPage::Fallback) => "Model fallback chain",
            (_, SettingsPage::Tools) => "Tools and registry",
            (_, SettingsPage::Plugins) => "Plugins and extensions",
            (_, SettingsPage::Skills) => "Skills and workflows",
            (_, SettingsPage::Agents) => "Sub-agents and delegation",
            (_, SettingsPage::Scheduling) => "Scheduling and wakeups",
            (_, SettingsPage::Channels) => "External channels",
            (_, SettingsPage::Media) => "Vision and multimodal",
            (_, SettingsPage::Safety) => "Safety boundaries",
            (_, SettingsPage::Observability) => "Observability and diagnostics",
            (_, SettingsPage::Ui) => "UI and workspace",
            (_, SettingsPage::Keyboard) => "Shortcuts and focus flow",
            (_, SettingsPage::About) => "Product info",
        }
    }

    fn page_description(&self, page: SettingsPage) -> String {
        match (self.ui_language, page) {
            (Language::Zh, SettingsPage::Runtime) => {
                "控制 notebook-native assistant runtime 的默认上下文、会话边界与本地执行入口。".to_string()
            }
            (Language::Zh, SettingsPage::Models) => {
                "主模型、推理级别、流式输出，以及未来的视觉模型和 embedding 配置。".to_string()
            }
            (Language::Zh, SettingsPage::Fallback) => {
                "配置 provider 故障时的模型 fallback 链和认证轮换策略。".to_string()
            }
            (Language::Zh, SettingsPage::Tools) => {
                "控制浏览器、执行、搜索与 MCP 等工具能力的暴露范围。".to_string()
            }
            (Language::Zh, SettingsPage::Plugins) => {
                "管理内置扩展、工作区插件来源、审批与沙箱边界。".to_string()
            }
            (Language::Zh, SettingsPage::Skills) => {
                "定义技能注册表、项目技能来源与代理可用的工作流能力。".to_string()
            }
            (Language::Zh, SettingsPage::Agents) => {
                "定义子代理、委派策略与 session 间协作边界。".to_string()
            }
            (Language::Zh, SettingsPage::Scheduling) => {
                "用于 cron、heartbeat 和后台唤醒任务的运营级配置。".to_string()
            }
            (Language::Zh, SettingsPage::Channels) => {
                "配置 WhatsApp 与 QQ Channel 的接入、激活模式、chunking 和 delivery 策略。".to_string()
            }
            (Language::Zh, SettingsPage::Media) => {
                "管理图片、音频、视频与文档的标准化、转录和限额策略。".to_string()
            }
            (Language::Zh, SettingsPage::Safety) => {
                "定义 trusted local 与 channel-exposed execution 之间的安全边界。".to_string()
            }
            (Language::Zh, SettingsPage::Observability) => {
                "检查 session 状态、token 使用、连通性与 delivery 诊断信息。".to_string()
            }
            (Language::Zh, SettingsPage::Ui) => {
                "管理工作区、语言、主题和终端显示偏好。".to_string()
            }
            (Language::Zh, SettingsPage::Keyboard) => {
                "定义 leader 方案、状态提示和预览跟随策略。".to_string()
            }
            (Language::Zh, SettingsPage::About) => self.about_description(),
            (_, SettingsPage::Runtime) => {
                "Control notebook-native runtime defaults, context injection, and session boundaries.".to_string()
            }
            (_, SettingsPage::Models) => {
                "Primary provider, reasoning level, streaming, and future vision or embedding model configuration.".to_string()
            }
            (_, SettingsPage::Fallback) => {
                "Define failover chains and auth rotation policy when the primary provider is unavailable.".to_string()
            }
            (_, SettingsPage::Tools) => {
                "Control browser, exec, search, and MCP capability exposure.".to_string()
            }
            (_, SettingsPage::Plugins) => {
                "Manage built-in extensions, workspace plugin sources, approvals, and sandbox boundaries.".to_string()
            }
            (_, SettingsPage::Skills) => {
                "Define skill registry, project skill sources, and workflow capabilities exposed to agents.".to_string()
            }
            (_, SettingsPage::Agents) => {
                "Define sub-agent delegation and workspace isolation for coordinated sessions.".to_string()
            }
            (_, SettingsPage::Scheduling) => {
                "Operator-facing cron, heartbeat, and wakeup configuration for background workflows.".to_string()
            }
            (_, SettingsPage::Channels) => {
                "Configure WhatsApp and QQ Channel connection, activation, chunking, and delivery behavior.".to_string()
            }
            (_, SettingsPage::Media) => {
                "Manage image, audio, video, and document normalization, transcription, and size limits.".to_string()
            }
            (_, SettingsPage::Safety) => {
                "Define trusted local execution boundaries and non-main session restrictions.".to_string()
            }
            (_, SettingsPage::Observability) => {
                "Inspect session diagnostics, usage, health checks, and delivery debug policy.".to_string()
            }
            (_, SettingsPage::Ui) => {
                "Manage workspace, language, theme, and terminal display preferences.".to_string()
            }
            (_, SettingsPage::Keyboard) => {
                "Choose focus flow, shortcut profile, and preview-follow behavior.".to_string()
            }
            (_, SettingsPage::About) => self.about_description(),
        }
    }

    fn about_description(&self) -> String {
        match self.ui_language {
            Language::Zh => {
                "TashanStone TUI 是一个 notebook-native 终端工作台，目标是承载共享 assistant runtime、本地知识上下文、图谱与未来 channel 交互。".to_string()
            }
            Language::En => {
                "TashanStone TUI is a notebook-native terminal workspace built to host a shared assistant runtime, local knowledge context, graph exploration, and future channel surfaces.".to_string()
            }
        }
    }

    fn page_footer_hint(&self, availability: PageAvailability) -> &'static str {
        match (self.ui_language, availability) {
            (Language::Zh, PageAvailability::Active) => "Ctrl+S 保存  Esc 关闭  Tab 切页",
            (Language::Zh, PageAvailability::Planned) => "规划中：页面可见，字段暂不可编辑",
            (Language::Zh, PageAvailability::Experimental) => "实验性：结构已预留，接入能力尚未启用",
            (_, PageAvailability::Active) => "Ctrl+S save  Esc close  Tab switch page",
            (_, PageAvailability::Planned) => "Planned: visible now, not editable yet",
            (_, PageAvailability::Experimental) => {
                "Experimental: structure is reserved before runtime wiring"
            }
        }
    }

    fn text_close_hint(&self) -> &'static str {
        match self.ui_language {
            Language::Zh => "Esc 关闭",
            Language::En => "Esc close",
        }
    }

    fn text_dirty_suffix(&self) -> &'static str {
        match self.ui_language {
            Language::Zh => " · 已修改",
            Language::En => " · modified",
        }
    }

    fn text_status_active(&self) -> &'static str {
        match self.ui_language {
            Language::Zh => "可用",
            Language::En => "Active",
        }
    }

    fn text_status_planned(&self) -> &'static str {
        match self.ui_language {
            Language::Zh => "规划中",
            Language::En => "Planned",
        }
    }

    fn text_status_experimental(&self) -> &'static str {
        match self.ui_language {
            Language::Zh => "实验性",
            Language::En => "Experimental",
        }
    }

    fn text_runtime_local(&self) -> String {
        match self.ui_language {
            Language::Zh => "本地运行时".to_string(),
            Language::En => "Local runtime".to_string(),
        }
    }

    fn text_runtime_context(&self) -> String {
        match self.ui_language {
            Language::Zh => "笔记上下文策略".to_string(),
            Language::En => "Notebook context mode".to_string(),
        }
    }

    fn text_runtime_session_policy(&self) -> String {
        match self.ui_language {
            Language::Zh => "会话边界".to_string(),
            Language::En => "Session policy".to_string(),
        }
    }

    fn text_runtime_channel_runtime(&self) -> String {
        match self.ui_language {
            Language::Zh => "通道运行时".to_string(),
            Language::En => "Channel runtime".to_string(),
        }
    }

    fn text_models_reasoning(&self) -> String {
        match self.ui_language {
            Language::Zh => "推理等级".to_string(),
            Language::En => "Reasoning level".to_string(),
        }
    }

    fn text_models_streaming(&self) -> String {
        match self.ui_language {
            Language::Zh => "流式输出".to_string(),
            Language::En => "Streaming".to_string(),
        }
    }

    fn text_models_vision_provider(&self) -> String {
        match self.ui_language {
            Language::Zh => "视觉模型提供商".to_string(),
            Language::En => "Vision provider".to_string(),
        }
    }

    fn text_models_vision_model(&self) -> String {
        match self.ui_language {
            Language::Zh => "视觉模型".to_string(),
            Language::En => "Vision model".to_string(),
        }
    }

    fn text_models_embedding_provider(&self) -> String {
        match self.ui_language {
            Language::Zh => "Embedding 提供商".to_string(),
            Language::En => "Embedding provider".to_string(),
        }
    }

    fn text_models_embedding_model(&self) -> String {
        match self.ui_language {
            Language::Zh => "Embedding 模型".to_string(),
            Language::En => "Embedding model".to_string(),
        }
    }

    fn text_models_vision_stack(&self) -> String {
        match self.ui_language {
            Language::Zh => "视觉栈".to_string(),
            Language::En => "Vision stack".to_string(),
        }
    }

    fn text_models_embedding_stack(&self) -> String {
        match self.ui_language {
            Language::Zh => "Embedding 栈".to_string(),
            Language::En => "Embedding stack".to_string(),
        }
    }

    fn text_fallback_enabled(&self) -> String {
        match self.ui_language {
            Language::Zh => "启用 fallback".to_string(),
            Language::En => "Enable fallback".to_string(),
        }
    }

    fn text_fallback_policy(&self) -> String {
        match self.ui_language {
            Language::Zh => "故障转移策略".to_string(),
            Language::En => "Failover policy".to_string(),
        }
    }

    fn text_fallback_chain(&self) -> String {
        match self.ui_language {
            Language::Zh => "fallback 链".to_string(),
            Language::En => "Fallback chain".to_string(),
        }
    }

    fn text_fallback_backup(&self) -> String {
        match self.ui_language {
            Language::Zh => "本地兜底模型".to_string(),
            Language::En => "Local backup model".to_string(),
        }
    }

    fn text_fallback_rotation(&self) -> String {
        match self.ui_language {
            Language::Zh => "认证轮换".to_string(),
            Language::En => "Auth rotation".to_string(),
        }
    }

    fn text_tools_mcp(&self) -> String {
        match self.ui_language {
            Language::Zh => "MCP 工具".to_string(),
            Language::En => "MCP tools".to_string(),
        }
    }

    fn text_tools_files(&self) -> String {
        match self.ui_language {
            Language::Zh => "文件工具".to_string(),
            Language::En => "File tools".to_string(),
        }
    }

    fn text_tools_search(&self) -> String {
        match self.ui_language {
            Language::Zh => "搜索工具".to_string(),
            Language::En => "Search tools".to_string(),
        }
    }

    fn text_tools_browser(&self) -> String {
        match self.ui_language {
            Language::Zh => "浏览器自动化".to_string(),
            Language::En => "Browser automation".to_string(),
        }
    }

    fn text_tools_exec(&self) -> String {
        match self.ui_language {
            Language::Zh => "执行工具".to_string(),
            Language::En => "Exec tools".to_string(),
        }
    }

    fn text_plugins_runtime(&self) -> String {
        match self.ui_language {
            Language::Zh => "运行时插件".to_string(),
            Language::En => "Runtime plugins".to_string(),
        }
    }

    fn text_plugins_workspace(&self) -> String {
        match self.ui_language {
            Language::Zh => "工作区插件".to_string(),
            Language::En => "Workspace plugins".to_string(),
        }
    }

    fn text_plugins_source(&self) -> String {
        match self.ui_language {
            Language::Zh => "安装来源".to_string(),
            Language::En => "Install source".to_string(),
        }
    }

    fn text_plugins_approval(&self) -> String {
        match self.ui_language {
            Language::Zh => "审批策略".to_string(),
            Language::En => "Approval policy".to_string(),
        }
    }

    fn text_plugins_sandbox(&self) -> String {
        match self.ui_language {
            Language::Zh => "沙箱范围".to_string(),
            Language::En => "Sandbox scope".to_string(),
        }
    }

    fn text_plugins_source_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "本地路径 + 扩展市场".to_string(),
            Language::En => "Local path + extension marketplace".to_string(),
        }
    }

    fn text_plugins_approval_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "手动审核".to_string(),
            Language::En => "Manual review".to_string(),
        }
    }

    fn text_plugins_sandbox_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "工作区级".to_string(),
            Language::En => "Workspace scoped".to_string(),
        }
    }

    fn text_skills_registry(&self) -> String {
        match self.ui_language {
            Language::Zh => "技能注册表".to_string(),
            Language::En => "Skills registry".to_string(),
        }
    }

    fn text_skills_project(&self) -> String {
        match self.ui_language {
            Language::Zh => "项目技能".to_string(),
            Language::En => "Project skills".to_string(),
        }
    }

    fn text_skills_source(&self) -> String {
        match self.ui_language {
            Language::Zh => "技能来源".to_string(),
            Language::En => "Skill source".to_string(),
        }
    }

    fn text_skills_binding(&self) -> String {
        match self.ui_language {
            Language::Zh => "代理绑定".to_string(),
            Language::En => "Agent binding".to_string(),
        }
    }

    fn text_skills_scope(&self) -> String {
        match self.ui_language {
            Language::Zh => "工作区范围".to_string(),
            Language::En => "Workspace scope".to_string(),
        }
    }

    fn text_skills_project_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "允许本地技能目录".to_string(),
            Language::En => "Allow local skill directories".to_string(),
        }
    }

    fn text_skills_source_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "本地 + 精选仓库".to_string(),
            Language::En => "Local + curated repos".to_string(),
        }
    }

    fn text_skills_binding_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "按代理类型分配".to_string(),
            Language::En => "Per-agent assignment".to_string(),
        }
    }

    fn text_planned_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "规划中".to_string(),
            Language::En => "Planned".to_string(),
        }
    }

    fn text_agents_enabled(&self) -> String {
        match self.ui_language {
            Language::Zh => "启用子代理".to_string(),
            Language::En => "Enable sub-agents".to_string(),
        }
    }

    fn text_agents_policy(&self) -> String {
        match self.ui_language {
            Language::Zh => "委派策略".to_string(),
            Language::En => "Delegation policy".to_string(),
        }
    }

    fn text_agents_tier(&self) -> String {
        match self.ui_language {
            Language::Zh => "默认模型档位".to_string(),
            Language::En => "Default model tier".to_string(),
        }
    }

    fn text_agents_coordination(&self) -> String {
        match self.ui_language {
            Language::Zh => "代理间协作".to_string(),
            Language::En => "Agent-to-agent".to_string(),
        }
    }

    fn text_agents_isolation(&self) -> String {
        match self.ui_language {
            Language::Zh => "工作区隔离".to_string(),
            Language::En => "Workspace isolation".to_string(),
        }
    }

    fn text_sched_cron(&self) -> String {
        match self.ui_language {
            Language::Zh => "定时计划".to_string(),
            Language::En => "Cron".to_string(),
        }
    }

    fn text_sched_heartbeat(&self) -> String {
        match self.ui_language {
            Language::Zh => "心跳唤醒".to_string(),
            Language::En => "Heartbeat".to_string(),
        }
    }

    fn text_sched_timezone(&self) -> String {
        match self.ui_language {
            Language::Zh => "时区".to_string(),
            Language::En => "Timezone".to_string(),
        }
    }

    fn text_sched_indexing(&self) -> String {
        match self.ui_language {
            Language::Zh => "自动索引任务".to_string(),
            Language::En => "Auto indexing".to_string(),
        }
    }

    fn text_sched_digest(&self) -> String {
        match self.ui_language {
            Language::Zh => "摘要任务".to_string(),
            Language::En => "Digest job".to_string(),
        }
    }

    fn text_channel_whatsapp(&self) -> String {
        match self.ui_language {
            Language::Zh => "WhatsApp 接入".to_string(),
            Language::En => "WhatsApp access".to_string(),
        }
    }

    fn text_channel_whatsapp_delivery(&self) -> String {
        match self.ui_language {
            Language::Zh => "WhatsApp 发送策略".to_string(),
            Language::En => "WhatsApp delivery".to_string(),
        }
    }

    fn text_channel_qq(&self) -> String {
        match self.ui_language {
            Language::Zh => "QQ Channel 接入".to_string(),
            Language::En => "QQ Channel access".to_string(),
        }
    }

    fn text_channel_qq_delivery(&self) -> String {
        match self.ui_language {
            Language::Zh => "QQ Channel 发送策略".to_string(),
            Language::En => "QQ Channel delivery".to_string(),
        }
    }

    fn text_media_vision(&self) -> String {
        match self.ui_language {
            Language::Zh => "视觉能力".to_string(),
            Language::En => "Vision".to_string(),
        }
    }

    fn text_media_audio(&self) -> String {
        match self.ui_language {
            Language::Zh => "音频转录".to_string(),
            Language::En => "Audio transcription".to_string(),
        }
    }

    fn text_media_docs(&self) -> String {
        match self.ui_language {
            Language::Zh => "文档摄取".to_string(),
            Language::En => "Document ingest".to_string(),
        }
    }

    fn text_media_limits(&self) -> String {
        match self.ui_language {
            Language::Zh => "媒体大小限制".to_string(),
            Language::En => "Media size limits".to_string(),
        }
    }

    fn text_media_detail(&self) -> String {
        match self.ui_language {
            Language::Zh => "图片细节模式".to_string(),
            Language::En => "Image detail mode".to_string(),
        }
    }

    fn text_safety_pairing(&self) -> String {
        match self.ui_language {
            Language::Zh => "DM 配对策略".to_string(),
            Language::En => "DM pairing policy".to_string(),
        }
    }

    fn text_safety_sandbox(&self) -> String {
        match self.ui_language {
            Language::Zh => "Sandbox 模式".to_string(),
            Language::En => "Sandbox mode".to_string(),
        }
    }

    fn text_safety_trusted(&self) -> String {
        match self.ui_language {
            Language::Zh => "可信本地工具".to_string(),
            Language::En => "Trusted local tools".to_string(),
        }
    }

    fn text_safety_non_main(&self) -> String {
        match self.ui_language {
            Language::Zh => "限制非主会话".to_string(),
            Language::En => "Restrict non-main sessions".to_string(),
        }
    }

    fn text_safety_destructive(&self) -> String {
        match self.ui_language {
            Language::Zh => "危险操作确认".to_string(),
            Language::En => "Confirm destructive tools".to_string(),
        }
    }

    fn text_obsv_usage(&self) -> String {
        match self.ui_language {
            Language::Zh => "使用量页脚".to_string(),
            Language::En => "Usage footer".to_string(),
        }
    }

    fn text_obsv_health(&self) -> String {
        match self.ui_language {
            Language::Zh => "健康检查".to_string(),
            Language::En => "Health checks".to_string(),
        }
    }

    fn text_obsv_log_level(&self) -> String {
        match self.ui_language {
            Language::Zh => "日志级别".to_string(),
            Language::En => "Log level".to_string(),
        }
    }

    fn text_obsv_sessions(&self) -> String {
        match self.ui_language {
            Language::Zh => "会话诊断".to_string(),
            Language::En => "Session diagnostics".to_string(),
        }
    }

    fn text_obsv_delivery(&self) -> String {
        match self.ui_language {
            Language::Zh => "发送调试".to_string(),
            Language::En => "Delivery debug".to_string(),
        }
    }

    fn text_about_build(&self) -> String {
        match self.ui_language {
            Language::Zh => "构建栈".to_string(),
            Language::En => "Build".to_string(),
        }
    }

    fn text_about_build_value(&self) -> String {
        "Rust + Ratatui + Crossterm".to_string()
    }

    fn text_about_focus(&self) -> String {
        match self.ui_language {
            Language::Zh => "当前重点".to_string(),
            Language::En => "Focus".to_string(),
        }
    }

    fn text_about_focus_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "共享运行时 / 图谱 / 外部通道".to_string(),
            Language::En => "Shared runtime / graph / external channels".to_string(),
        }
    }

    fn text_about_roadmap(&self) -> String {
        match self.ui_language {
            Language::Zh => "路线图".to_string(),
            Language::En => "Roadmap".to_string(),
        }
    }

    fn text_about_roadmap_value(&self) -> String {
        match self.ui_language {
            Language::Zh => "V1 终端工作台 -> V2 通道与自动化".to_string(),
            Language::En => "V1 terminal workspace -> V2 channels and automation".to_string(),
        }
    }
}

impl Default for SettingsModal {
    fn default() -> Self {
        Self::new()
    }
}

struct SettingsLayout {
    modal: Rect,
    header: Rect,
    close_button: Rect,
    nav_items: Vec<Rect>,
    page_title: Rect,
    page_status: Rect,
    page_description: Rect,
    field_items: Vec<Rect>,
    cancel_button: Rect,
    save_button: Rect,
    footer_hint: Rect,
}
