//! tui-notebook - A complete TUI notebook application
//!
//! Features:
//! - Markdown editing with syntax highlighting
//! - Wiki links [[]] and block references ((id))
//! - AI chat integration
//! - Knowledge base with semantic search
//! - Learning tools (SRS, quizzes)

use anyhow::Result;
use std::env;
use std::path::PathBuf;
use tui_notebook::app::App;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn setup_logging() -> WorkerGuard {
    let log_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("tui-notebook")
        .join("logs");

    // Create log directory if it doesn't exist
    let _ = std::fs::create_dir_all(&log_dir);

    let log_file = log_dir.join("tui-notebook.log");

    // Create non-blocking file writer
    let (file_writer, guard) = tracing_appender::non_blocking(
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file)
            .expect("Failed to open log file"),
    );

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    // File layer - writes to file
    let file_layer = fmt::layer()
        .with_writer(file_writer)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true);

    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .init();

    tracing::info!("Log file: {:?}", log_file);
    guard
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
    // Setup logging first - guard must be kept alive
    let _guard = setup_logging();
    setup_panic_hook();

    tracing::info!("Starting tui-notebook v{}", env!("CARGO_PKG_VERSION"));

    // Create Tokio runtime for async operations
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async {
        let mut app = App::new()?;
        app.run()
    })?;

    tracing::info!("Shutting down gracefully");
    Ok(())
}
