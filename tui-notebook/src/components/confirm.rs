//! Confirmation dialog component.

use crate::action::Action;
use crate::i18n::{Language, TextKey};
use crossterm::event::{KeyCode, KeyEvent, MouseButton, MouseEvent, MouseEventKind};
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConfirmFocus {
    Cancel,
    Confirm,
}

pub struct ConfirmDialog {
    is_open: bool,
    title: String,
    message: String,
    warning: String,
    confirm_label: String,
    focus: ConfirmFocus,
    action: Option<Action>,
    language: Language,
}

impl ConfirmDialog {
    pub fn new() -> Self {
        Self {
            is_open: false,
            title: String::new(),
            message: String::new(),
            warning: String::new(),
            confirm_label: String::from("Confirm"),
            focus: ConfirmFocus::Cancel,
            action: None,
            language: Language::En,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
        if self.confirm_label.is_empty() {
            self.confirm_label = self
                .language
                .translator()
                .text(TextKey::DialogConfirm)
                .to_string();
        }
    }

    pub fn open(
        &mut self,
        title: impl Into<String>,
        message: impl Into<String>,
        warning: impl Into<String>,
        confirm_label: impl Into<String>,
        action: Action,
    ) {
        self.is_open = true;
        self.title = title.into();
        self.message = message.into();
        self.warning = warning.into();
        self.confirm_label = confirm_label.into();
        self.focus = ConfirmFocus::Cancel;
        self.action = Some(action);
    }

    pub fn close(&mut self) {
        self.is_open = false;
        self.action = None;
    }

    pub fn is_open(&self) -> bool {
        self.is_open
    }

    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        match key.code {
            KeyCode::Esc => {
                self.close();
            }
            KeyCode::Tab | KeyCode::Left | KeyCode::Right => {
                self.focus = match self.focus {
                    ConfirmFocus::Cancel => ConfirmFocus::Confirm,
                    ConfirmFocus::Confirm => ConfirmFocus::Cancel,
                };
            }
            KeyCode::Enter => match self.focus {
                ConfirmFocus::Cancel => {
                    self.close();
                }
                ConfirmFocus::Confirm => {
                    let action = self.action.clone();
                    self.close();
                    return action;
                }
            },
            _ => {}
        }

        None
    }

    pub fn handle_mouse_event(&mut self, mouse: MouseEvent, area: Rect) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        if !matches!(mouse.kind, MouseEventKind::Down(MouseButton::Left)) {
            return None;
        }

        let layout = Self::layout(area);
        let point = (mouse.column, mouse.row);

        if Self::contains(layout.cancel_button, point) {
            self.focus = ConfirmFocus::Cancel;
            self.close();
            return None;
        }

        if Self::contains(layout.confirm_button, point) {
            self.focus = ConfirmFocus::Confirm;
            let action = self.action.clone();
            self.close();
            return action;
        }

        None
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

        let header = Paragraph::new(Line::from(vec![Span::styled(
            self.title.as_str(),
            Style::default()
                .fg(Color::Rgb(201, 209, 217))
                .add_modifier(Modifier::BOLD),
        )]))
        .style(Style::default().bg(Color::Rgb(22, 27, 34)));
        f.render_widget(header, layout.header);

        let message = Paragraph::new(vec![
            Line::from(vec![Span::styled(
                self.message.as_str(),
                Style::default().fg(Color::Rgb(201, 209, 217)),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                self.warning.as_str(),
                Style::default().fg(Color::Rgb(248, 81, 73)),
            )]),
        ]);
        f.render_widget(message, layout.body);

        self.render_button(
            f,
            layout.cancel_button,
            self.language.translator().text(TextKey::DialogCancel),
            self.focus == ConfirmFocus::Cancel,
            false,
        );
        self.render_button(
            f,
            layout.confirm_button,
            self.confirm_label.as_str(),
            self.focus == ConfirmFocus::Confirm,
            true,
        );
    }

    fn render_button(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        label: &str,
        focused: bool,
        destructive: bool,
    ) {
        let (bg, fg) = if destructive {
            if focused {
                (Color::Rgb(235, 73, 70), Color::White)
            } else {
                (Color::Rgb(218, 54, 51), Color::Rgb(201, 209, 217))
            }
        } else if focused {
            (Color::Rgb(35, 58, 92), Color::Rgb(241, 246, 252))
        } else {
            (Color::Rgb(33, 38, 45), Color::Rgb(139, 148, 158))
        };
        let border = if focused {
            Color::Rgb(121, 192, 255)
        } else {
            Color::Rgb(48, 54, 61)
        };
        let button = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border))
            .style(Style::default().bg(bg));
        f.render_widget(button, area);
        let text = Paragraph::new(label)
            .style(
                Style::default()
                    .fg(fg)
                    .add_modifier(if focused || destructive {
                        Modifier::BOLD
                    } else {
                        Modifier::empty()
                    }),
            )
            .alignment(ratatui::layout::Alignment::Center);
        f.render_widget(text, Self::button_inner_rect(area));
    }

    fn contains(rect: Rect, point: (u16, u16)) -> bool {
        point.0 >= rect.x
            && point.0 < rect.x + rect.width
            && point.1 >= rect.y
            && point.1 < rect.y + rect.height
    }

    fn layout(area: Rect) -> ConfirmLayout {
        let width = 44.min(area.width.saturating_sub(4)).max(36);
        let height = 10.min(area.height.saturating_sub(2)).max(10);
        let modal = Rect::new(
            area.x + (area.width.saturating_sub(width)) / 2,
            area.y + (area.height.saturating_sub(height)) / 2,
            width,
            height,
        );

        ConfirmLayout {
            modal,
            header: Rect::new(modal.x + 1, modal.y + 1, modal.width - 2, 1),
            body: Rect::new(modal.x + 3, modal.y + 3, modal.width - 6, 3),
            cancel_button: Rect::new(modal.x + 8, modal.y + modal.height - 4, 12, 3),
            confirm_button: Rect::new(
                modal.x + modal.width - 20,
                modal.y + modal.height - 4,
                12,
                3,
            ),
        }
    }

    fn button_inner_rect(area: Rect) -> Rect {
        if area.width <= 2 || area.height <= 2 {
            return area;
        }

        Rect::new(area.x + 1, area.y + area.height / 2, area.width - 2, 1)
    }
}

impl Default for ConfirmDialog {
    fn default() -> Self {
        Self::new()
    }
}

struct ConfirmLayout {
    modal: Rect,
    header: Rect,
    body: Rect,
    cancel_button: Rect,
    confirm_button: Rect,
}
