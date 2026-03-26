//! Workspace metadata indexing for wiki links, backlinks, and tags.

use crate::i18n::{Language, TextKey};
use crate::models::{
    document::{Backlink, LinkType},
    Document, Notebook,
};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default)]
pub struct KnowledgeReference {
    pub title: String,
    pub relative_path: String,
    pub absolute_path: Option<String>,
    pub context: String,
    pub line_number: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GraphEdgeKind {
    #[default]
    Link,
    Backlink,
    Tag,
}

#[derive(Debug, Clone, Default)]
pub struct GraphNodeRef {
    pub kind: GraphEdgeKind,
    pub title: String,
    pub relative_path: String,
    pub absolute_path: Option<String>,
    pub context: String,
    pub line_number: Option<usize>,
    pub resolved: bool,
}

#[derive(Debug, Clone, Default)]
pub struct GraphRoot {
    pub title: String,
    pub relative_path: String,
    pub absolute_path: Option<String>,
    pub children: Vec<GraphNodeRef>,
}

#[derive(Debug, Clone, Default)]
pub struct DocumentKnowledgeContext {
    pub title: String,
    pub relative_path: String,
    pub tags: Vec<String>,
    pub outgoing_links: Vec<KnowledgeReference>,
    pub backlinks: Vec<KnowledgeReference>,
    pub related_tags: Vec<KnowledgeReference>,
}

#[derive(Debug, Clone, Default)]
pub struct WorkspaceLinkPreview {
    pub title: String,
    pub subtitle: String,
    pub body: Vec<String>,
    pub absolute_path: Option<String>,
    pub line_number: Option<usize>,
    pub resolved: bool,
}

pub struct WorkspaceIndex {
    root_path: PathBuf,
    notebook: Notebook,
    document_contexts: HashMap<String, DocumentKnowledgeContext>,
    tag_count: usize,
}

impl WorkspaceIndex {
    fn should_skip_entry(name: &str, is_dir: bool) -> bool {
        if name.starts_with('.') {
            return true;
        }

        is_dir
            && matches!(
                name,
                "target" | "node_modules" | "dist" | "build" | ".turbo" | ".next"
            )
    }

    pub fn build(root: &Path) -> Self {
        let root_path = root.to_path_buf();
        let mut index = Self::empty(root_path.clone());
        index.reload();
        index
    }

    pub fn empty(root_path: PathBuf) -> Self {
        let notebook_name = root_path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or("workspace")
            .to_string();

        Self {
            notebook: Notebook::new(notebook_name, root_path.clone()),
            root_path,
            document_contexts: HashMap::new(),
            tag_count: 0,
        }
    }

    pub fn reload(&mut self) {
        let notebook_name = self
            .root_path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or("workspace")
            .to_string();

        self.notebook = Notebook::new(notebook_name, self.root_path.clone());
        self.document_contexts.clear();
        self.tag_count = 0;

        if !self.root_path.exists() {
            return;
        }

        for path in Self::collect_markdown_files(&self.root_path) {
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };

            let relative_path = Self::to_relative_path(&self.root_path, &path);
            self.notebook
                .add_document(relative_path.clone(), Document::new(relative_path, content));
        }

        self.rebuild_relationships();
    }

    pub fn document_context_for_path(&self, path: &Path) -> Option<DocumentKnowledgeContext> {
        let relative_path = Self::to_relative_path(&self.root_path, path);
        self.document_contexts.get(&relative_path).cloned()
    }

    pub fn graph_root_for_path(&self, path: &Path) -> Option<GraphRoot> {
        let relative_path = Self::to_relative_path(&self.root_path, path);
        let context = self.document_contexts.get(&relative_path)?;

        Some(GraphRoot {
            title: context.title.clone(),
            relative_path: context.relative_path.clone(),
            absolute_path: Some(self.absolute_path(&context.relative_path)),
            children: self.graph_children_for_relative_path(&context.relative_path),
        })
    }

    pub fn graph_children_for_relative_path(&self, path: &str) -> Vec<GraphNodeRef> {
        let Some(context) = self.document_contexts.get(path) else {
            return Vec::new();
        };

        let mut children = Vec::new();
        children.extend(
            context
                .outgoing_links
                .iter()
                .cloned()
                .map(|reference| Self::graph_node(GraphEdgeKind::Link, reference)),
        );
        children.extend(
            context
                .backlinks
                .iter()
                .cloned()
                .map(|reference| Self::graph_node(GraphEdgeKind::Backlink, reference)),
        );
        children.extend(
            context
                .related_tags
                .iter()
                .cloned()
                .map(|reference| Self::graph_node(GraphEdgeKind::Tag, reference)),
        );
        children
    }

    pub fn document_count(&self) -> usize {
        self.notebook.documents.len()
    }

    pub fn tag_count(&self) -> usize {
        self.tag_count
    }

    pub fn preview_reference(
        &self,
        language: Language,
        source_path: Option<&str>,
        target: &str,
    ) -> WorkspaceLinkPreview {
        let t = language.translator();
        let trimmed = target.trim();
        if trimmed.is_empty() {
            return WorkspaceLinkPreview {
                title: t.text(TextKey::PreviewEmptyLink).to_string(),
                subtitle: t.text(TextKey::PreviewNoTarget).to_string(),
                body: vec![t.text(TextKey::PreviewNoTarget).to_string()],
                absolute_path: None,
                line_number: None,
                resolved: false,
            };
        }

        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return WorkspaceLinkPreview {
                title: t.text(TextKey::PreviewExternalLink).to_string(),
                subtitle: trimmed.to_string(),
                body: vec![t
                    .text(TextKey::PreviewExternalInlineUnavailable)
                    .to_string()],
                absolute_path: None,
                line_number: None,
                resolved: false,
            };
        }

        let source_relative = source_path
            .map(Path::new)
            .map(|path| Self::to_relative_path(&self.root_path, path))
            .unwrap_or_default();
        let alias_map = self.build_alias_map(&self.notebook.documents);
        let (raw_target, anchor) = Self::split_target_and_anchor(trimmed);

        match Self::resolve_wiki_target(&source_relative, raw_target, &alias_map) {
            Some(relative_path) => {
                if let Some(document) = self.notebook.documents.get(&relative_path) {
                    let line_number = anchor
                        .and_then(|fragment| Self::find_anchor_line(&document.content, fragment))
                        .or(Some(1));

                    let snippet = Self::collect_snippet(
                        &document.content,
                        line_number.unwrap_or(1),
                        language,
                    );
                    WorkspaceLinkPreview {
                        title: document.title.clone(),
                        subtitle: relative_path.clone(),
                        body: snippet,
                        absolute_path: Some(self.absolute_path(&relative_path)),
                        line_number,
                        resolved: true,
                    }
                } else {
                    WorkspaceLinkPreview {
                        title: t.text(TextKey::PreviewBrokenLink).to_string(),
                        subtitle: trimmed.to_string(),
                        body: vec![t.text(TextKey::PreviewResolvedLoadFailed).to_string()],
                        absolute_path: None,
                        line_number: None,
                        resolved: false,
                    }
                }
            }
            None => WorkspaceLinkPreview {
                title: t.text(TextKey::PreviewUnresolvedLink).to_string(),
                subtitle: trimmed.to_string(),
                body: vec![t.text(TextKey::PreviewNoMatchingNote).to_string()],
                absolute_path: None,
                line_number: None,
                resolved: false,
            },
        }
    }

    fn rebuild_relationships(&mut self) {
        let documents = self.notebook.documents.clone();
        let alias_map = self.build_alias_map(&documents);
        let mut backlinks_by_target: HashMap<String, Vec<Backlink>> = HashMap::new();
        let mut links_by_source: HashMap<String, Vec<KnowledgeReference>> = HashMap::new();
        let mut tag_index: BTreeMap<String, Vec<KnowledgeReference>> = BTreeMap::new();

        for (path, document) in &documents {
            let unique_tags: BTreeSet<String> = document.tags.iter().cloned().collect();
            for tag in unique_tags {
                let (line_number, context) = Self::find_tag_occurrence(&document.content, &tag)
                    .unwrap_or((1, String::new()));

                tag_index
                    .entry(tag.clone())
                    .or_default()
                    .push(KnowledgeReference {
                        title: document.title.clone(),
                        relative_path: path.clone(),
                        absolute_path: Some(self.absolute_path(path)),
                        context: format!("#{tag} • {}", context.trim()),
                        line_number: Some(line_number),
                    });
            }

            for link in &document.links {
                if !matches!(link.link_type, LinkType::Wiki) {
                    continue;
                }

                let (raw_target, anchor) = Self::split_target_and_anchor(&link.target);
                let line_context = Self::line_context(&document.content, link.line_number);

                let reference = if let Some(target_path) =
                    Self::resolve_wiki_target(path, raw_target, &alias_map)
                {
                    let target_doc = documents.get(&target_path);
                    let target_title = target_doc
                        .map(|doc| doc.title.clone())
                        .or_else(|| link.label.clone())
                        .unwrap_or_else(|| raw_target.to_string());
                    let line_number = anchor.and_then(|fragment| {
                        target_doc.and_then(|doc| Self::find_anchor_line(&doc.content, fragment))
                    });

                    backlinks_by_target
                        .entry(target_path.clone())
                        .or_default()
                        .push(Backlink {
                            source_path: path.clone(),
                            source_title: document.title.clone(),
                            context: line_context.clone(),
                            line_number: link.line_number,
                        });

                    KnowledgeReference {
                        title: target_title,
                        relative_path: target_path.clone(),
                        absolute_path: Some(self.absolute_path(&target_path)),
                        context: line_context,
                        line_number,
                    }
                } else {
                    KnowledgeReference {
                        title: link.label.clone().unwrap_or_else(|| raw_target.to_string()),
                        relative_path: raw_target.to_string(),
                        absolute_path: None,
                        context: line_context,
                        line_number: None,
                    }
                };

                links_by_source
                    .entry(path.clone())
                    .or_default()
                    .push(reference);
            }
        }

        for document in self.notebook.documents.values_mut() {
            document.backlinks.clear();
        }

        for (target_path, backlinks) in backlinks_by_target {
            if let Some(document) = self.notebook.documents.get_mut(&target_path) {
                document.backlinks = backlinks;
            }
        }

        self.tag_count = tag_index.len();
        self.notebook.metadata.tags = tag_index.keys().cloned().collect();
        self.document_contexts.clear();

        for (path, document) in &self.notebook.documents {
            let mut tags: Vec<String> = document.tags.iter().cloned().collect();
            tags.sort();
            tags.dedup();

            let mut outgoing_links = links_by_source.remove(path).unwrap_or_default();
            outgoing_links.sort_by(|left, right| {
                left.relative_path
                    .cmp(&right.relative_path)
                    .then(left.title.cmp(&right.title))
            });

            let mut backlinks: Vec<KnowledgeReference> = document
                .backlinks
                .iter()
                .map(|backlink| KnowledgeReference {
                    title: backlink.source_title.clone(),
                    relative_path: backlink.source_path.clone(),
                    absolute_path: Some(self.absolute_path(&backlink.source_path)),
                    context: backlink.context.clone(),
                    line_number: Some(backlink.line_number),
                })
                .collect();
            backlinks.sort_by(|left, right| {
                left.relative_path
                    .cmp(&right.relative_path)
                    .then(left.line_number.cmp(&right.line_number))
            });

            let related_tags = Self::collect_related_tags(path, &tags, &tag_index);

            self.document_contexts.insert(
                path.clone(),
                DocumentKnowledgeContext {
                    title: document.title.clone(),
                    relative_path: path.clone(),
                    tags,
                    outgoing_links,
                    backlinks,
                    related_tags,
                },
            );
        }
    }

    fn collect_markdown_files(root: &Path) -> Vec<PathBuf> {
        let mut files = Vec::new();

        let Ok(entries) = std::fs::read_dir(root) else {
            return files;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            let is_dir = path.is_dir();
            if Self::should_skip_entry(name, is_dir) {
                continue;
            }

            if is_dir {
                files.extend(Self::collect_markdown_files(&path));
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                files.push(path);
            }
        }

        files.sort();
        files
    }

    fn graph_node(kind: GraphEdgeKind, reference: KnowledgeReference) -> GraphNodeRef {
        let resolved = reference.absolute_path.is_some();

        GraphNodeRef {
            kind,
            title: reference.title,
            relative_path: reference.relative_path,
            absolute_path: reference.absolute_path,
            context: reference.context,
            line_number: reference.line_number,
            resolved,
        }
    }

    fn collect_related_tags(
        current_path: &str,
        tags: &[String],
        tag_index: &BTreeMap<String, Vec<KnowledgeReference>>,
    ) -> Vec<KnowledgeReference> {
        let mut related = Vec::new();

        for tag in tags {
            if let Some(matches) = tag_index.get(tag) {
                for item in matches {
                    if item.relative_path == current_path {
                        continue;
                    }

                    related.push(KnowledgeReference {
                        title: item.title.clone(),
                        relative_path: item.relative_path.clone(),
                        absolute_path: item.absolute_path.clone(),
                        context: item.context.clone(),
                        line_number: item.line_number,
                    });
                }
            }
        }

        related.sort_by(|left, right| {
            left.relative_path
                .cmp(&right.relative_path)
                .then(left.context.cmp(&right.context))
        });
        related.dedup_by(|left, right| {
            left.relative_path == right.relative_path && left.context == right.context
        });
        related
    }

    fn build_alias_map(&self, documents: &HashMap<String, Document>) -> HashMap<String, String> {
        let mut aliases = HashMap::new();

        for (path, document) in documents {
            let path_buf = Path::new(path);
            let path_stem = path_buf
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or_default();
            let file_name = path_buf
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();

            for alias in [
                path.as_str(),
                path.trim_end_matches(".md"),
                path_stem,
                file_name,
                document.title.as_str(),
            ] {
                let normalized = Self::normalize_lookup(alias);
                if !normalized.is_empty() {
                    aliases.entry(normalized).or_insert_with(|| path.clone());
                }
            }
        }

        aliases
    }

    fn resolve_wiki_target(
        source_path: &str,
        target: &str,
        aliases: &HashMap<String, String>,
    ) -> Option<String> {
        let trimmed = target.trim();
        if trimmed.is_empty() {
            return Some(source_path.to_string());
        }

        let mut candidates = vec![PathBuf::from(trimmed)];
        if Path::new(trimmed).extension().is_none() {
            candidates.push(PathBuf::from(format!("{trimmed}.md")));
        }

        let source_dir = Path::new(source_path)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default();
        candidates.push(source_dir.join(trimmed));
        if Path::new(trimmed).extension().is_none() {
            candidates.push(source_dir.join(format!("{trimmed}.md")));
        }

        for candidate in candidates {
            let candidate_text = candidate.to_string_lossy().replace('\\', "/");
            let normalized = Self::normalize_lookup(candidate_text.as_str());
            if let Some(path) = aliases.get(&normalized) {
                return Some(path.clone());
            }
        }

        None
    }

    fn split_target_and_anchor(target: &str) -> (&str, Option<&str>) {
        match target.split_once('#') {
            Some((path, fragment)) => (path, Some(fragment)),
            None => (target, None),
        }
    }

    fn find_anchor_line(content: &str, fragment: &str) -> Option<usize> {
        let trimmed = fragment.trim();
        if trimmed.is_empty() {
            return None;
        }

        if trimmed.starts_with('^') {
            return content
                .lines()
                .enumerate()
                .find(|(_, line)| line.contains(trimmed))
                .map(|(index, _)| index + 1);
        }

        let normalized_fragment = Self::normalize_heading_fragment(trimmed);
        content.lines().enumerate().find_map(|(index, line)| {
            let heading = line.trim().trim_start_matches('#').trim();
            if !line.trim_start().starts_with('#') {
                return None;
            }

            if Self::normalize_heading_fragment(heading) == normalized_fragment {
                Some(index + 1)
            } else {
                None
            }
        })
    }

    fn find_tag_occurrence(content: &str, tag: &str) -> Option<(usize, String)> {
        let bracket_form = format!("#[{tag}]");
        let plain_form = format!("#{tag}");

        content.lines().enumerate().find_map(|(index, line)| {
            if line.contains(&bracket_form) || line.contains(&plain_form) {
                Some((index + 1, line.trim().to_string()))
            } else {
                None
            }
        })
    }

    fn collect_snippet(content: &str, center_line: usize, language: Language) -> Vec<String> {
        let lines: Vec<&str> = content.lines().collect();
        if lines.is_empty() {
            return vec![language
                .translator()
                .text(TextKey::PreviewEmptyNote)
                .to_string()];
        }

        let start = center_line.saturating_sub(2).max(1);
        let end = (center_line + 2).min(lines.len());
        let mut snippet = Vec::new();

        for index in start..=end {
            let prefix = if index == center_line { ">" } else { " " };
            let text = lines
                .get(index.saturating_sub(1))
                .map(|line| line.trim())
                .unwrap_or("");
            snippet.push(format!("{prefix} {:>3} {text}", index));
        }

        snippet
    }

    fn line_context(content: &str, line_number: usize) -> String {
        content
            .lines()
            .nth(line_number.saturating_sub(1))
            .map(|line| line.trim().to_string())
            .unwrap_or_default()
    }

    fn normalize_lookup(value: &str) -> String {
        let normalized = value
            .trim()
            .trim_matches('"')
            .trim_start_matches("./")
            .trim_end_matches(".md")
            .replace('\\', "/")
            .trim_matches('/')
            .to_lowercase();

        normalized
    }

    fn normalize_heading_fragment(value: &str) -> String {
        let mut normalized = String::new();
        let mut last_was_separator = false;

        for ch in value.trim().to_lowercase().chars() {
            if ch.is_ascii_alphanumeric() {
                normalized.push(ch);
                last_was_separator = false;
            } else if !last_was_separator {
                normalized.push('-');
                last_was_separator = true;
            }
        }

        normalized.trim_matches('-').to_string()
    }

    fn absolute_path(&self, relative_path: &str) -> String {
        self.root_path
            .join(relative_path)
            .to_string_lossy()
            .to_string()
    }

    fn to_relative_path(root: &Path, path: &Path) -> String {
        path.strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
    }
}

#[cfg(test)]
mod tests {
    use super::{GraphEdgeKind, WorkspaceIndex};
    use std::fs;

    #[test]
    fn builds_backlinks_and_tag_context() {
        let root = std::env::temp_dir().join(format!("tui-notebook-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("notes")).expect("create temp workspace");

        fs::write(
            root.join("notes/topic.md"),
            "# Topic\n\nShared #[rust]\n\nSee [[daily]].\n",
        )
        .expect("write topic");
        fs::write(
            root.join("daily.md"),
            "# Daily\n\nLinks back to [[notes/topic#topic]].\n\nTag #[rust]\n",
        )
        .expect("write daily");

        let index = WorkspaceIndex::build(&root);
        let topic = index
            .document_context_for_path(&root.join("notes/topic.md"))
            .expect("topic context");
        let daily = index
            .document_context_for_path(&root.join("daily.md"))
            .expect("daily context");

        assert_eq!(index.document_count(), 2);
        assert_eq!(index.tag_count(), 1);
        assert_eq!(topic.backlinks.len(), 1);
        assert_eq!(topic.backlinks[0].relative_path, "daily.md");
        assert_eq!(topic.related_tags.len(), 1);
        assert_eq!(topic.related_tags[0].relative_path, "daily.md");
        assert_eq!(daily.outgoing_links.len(), 1);
        assert_eq!(daily.outgoing_links[0].relative_path, "notes/topic.md");

        fs::remove_dir_all(root).expect("cleanup temp workspace");
    }

    #[test]
    fn builds_graph_roots_and_children() {
        let root = std::env::temp_dir().join(format!("tui-notebook-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("notes")).expect("create temp workspace");

        fs::write(
            root.join("notes/topic.md"),
            "# Topic\n\nSee [[daily]] and [[ghost-note]].\n\nTag #[rust]\n",
        )
        .expect("write topic");
        fs::write(
            root.join("daily.md"),
            "# Daily\n\nLinks back to [[notes/topic]].\n\nTag #[rust]\n",
        )
        .expect("write daily");

        let index = WorkspaceIndex::build(&root);
        let graph = index
            .graph_root_for_path(&root.join("notes/topic.md"))
            .expect("graph root");

        assert_eq!(graph.title, "Topic");
        assert_eq!(graph.relative_path, "notes/topic.md");
        assert_eq!(graph.children.len(), 4);
        assert_eq!(graph.children[0].kind, GraphEdgeKind::Link);
        assert_eq!(graph.children[0].relative_path, "daily.md");
        assert!(graph.children[0].resolved);
        assert_eq!(graph.children[1].kind, GraphEdgeKind::Link);
        assert_eq!(graph.children[1].relative_path, "ghost-note");
        assert!(!graph.children[1].resolved);
        assert_eq!(graph.children[2].kind, GraphEdgeKind::Backlink);
        assert_eq!(graph.children[2].relative_path, "daily.md");
        assert_eq!(graph.children[3].kind, GraphEdgeKind::Tag);
        assert_eq!(graph.children[3].relative_path, "daily.md");

        fs::remove_dir_all(root).expect("cleanup temp workspace");
    }
}
