//! Theme system - Color schemes for light/dark modes
//!
//! Provides centralized color definitions for consistent UI.

use ratatui::style::Color;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Application theme
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Theme {
    Dark,
    Light,
}

impl fmt::Display for Theme {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Theme::Dark => write!(f, "dark"),
            Theme::Light => write!(f, "light"),
        }
    }
}

impl Default for Theme {
    fn default() -> Self {
        Self::Dark
    }
}

/// Color palette for the application
#[derive(Debug, Clone)]
pub struct ThemeColors {
    // Background colors
    pub bg_primary: Color,
    pub bg_secondary: Color,
    pub bg_tertiary: Color,

    // Text colors
    pub text_primary: Color,
    pub text_secondary: Color,
    pub text_muted: Color,

    // Accent colors
    pub accent_primary: Color,
    pub accent_secondary: Color,

    // Semantic colors
    pub success: Color,
    pub warning: Color,
    pub error: Color,

    // UI element colors
    pub border: Color,
    pub highlight: Color,
    pub selection: Color,

    // Markdown specific
    pub heading1: Color,
    pub heading2: Color,
    pub heading3: Color,
    pub code: Color,
    pub code_block: Color,
    pub link: Color,
    pub blockquote: Color,
    pub list_bullet: Color,

    // Chat specific
    pub user_message: Color,
    pub ai_message: Color,
    pub system_message: Color,
}

impl ThemeColors {
    /// Get dark theme colors
    pub fn dark() -> Self {
        Self {
            bg_primary: Color::Reset,
            bg_secondary: Color::DarkGray,
            bg_tertiary: Color::Black,
            text_primary: Color::White,
            text_secondary: Color::LightGreen,
            text_muted: Color::DarkGray,
            accent_primary: Color::Cyan,
            accent_secondary: Color::Blue,
            success: Color::Green,
            warning: Color::Yellow,
            error: Color::Red,
            border: Color::DarkGray,
            highlight: Color::Blue,
            selection: Color::Blue,
            heading1: Color::Cyan,
            heading2: Color::Green,
            heading3: Color::Yellow,
            code: Color::Magenta,
            code_block: Color::Magenta,
            link: Color::Blue,
            blockquote: Color::DarkGray,
            list_bullet: Color::Green,
            user_message: Color::Green,
            ai_message: Color::Blue,
            system_message: Color::Yellow,
        }
    }

    /// Get light theme colors
    pub fn light() -> Self {
        Self {
            bg_primary: Color::White,
            bg_secondary: Color::Rgb(200, 200, 200), // LightGray
            bg_tertiary: Color::Rgb(128, 128, 128),  // Gray
            text_primary: Color::Black,
            text_secondary: Color::Rgb(0, 100, 0), // DarkGreen
            text_muted: Color::Rgb(128, 128, 128), // Gray
            accent_primary: Color::Blue,
            accent_secondary: Color::Cyan,
            success: Color::Rgb(0, 100, 0),       // DarkGreen
            warning: Color::Rgb(180, 180, 0),     // DarkYellow
            error: Color::Rgb(180, 0, 0),         // DarkRed
            border: Color::Rgb(200, 200, 200),    // LightGray
            highlight: Color::Rgb(173, 216, 230), // LightBlue
            selection: Color::Rgb(173, 216, 230), // LightBlue
            heading1: Color::Rgb(0, 0, 139),      // DarkBlue
            heading2: Color::Rgb(0, 100, 0),      // DarkGreen
            heading3: Color::Rgb(180, 180, 0),    // DarkYellow
            code: Color::Rgb(139, 0, 139),        // DarkMagenta
            code_block: Color::Rgb(139, 0, 139),  // DarkMagenta
            link: Color::Blue,
            blockquote: Color::Rgb(128, 128, 128),   // DarkGray
            list_bullet: Color::Rgb(0, 100, 0),      // DarkGreen
            user_message: Color::Rgb(0, 100, 0),     // DarkGreen
            ai_message: Color::Rgb(0, 0, 139),       // DarkBlue
            system_message: Color::Rgb(180, 180, 0), // DarkYellow
        }
    }
}

/// Theme manager
pub struct ThemeManager {
    current: Theme,
    colors: ThemeColors,
}

impl ThemeManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get current theme
    pub fn theme(&self) -> Theme {
        self.current
    }

    /// Set theme
    pub fn set_theme(&mut self, theme: Theme) {
        self.current = theme;
        self.colors = match theme {
            Theme::Dark => ThemeColors::dark(),
            Theme::Light => ThemeColors::light(),
        };
    }

    /// Toggle between dark and light
    pub fn toggle(&mut self) {
        self.set_theme(match self.current {
            Theme::Dark => Theme::Light,
            Theme::Light => Theme::Dark,
        });
    }

    /// Get current colors
    pub fn colors(&self) -> &ThemeColors {
        &self.colors
    }
}

impl Default for ThemeManager {
    fn default() -> Self {
        let colors = ThemeColors::dark();
        Self {
            current: Theme::Dark,
            colors,
        }
    }
}
