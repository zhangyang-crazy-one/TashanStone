use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use tui_notebook::services::ai::AiService;

#[test]
fn ai_stream_chunks_long_text() {
    let chunks = AiService::stream_chunks(
        "This is a deliberately long sentence that should be split into several streaming chunks for the TUI output path.",
    );

    assert!(chunks.len() > 1);
    assert!(chunks.iter().all(|chunk| !chunk.is_empty()));
}

#[tokio::test]
async fn ai_stream_emits_chunks_until_cancelled() {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let mut seen = Vec::new();

    AiService::emit_streaming_text(
        "one two three four five six seven eight".to_string(),
        Arc::clone(&cancel_flag),
        &mut |chunk| {
            seen.push(chunk);
            cancel_flag.store(true, Ordering::Relaxed);
        },
    )
    .await;

    assert_eq!(seen.len(), 1);
    assert!(!seen[0].is_empty());
}
