import type { AIConfig, ChatMessage, GraphData, MarkdownFile, MindMapDetailLevel, Quiz, QuizQuestion, ToolEventCallback } from "../../types";
import type { ToolCallback } from "./providerTypes";
import { chunkText, delay, extractJson } from "./aiTextUtils";

type GenerateAIResponse = (
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  jsonMode?: boolean,
  contextFiles?: MarkdownFile[],
  toolsCallback?: ToolCallback,
  retrievedContext?: string,
  conversationHistory?: ChatMessage[],
  disableTools?: boolean,
  toolEventCallback?: ToolEventCallback
) => Promise<string>;

type RawQuizQuestion = {
  id?: string;
  type?: string;
  question?: string;
  options?: unknown;
  correctAnswer?: unknown;
  explanation?: string;
};

const asRawQuizQuestion = (value: unknown): RawQuizQuestion => (
  typeof value === 'object' && value !== null ? value as RawQuizQuestion : {}
);

const asStringArray = (value: unknown): string[] | undefined => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
);

const coerceCorrectAnswer = (value: unknown): QuizQuestion['correctAnswer'] => {
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const filtered = value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
    if (filtered.length === 0) {
      return undefined;
    }
    const hasString = filtered.some(item => typeof item === 'string');
    if (hasString) {
      return filtered.map(item => String(item));
    }
    return filtered as number[];
  }

  return undefined;
};

export const createFeaturePipelines = (deps: { generateAIResponse: GenerateAIResponse }) => {
  const { generateAIResponse } = deps;

  const polishContent = async (content: string, config: AIConfig): Promise<string> => {
    const defaultPrompt = "You are an expert technical editor. Improve the provided Markdown content for clarity, grammar, and flow. Return only the polished Markdown.";
    const systemPrompt = config.customPrompts?.polish || defaultPrompt;
    return generateAIResponse(content, config, systemPrompt, false, [], undefined, undefined, undefined, true);
  };

  const expandContent = async (content: string, config: AIConfig): Promise<string> => {
    const defaultPrompt = "You are a creative technical writer. Expand on the provided Markdown content, adding relevant details, examples, or explanations. Return only the expanded Markdown.";
    const systemPrompt = config.customPrompts?.expand || defaultPrompt;
    return generateAIResponse(content, config, systemPrompt, false, [], undefined, undefined, undefined, true);
  };

  const generateKnowledgeGraph = async (files: MarkdownFile[], config: AIConfig): Promise<GraphData> => {
    const combinedContent = files.map(f => `<<< FILE_START: ${f.name} >>>\n${f.content}\n<<< FILE_END >>>`).join('\n\n');

    const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
    const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 10);

    const prompt = `Task: Generate a comprehensive Knowledge Graph from the provided notes.
  Goal: Identify granular concepts (entities) and their inter-relationships across the entire knowledge base.

  CRITICAL: Output ONLY valid JSON. No explanations, no markdown, no extra text.

  JSON Structure:
  {
    "nodes": [
      {"id": "unique_id_1", "label": "Concept Name", "val": 5, "group": 1},
      {"id": "unique_id_2", "label": "Another Concept", "val": 3, "group": 0}
    ],
    "links": [
      {"source": "unique_id_1", "target": "unique_id_2", "relationship": "relates to"}
    ]
  }

  Rules:
  - "id" must be unique string identifiers
  - "label" is the display text (2-5 words max)
  - "val" is importance weight (1-10)
  - "group" is 1 for core concepts, 0 for entities
  - Generate at least 10 nodes with meaningful connections

  Content to Analyze:
  ${combinedContent.substring(0, limit)}`;

    const systemPrompt = "You are an expert Knowledge Graph Architect. Output ONLY valid JSON. No explanations or markdown code blocks.";

    try {
      const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
      let cleanedJson = extractJson(jsonStr);

      cleanedJson = cleanedJson.replace(/,(\s*[}\]])/g, '$1');
      cleanedJson = cleanedJson.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      const parsed = JSON.parse(cleanedJson) as GraphData;

      if (!parsed.nodes || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        throw new Error("No valid nodes in response");
      }

      parsed.nodes = parsed.nodes.map((n, idx) => ({
        ...n,
        id: n.id || n.label || `node-${idx}`,
        label: n.label || n.id || `Node ${idx}`,
        val: n.val || 5,
        group: n.group || 0
      }));

      parsed.links = (parsed.links || []).filter(l => l.source && l.target);

      return parsed;
    } catch (error) {
      console.warn("Graph Generation failed, using fallback:", error);
      const nodes = files.map((f, idx) => ({
        id: `file-${idx}`,
        label: f.name.replace(/\.[^/.]+$/, ''),
        val: 5,
        group: 1
      }));
      return { nodes, links: [] };
    }
  };

  const synthesizeKnowledgeBase = async (files: MarkdownFile[], config: AIConfig): Promise<string> => {
    const combinedContent = files.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');

    const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
    const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 6);

    const prompt = `Read the notes. Organize info. Synthesize key findings. Produce a Master Summary in Markdown.\nNotes:\n${combinedContent.substring(0, limit)}`;
    return generateAIResponse(prompt, config, "You are a Knowledge Manager.");
  };

  const generateMindMap = async (content: string, config: AIConfig, detailLevel: MindMapDetailLevel = 'compact'): Promise<string> => {
    const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
    const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 10);
    const charCount = content.length;
    const baseNodes = Math.max(18, Math.floor(charCount / 250));
    const targetNodes = Math.min(detailLevel === 'detailed' ? 120 : 80, detailLevel === 'detailed' ? Math.floor(baseNodes * 1.4) : baseNodes);
    const targetDepth = charCount > 2200 ? (detailLevel === 'detailed' ? 4 : 3) : (detailLevel === 'detailed' ? 3 : 2);
    const includeSummary = detailLevel === 'detailed';

    const prompt = `Generate a Mermaid.js mind map from the content below.

CRITICAL INSTRUCTIONS:
1. Output ONLY the Mermaid mindmap code - NO explanations, NO descriptions, NO markdown formatting
2. Start with exactly "mindmap" on the first line
3. Use ((Root Topic)) for the root node (double parentheses = circle)
4. Use (Child Node) for all other nodes (single parentheses = rounded rectangle)
5. Use 2-space indentation for hierarchy
6. Keep labels short (2-5 words max)${includeSummary ? ' for the title part' : ''}
7. No special characters in labels: no (), #, :, **, *
8. Aim for about ${targetNodes} nodes and at least ${targetDepth} levels when content is long. Do not over-summarize; include key subpoints.
${includeSummary ? `9. For each node, append a short summary after \" | \". Example: (Branch Title | brief summary). Keep summary 6-12 words, plain text only.` : ''}

Example output format:
mindmap
  ((Main Topic))
    (Branch A)
      (Item A1)
      (Item A2)
    (Branch B)
      (Item B1)

Content to analyze:
${content.substring(0, limit)}`;

    const systemPrompt = "Output ONLY valid Mermaid mindmap code. No explanations. Start with 'mindmap' on line 1.";

    const result = await generateAIResponse(prompt, config, systemPrompt, false);

    return extractMermaidMindmap(result);
  };

  const extractQuizFromRawContent = async (content: string, config: AIConfig): Promise<Quiz> => {
    const strongQuestionPattern = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:Q\s*\d+|Question\s*\d+|问题\s*\d+|第\s*\d+\s*[题问])[:.．\s]/i;
    const optionPattern = /(?:^|\n)\s*[A-Da-d][.）)]\s+\S/;

    const hasStrongQuestionMarker = strongQuestionPattern.test(content);
    const hasOptions = optionPattern.test(content);

    if (hasStrongQuestionMarker || hasOptions) {
      const contextLimit = config.contextEngine?.modelContextLimit ?? 200000;
      const limit = config.provider === 'gemini' ? contextLimit : Math.floor(contextLimit / 4);

      const prompt = `Task: Extract ALL questions from the provided text verbatim into a JSON format.

       Rules:
       1. Preserve the exact text of questions and options.
       2. If options are present (A, B, C, D), extract them into the "options" array.
       3. If a correct answer is marked or implied, include it in "correctAnswer".
       4. Return a valid JSON Object with a "questions" array.
       5. If there are NO actual quiz questions in the text, return {"questions": []}

       Text Content:
       ${content.substring(0, limit)}`;

      const jsonStr = await generateAIResponse(prompt, config, "You are a Data Extractor. Extract questions exactly as they appear. Return JSON.", true);
      const result = JSON.parse(extractJson(jsonStr)) as unknown;

      const questions = Array.isArray(result)
        ? result
        : (typeof result === 'object' && result !== null && Array.isArray((result as { questions?: unknown }).questions))
          ? (result as { questions?: unknown[] }).questions
          : [];

      if (questions.length > 0) {
        return {
          id: `quiz-extracted-${Date.now()}`,
          title: "Extracted Quiz",
          description: "Extracted from current file.",
          questions: questions.map((q, i) => {
            const raw = asRawQuizQuestion(q);
            const options = asStringArray(raw.options);
            const hasOptions = Boolean(options && options.length > 0);
            return {
              ...raw,
              id: typeof raw.id === 'string' ? raw.id : `ext-${i}`,
              type: hasOptions ? 'single' : 'text',
              question: typeof raw.question === 'string' ? raw.question : '',
              options: hasOptions ? options : undefined,
              correctAnswer: coerceCorrectAnswer(raw.correctAnswer),
              timesUsed: 0,
              successRate: 0
            };
          }),
          isGraded: false
        };
      }
      console.log('[Quiz] Extraction returned no questions, falling back to generation mode');
    }

    try {
      const questions = await generateQuestionsFromChunks(content, config, generateAIResponse);
      if (questions.length === 0) {
        throw new Error("No questions generated. The AI did not return any valid questions.");
      }
      return {
        id: `quiz-gen-${Date.now()}`,
        title: "Generated Quiz",
        description: "Generated from notes.",
        questions,
        isGraded: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Quiz generation failed: ${message || 'Unknown error'}`);
    }
  };

  const generateQuiz = async (content: string, config: AIConfig): Promise<Quiz> => (
    extractQuizFromRawContent(content, config)
  );

  const gradeQuizQuestion = async (
    question: string,
    userAnswer: string,
    context: string,
    config: AIConfig
  ): Promise<{ isCorrect: boolean; explanation: string }> => {
    const prompt = `Grade User Answer.\nQuestion: ${question}\nUser: ${userAnswer}\nContext: ${context.substring(0, 50000)}\nReturn JSON {isCorrect, explanation}`;
    const jsonStr = await generateAIResponse(prompt, config, "Strict Teacher. Valid JSON.", true);
    return JSON.parse(extractJson(jsonStr)) as { isCorrect: boolean; explanation: string };
  };

  const generateQuizExplanation = async (
    question: string,
    correctAnswer: string,
    userAnswer: string,
    context: string,
    config: AIConfig
  ): Promise<string> => {
    const isZh = config.language === 'zh';

    const prompt = isZh
      ? `为以下测验题目提供解释：

问题：${question}
正确答案：${correctAnswer}
用户答案：${userAnswer}

请按以下格式回答（简洁明了，不超过150字）：
1. 首先明确说出正确答案是什么
2. 简要解释为什么这个答案是正确的
3. 如果用户答错了，指出错误原因

参考资料：${context.substring(0, 30000)}`
      : `Provide explanation for this quiz question:

Question: ${question}
Correct Answer: ${correctAnswer}
User's Answer: ${userAnswer}

Format your response (concise, max 150 words):
1. First, clearly state what the correct answer is
2. Briefly explain why this is the correct answer
3. If the user was wrong, point out why their answer was incorrect

Reference: ${context.substring(0, 30000)}`;

    const systemPrompt = isZh
      ? "你是一位简洁明了的老师。先给出正确答案，再简短解释。不要罗嗦。"
      : "You are a concise tutor. State the correct answer first, then explain briefly. Be direct.";

    return generateAIResponse(prompt, config, systemPrompt);
  };

  return {
    polishContent,
    expandContent,
    generateKnowledgeGraph,
    synthesizeKnowledgeBase,
    generateMindMap,
    extractQuizFromRawContent,
    generateQuiz,
    gradeQuizQuestion,
    generateQuizExplanation,
  };
};

const extractMermaidMindmap = (text: string): string => {
  const codeFenceMatch = text.match(/```(?:mermaid)?\s*\n?(mindmap[\s\S]*?)```/i);
  if (codeFenceMatch) {
    return sanitizeMindmap(codeFenceMatch[1].trim());
  }

  const lines = text.split('\n');
  let mindmapStartIdx = -1;
  let mindmapEndIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase();
    if (trimmed === 'mindmap') {
      mindmapStartIdx = i;
      break;
    }
  }

  if (mindmapStartIdx === -1) {
    return 'mindmap\n  ((Content))\n    (No valid mindmap generated)';
  }

  for (let i = mindmapStartIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.match(/^[\s]*([\(\[]|\)|\])/) || trimmed.match(/^\s+\(/)) {
      continue;
    }
    if (!trimmed.startsWith('(') && !trimmed.startsWith('[') && !lines[i].match(/^\s{2,}/)) {
      if (trimmed.match(/^(This|The|I |Here|Note|Example|---|###|##|#|\*\*|1\.|2\.)/i)) {
        mindmapEndIdx = i;
        break;
      }
    }
  }

  const mindmapLines = lines.slice(mindmapStartIdx, mindmapEndIdx);
  return sanitizeMindmap(mindmapLines.join('\n'));
};

const sanitizeMindmap = (code: string): string => {
  const lines = code.split('\n');
  const sanitizedLines: string[] = [];
  let foundMindmap = false;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    if (trimmed === 'mindmap') {
      if (!foundMindmap) {
        foundMindmap = true;
        sanitizedLines.push('mindmap');
      }
      continue;
    }

    if (!foundMindmap && trimmed === '') continue;

    if (line.trim().match(/^(This|The|I |Here|Note|Example|---|###|##|#|\*\*|1\.|2\.)/i)) {
      continue;
    }

    if (line.trim().startsWith('```')) continue;

    let sanitizedLine = line;

    sanitizedLine = sanitizedLine.replace(/（/g, '(').replace(/）/g, ')');

    sanitizedLine = sanitizedLine.replace(/\(\(([^)]+)\)\)/g, (match, content) => {
      const cleanContent = String(content).replace(/[()（）#:：\*\_]/g, ' ').replace(/\s+/g, ' ').trim();
      return `((${cleanContent}))`;
    });
    sanitizedLine = sanitizedLine.replace(/\(([^()]+)\)/g, (match, content) => {
      const cleanContent = String(content).replace(/[()（）#:：\*\_]/g, ' ').replace(/\s+/g, ' ').trim();
      return `(${cleanContent})`;
    });

    sanitizedLines.push(sanitizedLine);
  }

  if (!foundMindmap) {
    sanitizedLines.unshift('mindmap');
  }

  return sanitizedLines.join('\n');
};

const validateAndFixQuestion = (q: RawQuizQuestion | null | undefined, index: number, prefix: string): QuizQuestion | null => {
  if (!q || typeof q.question !== 'string' || q.question.trim().length === 0) {
    return null;
  }

  const validTypes = ['single', 'multiple', 'fill_blank', 'text'];
  let type = typeof q.type === 'string' ? q.type.toLowerCase() : 'single';
  if (!validTypes.includes(type)) {
    const options = asStringArray(q.options);
    if (options && options.length >= 2) {
      type = Array.isArray(q.correctAnswer) ? 'multiple' : 'single';
    } else {
      type = 'text';
    }
  }

  let options = asStringArray(q.options);
  if ((type === 'single' || type === 'multiple') && (!options || options.length < 2)) {
    type = 'text';
    options = undefined;
  }

  let correctAnswer: QuizQuestion['correctAnswer'] = coerceCorrectAnswer(q.correctAnswer);
  if ((type === 'single' || type === 'multiple') && options && options.length > 0) {
    correctAnswer = normalizeAnswerToIndex(q.correctAnswer, options, type);
  }

  return {
    id: `${prefix}-${index}`,
    type: type as 'single' | 'multiple' | 'text' | 'fill_blank',
    question: q.question.trim(),
    options: (type === 'single' || type === 'multiple') ? options : undefined,
    correctAnswer,
    explanation: q.explanation,
    timesUsed: 0,
    successRate: 0
  };
};

const normalizeAnswerToIndex = (answer: unknown, options: string[], type: string): number | number[] => {
  const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };
  const chineseToIndex: Record<string, number> = { '一': 0, '二': 1, '三': 2, '四': 3 };

  const parseOne = (val: unknown): number => {
    if (typeof val === 'number') {
      return Math.min(Math.max(0, Math.floor(val)), options.length - 1);
    }

    const str = String(val).trim().toUpperCase();

    if (letterToIndex[str] !== undefined) {
      return letterToIndex[str];
    }

    const num = parseInt(str, 10);
    if (!Number.isNaN(num) && num >= 0 && num < options.length) {
      return num;
    }

    if (chineseToIndex[str] !== undefined) {
      return chineseToIndex[str];
    }

    const idx = options.findIndex(opt => opt.trim().toLowerCase() === str.toLowerCase());
    if (idx !== -1) return idx;

    return 0;
  };

  if (type === 'multiple') {
    if (Array.isArray(answer)) {
      return [...new Set(answer.map(parseOne))].sort();
    }
    if (typeof answer === 'string' && answer.includes(',')) {
      return [...new Set(answer.split(',').map(s => parseOne(s.trim())))].sort();
    }
    return [parseOne(answer)];
  }

  return parseOne(answer);
};

const generateQuestionsFromChunks = async (
  content: string,
  config: AIConfig,
  generateAIResponse: GenerateAIResponse
): Promise<QuizQuestion[]> => {
  const langPrompt = config.language === 'zh'
    ? "用中文生成题目和选项。"
    : "Generate questions and options in English.";

  const quizPrompt = (text: string, count: string) => `Task: Generate ${count} quiz questions from the given text.

CRITICAL RULES - MUST FOLLOW:

1. Generate a MIX of 4 question types with this distribution:
   - "single": 40% - Single choice (4 options, ONE correct answer)
   - "multiple": 20% - Multiple choice (4 options, 2-3 correct answers)
   - "fill_blank": 20% - Fill-in-the-blank (exact short answer, 1-5 words)
   - "text": 20% - Essay question (requires paragraph answer)

2. JSON Structure for EACH question:
{
  "type": "single" | "multiple" | "fill_blank" | "text",
  "question": "Question text here",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0 | [0,2] | "exact answer" | "key points"
}

3. correctAnswer Format (IMPORTANT - USE NUMERIC INDEX 0-3):
   - "single": Integer 0-3 (0=first option, 1=second option, etc.)
   - "multiple": Array of integers, e.g. [0, 2] means first and third options
   - "fill_blank": Exact string answer (1-5 words)
   - "text": Key points string for grading reference

4. MANDATORY REQUIREMENTS:
   - For "single" and "multiple" types: ALWAYS include "options" array with exactly 4 items
   - For "fill_blank": Answer should be a short, specific term from the text
   - For "text": Answer should list key points that a good answer should cover

5. ${langPrompt}

Text Content:
"${text}"

Output: Valid JSON Array (no markdown, no code blocks, just pure JSON array)`;

  if (content.length < 500) {
    const prompt = quizPrompt(content, "2-4");
    const systemPrompt = "You are an expert Quiz Designer. Create diverse, insightful questions. Return ONLY a valid JSON array, no other text.";

    try {
      const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
      const parsed = JSON.parse(extractJson(jsonStr)) as unknown;
      const questions = Array.isArray(parsed) ? parsed : [];

      const validQuestions = questions
        .map((q, i) => validateAndFixQuestion(asRawQuizQuestion(q), i, 'gen-q-short'))
        .filter((q): q is QuizQuestion => q !== null);

      if (validQuestions.length === 0) {
        throw new Error("AI generated response but no valid questions were found. The content may be too short or not suitable for quiz generation.");
      }
      return validQuestions;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Quiz generation failed for short content: ${message || 'Unknown error'}`);
    }
  }

  const idealChunkSize = Math.max(500, Math.min(2000, Math.ceil(content.length / 15)));
  const chunks = chunkText(content, idealChunkSize, 100).slice(0, 15);
  const systemPrompt = "You are an expert Quiz Designer. Create diverse questions with proper type distribution. Return ONLY a valid JSON array.";

  const questionsPromises = chunks.map(async (chunk, index) => {
    const prompt = quizPrompt(chunk, "1-3");
    try {
      await delay(index * 100);
      const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
      const parsed = JSON.parse(extractJson(jsonStr)) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`Chunk ${index} quiz generation failed:`, error);
      return [];
    }
  });

  const results = await Promise.all(questionsPromises);
  const flatQuestions: QuizQuestion[] = [];

  results.forEach((batch, batchIdx) => {
    batch.forEach((q, qIdx) => {
      const validated = validateAndFixQuestion(asRawQuizQuestion(q), qIdx, `gen-q-${batchIdx}`);
      if (validated) {
        flatQuestions.push(validated);
      }
    });
  });

  if (flatQuestions.length === 0) {
    throw new Error('Failed to generate quiz questions. Possible reasons: AI response was invalid, content is not suitable for quiz generation, or API call failed. Please check your AI configuration and try again.');
  }

  return flatQuestions;
};
