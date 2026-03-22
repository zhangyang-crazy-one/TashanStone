//! Document model
//!
//! Represents a single document (Markdown file) in the notebook.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Document represents a single Markdown document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    /// Unique identifier
    pub id: String,
    /// Document title (derived from first heading or filename)
    pub title: String,
    /// File path relative to notebook root
    pub path: String,
    /// Raw content
    pub content: String,
    /// Document metadata
    pub metadata: DocumentMetadata,
    /// Links in this document
    pub links: Vec<Link>,
    /// Backlinks (links pointing to this document)
    pub backlinks: Vec<Backlink>,
    /// Block references in this document
    pub block_refs: Vec<BlockReference>,
    /// Tags in this document
    pub tags: Vec<String>,
    /// Creation timestamp
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Last modified timestamp
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Document metadata
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DocumentMetadata {
    /// Author
    pub author: Option<String>,
    /// Custom properties
    pub properties: HashMap<String, String>,
}

/// Link in the document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    /// Link type
    pub link_type: LinkType,
    /// Target (file path or URL)
    pub target: String,
    /// Display label (for wiki links with aliases)
    pub label: Option<String>,
    /// Line number where the link appears
    pub line_number: usize,
}

/// Link type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LinkType {
    /// Wiki link [[target]]
    Wiki,
    /// Block reference ((target))
    BlockRef,
    /// Markdown link [label](target)
    Markdown,
    /// URL link
    Url,
    /// Image link
    Image,
}

/// Backlink - a link from another document pointing to this one
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backlink {
    /// Source document path
    pub source_path: String,
    /// Source document title
    pub source_title: String,
    /// Context around the link
    pub context: String,
    /// Line number in source document
    pub line_number: usize,
}

/// Block reference in the document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockReference {
    /// Unique block ID
    pub id: String,
    /// Block type
    pub block_type: BlockType,
    /// Content of the block
    pub content: String,
    /// Line number where the block starts
    pub line_number: usize,
}

/// Block type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BlockType {
    /// Paragraph
    Paragraph,
    /// Heading
    Heading { level: u8 },
    /// Code block
    CodeBlock { language: Option<String> },
    /// List item
    ListItem,
    /// Blockquote
    Blockquote,
    /// Custom block
    Custom(String),
}

impl Document {
    /// Create a new document
    pub fn new(path: String, content: String) -> Self {
        let now = chrono::Utc::now();
        let title = Self::extract_title(&content);
        let (links, block_refs, tags) = Self::parse_content(&content);

        Self {
            id: Uuid::new_v4().to_string(),
            title,
            path,
            content,
            metadata: DocumentMetadata::default(),
            links,
            backlinks: Vec::new(),
            block_refs,
            tags,
            created_at: now,
            updated_at: now,
        }
    }

    /// Extract title from content (first heading)
    fn extract_title(content: &str) -> String {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                return trimmed[2..].trim().to_string();
            }
        }
        "Untitled".to_string()
    }

    /// Parse content to extract links, block references, and tags
    fn parse_content(content: &str) -> (Vec<Link>, Vec<BlockReference>, Vec<String>) {
        let mut links = Vec::new();
        let mut block_refs = Vec::new();
        let mut tags = Vec::new();

        for (line_num, line) in content.lines().enumerate() {
            // Wiki links [[]]
            if let Some(link) = Self::parse_wiki_link(line, line_num + 1) {
                links.push(link);
            }

            // Block references ((
            if let Some(block_ref) = Self::parse_block_ref(line, line_num + 1) {
                block_refs.push(block_ref);
            }

            // Tags #[]
            if let Some(tag) = Self::parse_tag(line) {
                tags.push(tag);
            }
        }

        (links, block_refs, tags)
    }

    /// Parse a wiki link
    fn parse_wiki_link(line: &str, line_num: usize) -> Option<Link> {
        // Simple wiki link detection [[target]] or [[target|label]]
        if let Some(start) = line.find("[[") {
            if let Some(end) = line.find("]]") {
                let inner = &line[start + 2..end];
                let (target, label) = if let Some(pipe) = inner.find('|') {
                    (inner[..pipe].to_string(), Some(inner[pipe + 1..].to_string()))
                } else {
                    (inner.to_string(), Some(inner.to_string()))
                };

                return Some(Link {
                    link_type: LinkType::Wiki,
                    target,
                    label,
                    line_number: line_num,
                });
            }
        }
        None
    }

    /// Parse a block reference
    fn parse_block_ref(line: &str, line_num: usize) -> Option<BlockReference> {
        // Block reference ((id))
        if let Some(start) = line.find("((") {
            if let Some(end) = line.find("))") {
                let id = line[start + 2..end].to_string();
                return Some(BlockReference {
                    id,
                    block_type: BlockType::Paragraph,
                    content: line.to_string(),
                    line_number: line_num,
                });
            }
        }
        None
    }

    /// Parse a tag
    fn parse_tag(line: &str) -> Option<String> {
        // Tag #[tag-name]
        if let Some(start) = line.find("#[") {
            if let Some(rest) = line.get(start + 2..) {
                if let Some(end) = rest.find(']') {
                    return Some(rest[..end].to_string());
                }
            }
        }
        None
    }

    /// Update content and re-parse
    pub fn update_content(&mut self, content: String) {
        self.content = content;
        self.title = Self::extract_title(&self.content);
        let (links, block_refs, tags) = Self::parse_content(&self.content);
        self.links = links;
        self.block_refs = block_refs;
        self.tags = tags;
        self.updated_at = chrono::Utc::now();
    }

    /// Add a backlink
    pub fn add_backlink(&mut self, backlink: Backlink) {
        self.backlinks.push(backlink);
    }
}
