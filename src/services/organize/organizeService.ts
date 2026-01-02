import { AIConfig } from '../../../types';

export interface OrganizeAnalysisResult {
  importance: number;
  keyConcepts: string[];
  suggestedFolder: string;
  suggestedTags: string[];
  relatedFiles: string[];
  suggestedTheme?: string;
}

export interface OrganizeAnalysisOptions {
  content: string;
  fileName: string;
  allFiles?: Array<{ id: string; name: string; content: string }>;
}

const FOLDER_CATEGORIES = [
  { name: 'Notes', keywords: ['note', '笔记', '记录', '学习', 'study'] },
  { name: 'Project', keywords: ['project', '项目', '开发', 'dev', 'code'] },
  { name: 'Documentation', keywords: ['doc', '文档', '文档', 'guide', 'manual'] },
  { name: 'Research', keywords: ['research', '研究', '论文', 'paper', '学术'] },
  { name: 'Journal', keywords: ['journal', '日记', '日志', 'daily', '日志'] },
  { name: 'Knowledge', keywords: ['knowledge', '知识', '概念', '概念', '学习'] },
  { name: 'Reference', keywords: ['reference', '参考', '引用', '链接', '资源'] },
  { name: 'Archive', keywords: ['archive', '归档', '旧', 'old', '历史'] }
];

const THEME_CATEGORIES = [
  { name: 'Cyber', keywords: ['code', '编程', '开发', 'tech', '技术', 'software', 'devops', 'ai', '人工智能'] },
  { name: 'Paper', keywords: ['note', '笔记', '学习', 'study', '文档', '文档', 'paper', '论文', '学术'] },
  { name: 'Business', keywords: ['business', '商业', '工作', 'meeting', '会议', 'project', '项目', 'report', '报告'] },
  { name: 'Light', keywords: ['journal', '日记', '个人', 'personal', '生活', 'life', '旅行', 'travel'] }
];

const assessImportanceByHeuristics = (content: string, fileName: string): number => {
  const text = (content + ' ' + fileName).toLowerCase();
  let score = 5;

  const length = content.length;
  if (length > 10000) score += 2;
  else if (length > 5000) score += 1.5;
  else if (length > 2000) score += 1;
  else if (length < 200) score -= 1;

  const importantKeywords = [
    'important', '重要', '关键', '核心', 'essential', 'critical',
    'important', '计划', 'todo', '任务', 'deadline', '截止'
  ];
  const count = importantKeywords.filter(kw => text.includes(kw)).length;
  score += Math.min(count * 0.5, 2);

  const hasCode = content.includes('```') || content.includes('function') || content.includes('const ');
  if (hasCode) score += 1;

  const hasChecklist = content.includes('[]') || content.includes('[ ]') || content.includes('- [ ]');
  if (hasChecklist) score += 0.5;

  const hasLinks = content.includes('[[') || content.includes('http') || content.includes('[');
  if (hasLinks) score += 0.5;

  return Math.max(1, Math.min(10, Math.round(score)));
};

const extractKeyConceptsByHeuristics = (content: string): string[] => {
  const concepts: string[] = [];

  const headings = content.match(/^#{1,3}\s+(.+)$/gm);
  if (headings) {
    headings.forEach(h => {
      const concept = h.replace(/^#+\s+/, '').trim();
      if (concept.length > 2 && concept.length < 50) {
        concepts.push(concept);
      }
    });
  }

  const boldText = content.match(/\*\*(.+?)\*\*/g);
  if (boldText) {
    boldText.forEach(b => {
      const concept = b.replace(/\*\*/g, '').trim();
      if (concept.length > 2 && concept.length < 30 && !concepts.includes(concept)) {
        concepts.push(concept);
      }
    });
  }

  const colonLines = content.split('\n')
    .filter(line => line.includes(':') && line.length < 50)
    .map(line => line.split(':')[0].trim())
    .filter(part => part.length > 2 && part.length < 30);

  colonLines.forEach(concept => {
    if (!concepts.includes(concept)) {
      concepts.push(concept);
    }
  });

  return concepts.slice(0, 8);
};

const suggestFolderByContent = (content: string, fileName: string): string => {
  const text = (content + ' ' + fileName).toLowerCase();

  for (const category of FOLDER_CATEGORIES) {
    const matchCount = category.keywords.filter(kw => text.includes(kw)).length;
    if (matchCount >= 2) {
      return category.name;
    }
  }

  if (text.includes('exam') || text.includes('quiz') || text.includes('test') || text.includes('考试')) {
    return 'Exam';
  }
  if (text.includes('meeting') || text.includes('会议') || text.includes('minutes')) {
    return 'Meetings';
  }

  return 'Notes';
};

const suggestThemeByContent = (content: string, fileName: string): string => {
  const text = (content + ' ' + fileName).toLowerCase();

  const scores: Array<{ name: string; score: number }> = THEME_CATEGORIES.map(category => {
    const matchCount = category.keywords.filter(kw => text.includes(kw)).length;
    return { name: category.name, score: matchCount };
  });

  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score >= 2) {
    return scores[0].name;
  }

  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
  if (codeBlocks > 2) return 'Cyber';

  const hasMath = content.includes('$') || content.includes('$$') || content.includes('\\frac') || content.includes('\\sum');
  if (hasMath) return 'Paper';

  return 'Cyber';
};

const findRelatedFilesByContent = (
  content: string,
  allFiles: Array<{ id: string; name: string; content: string }>
): string[] => {
  if (!allFiles || allFiles.length === 0) return [];

  const concepts = extractKeyConceptsByHeuristics(content);
  const contentWords = new Set(
    content.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 4)
      .slice(0, 50)
  );

  const scores: Array<{ id: string; score: number }> = [];

  for (const file of allFiles) {
    if (file.content === content) continue;

    const fileConcepts = extractKeyConceptsByHeuristics(file.content);
    const conceptOverlap = concepts.filter(c => fileConcepts.includes(c)).length;

    const fileWords = new Set(
      file.content.toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 4)
    );
    const wordOverlap = [...contentWords].filter(w => fileWords.has(w)).length;

    const score = conceptOverlap * 3 + wordOverlap * 0.5;
    scores.push({ id: file.id, score });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 5).filter(s => s.score > 0).map(s => s.id);
};

export const analyzeDocument = async (
  options: OrganizeAnalysisOptions,
  aiConfig?: AIConfig
): Promise<OrganizeAnalysisResult> => {
  const { content, fileName, allFiles = [] } = options;

  if (aiConfig && aiConfig.apiKey) {
    try {
      const prompt = `Analyze this document and provide organization suggestions in JSON format:

Document name: ${fileName}
Content (first 2000 chars): ${content.substring(0, 2000)}

Provide JSON:
{
  "importance": 1-10,
  "keyConcepts": ["concept1", "concept2"],
  "suggestedFolder": "FolderName",
  "suggestedTags": ["tag1", "tag2"],
  "relatedFileNames": ["filename1", "filename2"]
}`;

      const response = await fetch(`${aiConfig.baseUrl || 'https://api.google.com'}/v1beta/models/gemini-pro:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              importance: Math.max(1, Math.min(10, parsed.importance || 5)),
              keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts.slice(0, 8) : [],
              suggestedFolder: parsed.suggestedFolder || 'Notes',
              suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags.slice(0, 10) : [],
              relatedFiles: []
            };
          } catch (e) {
            console.warn('Failed to parse AI response:', e);
          }
        }
      }
    } catch (error) {
      console.warn('AI analysis failed, falling back to heuristics:', error);
    }
  }

  return {
    importance: assessImportanceByHeuristics(content, fileName),
    keyConcepts: extractKeyConceptsByHeuristics(content),
    suggestedFolder: suggestFolderByContent(content, fileName),
    suggestedTags: [],
    relatedFiles: findRelatedFilesByContent(content, allFiles),
    suggestedTheme: suggestThemeByContent(content, fileName)
  };
};

export const suggestTagsByAI = async (
  content: string,
  aiConfig?: AIConfig,
  existingTags: string[] = []
): Promise<string[]> => {
  if (aiConfig && aiConfig.apiKey) {
    try {
      const prompt = `Extract 5-10 relevant tags from this content. Return as JSON array.

Content: ${content.substring(0, 1500)}

Existing tags to avoid: ${existingTags.join(', ')}

Return only JSON: ["tag1", "tag2"]`;

      const response = await fetch(`${aiConfig.baseUrl || 'https://api.google.com'}/v1beta/models/gemini-pro:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 200
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const tags = JSON.parse(jsonMatch[0]);
            if (Array.isArray(tags)) {
              return tags.filter(t => !existingTags.includes(t));
            }
          } catch (e) {
            console.warn('Failed to parse AI tags:', e);
          }
        }
      }
    } catch (error) {
      console.warn('AI tag suggestion failed:', error);
    }
  }

  return [];
};
