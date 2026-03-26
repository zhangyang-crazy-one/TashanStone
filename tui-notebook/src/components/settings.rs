//! Settings modal component aligned with the Pencil design draft.

use crate::i18n::{Language, TextKey};
use crate::services::config::{AppSettings, ConfigService, ShortcutProfile};
use crate::theme::{Theme, ThemeManager};
use crossterm::event::{KeyCode, KeyEvent, MouseButton, MouseEvent, MouseEventKind};
use ratatui::{
    layout::{Alignment, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SettingsTab {
    AI,
    UI,
    Keyboard,
    About,
}

impl SettingsTab {
    fn next(self) -> Self {
        match self {
            Self::AI => Self::UI,
            Self::UI => Self::Keyboard,
            Self::Keyboard => Self::About,
            Self::About => Self::AI,
        }
    }
}

pub struct SettingsModal {
    config_service: ConfigService,
    theme_manager: ThemeManager,
    selected_tab: SettingsTab,
    ai_provider: String,
    ai_model: String,
    ai_api_key: String,
    ai_base_url: String,
    workspace_path: String,
    font_size: u8,
    language: String,
    shortcut_profile: ShortcutProfile,
    show_shortcut_hints: bool,
    preview_focus_follows_editor: bool,
    is_open: bool,
    cursor_position: usize,
    is_editing: bool,
    editing_field: String,
    is_dirty: bool,
    applied_settings: Option<AppSettings>,
    ui_language: Language,
}

impl SettingsModal {
    pub fn new() -> Self {
        let config_service = ConfigService::new();
        let settings = config_service.settings().clone();
        Self {
            config_service,
            theme_manager: ThemeManager::new(),
            selected_tab: SettingsTab::AI,
            ai_provider: settings.ai_provider.clone(),
            ai_model: settings.ai_model.clone(),
            ai_api_key: settings.ai_api_key.unwrap_or_default(),
            ai_base_url: settings.ai_base_url.unwrap_or_default(),
            workspace_path: settings.workspace_path.clone(),
            font_size: settings.font_size,
            language: settings.language.clone(),
            shortcut_profile: settings.shortcut_profile,
            show_shortcut_hints: settings.show_shortcut_hints,
            preview_focus_follows_editor: settings.preview_focus_follows_editor,
            is_open: false,
            cursor_position: 0,
            is_editing: false,
            editing_field: String::new(),
            is_dirty: false,
            applied_settings: None,
            ui_language: Language::from_code(&settings.language),
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.ui_language = language;
    }

    pub fn open(&mut self) {
        let settings = self.config_service.settings().clone();
        self.ai_provider = settings.ai_provider.clone();
        self.ai_model = settings.ai_model.clone();
        self.ai_api_key = settings.ai_api_key.unwrap_or_default();
        self.ai_base_url = settings.ai_base_url.unwrap_or_default();
        self.workspace_path = settings.workspace_path.clone();
        self.font_size = settings.font_size;
        self.language = settings.language.clone();
        self.ui_language = Language::from_code(&settings.language);
        self.shortcut_profile = settings.shortcut_profile;
        self.show_shortcut_hints = settings.show_shortcut_hints;
        self.preview_focus_follows_editor = settings.preview_focus_follows_editor;
        self.theme_manager.set_theme(if settings.theme == "light" {
            Theme::Light
        } else {
            Theme::Dark
        });
        self.selected_tab = SettingsTab::Keyboard;
        self.cursor_position = 0;
        self.is_open = true;
        self.is_editing = false;
        self.editing_field.clear();
        self.is_dirty = false;
        self.applied_settings = None;
    }

    pub fn close(&mut self) {
        if self.is_editing {
            self.commit_active_edit();
        }
        if self.is_dirty {
            self.apply_settings();
            self.is_dirty = false;
        }
        self.is_open = false;
        self.is_editing = false;
    }

    pub fn is_open(&self) -> bool {
        self.is_open
    }

    pub fn set_theme(&mut self, theme: Theme) {
        self.theme_manager.set_theme(theme);
    }

    pub fn take_applied_settings(&mut self) -> Option<AppSettings> {
        self.applied_settings.take()
    }

    pub fn handle_key_event(&mut self, key: KeyEvent) -> bool {
        if !self.is_open {
            return false;
        }

        if self.is_editing {
            match key.code {
                KeyCode::Esc => {
                    self.is_editing = false;
                    self.editing_field.clear();
                    return true;
                }
                KeyCode::Enter => {
                    self.commit_edit();
                    self.is_editing = false;
                    self.editing_field.clear();
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

        match key.code {
            KeyCode::Esc => {
                self.close();
                true
            }
            KeyCode::Tab => {
                self.selected_tab = self.selected_tab.next();
                self.cursor_position = 0;
                true
            }
            KeyCode::Up => {
                self.cursor_position = self.cursor_position.saturating_sub(1);
                true
            }
            KeyCode::Down => {
                let max = self.max_cursor_position();
                if self.cursor_position < max {
                    self.cursor_position += 1;
                }
                true
            }
            KeyCode::Left => {
                self.cycle_value(-1);
                true
            }
            KeyCode::Right => {
                self.cycle_value(1);
                true
            }
            KeyCode::Enter => {
                self.activate_current();
                true
            }
            _ => false,
        }
    }

    pub fn handle_mouse_event(&mut self, mouse: MouseEvent, area: Rect) -> bool {
        if !self.is_open || !matches!(mouse.kind, MouseEventKind::Down(MouseButton::Left)) {
            return false;
        }

        let layout = Self::layout(area);
        let point = (mouse.column, mouse.row);

        if self.is_editing {
            let should_commit = self
                .editing_input_rect(&layout)
                .map(|rect| !Self::contains(rect, point))
                .unwrap_or(true);
            if should_commit {
                self.commit_active_edit();
            }
        }

        if Self::contains(layout.close_button, point) {
            self.close();
            return true;
        }

        for (index, rect) in layout.tabs.iter().enumerate() {
            if Self::contains(*rect, point) {
                self.selected_tab = match index {
                    0 => SettingsTab::AI,
                    1 => SettingsTab::UI,
                    2 => SettingsTab::Keyboard,
                    _ => SettingsTab::About,
                };
                self.cursor_position = 0;
                self.is_editing = false;
                return true;
            }
        }

        match self.selected_tab {
            SettingsTab::AI => {
                if Self::contains(layout.ai_provider, point) {
                    self.cursor_position = 0;
                    self.cycle_value(1);
                    return true;
                }
                if Self::contains(layout.ai_model, point) {
                    self.cursor_position = 1;
                    self.begin_edit();
                    return true;
                }
                if Self::contains(layout.ai_api_key, point) {
                    self.cursor_position = 2;
                    self.begin_edit();
                    return true;
                }
                if Self::contains(layout.ai_base_url, point) {
                    self.cursor_position = 3;
                    self.begin_edit();
                    return true;
                }
                if Self::contains(layout.save_button, point) {
                    self.cursor_position = 4;
                    self.save_and_close();
                    return true;
                }
            }
            SettingsTab::UI => {
                if Self::contains(layout.ui_workspace, point) {
                    self.cursor_position = 0;
                    self.begin_edit();
                    return true;
                }
                if Self::contains(layout.ui_font_size, point) {
                    self.cursor_position = 1;
                    self.begin_edit();
                    return true;
                }
                if Self::contains(layout.ui_theme_dark, point) {
                    self.cursor_position = 2;
                    self.theme_manager.set_theme(Theme::Dark);
                    self.is_dirty = true;
                    return true;
                }
                if Self::contains(layout.ui_theme_light, point) {
                    self.cursor_position = 3;
                    self.theme_manager.set_theme(Theme::Light);
                    self.is_dirty = true;
                    return true;
                }
                if Self::contains(layout.ui_language, point) {
                    self.cursor_position = 4;
                    self.cycle_value(1);
                    return true;
                }
                if Self::contains(layout.save_button, point) {
                    self.cursor_position = 5;
                    self.save_and_close();
                    return true;
                }
            }
            SettingsTab::About => {}
            SettingsTab::Keyboard => {
                if Self::contains(layout.keyboard_profile, point) {
                    self.cursor_position = 0;
                    self.cycle_value(1);
                    return true;
                }
                if Self::contains(layout.keyboard_hints, point) {
                    self.cursor_position = 1;
                    self.cycle_value(1);
                    return true;
                }
                if Self::contains(layout.keyboard_preview_follow, point) {
                    self.cursor_position = 2;
                    self.cycle_value(1);
                    return true;
                }
                if Self::contains(layout.save_button, point) {
                    self.cursor_position = 3;
                    self.save_and_close();
                    return true;
                }
            }
        }

        true
    }

    pub fn render(&self, f: &mut Frame<'_>, area: Rect) {
        if !self.is_open {
            return;
        }

        let layout = Self::layout(area);
        f.render_widget(
            Block::default().style(Style::default().bg(Color::Rgb(3, 8, 18))),
            area,
        );
        f.render_widget(Clear, layout.modal);

        let shell = Block::default()
            .borders(Borders::ALL)
            .style(Style::default().bg(Color::Rgb(26, 26, 46)))
            .border_style(Style::default().fg(Color::Rgb(48, 54, 61)));
        f.render_widget(shell, layout.modal);

        let header = Paragraph::new(Line::from(vec![
            Span::styled(
                self.ui_language.translator().text(TextKey::SettingsTitle),
                Style::default()
                    .fg(Color::Rgb(201, 209, 217))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled("x", Style::default().fg(Color::Rgb(110, 118, 129))),
        ]))
        .style(Style::default().bg(Color::Rgb(22, 27, 34)));
        f.render_widget(header, layout.header);

        let tabs = [
            SettingsTab::AI,
            SettingsTab::UI,
            SettingsTab::Keyboard,
            SettingsTab::About,
        ];
        for (index, tab) in tabs.iter().enumerate() {
            self.render_tab_button(
                f,
                layout.tabs[index],
                self.tab_label(*tab),
                *tab == self.selected_tab,
            );
        }

        match self.selected_tab {
            SettingsTab::AI => self.render_ai_tab(f, &layout),
            SettingsTab::UI => self.render_ui_tab(f, &layout),
            SettingsTab::Keyboard => self.render_keyboard_tab(f, &layout),
            SettingsTab::About => self.render_about_tab(f, &layout),
        }

        self.render_save_button(
            f,
            layout.save_button,
            match self.selected_tab {
                SettingsTab::AI => self.cursor_position == 4,
                SettingsTab::UI => self.cursor_position == 5,
                SettingsTab::Keyboard => self.cursor_position == 3,
                SettingsTab::About => false,
            },
        );

        if self.is_editing {
            if let Some(input_rect) = self.editing_input_rect(&layout) {
                let offset = self.editing_field.chars().count() as u16;
                f.set_cursor_position((
                    input_rect.x + 2 + offset.min(input_rect.width.saturating_sub(4)),
                    input_rect.y + 1,
                ));
            }
        }
    }

    fn render_ai_tab(&self, f: &mut Frame<'_>, layout: &SettingsLayout) {
        self.render_label(
            f,
            layout.ai_provider_label,
            self.ui_language
                .translator()
                .text(TextKey::SettingsProvider),
        );
        self.render_input(
            f,
            layout.ai_provider,
            self.ai_provider.as_str(),
            self.cursor_position == 0,
            false,
            true,
        );

        self.render_label(
            f,
            layout.ai_model_label,
            self.ui_language.translator().text(TextKey::SettingsModel),
        );
        self.render_input(
            f,
            layout.ai_model,
            self.display_value(self.ai_model.as_str(), self.cursor_position == 1),
            self.cursor_position == 1,
            self.is_editing && self.cursor_position == 1,
            false,
        );

        self.render_label(
            f,
            layout.ai_api_key_label,
            self.ui_language.translator().text(TextKey::SettingsApiKey),
        );
        let api_key = if self.is_editing && self.cursor_position == 2 {
            self.editing_field.as_str()
        } else if self.ai_api_key.is_empty() {
            ""
        } else {
            "sk-********"
        };
        self.render_input(
            f,
            layout.ai_api_key,
            self.display_value(api_key, self.cursor_position == 2),
            self.cursor_position == 2,
            self.is_editing && self.cursor_position == 2,
            false,
        );

        self.render_label(
            f,
            layout.ai_base_url_label,
            self.ui_language.translator().text(TextKey::SettingsBaseUrl),
        );
        self.render_input(
            f,
            layout.ai_base_url,
            self.display_value(self.ai_base_url.as_str(), self.cursor_position == 3),
            self.cursor_position == 3,
            self.is_editing && self.cursor_position == 3,
            false,
        );
    }

    fn render_ui_tab(&self, f: &mut Frame<'_>, layout: &SettingsLayout) {
        self.render_label(
            f,
            layout.ui_workspace_label,
            self.ui_language
                .translator()
                .text(TextKey::SettingsWorkspace),
        );
        self.render_input(
            f,
            layout.ui_workspace,
            self.display_value(self.workspace_path.as_str(), self.cursor_position == 0),
            self.cursor_position == 0,
            self.is_editing && self.cursor_position == 0,
            false,
        );

        self.render_label(
            f,
            layout.ui_font_size_label,
            self.ui_language
                .translator()
                .text(TextKey::SettingsFontSize),
        );
        let font_value = if self.is_editing && self.cursor_position == 1 {
            self.editing_field.clone()
        } else {
            self.font_size.to_string()
        };
        self.render_input(
            f,
            layout.ui_font_size,
            self.display_value(font_value.as_str(), self.cursor_position == 1),
            self.cursor_position == 1,
            self.is_editing && self.cursor_position == 1,
            false,
        );

        self.render_label(
            f,
            layout.ui_theme_label,
            self.ui_language.translator().text(TextKey::SettingsTheme),
        );
        self.render_theme_button(
            f,
            layout.ui_theme_dark,
            self.ui_language
                .translator()
                .text(TextKey::SettingsThemeDark),
            self.theme_manager.theme() == Theme::Dark,
            self.cursor_position == 2,
        );
        self.render_theme_button(
            f,
            layout.ui_theme_light,
            self.ui_language
                .translator()
                .text(TextKey::SettingsThemeLight),
            self.theme_manager.theme() == Theme::Light,
            self.cursor_position == 3,
        );

        self.render_label(
            f,
            layout.ui_language_label,
            self.ui_language
                .translator()
                .text(TextKey::SettingsLanguage),
        );
        let language = self
            .ui_language
            .translator()
            .language_name(Language::from_code(&self.language));
        self.render_input(
            f,
            layout.ui_language,
            language,
            self.cursor_position == 4,
            false,
            true,
        );
    }

    fn render_about_tab(&self, f: &mut Frame<'_>, layout: &SettingsLayout) {
        let about = vec![
            Line::from(vec![Span::styled(
                "TUI Notebook",
                Style::default()
                    .fg(Color::Rgb(201, 209, 217))
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                self.ui_language
                    .translator()
                    .text(TextKey::SettingsAboutDescription),
                Style::default().fg(Color::Rgb(139, 148, 158)),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                self.ui_language
                    .translator()
                    .text(TextKey::SettingsAboutBuiltWith),
                Style::default().fg(Color::Rgb(63, 185, 80)),
            )]),
        ];
        let paragraph = Paragraph::new(about);
        f.render_widget(paragraph, layout.about_area);
    }

    fn render_keyboard_tab(&self, f: &mut Frame<'_>, layout: &SettingsLayout) {
        self.render_label(
            f,
            layout.keyboard_profile_label,
            self.ui_language.translator().text(TextKey::SettingsProfile),
        );
        self.render_input(
            f,
            layout.keyboard_profile,
            self.ui_language
                .translator()
                .shortcut_profile_label(self.shortcut_profile),
            self.cursor_position == 0,
            false,
            true,
        );

        self.render_label(
            f,
            layout.keyboard_hints_label,
            self.ui_language
                .translator()
                .text(TextKey::SettingsStatusHints),
        );
        self.render_input(
            f,
            layout.keyboard_hints,
            if self.show_shortcut_hints {
                self.ui_language.translator().text(TextKey::SettingsOn)
            } else {
                self.ui_language.translator().text(TextKey::SettingsOff)
            },
            self.cursor_position == 1,
            false,
            true,
        );

        self.render_label(
            f,
            layout.keyboard_preview_follow_label,
            self.ui_language
                .translator()
                .text(TextKey::SettingsPreviewFollow),
        );
        self.render_input(
            f,
            layout.keyboard_preview_follow,
            if self.preview_focus_follows_editor {
                self.ui_language
                    .translator()
                    .text(TextKey::SettingsFollowEditor)
            } else {
                self.ui_language
                    .translator()
                    .text(TextKey::SettingsKeepPreviewScroll)
            },
            self.cursor_position == 2,
            false,
            true,
        );

        let notes = vec![
            Line::from(vec![Span::styled(
                self.ui_language
                    .translator()
                    .text(TextKey::KeyboardNoteTerminalLeader),
                Style::default().fg(Color::Rgb(139, 148, 158)),
            )]),
            Line::from(vec![Span::styled(
                self.ui_language
                    .translator()
                    .text(TextKey::KeyboardNoteIdeCompatible),
                Style::default().fg(Color::Rgb(139, 148, 158)),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                self.ui_language
                    .translator()
                    .text(TextKey::KeyboardNoteEscape),
                Style::default().fg(Color::Rgb(63, 185, 80)),
            )]),
        ];
        f.render_widget(Paragraph::new(notes), layout.keyboard_notes);
    }

    fn render_label(&self, f: &mut Frame<'_>, area: Rect, label: &str) {
        let paragraph = Paragraph::new(label).style(Style::default().fg(Color::Rgb(139, 148, 158)));
        f.render_widget(paragraph, area);
    }

    fn render_input(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        value: &str,
        focused: bool,
        editing: bool,
        discrete: bool,
    ) {
        let border = if focused {
            Color::Rgb(88, 166, 255)
        } else {
            Color::Rgb(48, 54, 61)
        };
        let background = if editing {
            Color::Rgb(13, 17, 23)
        } else {
            Color::Rgb(16, 21, 29)
        };
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border))
            .style(Style::default().bg(background));
        f.render_widget(block, area);

        let text = Paragraph::new(Line::from(vec![
            Span::styled(
                value,
                Style::default().fg(if value.is_empty() {
                    Color::Rgb(110, 118, 129)
                } else {
                    Color::Rgb(201, 209, 217)
                }),
            ),
            if discrete {
                Span::styled("  v", Style::default().fg(Color::Rgb(110, 118, 129)))
            } else {
                Span::raw("")
            },
        ]));
        f.render_widget(text, Rect::new(area.x + 2, area.y + 1, area.width - 4, 1));
    }

    fn render_tab_button(&self, f: &mut Frame<'_>, area: Rect, label: &str, active: bool) {
        let fill = if active {
            Color::Rgb(35, 134, 54)
        } else {
            Color::Rgb(33, 38, 45)
        };
        let fg = if active {
            Color::Rgb(201, 209, 217)
        } else {
            Color::Rgb(139, 148, 158)
        };
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(fill))
            .style(Style::default().bg(fill));
        f.render_widget(block, area);
        let text = Paragraph::new(label)
            .style(Style::default().fg(fg))
            .alignment(Alignment::Center);
        f.render_widget(text, area);
    }

    fn render_theme_button(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        label: &str,
        active: bool,
        focused: bool,
    ) {
        let fill = if active {
            Color::Rgb(35, 134, 54)
        } else {
            Color::Rgb(33, 38, 45)
        };
        let border = if focused {
            Color::Rgb(88, 166, 255)
        } else {
            fill
        };
        let fg = if active {
            Color::Rgb(201, 209, 217)
        } else {
            Color::Rgb(139, 148, 158)
        };
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border))
            .style(Style::default().bg(fill));
        f.render_widget(block, area);
        let text = Paragraph::new(label)
            .style(Style::default().fg(fg))
            .alignment(Alignment::Center);
        f.render_widget(text, area);
    }

    fn render_save_button(&self, f: &mut Frame<'_>, area: Rect, focused: bool) {
        let border = if focused {
            Color::Rgb(88, 166, 255)
        } else {
            Color::Rgb(35, 134, 54)
        };
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border))
            .style(Style::default().bg(Color::Rgb(35, 134, 54)));
        f.render_widget(block, area);
        let text = Paragraph::new(self.ui_language.translator().text(TextKey::SettingsSave))
            .style(
                Style::default()
                    .fg(Color::Rgb(201, 209, 217))
                    .add_modifier(Modifier::BOLD),
            )
            .alignment(Alignment::Center);
        f.render_widget(text, area);
    }

    fn begin_edit(&mut self) {
        self.editing_field = match self.selected_tab {
            SettingsTab::AI => match self.cursor_position {
                1 => self.ai_model.clone(),
                2 => self.ai_api_key.clone(),
                3 => self.ai_base_url.clone(),
                _ => String::new(),
            },
            SettingsTab::UI => match self.cursor_position {
                0 => self.workspace_path.clone(),
                1 => self.font_size.to_string(),
                _ => String::new(),
            },
            SettingsTab::Keyboard => String::new(),
            SettingsTab::About => String::new(),
        };
        self.is_editing = !self.editing_field.is_empty()
            || matches!(self.selected_tab, SettingsTab::AI | SettingsTab::UI);
    }

    fn activate_current(&mut self) {
        match self.selected_tab {
            SettingsTab::AI => match self.cursor_position {
                0 => self.cycle_value(1),
                1 | 2 | 3 => self.begin_edit(),
                4 => self.save_and_close(),
                _ => {}
            },
            SettingsTab::UI => match self.cursor_position {
                0 | 1 => self.begin_edit(),
                2 => {
                    self.theme_manager.set_theme(Theme::Dark);
                    self.is_dirty = true;
                }
                3 => {
                    self.theme_manager.set_theme(Theme::Light);
                    self.is_dirty = true;
                }
                4 => self.cycle_value(1),
                5 => self.save_and_close(),
                _ => {}
            },
            SettingsTab::Keyboard => match self.cursor_position {
                0..=2 => self.cycle_value(1),
                3 => self.save_and_close(),
                _ => {}
            },
            SettingsTab::About => {}
        }
    }

    fn cycle_value(&mut self, direction: i32) {
        match self.selected_tab {
            SettingsTab::AI => match self.cursor_position {
                0 => {
                    let providers = ["openai", "gemini", "ollama", "anthropic"];
                    let idx = providers
                        .iter()
                        .position(|provider| *provider == self.ai_provider)
                        .unwrap_or(0);
                    let next = Self::cycle_index(idx, providers.len(), direction);
                    self.ai_provider = providers[next].to_string();
                    if self.ai_model.is_empty() {
                        self.ai_model =
                            self.get_models_for_provider(&self.ai_provider)[0].to_string();
                    }
                    self.is_dirty = true;
                }
                1 => {
                    let models = self.get_models_for_provider(&self.ai_provider);
                    let idx = models
                        .iter()
                        .position(|model| *model == self.ai_model)
                        .unwrap_or(0);
                    let next = Self::cycle_index(idx, models.len(), direction);
                    self.ai_model = models[next].to_string();
                    self.is_dirty = true;
                }
                _ => {}
            },
            SettingsTab::UI => match self.cursor_position {
                2 | 3 => {
                    self.theme_manager
                        .set_theme(match self.theme_manager.theme() {
                            Theme::Dark => Theme::Light,
                            Theme::Light => Theme::Dark,
                        });
                    self.is_dirty = true;
                }
                4 => {
                    let values = ["en", "zh"];
                    let idx = values
                        .iter()
                        .position(|value| *value == self.language)
                        .unwrap_or(0);
                    let next = Self::cycle_index(idx, values.len(), direction);
                    self.language = values[next].to_string();
                    self.ui_language = Language::from_code(&self.language);
                    self.is_dirty = true;
                }
                _ => {}
            },
            SettingsTab::Keyboard => match self.cursor_position {
                0 => {
                    self.shortcut_profile = match self.shortcut_profile {
                        ShortcutProfile::TerminalLeader => ShortcutProfile::IdeCompatible,
                        ShortcutProfile::IdeCompatible => ShortcutProfile::TerminalLeader,
                    };
                    self.is_dirty = true;
                }
                1 => {
                    self.show_shortcut_hints = !self.show_shortcut_hints;
                    self.is_dirty = true;
                }
                2 => {
                    self.preview_focus_follows_editor = !self.preview_focus_follows_editor;
                    self.is_dirty = true;
                }
                _ => {}
            },
            SettingsTab::About => {}
        }
    }

    fn commit_edit(&mut self) {
        match self.selected_tab {
            SettingsTab::AI => match self.cursor_position {
                1 => self.ai_model = self.editing_field.clone(),
                2 => self.ai_api_key = self.editing_field.clone(),
                3 => self.ai_base_url = self.editing_field.clone(),
                _ => {}
            },
            SettingsTab::UI => match self.cursor_position {
                0 => self.workspace_path = self.editing_field.clone(),
                1 => {
                    if let Ok(size) = self.editing_field.parse() {
                        self.font_size = size;
                    }
                }
                _ => {}
            },
            SettingsTab::Keyboard => {}
            SettingsTab::About => {}
        }
        self.is_dirty = true;
    }

    fn save_and_close(&mut self) {
        if self.is_editing {
            self.commit_active_edit();
        }
        self.apply_settings();
        self.is_dirty = false;
        self.is_open = false;
        self.is_editing = false;
    }

    fn commit_active_edit(&mut self) {
        if !self.is_editing {
            return;
        }

        self.commit_edit();
        self.is_editing = false;
        self.editing_field.clear();
    }

    fn apply_settings(&mut self) {
        let settings = AppSettings {
            ai_provider: self.ai_provider.clone(),
            ai_model: self.ai_model.clone(),
            ai_api_key: if self.ai_api_key.trim().is_empty() {
                None
            } else {
                Some(self.ai_api_key.clone())
            },
            ai_base_url: if self.ai_base_url.trim().is_empty() {
                None
            } else {
                Some(self.ai_base_url.clone())
            },
            theme: self.theme_manager.theme().to_string(),
            font_size: self.font_size,
            workspace_path: self.workspace_path.clone(),
            language: self.language.clone(),
            shortcut_profile: self.shortcut_profile,
            show_shortcut_hints: self.show_shortcut_hints,
            preview_focus_follows_editor: self.preview_focus_follows_editor,
        };
        self.applied_settings = Some(settings);
    }

    fn get_models_for_provider(&self, provider: &str) -> Vec<&'static str> {
        match provider {
            "openai" => vec!["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
            "gemini" => vec!["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
            "ollama" => vec!["llama3.2", "qwen2.5", "mistral"],
            "anthropic" => vec!["claude-3-5-sonnet", "claude-3-opus", "claude-3-haiku"],
            _ => vec!["gpt-4"],
        }
    }

    fn tab_label(&self, tab: SettingsTab) -> &'static str {
        match tab {
            SettingsTab::AI => self.ui_language.translator().text(TextKey::SettingsTabAi),
            SettingsTab::UI => self.ui_language.translator().text(TextKey::SettingsTabUi),
            SettingsTab::Keyboard => self
                .ui_language
                .translator()
                .text(TextKey::SettingsTabKeyboard),
            SettingsTab::About => self
                .ui_language
                .translator()
                .text(TextKey::SettingsTabAbout),
        }
    }

    fn max_cursor_position(&self) -> usize {
        match self.selected_tab {
            SettingsTab::AI => 4,
            SettingsTab::UI => 5,
            SettingsTab::Keyboard => 3,
            SettingsTab::About => 0,
        }
    }

    fn editing_input_rect(&self, layout: &SettingsLayout) -> Option<Rect> {
        match self.selected_tab {
            SettingsTab::AI => match self.cursor_position {
                1 => Some(layout.ai_model),
                2 => Some(layout.ai_api_key),
                3 => Some(layout.ai_base_url),
                _ => None,
            },
            SettingsTab::UI => match self.cursor_position {
                0 => Some(layout.ui_workspace),
                1 => Some(layout.ui_font_size),
                _ => None,
            },
            SettingsTab::Keyboard => None,
            SettingsTab::About => None,
        }
    }

    fn display_value<'a>(&'a self, value: &'a str, focused: bool) -> &'a str {
        if value.is_empty() && focused {
            " "
        } else {
            value
        }
    }

    fn cycle_index(current: usize, len: usize, direction: i32) -> usize {
        if len == 0 {
            return 0;
        }

        if direction >= 0 {
            (current + 1) % len
        } else if current == 0 {
            len - 1
        } else {
            current - 1
        }
    }

    fn contains(rect: Rect, point: (u16, u16)) -> bool {
        point.0 >= rect.x
            && point.0 < rect.x + rect.width
            && point.1 >= rect.y
            && point.1 < rect.y + rect.height
    }

    fn layout(area: Rect) -> SettingsLayout {
        let width = 72.min(area.width.saturating_sub(4)).max(56);
        let height = 24.min(area.height.saturating_sub(2)).max(20);
        let modal = Rect::new(
            area.x + (area.width.saturating_sub(width)) / 2,
            area.y + (area.height.saturating_sub(height)) / 2,
            width,
            height,
        );

        let header = Rect::new(modal.x + 1, modal.y + 1, modal.width - 2, 1);
        let tabs = [
            Rect::new(modal.x + 4, modal.y + 4, 10, 3),
            Rect::new(modal.x + 16, modal.y + 4, 10, 3),
            Rect::new(modal.x + 28, modal.y + 4, 12, 3),
            Rect::new(modal.x + 42, modal.y + 4, 10, 3),
        ];
        let save_button = Rect::new(
            modal.x + modal.width - 16,
            modal.y + modal.height - 4,
            12,
            3,
        );
        let base_url_y = modal.y + 20;
        let base_url_width = save_button
            .x
            .saturating_sub(modal.x + 17)
            .saturating_sub(2)
            .max(18);

        SettingsLayout {
            modal,
            header,
            close_button: Rect::new(modal.x + modal.width.saturating_sub(4), modal.y + 1, 2, 1),
            tabs,
            ai_provider_label: Rect::new(modal.x + 4, modal.y + 9, 12, 1),
            ai_provider: Rect::new(modal.x + 17, modal.y + 8, modal.width - 22, 3),
            ai_model_label: Rect::new(modal.x + 4, modal.y + 13, 12, 1),
            ai_model: Rect::new(modal.x + 17, modal.y + 12, modal.width - 22, 3),
            ai_api_key_label: Rect::new(modal.x + 4, modal.y + 17, 12, 1),
            ai_api_key: Rect::new(modal.x + 17, modal.y + 16, modal.width - 22, 3),
            ai_base_url_label: Rect::new(modal.x + 4, base_url_y + 1, 12, 1),
            ai_base_url: Rect::new(modal.x + 17, base_url_y, base_url_width, 3),
            ui_workspace_label: Rect::new(modal.x + 4, modal.y + 9, 12, 1),
            ui_workspace: Rect::new(modal.x + 17, modal.y + 8, modal.width - 22, 3),
            ui_font_size_label: Rect::new(modal.x + 4, modal.y + 13, 12, 1),
            ui_font_size: Rect::new(modal.x + 17, modal.y + 12, 12, 3),
            ui_theme_label: Rect::new(modal.x + 4, modal.y + 17, 12, 1),
            ui_theme_dark: Rect::new(modal.x + 17, modal.y + 16, 10, 3),
            ui_theme_light: Rect::new(modal.x + 30, modal.y + 16, 10, 3),
            ui_language_label: Rect::new(modal.x + 4, modal.y + 21, 12, 1),
            ui_language: Rect::new(modal.x + 17, modal.y + 20, 16, 3),
            keyboard_profile_label: Rect::new(modal.x + 4, modal.y + 9, 12, 1),
            keyboard_profile: Rect::new(modal.x + 17, modal.y + 8, 24, 3),
            keyboard_hints_label: Rect::new(modal.x + 4, modal.y + 13, 12, 1),
            keyboard_hints: Rect::new(modal.x + 17, modal.y + 12, 16, 3),
            keyboard_preview_follow_label: Rect::new(modal.x + 4, modal.y + 17, 12, 1),
            keyboard_preview_follow: Rect::new(modal.x + 17, modal.y + 16, 24, 3),
            keyboard_notes: Rect::new(modal.x + 4, modal.y + 20, modal.width - 8, 5),
            save_button,
            about_area: Rect::new(modal.x + 4, modal.y + 9, modal.width - 8, 10),
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
    tabs: [Rect; 4],
    ai_provider_label: Rect,
    ai_provider: Rect,
    ai_model_label: Rect,
    ai_model: Rect,
    ai_api_key_label: Rect,
    ai_api_key: Rect,
    ai_base_url_label: Rect,
    ai_base_url: Rect,
    ui_workspace_label: Rect,
    ui_workspace: Rect,
    ui_font_size_label: Rect,
    ui_font_size: Rect,
    ui_theme_label: Rect,
    ui_theme_dark: Rect,
    ui_theme_light: Rect,
    ui_language_label: Rect,
    ui_language: Rect,
    keyboard_profile_label: Rect,
    keyboard_profile: Rect,
    keyboard_hints_label: Rect,
    keyboard_hints: Rect,
    keyboard_preview_follow_label: Rect,
    keyboard_preview_follow: Rect,
    keyboard_notes: Rect,
    save_button: Rect,
    about_area: Rect,
}
