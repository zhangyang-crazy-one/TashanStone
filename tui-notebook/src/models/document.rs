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
        let title = Self::extract_title(&path, &content);
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
    fn extract_title(path: &str, content: &str) -> String {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                return trimmed[2..].trim().to_string();
            }
        }

        std::path::Path::new(path)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .filter(|stem| !stem.is_empty())
            .unwrap_or("Untitled")
            .to_string()
    }

    /// Parse content to extract links, block references, and tags
    fn parse_content(content: &str) -> (Vec<Link>, Vec<BlockReference>, Vec<String>) {
        let mut links = Vec::new();
        let mut block_refs = Vec::new();
        let mut tags = Vec::new();

        for (line_num, line) in content.lines().enumerate() {
            links.extend(Self::parse_wiki_links(line, line_num + 1));

            block_refs.extend(Self::parse_block_refs(line, line_num + 1));

            tags.extend(Self::parse_tags(line));
        }

        (links, block_refs, tags)
    }

    fn parse_wiki_links(line: &str, line_num: usize) -> Vec<Link> {
        let mut links = Vec::new();
        let mut cursor = 0;

        while let Some(start) = line[cursor..].find("[[") {
            let absolute_start = cursor + start;
            let rest = &line[absolute_start + 2..];
            let Some(end) = rest.find("]]") else {
                break;
            };

            let inner = &rest[..end];
            let (target, label) = if let Some(pipe) = inner.find('|') {
                (
                    inner[..pipe].trim().to_string(),
                    Some(inner[pipe + 1..].trim().to_string()),
                )
            } else {
                (inner.trim().to_string(), Some(inner.trim().to_string()))
            };

            if !target.is_empty() {
                links.push(Link {
                    link_type: LinkType::Wiki,
                    target,
                    label,
                    line_number: line_num,
                });
            }

            cursor = absolute_start + 2 + end + 2;
        }

        links
    }

    fn parse_block_refs(line: &str, line_num: usize) -> Vec<BlockReference> {
        let mut block_refs = Vec::new();
        let mut cursor = 0;

        while let Some(start) = line[cursor..].find("((") {
            let absolute_start = cursor + start;
            let rest = &line[absolute_start + 2..];
            let Some(end) = rest.find("))") else {
                break;
            };

            let id = rest[..end].trim().to_string();
            if !id.is_empty() {
                block_refs.push(BlockReference {
                    id,
                    block_type: BlockType::Paragraph,
                    content: line.to_string(),
                    line_number: line_num,
                });
            }

            cursor = absolute_start + 2 + end + 2;
        }

        block_refs
    }

    fn parse_tags(line: &str) -> Vec<String> {
        let chars: Vec<char> = line.chars().collect();
        let mut tags = Vec::new();
        let mut index = 0;

        while index < chars.len() {
            if chars[index] != '#' {
                index += 1;
                continue;
            }

            let previous = index
                .checked_sub(1)
                .and_then(|prev| chars.get(prev).copied());
            if previous
                .map(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '/' | '-'))
                .unwrap_or(false)
            {
                index += 1;
                continue;
            }

            if chars.get(index + 1) == Some(&'[') {
                let mut end = index + 2;
                while end < chars.len() && chars[end] != ']' {
                    end += 1;
                }

                if end < chars.len() {
                    let tag: String = chars[index + 2..end].iter().collect();
                    if !tag.trim().is_empty() {
                        tags.push(tag.trim().to_string());
                    }
                    index = end + 1;
                    continue;
                }
            } else {
                let mut end = index + 1;
                while end < chars.len()
                    && (chars[end].is_ascii_alphanumeric() || matches!(chars[end], '_' | '-' | '/'))
                {
                    end += 1;
                }

                if end > index + 1 {
                    let tag: String = chars[index + 1..end].iter().collect();
                    if !tag.trim().is_empty() {
                        tags.push(tag.trim().to_string());
                    }
                    index = end;
                    continue;
                }
            }

            index += 1;
        }

        tags
    }

    /// Update content and re-parse
    pub fn update_content(&mut self, content: String) {
        self.content = content;
        self.title = Self::extract_title(&self.path, &self.content);
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

#[cfg(test)]
mod tests {
    use super::{Document, LinkType};

    #[test]
    fn parses_multiple_wiki_links_and_tags() {
        let document = Document::new(
            "notes/sample.md".to_string(),
            "# Sample\n\nLinks [[first]] and [[second|Second]]. Tags #[rust] and #tui.\n"
                .to_string(),
        );

        assert_eq!(document.title, "Sample");
        assert_eq!(document.links.len(), 2);
        assert!(matches!(document.links[0].link_type, LinkType::Wiki));
        assert_eq!(document.links[0].target, "first");
        assert_eq!(document.links[1].target, "second");
        assert_eq!(document.tags, vec!["rust".to_string(), "tui".to_string()]);
    }

    #[test]
    fn falls_back_to_file_stem_for_title() {
        let document = Document::new(
            "notes/untitled-note.md".to_string(),
            "Plain text".to_string(),
        );
        assert_eq!(document.title, "untitled-note");
    }
}
