//! New file modal dialog.

use crate::action::{Action, FileAction};
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
enum NewFileFocus {
    Directory,
    FileName,
    Cancel,
    Create,
}

pub struct NewFileDialog {
    is_open: bool,
    directory: String,
    file_name: String,
    focus: NewFileFocus,
    is_editing: bool,
    language: Language,
}

impl NewFileDialog {
    pub fn new() -> Self {
        Self {
            is_open: false,
            directory: String::new(),
            file_name: String::new(),
            focus: NewFileFocus::FileName,
            is_editing: false,
            language: Language::En,
        }
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
    }

    pub fn open(&mut self, directory: Option<String>) {
        self.is_open = true;
        self.directory = directory
            .unwrap_or_default()
            .trim_matches('/')
            .trim()
            .to_string();
        self.file_name = String::from("note.md");
        self.focus = NewFileFocus::FileName;
        self.is_editing = true;
    }

    pub fn close(&mut self) {
        self.is_open = false;
        self.is_editing = false;
    }

    pub fn is_open(&self) -> bool {
        self.is_open
    }

    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        if !self.is_open {
            return None;
        }

        if self.is_editing {
            match key.code {
                KeyCode::Esc => {
                    self.is_editing = false;
                    return None;
                }
                KeyCode::Enter => {
                    self.is_editing = false;
                    return None;
                }
                KeyCode::Backspace => {
                    self.active_field_mut().pop();
                    return None;
                }
                KeyCode::Char(c) => {
                    self.active_field_mut().push(c);
                    return None;
                }
                _ => return None,
            }
        }

        match key.code {
            KeyCode::Esc => {
                self.close();
            }
            KeyCode::Tab | KeyCode::Right => {
                self.focus = match self.focus {
                    NewFileFocus::Directory => NewFileFocus::FileName,
                    NewFileFocus::FileName => NewFileFocus::Cancel,
                    NewFileFocus::Cancel => NewFileFocus::Create,
                    NewFileFocus::Create => NewFileFocus::Directory,
                };
            }
            KeyCode::Left => {
                self.focus = match self.focus {
                    NewFileFocus::Directory => NewFileFocus::Create,
                    NewFileFocus::FileName => NewFileFocus::Directory,
                    NewFileFocus::Cancel => NewFileFocus::FileName,
                    NewFileFocus::Create => NewFileFocus::Cancel,
                };
            }
            KeyCode::Down => {
                self.focus = match self.focus {
                    NewFileFocus::Directory => NewFileFocus::FileName,
                    NewFileFocus::FileName => NewFileFocus::Cancel,
                    focus => focus,
                };
            }
            KeyCode::Up => {
                self.focus = match self.focus {
                    NewFileFocus::FileName => NewFileFocus::Directory,
                    NewFileFocus::Cancel | NewFileFocus::Create => NewFileFocus::FileName,
                    focus => focus,
                };
            }
            KeyCode::Enter => match self.focus {
                NewFileFocus::Directory | NewFileFocus::FileName => {
                    self.is_editing = true;
                }
                NewFileFocus::Cancel => {
                    self.close();
                }
                NewFileFocus::Create => {
                    if let Some(action) = self.create_action() {
                        self.close();
                        return Some(action);
                    }
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

        if Self::contains(layout.close_button, point) {
            self.close();
            return None;
        }

        if Self::contains(layout.directory_input, point) {
            self.focus = NewFileFocus::Directory;
            self.is_editing = true;
            return None;
        }

        if Self::contains(layout.file_input, point) {
            self.focus = NewFileFocus::FileName;
            self.is_editing = true;
            return None;
        }

        if Self::contains(layout.cancel_button, point) {
            self.focus = NewFileFocus::Cancel;
            self.close();
            return None;
        }

        if Self::contains(layout.create_button, point) {
            self.focus = NewFileFocus::Create;
            if let Some(action) = self.create_action() {
                self.close();
                return Some(action);
            }
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

        let header = Paragraph::new(Line::from(vec![
            Span::styled(
                self.language.translator().text(TextKey::NewFileTitle),
                Style::default()
                    .fg(Color::Rgb(201, 209, 217))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled("x", Style::default().fg(Color::Rgb(110, 118, 129))),
        ]))
        .style(Style::default().bg(Color::Rgb(22, 27, 34)));
        f.render_widget(header, layout.header);

        self.render_label(
            f,
            layout.directory_label,
            self.language.translator().text(TextKey::NewFileDirectory),
            Style::default().fg(Color::Rgb(139, 148, 158)),
        );
        self.render_input(
            f,
            layout.directory_input,
            if self.directory.is_empty() {
                "."
            } else {
                self.directory.as_str()
            },
            self.focus == NewFileFocus::Directory,
            self.is_editing && self.focus == NewFileFocus::Directory,
        );

        self.render_label(
            f,
            layout.file_label,
            self.language.translator().text(TextKey::NewFileFile),
            Style::default().fg(Color::Rgb(139, 148, 158)),
        );
        self.render_input(
            f,
            layout.file_input,
            self.file_name.as_str(),
            self.focus == NewFileFocus::FileName,
            self.is_editing && self.focus == NewFileFocus::FileName,
        );

        self.render_button(
            f,
            layout.cancel_button,
            self.language.translator().text(TextKey::DialogCancel),
            self.focus == NewFileFocus::Cancel,
            false,
        );
        self.render_button(
            f,
            layout.create_button,
            self.language.translator().text(TextKey::DialogCreate),
            self.focus == NewFileFocus::Create,
            true,
        );

        if self.is_editing {
            let input = match self.focus {
                NewFileFocus::Directory => layout.directory_input,
                NewFileFocus::FileName => layout.file_input,
                _ => layout.file_input,
            };
            let offset = self.active_field().chars().count() as u16;
            f.set_cursor_position((
                input.x + 2 + offset.min(input.width.saturating_sub(4)),
                input.y + 1,
            ));
        }
    }

    fn create_action(&self) -> Option<Action> {
        let file_name = self.file_name.trim();
        if file_name.is_empty() {
            return None;
        }

        let relative_path = if self.directory.trim().is_empty() || self.directory.trim() == "." {
            file_name.to_string()
        } else {
            format!("{}/{}", self.directory.trim().trim_matches('/'), file_name)
        };

        Some(Action::File(FileAction::Create(relative_path)))
    }

    fn active_field(&self) -> &String {
        match self.focus {
            NewFileFocus::Directory => &self.directory,
            NewFileFocus::FileName => &self.file_name,
            _ => &self.file_name,
        }
    }

    fn active_field_mut(&mut self) -> &mut String {
        match self.focus {
            NewFileFocus::Directory => &mut self.directory,
            NewFileFocus::FileName => &mut self.file_name,
            _ => &mut self.file_name,
        }
    }

    fn render_label(&self, f: &mut Frame<'_>, area: Rect, label: &str, style: Style) {
        f.render_widget(Paragraph::new(label).style(style), area);
    }

    fn render_input(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        value: &str,
        focused: bool,
        editing: bool,
    ) {
        let border = if focused {
            Color::Rgb(88, 166, 255)
        } else {
            Color::Rgb(48, 54, 61)
        };
        let text_color = if value.is_empty() {
            Color::Rgb(110, 118, 129)
        } else {
            Color::Rgb(201, 209, 217)
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
        let text = Paragraph::new(value.to_string()).style(Style::default().fg(text_color));
        f.render_widget(block, area);
        f.render_widget(text, Rect::new(area.x + 2, area.y + 1, area.width - 4, 1));
    }

    fn render_button(
        &self,
        f: &mut Frame<'_>,
        area: Rect,
        label: &str,
        focused: bool,
        primary: bool,
    ) {
        let (bg, fg) = if primary {
            (Color::Rgb(35, 134, 54), Color::Rgb(201, 209, 217))
        } else {
            (Color::Rgb(33, 38, 45), Color::Rgb(139, 148, 158))
        };
        let border = if focused {
            Color::Rgb(88, 166, 255)
        } else {
            bg
        };
        let button = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border))
            .style(Style::default().bg(bg));
        f.render_widget(button, area);
        let text = Paragraph::new(label)
            .style(Style::default().fg(fg).add_modifier(if primary {
                Modifier::BOLD
            } else {
                Modifier::empty()
            }))
            .alignment(ratatui::layout::Alignment::Center);
        f.render_widget(text, area);
    }

    fn contains(rect: Rect, point: (u16, u16)) -> bool {
        point.0 >= rect.x
            && point.0 < rect.x + rect.width
            && point.1 >= rect.y
            && point.1 < rect.y + rect.height
    }

    fn layout(area: Rect) -> NewFileLayout {
        let width = 62.min(area.width.saturating_sub(4)).max(42);
        let height = 16.min(area.height.saturating_sub(2)).max(14);
        let modal = Rect::new(
            area.x + (area.width.saturating_sub(width)) / 2,
            area.y + (area.height.saturating_sub(height)) / 2,
            width,
            height,
        );

        let header = Rect::new(modal.x + 1, modal.y + 1, modal.width - 2, 1);
        let close_button = Rect::new(modal.x + modal.width.saturating_sub(4), modal.y + 1, 2, 1);
        let directory_label = Rect::new(modal.x + 3, modal.y + 4, 10, 1);
        let directory_input = Rect::new(modal.x + 14, modal.y + 3, modal.width - 18, 3);
        let file_label = Rect::new(modal.x + 3, modal.y + 8, 10, 1);
        let file_input = Rect::new(modal.x + 14, modal.y + 7, modal.width - 18, 3);
        let cancel_button = Rect::new(modal.x + modal.width - 24, modal.y + height - 4, 10, 3);
        let create_button = Rect::new(modal.x + modal.width - 12, modal.y + height - 4, 10, 3);

        NewFileLayout {
            modal,
            header,
            close_button,
            directory_label,
            directory_input,
            file_label,
            file_input,
            cancel_button,
            create_button,
        }
    }
}

impl Default for NewFileDialog {
    fn default() -> Self {
        Self::new()
    }
}

struct NewFileLayout {
    modal: Rect,
    header: Rect,
    close_button: Rect,
    directory_label: Rect,
    directory_input: Rect,
    file_label: Rect,
    file_input: Rect,
    cancel_button: Rect,
    create_button: Rect,
}
