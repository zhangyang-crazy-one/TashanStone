//! Learning service - SRS and flashcard system
//!
//! Implements spaced repetition for effective learning.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};

/// Flashcard with SRS metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flashcard {
    /// Unique identifier
    pub id: String,
    /// Question/prompt
    pub question: String,
    /// Answer
    pub answer: String,
    /// Source file (optional)
    pub source_file: Option<String>,
    /// Source block ID (optional)
    pub source_block_id: Option<String>,
    /// Creation time
    pub created_at: DateTime<Utc>,
    /// Next review time
    pub next_review: DateTime<Utc>,
    /// Ease factor (default 2.5)
    pub ease_factor: f32,
    /// Interval in days
    pub interval: i32,
    /// Repetition count
    pub repetitions: i32,
}

impl Flashcard {
    /// Create a new flashcard
    pub fn new(question: String, answer: String) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            question,
            answer,
            source_file: None,
            source_block_id: None,
            created_at: now,
            next_review: now,
            ease_factor: 2.5,
            interval: 0,
            repetitions: 0,
        }
    }

    /// Create with source location
    pub fn with_source(mut self, file: String, block_id: Option<String>) -> Self {
        self.source_file = Some(file);
        self.source_block_id = block_id;
        self
    }
}

/// Review quality ratings
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ReviewQuality {
    /// Complete blackout - total failure to recall
    Again = 0,
    /// Incorrect response, but upon seeing correct answer, remembered
    Hard = 1,
    /// Correct response with some hesitation
    Good = 2,
    /// Perfect response with no hesitation
    Easy = 3,
}

/// SRS Algorithm implementation
impl Flashcard {
    /// Update flashcard based on review quality (SM-2 algorithm variant)
    pub fn update_after_review(&mut self, quality: ReviewQuality) {
        let now = Utc::now();

        match quality {
            ReviewQuality::Again => {
                // Reset to beginning
                self.repetitions = 0;
                self.interval = 1;
                self.ease_factor = (self.ease_factor - 0.2).max(1.3);
            }
            ReviewQuality::Hard => {
                self.repetitions += 1;
                self.interval = (self.interval as f32 * 1.2) as i32;
                self.ease_factor = (self.ease_factor - 0.15).max(1.3);
            }
            ReviewQuality::Good => {
                self.repetitions += 1;
                if self.repetitions == 1 {
                    self.interval = 1;
                } else if self.repetitions == 2 {
                    self.interval = 6;
                } else {
                    self.interval = (self.interval as f32 * self.ease_factor) as i32;
                }
            }
            ReviewQuality::Easy => {
                self.repetitions += 1;
                self.interval = (self.interval as f32 * self.ease_factor * 1.3) as i32;
                self.ease_factor += 0.15;
            }
        }

        // Update next review time
        self.next_review = now + Duration::days(self.interval as i64);
    }

    /// Check if card is due for review
    pub fn is_due(&self) -> bool {
        Utc::now() >= self.next_review
    }
}

/// Learning service error
#[derive(Debug, thiserror::Error)]
pub enum LearningError {
    #[error("Card not found: {0}")]
    CardNotFound(String),
    #[error("Storage error: {0}")]
    Storage(String),
}

/// Learning service for flashcard management
pub struct LearningService {
    /// All flashcards
    cards: HashMap<String, Flashcard>,
    /// Cards due for review (by ID)
    due_cards: Vec<String>,
}

impl LearningService {
    /// Create a new learning service
    pub fn new() -> Self {
        Self {
            cards: HashMap::new(),
            due_cards: Vec::new(),
        }
    }

    /// Add a new flashcard
    pub fn add_card(&mut self, card: Flashcard) {
        let id = card.id.clone();
        self.cards.insert(id, card);
        self.update_due_cards();
    }

    /// Create and add a new flashcard from question/answer
    pub fn create_card(&mut self, question: String, answer: String) -> String {
        let card = Flashcard::new(question, answer);
        let id = card.id.clone();
        self.add_card(card);
        id
    }

    /// Get a flashcard by ID
    pub fn get_card(&self, id: &str) -> Option<&Flashcard> {
        self.cards.get(id)
    }

    /// Get a mutable flashcard by ID
    pub fn get_card_mut(&mut self, id: &str) -> Option<&mut Flashcard> {
        self.cards.get_mut(id)
    }

    /// Review a card and update its SRS data
    pub fn review_card(&mut self, card_id: &str, quality: ReviewQuality) -> Result<(), LearningError> {
        let card = self.cards.get_mut(card_id)
            .ok_or_else(|| LearningError::CardNotFound(card_id.to_string()))?;

        card.update_after_review(quality);
        self.update_due_cards();
        Ok(())
    }

    /// Get all cards due for review
    pub fn get_due_cards(&self) -> Vec<&Flashcard> {
        self.due_cards
            .iter()
            .filter_map(|id| self.cards.get(id))
            .collect()
    }

    /// Get count of cards due for review
    pub fn due_count(&self) -> usize {
        self.due_cards.len()
    }

    /// Get total card count
    pub fn total_cards(&self) -> usize {
        self.cards.len()
    }

    /// Update the due cards list
    fn update_due_cards(&mut self) {
        self.due_cards = self.cards
            .values()
            .filter(|c| c.is_due())
            .map(|c| c.id.clone())
            .collect();
    }

    /// Delete a flashcard
    pub fn delete_card(&mut self, card_id: &str) -> Option<Flashcard> {
        let result = self.cards.remove(card_id);
        self.update_due_cards();
        result
    }

    /// Get cards from a specific file
    pub fn get_cards_for_file(&self, file_path: &str) -> Vec<&Flashcard> {
        self.cards
            .values()
            .filter(|c| c.source_file.as_deref() == Some(file_path))
            .collect()
    }

    /// Save all cards to a JSON file
    pub async fn save_to_file(&self, path: &std::path::Path) -> Result<(), std::io::Error> {
        let json = serde_json::to_string_pretty(&self.cards).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, e)
        })?;
        tokio::fs::write(path, json).await
    }

    /// Load cards from a JSON file
    pub async fn load_from_file(path: &std::path::Path) -> Result<Self, std::io::Error> {
        let json = tokio::fs::read_to_string(path).await?;
        let cards: HashMap<String, Flashcard> = serde_json::from_str(&json).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, e)
        })?;

        let mut service = Self {
            cards,
            due_cards: Vec::new(),
        };
        service.update_due_cards();
        Ok(service)
    }
}

impl Default for LearningService {
    fn default() -> Self {
        Self::new()
    }
}
