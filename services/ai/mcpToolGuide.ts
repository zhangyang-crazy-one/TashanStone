import type { MCPTool } from './mcpClients';

const categorizeMCPTool = (toolName: string): string => {
  const name = toolName.toLowerCase();

  if (name.includes('navigate') || name.includes('page') || name.includes('click') ||
      name.includes('snapshot') || name.includes('fill') || name.includes('screenshot') ||
      name.includes('browser') || name.includes('scroll') || name.includes('hover') ||
      name.includes('devtools') || name.includes('chrome')) {
    return 'browser';
  }

  if (name.includes('search') || name.includes('query') || name.includes('find')) {
    return 'search';
  }

  if (name.includes('file') || name.includes('read') || name.includes('write') ||
      name.includes('create') || name.includes('delete') || name.includes('directory')) {
    return 'file';
  }

  if (name.includes('database') || name.includes('sql') || name.includes('db') ||
      name.includes('table') || name.includes('record')) {
    return 'database';
  }

  if (name.includes('fetch') || name.includes('request') || name.includes('api') ||
      name.includes('http') || name.includes('get') || name.includes('post')) {
    return 'network';
  }

  return 'general';
};

export const generateMCPToolGuide = (tools: MCPTool[], lang: 'en' | 'zh' = 'en'): string => {
  if (tools.length === 0) {
    return '';
  }

  const categories: Record<string, string[]> = {};
  tools.forEach(tool => {
    const cat = categorizeMCPTool(tool.name);
    if (!categories[cat]) {
      categories[cat] = [];
    }
    categories[cat].push(tool.name);
  });

  const guides: string[] = [];

  guides.push(lang === 'zh'
    ? '⚠️ 重要: 创建/修改应用内文件请用 create_file/update_file，MCP工具仅用于外部操作'
    : '⚠️ Important: Use create_file/update_file for app files. MCP tools are for external operations only');

  if (categories['browser']) {
    const hasNavigate = categories['browser'].some(name => name.includes('navigate'));
    const hasSnapshot = categories['browser'].some(name => name.includes('snapshot'));

    if (hasNavigate && hasSnapshot) {
      guides.push(lang === 'zh'
        ? '🌐 浏览器: 先 navigate_page 打开网址，再 take_snapshot 获取内容'
        : '🌐 Browser: navigate_page first, then take_snapshot');
    }
  }

  if (categories['search']) {
    guides.push(lang === 'zh'
      ? '🔍 搜索: 可直接搜索，无需先打开网页'
      : '🔍 Search: Query directly without opening pages');
  }

  return `\n\n**${lang === 'zh' ? '工具使用提示' : 'Usage Tips'}:**\n${guides.join('\n')}`;
};
