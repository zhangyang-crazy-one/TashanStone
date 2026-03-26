//! Global Action definitions for the application
//!
//! All components communicate through these actions.

use serde::{Deserialize, Serialize};

/// Navigation actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NavigationAction {
    FocusNext,
    FocusPrev,
    FocusMove(usize),
    FocusComponent(ComponentId),
}

/// Component identifiers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ComponentId {
    Sidebar,
    Editor,
    Preview,
    Chat,
    Search,
    Settings,
    Status,
    Knowledge,
}

impl std::fmt::Display for ComponentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ComponentId::Sidebar => write!(f, "Sidebar"),
            ComponentId::Editor => write!(f, "Editor"),
            ComponentId::Preview => write!(f, "Preview"),
            ComponentId::Chat => write!(f, "Chat"),
            ComponentId::Search => write!(f, "Search"),
            ComponentId::Settings => write!(f, "Settings"),
            ComponentId::Status => write!(f, "Status"),
            ComponentId::Knowledge => write!(f, "Knowledge"),
        }
    }
}

/// File operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileAction {
    OpenCreateDialog { directory: Option<String> },
    OpenDeleteDialog(String),
    Select(String),
    Create(String),
    Delete(String),
    Rename { old: String, new: String },
    Save,
    SaveAll,
}

/// Editor actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EditorAction {
    Insert(String),
    Delete,
    Undo,
    Redo,
    MoveCursor(CursorPosition),
    Select {
        start: CursorPosition,
        end: CursorPosition,
    },
    Scroll(i32),
    // Wiki link specific
    NavigateToLink(String),
    ShowBacklinks(Vec<Backlink>),
    // Block reference specific
    NavigateToBlock(String),
    ShowBlockPreview {
        block_id: String,
        content: String,
    },
}

/// Cursor position in the editor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub line: usize,
    pub column: usize,
}

/// Backlink information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backlink {
    pub file_path: String,
    pub block_id: Option<String>,
    pub context: String,
    pub line_number: usize,
}

/// Search actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchAction {
    Open,
    Close,
    SetQuery(String),
    OpenResult {
        file_path: String,
        line_number: usize,
    },
    Next,
    Previous,
    ToggleRegex,
    ToggleCaseSensitive,
    SearchResults(Vec<crate::action::SearchResult>),
}

/// AI Chat actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChatAction {
    Send(String),
    Cancel,
    Clear,
    LoadHistory,
    StreamResponse(String),
    SetModel(ChatModel),
}

/// Chat model selection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChatModel {
    OpenAI { model: String },
    Gemini { model: String },
    Ollama { model: String, base_url: String },
    Anthropic { model: String },
}

/// Knowledge base actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum KnowledgeAction {
    Index(String),
    Search(String),
    SearchResults(Vec<SearchResult>),
    IndexProgress(f32),
    AddToIndex { path: String, content: String },
    RemoveFromIndex(String),
}

/// Search result from knowledge base
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub file_path: String,
    pub score: f32,
    pub excerpt: String,
    pub block_id: Option<String>,
    pub line_number: Option<usize>,
}

/// Learning tool actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LearningAction {
    StartReview,
    ShowQuestion(String),
    SubmitAnswer(String),
    ShowResult {
        correct: bool,
        explanation: String,
    },
    UpdateProgress {
        card_id: String,
        quality: ReviewQuality,
    },
}

/// Review quality rating
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReviewQuality {
    Again,
    Hard,
    Good,
    Easy,
}

/// Settings actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SettingsAction {
    Open,
    Close,
}

/// Application-wide actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Action {
    // Navigation
    Navigation(NavigationAction),

    // File operations
    File(FileAction),

    // Editor
    Editor(EditorAction),

    // Search
    Search(SearchAction),

    // AI Chat
    Chat(ChatAction),

    // Knowledge base
    Knowledge(KnowledgeAction),

    // Learning
    Learning(LearningAction),

    // Settings
    Settings(SettingsAction),

    // UI State
    Resize { width: u16, height: u16 },
    Tick,
    Render,
    Quit,
}

impl Action {
    /// Convert action to string for logging
    pub fn name(&self) -> &'static str {
        match self {
            Action::Navigation(_) => "Navigation",
            Action::File(_) => "File",
            Action::Editor(_) => "Editor",
            Action::Search(_) => "Search",
            Action::Chat(_) => "Chat",
            Action::Knowledge(_) => "Knowledge",
            Action::Learning(_) => "Learning",
            Action::Settings(_) => "Settings",
            Action::Resize { .. } => "Resize",
            Action::Tick => "Tick",
            Action::Render => "Render",
            Action::Quit => "Quit",
        }
    }
}
