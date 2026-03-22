//! Notebook model
//!
//! A notebook is a collection of documents organized in a directory structure.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

/// Notebook represents a collection of documents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    /// Unique identifier
    pub id: String,
    /// Notebook name
    pub name: String,
    /// Root directory path
    pub root_path: PathBuf,
    /// Documents in the notebook
    pub documents: HashMap<String, Document>,
    /// Creation timestamp
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Last modified timestamp
    pub updated_at: chrono::DateTime<chrono::Utc>,
    /// Metadata
    pub metadata: NotebookMetadata,
}

/// Notebook metadata
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NotebookMetadata {
    /// Description
    pub description: Option<String>,
    /// Tags
    pub tags: Vec<String>,
    /// Settings
    pub settings: NotebookSettings,
}

/// Notebook settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookSettings {
    /// Default file extension
    pub default_extension: String,
    /// Auto-save interval in seconds
    pub auto_save_interval: u64,
    /// Enable spell check
    pub spell_check: bool,
    /// Default markdown flavor
    pub markdown_flavor: MarkdownFlavor,
}

/// Markdown flavor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarkdownFlavor {
    CommonMark,
    GFM,       // GitHub Flavored Markdown
    Obsidian,
}

impl Default for NotebookSettings {
    fn default() -> Self {
        Self {
            default_extension: "md".to_string(),
            auto_save_interval: 30,
            spell_check: false,
            markdown_flavor: MarkdownFlavor::GFM,
        }
    }
}

impl Notebook {
    /// Create a new notebook
    pub fn new(name: String, root_path: PathBuf) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            root_path,
            documents: HashMap::new(),
            created_at: now,
            updated_at: now,
            metadata: NotebookMetadata::default(),
        }
    }

    /// Add a document to the notebook
    pub fn add_document(&mut self, path: String, document: Document) {
        self.documents.insert(path, document);
        self.updated_at = chrono::Utc::now();
    }

    /// Remove a document from the notebook
    pub fn remove_document(&mut self, path: &str) -> Option<Document> {
        let result = self.documents.remove(path);
        if result.is_some() {
            self.updated_at = chrono::Utc::now();
        }
        result
    }

    /// Get a document by path
    pub fn get_document(&self, path: &str) -> Option<&Document> {
        self.documents.get(path)
    }

    /// Get a mutable document by path
    pub fn get_document_mut(&mut self, path: &str) -> Option<&mut Document> {
        self.updated_at = chrono::Utc::now();
        self.documents.get_mut(path)
    }

    /// List all document paths
    pub fn list_documents(&self) -> Vec<&String> {
        self.documents.keys().collect()
    }

    /// Search documents by content
    pub fn search(&self, query: &str) -> Vec<SearchHit> {
        let mut hits = Vec::new();
        for (path, doc) in &self.documents {
            for (line_num, line) in doc.content.lines().enumerate() {
                if line.contains(query) {
                    hits.push(SearchHit {
                        path: path.clone(),
                        line_number: line_num + 1,
                        line_content: line.to_string(),
                    });
                }
            }
        }
        hits
    }
}

/// Search hit
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub path: String,
    pub line_number: usize,
    pub line_content: String,
}

use crate::models::document::Document;
