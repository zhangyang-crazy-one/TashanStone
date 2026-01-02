#!/usr/bin/env node
/**
 * 验证记忆功能的脚本
 * 运行方式: node scripts/verify-memories.cjs
 */

const fs = require('fs');
const path = require('path');

const MEMORIES_DIR = path.join(process.cwd(), '.memories');
const INDEX_FILE = path.join(MEMORIES_DIR, '_memories_index.json');

console.log('🧪 验证永久记忆功能\n');
console.log('='.repeat(50));

// 1. 检查记忆目录
console.log('\n📁 检查记忆目录...');
if (fs.existsSync(MEMORIES_DIR)) {
  console.log(`✅ 目录存在: ${MEMORIES_DIR}`);
} else {
  console.log(`❌ 目录不存在: ${MEMORIES_DIR}`);
  process.exit(1);
}

// 2. 检查索引文件
console.log('\n📋 检查索引文件...');
if (fs.existsSync(INDEX_FILE)) {
  console.log(`✅ 索引文件存在: ${INDEX_FILE}`);
} else {
  console.log(`❌ 索引文件不存在: ${INDEX_FILE}`);
  process.exit(1);
}

// 3. 读取并验证索引
console.log('\n📊 验证索引内容...');
try {
  const indexData = fs.readFileSync(INDEX_FILE, 'utf-8');
  const index = JSON.parse(indexData);

  console.log(`  - 版本: ${index.version}`);
  console.log(`  - 更新时间: ${index.updated}`);
  console.log(`  - 记忆数量: ${index.memories.length}`);

  if (index.memories.length === 0) {
    console.log('❌ 没有找到任何记忆！');
    process.exit(1);
  }

  // 4. 验证每个记忆文件
  console.log('\n📄 验证记忆文件...');
  for (const memory of index.memories) {
    const exists = fs.existsSync(memory.filePath);
    const status = exists ? '✅' : '❌';
    console.log(`  ${status} ${path.basename(memory.filePath)}`);
    console.log(`      ID: ${memory.id}`);
    console.log(`      话题: ${memory.topics.join(', ')}`);
    console.log(`      重要性: ${memory.importance}`);
  }

  // 5. 搜索功能测试
  console.log('\n🔍 测试搜索功能...');
  const testQueries = ['测试', '项目', '开发'];

  for (const query of testQueries) {
    const queryLower = query.toLowerCase();
    const matchingMemories = index.memories.filter(m =>
      m.topics.some(t => t.toLowerCase().includes(queryLower))
    );
    console.log(`  搜索 "${query}": ${matchingMemories.length} 个结果`);
    matchingMemories.forEach(m => {
      console.log(`    - ${path.basename(m.filePath)}`);
    });
  }

  console.log('\n' + '='.repeat(50));
  console.log('✨ 验证完成！所有测试记忆已就绪。');
  console.log('\n📝 下一步:');
  console.log('   1. 启动应用: npm run dev');
  console.log('   2. 点击左侧 Brain 图标');
  console.log('   3. 输入搜索词测试记忆检索');

} catch (error) {
  console.error('❌ 验证失败:', error.message);
  process.exit(1);
}
