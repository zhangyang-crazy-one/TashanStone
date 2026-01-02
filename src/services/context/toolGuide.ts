export type Language = 'zh' | 'en';

export const toolDistinctionGuide = (language: Language): string => {
  if (language === 'zh') {
    return `

---

**⚠️ 重要：工具使用规则**

你有两类不同的工具：

1. **应用内文件工具**（create_file, update_file, read_file, search_files, delete_file）：
   - 只能操作应用内部的笔记文件
   - 当前可用文件：用户的 Markdown 笔记
   - 用于：创建/编辑用户笔记

2. **MCP 外部工具**（navigate_page, take_snapshot, evaluate_script 等）：
   - 操作外部浏览器、网页、外部文件系统
   - 与应用内文件完全隔离
   - 用于：网页浏览、数据抓取

3. **持久记忆检索结果**：
   - 当用户通过 Brain 图标搜索记忆时，检索结果会直接注入到对话中
   - 这些记忆信息**已经完整**，包含了用户需要的知识
   - **不要**用 read_file/search_files 重复读取已注入的记忆文件
   - 如果需要引用记忆内容，直接使用注入的信息即可

**规则**：
- 不要尝试用 read_file 读取通过 MCP 工具获取的数据
- 不要尝试用 read_file 读取已注入的持久记忆检索结果
- 如果需要保存抓取的数据，使用 create_file 创建新笔记
- MCP 工具的输出已经在对话中，不需要再次"读取"
- 持久记忆检索结果已经在对话中，不需要再次读取原文件
`;
  }

  return `

---

**⚠️ Important: Tool Usage Rules**

You have THREE types of information:

1. **App Internal File Tools** (create_file, update_file, read_file, search_files, delete_file):
   - Only operate on internal note files within the app
   - Available files: User's Markdown notes
   - Use for: Creating/editing user notes

2. **MCP External Tools** (navigate_page, take_snapshot, evaluate_script, etc.):
   - Operate on external browser, webpages, external filesystem
   - Completely isolated from app files
   - Use for: Web browsing, data scraping

3. **Persistent Memory Search Results**:
   - When user searches memories via Brain icon, results are directly injected into conversation
   - These memory informations are **complete** and contain needed knowledge
   - **DO NOT** use read_file/search_files to re-read already injected memory files
   - Reference the injected information directly if needed

**Rules**:
- Do NOT use read_file to read data obtained via MCP tools
- Do NOT use read_file to read already injected persistent memory search results
- If you need to save scraped data, use create_file to create a new note
- MCP tool outputs are already in the conversation, no need to "read" again
- Persistent memory search results are already in the conversation, no need to re-read files
`;
};
