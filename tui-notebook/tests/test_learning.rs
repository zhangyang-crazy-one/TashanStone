//! Tests for the learning service - SRS flashcard system

use tui_notebook::services::learning::{Flashcard, LearningService, ReviewQuality};

#[test]
fn test_create_flashcard() {
    let card = Flashcard::new(
        "What is Rust?".to_string(),
        "A systems programming language".to_string(),
    );

    assert!(!card.id.is_empty());
    assert_eq!(card.question, "What is Rust?");
    assert_eq!(card.answer, "A systems programming language");
    assert_eq!(card.repetitions, 0);
    assert_eq!(card.interval, 0);
    assert!((card.ease_factor - 2.5).abs() < 0.01);
}

#[test]
fn test_flashcard_with_source() {
    let card = Flashcard::new(
        "What is TMUX?".to_string(),
        "A terminal multiplexer".to_string(),
    )
    .with_source("notes.md".to_string(), Some("block-123".to_string()));

    assert_eq!(card.source_file, Some("notes.md".to_string()));
    assert_eq!(card.source_block_id, Some("block-123".to_string()));
}

#[test]
fn test_srs_review_again() {
    let mut card = Flashcard::new("Question".to_string(), "Answer".to_string());

    // First review with "Again"
    card.update_after_review(ReviewQuality::Again);

    assert_eq!(card.repetitions, 0);
    assert_eq!(card.interval, 1);
    assert!(card.ease_factor < 2.5);
}

#[test]
fn test_srs_review_good() {
    let mut card = Flashcard::new("Question".to_string(), "Answer".to_string());

    // First review with "Good"
    card.update_after_review(ReviewQuality::Good);
    assert_eq!(card.interval, 1);

    // Second review with "Good"
    card.update_after_review(ReviewQuality::Good);
    assert_eq!(card.interval, 6);

    // Third review with "Good" - should use ease factor
    let expected_interval = (6.0 * card.ease_factor) as i32;
    card.update_after_review(ReviewQuality::Good);
    assert_eq!(card.interval, expected_interval);
}

#[test]
fn test_srs_review_easy() {
    let mut card = Flashcard::new("Question".to_string(), "Answer".to_string());

    card.update_after_review(ReviewQuality::Easy);
    assert!(card.ease_factor > 2.5); // Easy increases ease factor
}

#[test]
fn test_learning_service_add_card() {
    let mut service = LearningService::new();
    let card_id = service.create_card(
        "What is async?".to_string(),
        "Running concurrently without blocking".to_string(),
    );

    assert!(service.get_card(&card_id).is_some());
    assert_eq!(service.total_cards(), 1);
}

#[test]
fn test_learning_service_review() {
    let mut service = LearningService::new();
    let card_id = service.create_card("Q".to_string(), "A".to_string());

    // Review card
    let result = service.review_card(&card_id, ReviewQuality::Good);
    assert!(result.is_ok());

    // Review non-existent card
    let result = service.review_card("invalid-id", ReviewQuality::Good);
    assert!(result.is_err());
}

#[test]
fn test_learning_service_delete() {
    let mut service = LearningService::new();
    let card_id = service.create_card("Q".to_string(), "A".to_string());

    assert_eq!(service.total_cards(), 1);

    let deleted = service.delete_card(&card_id);
    assert!(deleted.is_some());
    assert_eq!(service.total_cards(), 0);

    // Delete again returns None
    let deleted = service.delete_card(&card_id);
    assert!(deleted.is_none());
}

#[test]
fn test_learning_service_due_cards() {
    let mut service = LearningService::new();

    // Create a card - should be due immediately
    service.create_card("Q1".to_string(), "A1".to_string());

    // Create another card
    let card_id = service.create_card("Q2".to_string(), "A2".to_string());

    // First card should be due
    let due = service.get_due_cards();
    assert!(!due.is_empty());

    // Review the second card to schedule it in the future
    service.review_card(&card_id, ReviewQuality::Good);
}

#[test]
fn test_learning_service_cards_for_file() {
    let mut service = LearningService::new();

    // Create cards from different files
    service.create_card("Q1".to_string(), "A1".to_string());
    let card2_id = service.create_card("Q2".to_string(), "A2".to_string());

    // Set source for card2
    if let Some(card) = service.get_card_mut(&card2_id) {
        card.source_file = Some("rust-notes.md".to_string());
    }

    let cards = service.get_cards_for_file("rust-notes.md");
    assert_eq!(cards.len(), 1);

    let cards = service.get_cards_for_file("nonexistent.md");
    assert!(cards.is_empty());
}
