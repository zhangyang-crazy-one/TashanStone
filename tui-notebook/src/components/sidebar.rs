//! Sidebar component - file tree navigation

use crate::action::{Action, FileAction, NavigationAction};
use crossterm::event::KeyEvent;
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Text},
    widgets::{Block, List, ListItem, ListState},
    Frame,
};
use std::collections::HashMap;

/// File tree item
#[derive(Debug, Clone)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileItem>,
    pub is_expanded: bool,
}

/// Sidebar state
pub struct Sidebar {
    /// File tree
    files: Vec<FileItem>,
    /// Selection state
    list_state: ListState,
    /// Expanded directories
    expanded_paths: HashMap<String, bool>,
    /// Current directory
    current_path: String,
}

impl Sidebar {
    pub fn new() -> Self {
        Self {
            files: Vec::new(),
            list_state: ListState::default(),
            expanded_paths: HashMap::new(),
            current_path: String::from("."),
        }
    }

    /// Initialize the sidebar with default files
    pub fn init(&mut self) {
        // Load current directory
        self.load_directory(".");
    }

    /// Load a directory
    pub fn load_directory(&mut self, path: &str) {
        self.current_path = path.to_string();
        self.files = self.read_directory(path, 0);
        if !self.files.is_empty() {
            self.list_state.select(Some(0));
        }
    }

    /// Read directory contents
    fn read_directory(&self, path: &str, depth: usize) -> Vec<FileItem> {
        let mut items = Vec::new();

        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let file_path = entry.path().to_string_lossy().to_string();

                    // Skip hidden files
                    if name.starts_with('.') {
                        continue;
                    }

                    let is_dir = metadata.is_dir();
                    let children = if is_dir && depth < 2 {
                        self.read_directory(&file_path, depth + 1)
                    } else {
                        Vec::new()
                    };

                    items.push(FileItem {
                        name,
                        path: file_path,
                        is_dir,
                        children,
                        is_expanded: false,
                    });
                }
            }
        }

        // Sort: directories first, then files, alphabetically
        items.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            } else if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });

        items
    }

    /// Handle key events
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        match key.code {
            crossterm::event::KeyCode::Up => {
                self.move_up();
                Some(Action::Navigation(NavigationAction::FocusPrev))
            }
            crossterm::event::KeyCode::Down => {
                self.move_down();
                Some(Action::Navigation(NavigationAction::FocusNext))
            }
            crossterm::event::KeyCode::Enter => {
                let selected = self.get_selected_file().cloned();
                if let Some(selected) = selected {
                    if selected.is_dir {
                        self.toggle_expand(&selected.path);
                    } else {
                        return Some(Action::File(FileAction::Select(selected.path.clone())));
                    }
                }
                None
            }
            crossterm::event::KeyCode::Char('n') if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) => {
                Some(Action::File(FileAction::Create("new_file.md".to_string())))
            }
            _ => None,
        }
    }

    /// Move selection up
    fn move_up(&mut self) {
        if let Some(idx) = self.list_state.selected() {
            if idx > 0 {
                self.list_state.select(Some(idx - 1));
            }
        }
    }

    /// Move selection down
    fn move_down(&mut self) {
        if let Some(idx) = self.list_state.selected() {
            if idx < self.files.len().saturating_sub(1) {
                self.list_state.select(Some(idx + 1));
            }
        }
    }

    /// Toggle directory expansion
    fn toggle_expand(&mut self, path: &str) {
        if let Some(expanded) = self.expanded_paths.get_mut(path) {
            *expanded = !*expanded;
        } else {
            self.expanded_paths.insert(path.to_string(), true);
        }
    }

    /// Get currently selected file
    fn get_selected_file(&self) -> Option<&FileItem> {
        self.list_state.selected().and_then(|idx| self.files.get(idx))
    }

    /// Delete a file
    pub fn delete_file(&mut self, path: &str) {
        if let Err(e) = std::fs::remove_file(path) {
            tracing::error!("Failed to delete file: {}", e);
        }
        let current = self.current_path.clone();
        self.load_directory(&current);
    }

    /// Rename a file
    pub fn rename_file(&mut self, old: &str, new: &str) {
        if let Err(e) = std::fs::rename(old, new) {
            tracing::error!("Failed to rename file: {}", e);
        }
        let current = self.current_path.clone();
        self.load_directory(&current);
    }
}

impl Default for Sidebar {
    fn default() -> Self {
        Self::new()
    }
}

impl crate::components::Component for Sidebar {
    fn init(&mut self) {
        self.init();
    }

    fn handle_key_event(&mut self, key: KeyEvent) -> Option<Action> {
        self.handle_key_event(key)
    }

    fn render(&self, f: &mut Frame<'_>, area: Rect) {
        let items: Vec<ListItem> = self
            .files
            .iter()
            .map(|file| {
                let prefix = if file.is_dir { "[DIR] " } else { "[ ] " };
                let name = format!("{}{}", prefix, file.name);
                ListItem::new(name)
            })
            .collect();

        let list = List::new(items)
            .block(
                Block::default()
                    .title(" Files ")
                    .borders(ratatui::widgets::Borders::ALL),
            )
            .style(Style::default().fg(Color::White))
            .highlight_style(Style::default().bg(Color::Blue).fg(Color::White));

        f.render_stateful_widget(list, area, &mut self.list_state.clone());
    }
}
