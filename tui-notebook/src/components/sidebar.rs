//! Sidebar component - file tree navigation

use crate::action::{Action, FileAction};
use crossterm::event::KeyEvent;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Frame,
};
use std::collections::HashMap;

/// File tree item with flat representation for rendering
#[derive(Debug, Clone)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileItem>,
    pub is_expanded: bool,
}

/// Flattened tree item for rendering
#[derive(Debug, Clone)]
struct FlatItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub depth: usize,
    pub is_expanded: bool,
    pub has_children: bool,
}

/// Sidebar state
pub struct Sidebar {
    /// File tree
    files: Vec<FileItem>,
    /// Flattened items for rendering
    flat_items: Vec<FlatItem>,
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
            flat_items: Vec::new(),
            list_state: ListState::default(),
            expanded_paths: HashMap::new(),
            current_path: String::from("."),
        }
    }

    /// Initialize the sidebar with default files
    pub fn init(&mut self) {
        self.load_directory(".");
    }

    /// Load a directory
    pub fn load_directory(&mut self, path: &str) {
        self.current_path = path.to_string();
        self.files = self.read_directory(path, 0);
        self.rebuild_flat_list();
        if !self.flat_items.is_empty() {
            self.list_state.select(Some(0));
        }
    }

    /// Refresh the current workspace tree.
    pub fn reload(&mut self) {
        let current = self.current_path.clone();
        self.load_directory(&current);
    }

    /// Get the current workspace root path.
    pub fn workspace_path(&self) -> &str {
        &self.current_path
    }

    /// Get the current workspace display name.
    pub fn workspace_name(&self) -> String {
        std::path::Path::new(&self.current_path)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or("workspace")
            .to_string()
    }

    /// Get the currently selected path.
    pub fn selected_path(&self) -> Option<String> {
        self.list_state
            .selected()
            .and_then(|idx| self.flat_items.get(idx))
            .map(|item| item.path.clone())
    }

    /// Get the selected directory, or the parent directory of a selected file.
    pub fn selected_directory(&self) -> Option<String> {
        self.list_state
            .selected()
            .and_then(|idx| self.flat_items.get(idx))
            .map(|item| {
                if item.is_dir {
                    item.path.clone()
                } else {
                    std::path::Path::new(&item.path)
                        .parent()
                        .map(|path| path.to_string_lossy().to_string())
                        .unwrap_or_else(|| self.current_path.clone())
                }
            })
    }

    /// Rebuild the flattened list from tree
    fn rebuild_flat_list(&mut self) {
        self.flat_items.clear();
        let files = self.files.clone();
        let expanded_paths = self.expanded_paths.clone();
        self.flatten_tree_impl(&files, 0, &expanded_paths);
    }

    /// Flatten tree into list recursively
    fn flatten_tree_impl(
        &mut self,
        items: &[FileItem],
        depth: usize,
        expanded_paths: &HashMap<String, bool>,
    ) {
        for item in items {
            let has_children = !item.children.is_empty();
            let is_expanded = expanded_paths.get(&item.path).copied().unwrap_or(false);

            self.flat_items.push(FlatItem {
                name: item.name.clone(),
                path: item.path.clone(),
                is_dir: item.is_dir,
                depth,
                is_expanded,
                has_children,
            });

            if item.is_dir && is_expanded {
                self.flatten_tree_impl(&item.children, depth + 1, expanded_paths);
            }
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

                    // Skip hidden files and non-markdown files at root
                    if name.starts_with('.') {
                        continue;
                    }

                    let is_dir = metadata.is_dir();
                    // Only read subdirectories, not all nested content
                    let children = if is_dir && depth < 3 {
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
                None // Don't trigger focus change, just move selection
            }
            crossterm::event::KeyCode::Down => {
                self.move_down();
                None // Don't trigger focus change, just move selection
            }
            crossterm::event::KeyCode::Enter => {
                // Get the path before borrowing mutably
                let path_to_toggle = self.get_selected_path_if_dir();
                if let Some(path) = path_to_toggle {
                    self.toggle_expand(&path);
                    self.rebuild_flat_list();
                    None
                } else if let Some(path) = self.get_selected_path_if_file() {
                    Some(Action::File(FileAction::Select(path)))
                } else {
                    None
                }
            }
            crossterm::event::KeyCode::Left => {
                // Collapse directory if expanded
                if let Some(path) = self.get_selected_path_if_expanded_dir() {
                    self.toggle_expand(&path);
                    self.rebuild_flat_list();
                }
                None
            }
            crossterm::event::KeyCode::Right => {
                // Expand directory if collapsed
                if let Some(path) = self.get_selected_path_if_collapsed_dir() {
                    self.toggle_expand(&path);
                    self.rebuild_flat_list();
                }
                None
            }
            crossterm::event::KeyCode::Char('n')
                if key
                    .modifiers
                    .contains(crossterm::event::KeyModifiers::CONTROL) =>
            {
                Some(Action::File(FileAction::OpenCreateDialog {
                    directory: self.selected_directory(),
                }))
            }
            crossterm::event::KeyCode::Delete => self
                .get_selected_path_if_file()
                .map(|path| Action::File(FileAction::OpenDeleteDialog(path))),
            _ => None,
        }
    }

    /// Get selected path if it's a directory
    fn get_selected_path_if_dir(&self) -> Option<String> {
        self.list_state
            .selected()
            .and_then(|idx| self.flat_items.get(idx))
            .and_then(|item| {
                if item.is_dir {
                    Some(item.path.clone())
                } else {
                    None
                }
            })
    }

    /// Get selected path if it's a file
    fn get_selected_path_if_file(&self) -> Option<String> {
        self.list_state
            .selected()
            .and_then(|idx| self.flat_items.get(idx))
            .and_then(|item| {
                if !item.is_dir {
                    Some(item.path.clone())
                } else {
                    None
                }
            })
    }

    /// Get selected path if it's an expanded directory
    fn get_selected_path_if_expanded_dir(&self) -> Option<String> {
        self.list_state
            .selected()
            .and_then(|idx| self.flat_items.get(idx))
            .and_then(|item| {
                if item.is_dir && item.is_expanded {
                    Some(item.path.clone())
                } else {
                    None
                }
            })
    }

    /// Get selected path if it's a collapsed directory with children
    fn get_selected_path_if_collapsed_dir(&self) -> Option<String> {
        self.list_state
            .selected()
            .and_then(|idx| self.flat_items.get(idx))
            .and_then(|item| {
                if item.is_dir && !item.is_expanded && item.has_children {
                    Some(item.path.clone())
                } else {
                    None
                }
            })
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
            if idx < self.flat_items.len().saturating_sub(1) {
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

    /// Get currently selected flat item
    fn get_selected_flat(&self) -> Option<&FlatItem> {
        self.list_state
            .selected()
            .and_then(|idx| self.flat_items.get(idx))
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
        let sections = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(3), Constraint::Min(1)])
            .split(area);

        let header = Paragraph::new(vec![
            Line::from(vec![Span::styled(
                format!("◆ {}", self.workspace_name()),
                Style::default().fg(Color::Cyan),
            )]),
            Line::from(vec![Span::styled(
                self.current_path.as_str(),
                Style::default().fg(Color::DarkGray),
            )]),
        ])
        .block(Block::default().borders(Borders::BOTTOM))
        .style(Style::default().bg(Color::Rgb(22, 27, 34)).fg(Color::White));
        f.render_widget(header, sections[0]);

        let items: Vec<ListItem> = self
            .flat_items
            .iter()
            .map(|item| {
                // Tree lines and icons
                let indent = "  ".repeat(item.depth);
                let connector = if item.is_dir {
                    if item.is_expanded {
                        "▼ "
                    } else if item.has_children {
                        "▶ "
                    } else {
                        "• "
                    }
                } else {
                    "· "
                };

                let name = format!("{}{}{}", indent, connector, item.name);
                let color = if item.is_dir {
                    Color::Rgb(139, 148, 158)
                } else {
                    Color::Rgb(201, 209, 217)
                };
                ListItem::new(name).style(Style::default().fg(color))
            })
            .collect();

        let list = List::new(items)
            .block(
                Block::default()
                    .title(" Files ")
                    .borders(ratatui::widgets::Borders::NONE),
            )
            .style(Style::default().bg(Color::Rgb(13, 17, 23)).fg(Color::White))
            .highlight_style(
                Style::default()
                    .bg(Color::Rgb(30, 41, 59))
                    .fg(Color::Rgb(201, 209, 217)),
            )
            .highlight_symbol("▸ ");

        f.render_stateful_widget(list, sections[1], &mut self.list_state.clone());
    }
}
