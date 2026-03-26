//! UI Components
//!
//! Each component implements the Component trait and handles its own
//! rendering, events, and state.

pub mod chat;
pub mod confirm;
pub mod editor;
pub mod knowledge;
pub mod new_file;
pub mod search;
pub mod settings;
pub mod sidebar;
pub mod status;

use crossterm::event::{KeyEvent, MouseEvent};
use ratatui::Frame;

/// Component trait - all UI components implement this
pub trait Component {
    /// Initialize the component
    fn init(&mut self) {}

    /// Handle a key event, returns an action if handled
    fn handle_key_event(&mut self, _key: KeyEvent) -> Option<crate::action::Action> {
        None
    }

    /// Handle a mouse event, returns an action if handled
    fn handle_mouse_event(&mut self, _mouse: MouseEvent) -> Option<crate::action::Action> {
        None
    }

    /// Handle an action sent to this component
    fn handle_action(&mut self, _action: &crate::action::Action) {}

    /// Render the component
    fn render(&self, f: &mut Frame<'_>, area: ratatui::layout::Rect);
}
