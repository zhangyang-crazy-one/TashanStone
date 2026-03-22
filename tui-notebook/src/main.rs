//! tui-notebook - A complete TUI notebook application
//!
//! Features:
//! - Markdown editing with syntax highlighting
//! - Wiki links [[]] and block references ((id))
//! - AI chat integration
//! - Knowledge base with semantic search
//! - Learning tools (SRS, quizzes)

mod action;
mod app;
mod components;
mod models;
mod services;
mod theme;
mod tui;

use anyhow::Result;
use std::env;
use tracing_subscriber::{fmt, EnvFilter};

fn setup_logging() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(true)
        .init();
}

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        let message = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };

        tracing::error!(
            target: "panic",
            location = %location,
            message = %message,
            "Application panic"
        );
    }));
}

fn main() -> Result<()> {
    setup_logging();
    setup_panic_hook();

    tracing::info!("Starting tui-notebook v{}", env!("CARGO_PKG_VERSION"));

    // Create Tokio runtime for async operations
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async {
        let mut app = app::App::new()?;
        app.run()
    })?;

    tracing::info!("Shutting down gracefully");
    Ok(())
}
