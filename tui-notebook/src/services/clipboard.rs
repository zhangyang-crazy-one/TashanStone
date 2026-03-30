//! Clipboard service with internal fallback for SSH/headless terminals.

use copypasta::{ClipboardContext, ClipboardProvider};

pub struct ClipboardService {
    internal: String,
    system: Option<ClipboardContext>,
}

impl ClipboardService {
    pub fn new() -> Self {
        Self {
            internal: String::new(),
            system: ClipboardContext::new().ok(),
        }
    }

    pub fn set_contents(&mut self, text: String) {
        self.internal = text.clone();
        if let Some(system) = self.system.as_mut() {
            if system.set_contents(text).is_err() {
                self.system = None;
            }
        }
    }

    pub fn get_contents(&mut self) -> Option<String> {
        if let Some(system) = self.system.as_mut() {
            match system.get_contents() {
                Ok(text) => {
                    self.internal = text.clone();
                    return Some(text);
                }
                Err(_) => {
                    self.system = None;
                }
            }
        }

        if self.internal.is_empty() {
            None
        } else {
            Some(self.internal.clone())
        }
    }
}

impl Default for ClipboardService {
    fn default() -> Self {
        Self::new()
    }
}
