//! TUI wrapper for terminal setup and event handling

use anyhow::Result;
use crossterm::{
    event::{
        DisableBracketedPaste, DisableMouseCapture, EnableBracketedPaste, EnableMouseCapture,
        Event as CrosstermEvent,
    },
    terminal::{
        disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen, SetTitle,
    },
};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use std::io::Stdout;
use std::time::Duration;

/// TUI wrapper
pub struct Tui {
    terminal: Terminal<CrosstermBackend<Stdout>>,
}

impl Tui {
    /// Create a new TUI
    pub fn new() -> Result<Self> {
        // Setup terminal
        let stdout = std::io::stdout();
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        // Enable bracketed paste
        crossterm::execute!(terminal.backend_mut(), EnableBracketedPaste)?;

        Ok(Self { terminal })
    }

    /// Enter the alternate screen
    pub fn enter(&mut self) -> Result<()> {
        enable_raw_mode()?;
        crossterm::execute!(
            self.terminal.backend_mut(),
            EnterAlternateScreen,
            EnableMouseCapture,
        )?;
        self.terminal.clear()?;
        Ok(())
    }

    /// Exit the alternate screen
    pub fn exit(&mut self) -> Result<()> {
        crossterm::execute!(
            self.terminal.backend_mut(),
            LeaveAlternateScreen,
            DisableMouseCapture,
            DisableBracketedPaste,
        )?;
        disable_raw_mode()?;
        Ok(())
    }

    /// Set terminal title
    pub fn set_title(&mut self, title: &str) -> Result<()> {
        crossterm::execute!(self.terminal.backend_mut(), SetTitle(title))?;
        Ok(())
    }

    /// Draw to the terminal
    pub fn draw<F>(&mut self, f: F) -> Result<()>
    where
        F: FnOnce(&mut ratatui::Frame<'_>),
    {
        self.terminal.draw(f)?;
        Ok(())
    }

    /// Get the next event with timeout
    pub fn next_event(&mut self) -> Result<Option<CrosstermEvent>> {
        // Use sync event poll with timeout
        match crossterm::event::poll(Duration::from_millis(16))? {
            true => {
                let event = crossterm::event::read()?;
                Ok(Some(event))
            }
            false => Ok(None),
        }
    }

    /// Get the terminal size
    pub fn size(&self) -> ratatui::layout::Rect {
        self.terminal
            .size()
            .map(|size| ratatui::layout::Rect::new(0, 0, size.width, size.height))
            .unwrap_or_else(|_| ratatui::layout::Rect::new(0, 0, 80, 24))
    }

    /// Check if the terminal supports true color
    pub fn supports_true_color(&self) -> bool {
        std::env::var("COLORTERM")
            .map(|v| v == "truecolor" || v == "24bit")
            .unwrap_or(false)
    }

    /// Get the terminal's color depth
    pub fn color_depth(&self) -> ColorDepth {
        if self.supports_true_color() {
            ColorDepth::TrueColor
        } else if std::env::var("TERM")
            .map(|t| t.contains("256"))
            .unwrap_or(false)
        {
            ColorDepth::EightBit
        } else {
            ColorDepth::FourBit
        }
    }
}

/// Color depth enum
#[derive(Debug, Clone, Copy)]
pub enum ColorDepth {
    /// 16 colors
    FourBit,
    /// 256 colors
    EightBit,
    /// 24-bit true color
    TrueColor,
}
