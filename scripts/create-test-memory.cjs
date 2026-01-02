#!/usr/bin/env node
/**
 * 创建测试记忆的脚本
 * 运行方式: node scripts/create-test-memory.js
 */

const fs = require('fs');
const path = require('path');

const MEMORIES_DIR = path.join(process.cwd(), '.memories');
const INDEX_FILE = path.join(MEMORIES_DIR, '_memories_index.json');

function generateId() {
  return 'test-memory-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
}

function createTestMemory() {
  console.log('🧠 创建测试记忆...\n');

  // 1. 确保目录存在
  if (!fs.existsSync(MEMORIES_DIR)) {
    fs.mkdirSync(MEMORIES_DIR, { recursive: true });
    console.log(`✅ 创建目录: ${MEMORIES_DIR}`);
  }

  // 2. 创建测试记忆文件
  const memoryId = generateId();
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `memory_${dateStr}_ceshi_${memoryId.slice(-6)}.md`;
  const filePath = path.join(MEMORIES_DIR, fileName);

  const memoryContent = `---
id: ${memoryId}
created: ${timestamp}
updated: ${timestamp}
topics: ["测试", "示例", "项目"]
importance: medium
source_sessions: []
---

# 测试记忆

这是一个用于测试永久记忆功能的示例记忆。

## 主要内容
- 测试场景 1：验证搜索功能是否正常工作
- 测试场景 2：检查记忆能否正确加载
- 测试场景 3：确认索引更新机制

## 结论
永久记忆功能已成功实现，能够存储和检索用户的长期记忆。
`;

  fs.writeFileSync(filePath, memoryContent, 'utf-8');
  console.log(`✅ 创建记忆文件: ${fileName}`);

  // 3. 更新索引文件
  let index;
  if (fs.existsSync(INDEX_FILE)) {
    try {
      const data = fs.readFileSync(INDEX_FILE, 'utf-8');
      index = JSON.parse(data);
    } catch {
      index = { version: '1.0', updated: '', memories: [] };
    }
  } else {
    index = { version: '1.0', updated: '', memories: [] };
  }

  const newEntry = {
    id: memoryId,
    filePath,
    created: timestamp,
    updated: timestamp,
    topics: ['测试', '示例', '项目'],
    importance: 'medium',
  };

  const existingIndex = index.memories.findIndex(m => m.id === memoryId);
  if (existingIndex >= 0) {
    index.memories[existingIndex] = newEntry;
  } else {
    index.memories.push(newEntry);
  }

  index.updated = timestamp;
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`✅ 更新索引文件: ${INDEX_FILE}`);

  // 4. 创建更多测试记忆
  createAdditionalMemories();

  console.log('\n✨ 测试记忆创建完成！');
  console.log(`\n📁 记忆目录: ${MEMORIES_DIR}`);
  console.log('\n📋 在应用中验证步骤:');
  console.log('   1. 启动应用 (npm run dev 或 npm start)');
  console.log('   2. 点击左侧 Brain 图标');
  console.log('   3. 在搜索框输入 "测试" 或 "示例" 或 "项目"');
  console.log('   4. 应该能找到刚才创建的测试记忆');
}

function createAdditionalMemories() {
  const additionalMemories = [
    {
      topics: ['项目', 'TashaStone', 'AI'],
      content: `# TashaStone 项目知识

## 项目概述
TashaStone 是一个 AI 驱动的 Markdown 编辑器，集成上下文工程技术。

## 核心功能
- Markdown 编辑与预览
- AI 对话助手
- 知识图谱可视化
- 永久记忆存储
- RAG 向量检索
- MCP 工具协议支持

## 技术栈
- 前端: React 19 + TypeScript + Vite
- 桌面端: Electron 33
- 数据库: SQLite + LanceDB
- AI: Gemini / Ollama / OpenAI`
    },
    {
      topics: ['开发', '工作流', '指南'],
      content: `# 开发工作流指南

## 日常开发
1. 运行开发服务器: \`npm run dev\`
2. 执行测试: \`npm test\`
3. 构建应用: \`npm run build\`

## 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 组件使用函数式编程

## 提交规范
- feat: 新功能
- fix: Bug 修复
- docs: 文档更新
- refactor: 重构`
    }
  ];

  additionalMemories.forEach((mem, index) => {
    const memoryId = generateId();
    const timestamp = new Date().toISOString();
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `memory_${dateStr}_test-${index + 1}_${memoryId.slice(-6)}.md`;
    const filePath = path.join(MEMORIES_DIR, fileName);

    const content = `---
id: ${memoryId}
created: ${timestamp}
updated: ${timestamp}
topics: ${JSON.stringify(mem.topics)}
importance: medium
source_sessions: []
---

${mem.content}`;

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ 创建附加记忆: ${fileName}`);

    // 更新索引
    let indexData;
    try {
      indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    } catch {
      indexData = { version: '1.0', updated: '', memories: [] };
    }

    indexData.memories.push({
      id: memoryId,
      filePath,
      created: timestamp,
      updated: timestamp,
      topics: mem.topics,
      importance: 'medium',
    });
    indexData.updated = timestamp;
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf-8');
  });
}

// 运行脚本
createTestMemory();
