use crate::action::ComponentId;
use crate::services::config::ShortcutProfile;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Language {
    #[default]
    En,
    Zh,
}

impl Language {
    pub fn from_code(code: &str) -> Self {
        match code.trim().to_ascii_lowercase().as_str() {
            "zh" | "zh-cn" | "zh_hans" | "zh-hans" => Self::Zh,
            _ => Self::En,
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::Zh => "zh",
        }
    }

    pub fn translator(self) -> Translator {
        Translator::new(self)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Translator {
    language: Language,
}

impl Translator {
    pub const fn new(language: Language) -> Self {
        Self { language }
    }

    pub fn text(self, key: TextKey) -> &'static str {
        match self.language {
            Language::En => en_text(key),
            Language::Zh => zh_text(key),
        }
    }

    pub fn component_label(self, component: ComponentId) -> &'static str {
        match component {
            ComponentId::Sidebar => self.text(TextKey::ComponentFiles),
            ComponentId::Editor => self.text(TextKey::ComponentEditor),
            ComponentId::Chat => self.text(TextKey::ComponentAi),
            ComponentId::Knowledge => self.text(TextKey::ComponentKnowledge),
            ComponentId::Search => self.text(TextKey::ComponentSearch),
            ComponentId::Settings => self.text(TextKey::ComponentSettings),
            ComponentId::Preview => self.text(TextKey::ComponentPreview),
            ComponentId::Status => self.text(TextKey::ComponentStatus),
        }
    }

    pub fn shortcut_profile_label(self, profile: ShortcutProfile) -> &'static str {
        match profile {
            ShortcutProfile::TerminalLeader => self.text(TextKey::ShortcutProfileTerminalLeader),
            ShortcutProfile::IdeCompatible => self.text(TextKey::ShortcutProfileIdeCompatible),
        }
    }

    pub fn language_name(self, language: Language) -> &'static str {
        match language {
            Language::En => self.text(TextKey::SettingsLanguageEnglish),
            Language::Zh => self.text(TextKey::SettingsLanguageChinese),
        }
    }

    pub fn shortcut_help_lines(self, profile: ShortcutProfile) -> Vec<&'static str> {
        match (self.language, profile) {
            (Language::En, ShortcutProfile::TerminalLeader) => vec![
                "Terminal Leader",
                "",
                "Esc normal/back   Tab cycle focus",
                "Space 1-5 focus   Space s save",
                "Space / search    Space , settings",
                "Space k AI        Space l knowledge",
                "i/a/o insert      h j k l move",
                "w/b words         0/$ line",
                "gg/G top/bottom   Ctrl+u/d half page",
                "p preview         Enter open target",
                "",
                "Ctrl+Q quit   Ctrl+K AI   Ctrl+G help",
            ],
            (Language::Zh, ShortcutProfile::TerminalLeader) => vec![
                "终端 Leader",
                "",
                "Esc 返回普通/关闭   Tab 循环焦点",
                "Space 1-5 聚焦     Space s 保存",
                "Space / 搜索       Space , 设置",
                "Space k AI         Space l 知识",
                "i/a/o 插入         h j k l 移动",
                "w/b 单词           0/$ 行首尾",
                "gg/G 顶部/底部     Ctrl+u/d 半页",
                "p 预览             Enter 打开目标",
                "",
                "Ctrl+Q 退出   Ctrl+K AI   Ctrl+G 帮助",
            ],
            (Language::En, ShortcutProfile::IdeCompatible) => vec![
                "IDE Compatible",
                "",
                "F1 Files     F2 Editor    F3 Preview",
                "F4 AI        F5 Knowledge F6 Search",
                "F7 Index     F8 Preview   F9 Save",
                "F10 Settings F12 Quit",
                "",
                "Esc back/close  Tab cycle focus",
                "Ctrl+Q quit    Ctrl+K AI",
            ],
            (Language::Zh, ShortcutProfile::IdeCompatible) => vec![
                "IDE 兼容",
                "",
                "F1 文件      F2 编辑器    F3 预览",
                "F4 AI        F5 知识      F6 搜索",
                "F7 建索引    F8 预览      F9 保存",
                "F10 设置     F12 退出",
                "",
                "Esc 返回/关闭   Tab 循环焦点",
                "Ctrl+Q 退出    Ctrl+K AI",
            ],
        }
    }

    pub fn status_document_summary(self, tags: usize, links: usize, backlinks: usize) -> String {
        match self.language {
            Language::En => format!("{tags} tags • {links} links • {backlinks} backlinks"),
            Language::Zh => format!("{tags} 个标签 • {links} 个链接 • {backlinks} 个反链"),
        }
    }

    pub fn status_workspace_summary(self, notes: usize, tags: usize, indexing: bool) -> String {
        match (self.language, indexing) {
            (Language::En, true) => format!("{notes} notes • {tags} tags • indexing…"),
            (Language::Zh, true) => format!("{notes} 篇笔记 • {tags} 个标签 • 正在索引…"),
            (Language::En, false) => format!("{notes} notes • {tags} tags"),
            (Language::Zh, false) => format!("{notes} 篇笔记 • {tags} 个标签"),
        }
    }

    pub fn knowledge_title_indexing(self, progress: f32) -> String {
        match self.language {
            Language::En => format!(" Knowledge (Indexing... {:.0}%) ", progress * 100.0),
            Language::Zh => format!(" 知识（索引中 {:.0}%） ", progress * 100.0),
        }
    }

    pub fn knowledge_title_search(self, result_count: usize) -> String {
        match self.language {
            Language::En => format!(" Knowledge Search ({result_count} results) "),
            Language::Zh => format!(" 知识搜索（{result_count} 条结果） "),
        }
    }

    pub fn knowledge_title_overview(
        self,
        links: usize,
        backlinks: usize,
        related: usize,
    ) -> String {
        match self.language {
            Language::En => format!(" Knowledge ({links}/{backlinks}/{related}) "),
            Language::Zh => format!(" 知识（{links}/{backlinks}/{related}） "),
        }
    }

    pub fn knowledge_tags_line(self, tags: &[String]) -> String {
        if tags.is_empty() {
            return self.text(TextKey::KnowledgeTagsNone).to_string();
        }

        match self.language {
            Language::En => format!("Tags: {}", tags.join("  ")),
            Language::Zh => format!("标签：{}", tags.join("  ")),
        }
    }

    pub fn knowledge_counts_line(self, links: usize, backlinks: usize, related: usize) -> String {
        match self.language {
            Language::En => format!("Links {links}  Backlinks {backlinks}  Related {related}"),
            Language::Zh => format!("链接 {links}  反链 {backlinks}  相关 {related}"),
        }
    }

    pub fn knowledge_line_number(self, line: usize) -> String {
        match self.language {
            Language::En => format!("Ln {line}"),
            Language::Zh => format!("第 {line} 行"),
        }
    }

    pub fn search_results_title(self, count: usize) -> String {
        match self.language {
            Language::En => format!(" Results ({count} found) "),
            Language::Zh => format!(" 结果（{count} 条） "),
        }
    }

    pub fn image_preview_title(self, label: &str) -> String {
        if label.trim().is_empty() {
            return self.text(TextKey::PreviewImage).to_string();
        }

        match self.language {
            Language::En => format!("Image: {label}"),
            Language::Zh => format!("图片：{label}"),
        }
    }

    pub fn block_preview_title(self, id: &str) -> String {
        match self.language {
            Language::En => format!("Block {id}"),
            Language::Zh => format!("块 {id}"),
        }
    }

    pub fn delete_file_message(self, label: &str) -> String {
        match self.language {
            Language::En => format!("Delete file {label}?"),
            Language::Zh => format!("确定要删除文件 {label} 吗？"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TextKey {
    ComponentFiles,
    ComponentEditor,
    ComponentAi,
    ComponentKnowledge,
    ComponentSearch,
    ComponentSettings,
    ComponentPreview,
    ComponentStatus,
    StatusMarkdown,
    StatusAiReady,
    StatusAiIdle,
    StatusFocus,
    StatusLine,
    StatusColumn,
    StatusUtf8,
    StatusModeNormal,
    StatusModeInsert,
    StatusModeVisual,
    StatusModeCommand,
    StatusModePreview,
    SettingsTitle,
    SettingsTabAi,
    SettingsTabUi,
    SettingsTabKeyboard,
    SettingsTabAbout,
    SettingsProvider,
    SettingsModel,
    SettingsApiKey,
    SettingsBaseUrl,
    SettingsWorkspace,
    SettingsFontSize,
    SettingsTheme,
    SettingsLanguage,
    SettingsProfile,
    SettingsStatusHints,
    SettingsPreviewFollow,
    SettingsThemeDark,
    SettingsThemeLight,
    SettingsLanguageEnglish,
    SettingsLanguageChinese,
    SettingsOn,
    SettingsOff,
    SettingsFollowEditor,
    SettingsKeepPreviewScroll,
    SettingsSave,
    SettingsAboutDescription,
    SettingsAboutBuiltWith,
    SearchTitle,
    SearchFlagRegex,
    SearchFlagCase,
    NewFileTitle,
    NewFileDirectory,
    NewFileFile,
    DialogCancel,
    DialogCreate,
    DialogConfirm,
    ChatTitle,
    ChatPlaceholder,
    ChatThinking,
    KnowledgeQueryTitle,
    KnowledgeItemsTitle,
    KnowledgeQueryPlaceholder,
    KnowledgeEmpty,
    KnowledgeTagsNone,
    KnowledgeBadgeLink,
    KnowledgeBadgeBacklink,
    KnowledgeBadgeTag,
    KnowledgeBadgeRag,
    AppShortcutHelpTitle,
    AppKeyboardPreview,
    TitleSaved,
    TitleModified,
    ShortcutHintInsertLeader,
    ShortcutHintNormalLeader,
    ShortcutHintPreview,
    ShortcutHintGlobalLeader,
    ShortcutHintIde,
    ShortcutProfileTerminalLeader,
    ShortcutProfileIdeCompatible,
    KeyboardNoteTerminalLeader,
    KeyboardNoteIdeCompatible,
    KeyboardNoteEscape,
    ConfirmDeleteTitle,
    ConfirmDeleteWarning,
    ConfirmDeleteButton,
    ConfirmQuitTitle,
    ConfirmQuitMessage,
    ConfirmQuitWarning,
    ConfirmQuitButton,
    PreviewImage,
    PreviewExternalLink,
    PreviewBrokenLink,
    PreviewUnresolvedLink,
    PreviewEmptyLink,
    PreviewNoTarget,
    PreviewExternalInlineUnavailable,
    PreviewResolvedLoadFailed,
    PreviewNoMatchingNote,
    PreviewEmptyNote,
    PreviewCurrentFile,
    PreviewMissingBlock,
    PreviewNoMatchingBlock,
    PreviewRemoteImageDetected,
    PreviewLocalImagesOnly,
    PreviewLocalImageResolved,
    PreviewStandaloneImageRenders,
    PreviewLocalImageUnresolved,
    PreviewCheckRelativePath,
    SidebarWorkspaceFallback,
    EditorTitle,
    PreviewTitle,
    EditorNothingToPreview,
    EditorNewDocumentHeading,
    EditorNewDocumentBody,
    EditorCalloutNote,
    EditorCalloutTip,
    EditorCalloutImportant,
    EditorCalloutWarning,
    EditorCalloutCaution,
    EditorImageBadge,
    EditorHtmlBadge,
    EditorMathBadge,
    EditorCodeBadge,
    EditorMermaidBadge,
    EditorTableBadge,
    EditorAltLabel,
    EditorSourceLabel,
}

fn en_text(key: TextKey) -> &'static str {
    match key {
        TextKey::ComponentFiles => "Files",
        TextKey::ComponentEditor => "Editor",
        TextKey::ComponentAi => "AI",
        TextKey::ComponentKnowledge => "Knowledge",
        TextKey::ComponentSearch => "Search",
        TextKey::ComponentSettings => "Settings",
        TextKey::ComponentPreview => "Preview",
        TextKey::ComponentStatus => "Status",
        TextKey::StatusMarkdown => "Markdown",
        TextKey::StatusAiReady => "● AI ready",
        TextKey::StatusAiIdle => "● AI idle",
        TextKey::StatusFocus => "Focus",
        TextKey::StatusLine => "Ln",
        TextKey::StatusColumn => "Col",
        TextKey::StatusUtf8 => "UTF-8",
        TextKey::StatusModeNormal => "NORMAL",
        TextKey::StatusModeInsert => "INSERT",
        TextKey::StatusModeVisual => "VISUAL",
        TextKey::StatusModeCommand => "COMMAND",
        TextKey::StatusModePreview => "PREVIEW",
        TextKey::SettingsTitle => "Settings",
        TextKey::SettingsTabAi => "AI",
        TextKey::SettingsTabUi => "UI",
        TextKey::SettingsTabKeyboard => "Keyboard",
        TextKey::SettingsTabAbout => "About",
        TextKey::SettingsProvider => "Provider",
        TextKey::SettingsModel => "Model",
        TextKey::SettingsApiKey => "API Key",
        TextKey::SettingsBaseUrl => "Base URL",
        TextKey::SettingsWorkspace => "Workspace",
        TextKey::SettingsFontSize => "Font Size",
        TextKey::SettingsTheme => "Theme",
        TextKey::SettingsLanguage => "Language",
        TextKey::SettingsProfile => "Profile",
        TextKey::SettingsStatusHints => "Status Hints",
        TextKey::SettingsPreviewFollow => "Preview Follow",
        TextKey::SettingsThemeDark => "Dark",
        TextKey::SettingsThemeLight => "Light",
        TextKey::SettingsLanguageEnglish => "English",
        TextKey::SettingsLanguageChinese => "Chinese",
        TextKey::SettingsOn => "On",
        TextKey::SettingsOff => "Off",
        TextKey::SettingsFollowEditor => "Follow editor",
        TextKey::SettingsKeepPreviewScroll => "Keep preview scroll",
        TextKey::SettingsSave => "Save",
        TextKey::SettingsAboutDescription => "Markdown editing, AI chat, knowledge search and SRS.",
        TextKey::SettingsAboutBuiltWith => "Built with Rust + Ratatui",
        TextKey::SearchTitle => "Search",
        TextKey::SearchFlagRegex => "regex",
        TextKey::SearchFlagCase => "case",
        TextKey::NewFileTitle => "New File",
        TextKey::NewFileDirectory => "Directory",
        TextKey::NewFileFile => "File",
        TextKey::DialogCancel => "Cancel",
        TextKey::DialogCreate => "Create",
        TextKey::DialogConfirm => "Confirm",
        TextKey::ChatTitle => "AI Chat",
        TextKey::ChatPlaceholder => "Type a message...",
        TextKey::ChatThinking => "thinking...",
        TextKey::KnowledgeQueryTitle => "Query",
        TextKey::KnowledgeItemsTitle => "Items",
        TextKey::KnowledgeQueryPlaceholder => "Type query and press Enter for semantic search",
        TextKey::KnowledgeEmpty => "No note links or semantic matches yet.",
        TextKey::KnowledgeTagsNone => "Tags: none",
        TextKey::KnowledgeBadgeLink => "LINK",
        TextKey::KnowledgeBadgeBacklink => "BACK",
        TextKey::KnowledgeBadgeTag => "TAG",
        TextKey::KnowledgeBadgeRag => "RAG",
        TextKey::AppShortcutHelpTitle => "Shortcuts",
        TextKey::AppKeyboardPreview => "Keyboard Preview",
        TextKey::TitleSaved => "Saved",
        TextKey::TitleModified => "Modified",
        TextKey::ShortcutHintInsertLeader => "Esc Normal  Ctrl+K AI  Ctrl+Q Quit  Ctrl+G Help",
        TextKey::ShortcutHintNormalLeader => "Space leader  i Insert  p Preview  / Search  ? Help",
        TextKey::ShortcutHintPreview => "j/k Scroll  Tab Next  Enter Open  Esc Back",
        TextKey::ShortcutHintGlobalLeader => "Tab Cycle  Shift+Tab Back  Space 1-5 Focus  ? Help",
        TextKey::ShortcutHintIde => "F1-F5 Focus  F6 Search  F8 Preview  F9 Save  F10 Settings",
        TextKey::ShortcutProfileTerminalLeader => "Terminal Leader",
        TextKey::ShortcutProfileIdeCompatible => "IDE Compatible",
        TextKey::KeyboardNoteTerminalLeader => {
            "Terminal Leader: Space leader + Vim-style editor navigation."
        }
        TextKey::KeyboardNoteIdeCompatible => {
            "IDE Compatible: F1-F12 focus/actions + Ctrl+Q/Ctrl+K fallback."
        }
        TextKey::KeyboardNoteEscape => "Esc always returns or closes without requiring the mouse.",
        TextKey::ConfirmDeleteTitle => "Confirm",
        TextKey::ConfirmDeleteWarning => "This action cannot be undone.",
        TextKey::ConfirmDeleteButton => "Delete",
        TextKey::ConfirmQuitTitle => "Quit",
        TextKey::ConfirmQuitMessage => "Quit TUI Notebook?",
        TextKey::ConfirmQuitWarning => "Unsaved changes may be lost.",
        TextKey::ConfirmQuitButton => "Quit",
        TextKey::PreviewImage => "Image",
        TextKey::PreviewExternalLink => "External Link",
        TextKey::PreviewBrokenLink => "Broken Link",
        TextKey::PreviewUnresolvedLink => "Unresolved Link",
        TextKey::PreviewEmptyLink => "Empty Link",
        TextKey::PreviewNoTarget => "No target",
        TextKey::PreviewExternalInlineUnavailable => {
            "Inline preview is not available for external URLs."
        }
        TextKey::PreviewResolvedLoadFailed => "The resolved note could not be loaded.",
        TextKey::PreviewNoMatchingNote => "No matching note was found in the workspace.",
        TextKey::PreviewEmptyNote => "(empty note)",
        TextKey::PreviewCurrentFile => "Current file",
        TextKey::PreviewMissingBlock => "Missing Block",
        TextKey::PreviewNoMatchingBlock => {
            "No matching block reference was found in the current file."
        }
        TextKey::PreviewRemoteImageDetected => "Remote image references are detected correctly.",
        TextKey::PreviewLocalImagesOnly => "Preview currently renders only local workspace images.",
        TextKey::PreviewLocalImageResolved => "Local image reference resolved successfully.",
        TextKey::PreviewStandaloneImageRenders => {
            "Standalone image blocks render directly in Preview when visible."
        }
        TextKey::PreviewLocalImageUnresolved => "Local image reference could not be resolved.",
        TextKey::PreviewCheckRelativePath => {
            "Check the path relative to the current note or workspace root."
        }
        TextKey::SidebarWorkspaceFallback => "workspace",
        TextKey::EditorTitle => "Editor",
        TextKey::PreviewTitle => "Preview",
        TextKey::EditorNothingToPreview => "Nothing to preview",
        TextKey::EditorNewDocumentHeading => "# New Document",
        TextKey::EditorNewDocumentBody => "Start writing here...",
        TextKey::EditorCalloutNote => "NOTE",
        TextKey::EditorCalloutTip => "TIP",
        TextKey::EditorCalloutImportant => "IMPORTANT",
        TextKey::EditorCalloutWarning => "WARNING",
        TextKey::EditorCalloutCaution => "CAUTION",
        TextKey::EditorImageBadge => "IMAGE",
        TextKey::EditorHtmlBadge => "HTML",
        TextKey::EditorMathBadge => "MATH",
        TextKey::EditorCodeBadge => "CODE",
        TextKey::EditorMermaidBadge => "MERMAID",
        TextKey::EditorTableBadge => "TABLE",
        TextKey::EditorAltLabel => "alt",
        TextKey::EditorSourceLabel => "src",
    }
}

fn zh_text(key: TextKey) -> &'static str {
    match key {
        TextKey::ComponentFiles => "文件",
        TextKey::ComponentEditor => "编辑器",
        TextKey::ComponentAi => "AI",
        TextKey::ComponentKnowledge => "知识",
        TextKey::ComponentSearch => "搜索",
        TextKey::ComponentSettings => "设置",
        TextKey::ComponentPreview => "预览",
        TextKey::ComponentStatus => "状态栏",
        TextKey::StatusMarkdown => "Markdown",
        TextKey::StatusAiReady => "● AI 就绪",
        TextKey::StatusAiIdle => "● AI 空闲",
        TextKey::StatusFocus => "焦点",
        TextKey::StatusLine => "行",
        TextKey::StatusColumn => "列",
        TextKey::StatusUtf8 => "UTF-8",
        TextKey::StatusModeNormal => "普通",
        TextKey::StatusModeInsert => "插入",
        TextKey::StatusModeVisual => "可视",
        TextKey::StatusModeCommand => "命令",
        TextKey::StatusModePreview => "预览",
        TextKey::SettingsTitle => "设置",
        TextKey::SettingsTabAi => "AI",
        TextKey::SettingsTabUi => "界面",
        TextKey::SettingsTabKeyboard => "键盘",
        TextKey::SettingsTabAbout => "关于",
        TextKey::SettingsProvider => "提供商",
        TextKey::SettingsModel => "模型",
        TextKey::SettingsApiKey => "API Key",
        TextKey::SettingsBaseUrl => "Base URL",
        TextKey::SettingsWorkspace => "工作区",
        TextKey::SettingsFontSize => "字体大小",
        TextKey::SettingsTheme => "主题",
        TextKey::SettingsLanguage => "语言",
        TextKey::SettingsProfile => "方案",
        TextKey::SettingsStatusHints => "状态提示",
        TextKey::SettingsPreviewFollow => "预览跟随",
        TextKey::SettingsThemeDark => "深色",
        TextKey::SettingsThemeLight => "浅色",
        TextKey::SettingsLanguageEnglish => "英语",
        TextKey::SettingsLanguageChinese => "中文",
        TextKey::SettingsOn => "开启",
        TextKey::SettingsOff => "关闭",
        TextKey::SettingsFollowEditor => "跟随编辑器",
        TextKey::SettingsKeepPreviewScroll => "保持预览滚动",
        TextKey::SettingsSave => "保存",
        TextKey::SettingsAboutDescription => "Markdown 编辑、AI 对话、知识检索与 SRS。",
        TextKey::SettingsAboutBuiltWith => "基于 Rust + Ratatui 构建",
        TextKey::SearchTitle => "搜索",
        TextKey::SearchFlagRegex => "正则",
        TextKey::SearchFlagCase => "大小写",
        TextKey::NewFileTitle => "新建文件",
        TextKey::NewFileDirectory => "目录",
        TextKey::NewFileFile => "文件",
        TextKey::DialogCancel => "取消",
        TextKey::DialogCreate => "创建",
        TextKey::DialogConfirm => "确认",
        TextKey::ChatTitle => "AI 对话",
        TextKey::ChatPlaceholder => "输入消息...",
        TextKey::ChatThinking => "思考中...",
        TextKey::KnowledgeQueryTitle => "查询",
        TextKey::KnowledgeItemsTitle => "条目",
        TextKey::KnowledgeQueryPlaceholder => "输入查询并按 Enter 进行语义搜索",
        TextKey::KnowledgeEmpty => "暂时没有笔记链接或语义检索结果。",
        TextKey::KnowledgeTagsNone => "标签：无",
        TextKey::KnowledgeBadgeLink => "链接",
        TextKey::KnowledgeBadgeBacklink => "反链",
        TextKey::KnowledgeBadgeTag => "标签",
        TextKey::KnowledgeBadgeRag => "RAG",
        TextKey::AppShortcutHelpTitle => "快捷键",
        TextKey::AppKeyboardPreview => "键盘预览",
        TextKey::TitleSaved => "已保存",
        TextKey::TitleModified => "已修改",
        TextKey::ShortcutHintInsertLeader => "Esc 普通  Ctrl+K AI  Ctrl+Q 退出  Ctrl+G 帮助",
        TextKey::ShortcutHintNormalLeader => "Space 引导  i 插入  p 预览  / 搜索  ? 帮助",
        TextKey::ShortcutHintPreview => "j/k 滚动  Tab 下一个  Enter 打开  Esc 返回",
        TextKey::ShortcutHintGlobalLeader => "Tab 循环  Shift+Tab 返回  Space 1-5 聚焦  ? 帮助",
        TextKey::ShortcutHintIde => "F1-F5 聚焦  F6 搜索  F8 预览  F9 保存  F10 设置",
        TextKey::ShortcutProfileTerminalLeader => "终端 Leader",
        TextKey::ShortcutProfileIdeCompatible => "IDE 兼容",
        TextKey::KeyboardNoteTerminalLeader => "终端 Leader：Space 引导键 + 类 Vim 编辑导航。",
        TextKey::KeyboardNoteIdeCompatible => "IDE 兼容：F1-F12 聚焦/动作 + Ctrl+Q/Ctrl+K 兜底。",
        TextKey::KeyboardNoteEscape => "Esc 始终可返回或关闭，无需鼠标。",
        TextKey::ConfirmDeleteTitle => "确认",
        TextKey::ConfirmDeleteWarning => "此操作不可撤销。",
        TextKey::ConfirmDeleteButton => "删除",
        TextKey::ConfirmQuitTitle => "退出",
        TextKey::ConfirmQuitMessage => "确定要退出 TUI Notebook 吗？",
        TextKey::ConfirmQuitWarning => "未保存的改动可能会丢失。",
        TextKey::ConfirmQuitButton => "退出",
        TextKey::PreviewImage => "图片",
        TextKey::PreviewExternalLink => "外部链接",
        TextKey::PreviewBrokenLink => "损坏链接",
        TextKey::PreviewUnresolvedLink => "未解析链接",
        TextKey::PreviewEmptyLink => "空链接",
        TextKey::PreviewNoTarget => "无目标",
        TextKey::PreviewExternalInlineUnavailable => "外部 URL 不支持内联预览。",
        TextKey::PreviewResolvedLoadFailed => "已解析的笔记无法加载。",
        TextKey::PreviewNoMatchingNote => "工作区中没有找到匹配的笔记。",
        TextKey::PreviewEmptyNote => "（空笔记）",
        TextKey::PreviewCurrentFile => "当前文件",
        TextKey::PreviewMissingBlock => "缺失块引用",
        TextKey::PreviewNoMatchingBlock => "当前文件中没有找到对应的块引用。",
        TextKey::PreviewRemoteImageDetected => "已识别远程图片引用。",
        TextKey::PreviewLocalImagesOnly => "预览目前只渲染工作区内的本地图片。",
        TextKey::PreviewLocalImageResolved => "本地图片引用已成功解析。",
        TextKey::PreviewStandaloneImageRenders => "独立图片块在可视区域内会直接渲染到预览中。",
        TextKey::PreviewLocalImageUnresolved => "本地图片引用无法解析。",
        TextKey::PreviewCheckRelativePath => "请检查它相对当前笔记或工作区根目录的路径。",
        TextKey::SidebarWorkspaceFallback => "工作区",
        TextKey::EditorTitle => "编辑器",
        TextKey::PreviewTitle => "预览",
        TextKey::EditorNothingToPreview => "暂无可预览内容",
        TextKey::EditorNewDocumentHeading => "# 新文档",
        TextKey::EditorNewDocumentBody => "从这里开始写作...",
        TextKey::EditorCalloutNote => "注记",
        TextKey::EditorCalloutTip => "提示",
        TextKey::EditorCalloutImportant => "重要",
        TextKey::EditorCalloutWarning => "警告",
        TextKey::EditorCalloutCaution => "注意",
        TextKey::EditorImageBadge => "图片",
        TextKey::EditorHtmlBadge => "HTML",
        TextKey::EditorMathBadge => "公式",
        TextKey::EditorCodeBadge => "代码",
        TextKey::EditorMermaidBadge => "流程图",
        TextKey::EditorTableBadge => "表格",
        TextKey::EditorAltLabel => "说明",
        TextKey::EditorSourceLabel => "路径",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_from_code_defaults_to_english() {
        assert_eq!(Language::from_code("en"), Language::En);
        assert_eq!(Language::from_code("zh"), Language::Zh);
        assert_eq!(Language::from_code("unknown"), Language::En);
    }

    #[test]
    fn test_shortcut_profile_labels_are_localized() {
        let en = Translator::new(Language::En);
        let zh = Translator::new(Language::Zh);

        assert_eq!(
            en.shortcut_profile_label(ShortcutProfile::TerminalLeader),
            "Terminal Leader"
        );
        assert_eq!(
            zh.shortcut_profile_label(ShortcutProfile::TerminalLeader),
            "终端 Leader"
        );
    }
}
