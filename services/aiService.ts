

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIConfig, MarkdownFile, GraphData, Quiz } from "../types";

// Default configuration
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// Initialize Gemini Client
// We create a new instance per request to ensure fresh config/keys
const getClient = (apiKey?: string) => new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });

// --- Function Declarations for AI File Manipulation ---

const createFileParams = {
  name: 'create_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file (e.g. 'notes.md')" },
      content: { type: Type.STRING, description: "Markdown content of the file" }
    },
    required: ['filename', 'content']
  }
};

const updateFileParams = {
  name: 'update_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file to update" },
      content: { type: Type.STRING, description: "New content to append or replace" }
    },
    required: ['filename', 'content']
  }
};

const deleteFileParams = {
  name: 'delete_file',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file to delete" }
    },
    required: ['filename']
  }
};

// Helper to sanitize code blocks and extract JSON
const cleanCodeBlock = (text: string): string => {
  // Remove markdown code block syntax
  let cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  return cleaned;
};

// Robust JSON extractor that finds the first '{' and last '}'
const extractJson = (text: string): string => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1);
  }
  return cleanCodeBlock(text);
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateAIResponse = async (
  prompt: string, 
  config: AIConfig, 
  systemInstruction?: string,
  jsonMode: boolean = false,
  contextFiles: MarkdownFile[] = [],
  toolsCallback?: (toolName: string, args: any) => Promise<any>
): Promise<string> => {
  
  // RAG: Inject context from files
  let fullPrompt = prompt;
  if (contextFiles.length > 0) {
    const contextStr = contextFiles.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');
    const truncatedContext = contextStr.substring(0, 50000); 
    fullPrompt = `Context from user knowledge base:\n${truncatedContext}\n\nUser Query: ${prompt}`;
  }
  
  // Language Injection
  const langInstruction = config.language === 'zh' 
    ? " IMPORTANT: Respond in Chinese (Simplified) for all content, explanations, and labels." 
    : "";

  const finalSystemInstruction = (systemInstruction || "") + langInstruction;

  if (config.provider === 'gemini') {
    return callGemini(fullPrompt, config.model, finalSystemInstruction, jsonMode, toolsCallback, config.apiKey);
  } else if (config.provider === 'ollama') {
    return callOllama(fullPrompt, config, finalSystemInstruction, jsonMode);
  } else if (config.provider === 'openai') {
    return callOpenAICompatible(fullPrompt, config, finalSystemInstruction, jsonMode);
  }
  throw new Error(`Unsupported provider: ${config.provider}`);
};

const callGemini = async (
  prompt: string, 
  modelName: string, 
  systemInstruction?: string, 
  jsonMode: boolean = false,
  toolsCallback?: (toolName: string, args: any) => Promise<any>,
  apiKey?: string,
  retries = 3
): Promise<string> => {
  try {
    const client = getClient(apiKey);
    
    // Construct config object carefully. 
    const tools = toolsCallback ? [{
      functionDeclarations: [
        createFileParams,
        updateFileParams, 
        deleteFileParams
      ] as FunctionDeclaration[]
    }] : undefined;

    const generateConfig: any = {
      systemInstruction: systemInstruction,
    };

    if (jsonMode) {
      generateConfig.responseMimeType = 'application/json';
    }
    
    if (tools) {
      generateConfig.tools = tools;
    }

    const response = await client.models.generateContent({
      model: modelName || DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: generateConfig
    });

    // Handle Function Calls
    if (response.functionCalls && toolsCallback) {
      const calls = response.functionCalls;
      let toolOutputs: string[] = [];
      
      for (const call of calls) {
        const result = await toolsCallback(call.name, call.args);
        toolOutputs.push(`Function ${call.name} executed. Result: ${JSON.stringify(result)}`);
      }
      return toolOutputs.join('\n') + "\n\n(AI performed file operations based on your request)";
    }

    return response.text || '';
  } catch (error: any) {
    console.warn(`Gemini Attempt Failed (Retries left: ${retries}):`, error.message);

    // Check for retryable errors (XHR, Network, 5xx)
    const isNetworkError = error.message && (
        error.message.includes("xhr error") || 
        error.message.includes("fetch failed") ||
        error.message.includes("NetworkError") ||
        error.status === 503 || 
        error.status === 500
    );

    if (isNetworkError && retries > 0) {
        const waitTime = 2000; // Wait 2 seconds before retry
        await delay(waitTime); 
        return callGemini(prompt, modelName, systemInstruction, jsonMode, toolsCallback, apiKey, retries - 1);
    }

    if (error.message && error.message.includes("xhr error")) {
       throw new Error("Network error connecting to Gemini. Please check your internet connection or reduce the amount of content.");
    }
    throw new Error(`Gemini Error: ${error.message || "Unknown error"}`);
  }
};

const callOllama = async (prompt: string, config: AIConfig, systemInstruction?: string, jsonMode: boolean = false): Promise<string> => {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const model = config.model || 'llama3';
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: prompt });
  
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model, messages: messages, stream: false, format: jsonMode ? 'json' : undefined,
          options: { temperature: config.temperature }
        }),
      });
      if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
      const data = await response.json();
      return data.message?.content || '';
    } catch (error) { throw new Error("Failed to communicate with Ollama."); }
  };
  
  const callOpenAICompatible = async (prompt: string, config: AIConfig, systemInstruction?: string, jsonMode: boolean = false): Promise<string> => {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: prompt });
  
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey || ''}`
        },
        body: JSON.stringify({
          model: config.model, messages: messages, temperature: config.temperature,
          response_format: jsonMode ? { type: "json_object" } : undefined
        }),
      });
      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) { throw new Error(`Failed to connect to AI provider: ${error.message}`); }
  };

export const polishContent = async (content: string, config: AIConfig): Promise<string> => {
  const systemPrompt = "You are an expert technical editor. Improve the provided Markdown content for clarity, grammar, and flow. Return only the polished Markdown.";
  return generateAIResponse(content, config, systemPrompt);
};

export const expandContent = async (content: string, config: AIConfig): Promise<string> => {
  const systemPrompt = "You are a creative technical writer. Expand on the provided Markdown content, adding relevant details, examples, or explanations. Return only the expanded Markdown.";
  return generateAIResponse(content, config, systemPrompt);
};

export const generateKnowledgeGraph = async (files: MarkdownFile[], config: AIConfig): Promise<GraphData> => {
  // Use distinct delimiters to help AI differentiate file boundaries vs content
  const combinedContent = files.map(f => `<<< FILE_START: ${f.name} >>>\n${f.content}\n<<< FILE_END >>>`).join('\n\n');
  
  // Reduced payload limit to 15,000 characters to prevent XHR/Timeout errors
  const prompt = `Task: Generate a comprehensive Knowledge Graph from the provided notes.
  
  Goal: Identify granular concepts (entities) and their inter-relationships across the entire knowledge base, NOT just file summaries.
  
  STRICT INSTRUCTIONS:
  1. **Entities, Not Files**: Do NOT create nodes for file names (like "Untitled-1"). Instead, extract specific concepts, technologies, people, or definitions mentioned *within* the text.
  2. **Cross-File Linking**: Connect concepts that appear in different files if they are related. 
     - Example: If File A mentions "React" and File B mentions "JSX", link "React" -> "JSX" with "uses".
  3. **Abstraction**: Identify higher-level abstract concepts that link granular details together.
  4. **Canonical Naming**: Merge duplicates (e.g. "JS" and "JavaScript" should be one node).
  
  Output Format: STRICT JSON ONLY. No markdown code blocks.
  Structure:
  {
    "nodes": [
      { "id": "UniqueConceptId", "label": "Readable Label", "val": 10, "group": 1 } 
    ],
    "links": [
      { "source": "UniqueConceptId", "target": "OtherConceptId", "relationship": "is part of" }
    ]
  }

  Important: "val" in nodes determines size (1-10). "group" is optional (1-5) for clustering.
  
  Content to Analyze:
  ${combinedContent.substring(0, 15000)}
  `; 
  
  const systemPrompt = "You are an expert Knowledge Graph Architect. You ignore file metadata and extract semantic relationships from text content. You output valid JSON only.";
  
  try {
    const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
    const cleanedJson = extractJson(jsonStr);
    const parsed = JSON.parse(cleanedJson) as GraphData;

    // Basic Validation
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) throw new Error("Invalid Graph JSON: missing nodes array");
    
    // Ensure nodes have required fields
    parsed.nodes = parsed.nodes.map(n => ({
      ...n,
      id: n.id || n.label,
      label: n.label || n.id,
      val: n.val || 5
    }));

    return parsed;
  } catch (e) {
    console.warn("Graph Generation failed (likely network), using fallback:", e);
    
    // Fallback: Create a simple graph from headings if AI fails
    const nodes: any[] = [];
    const links: any[] = [];
    
    files.forEach(f => {
       // Extract headings as nodes
       const headings = f.content.match(/^#{1,3}\s+(.+)$/gm);
       if (headings) {
         headings.forEach(h => {
            const label = h.replace(/^#+\s+/, '').trim();
            // Avoid duplicate IDs
            if (!nodes.find(n => n.id === label)) {
                nodes.push({ id: label, label, val: 5 });
            }
         });
         // Link headings in same file sequentially
         for(let i=0; i<headings.length-1; i++) {
            const src = headings[i].replace(/^#+\s+/, '').trim();
            const trg = headings[i+1].replace(/^#+\s+/, '').trim();
            links.push({ source: src, target: trg, relationship: 'related' });
         }
       }
    });
    
    return {
      nodes: nodes.length > 0 ? nodes.slice(0, 50) : files.map(f => ({ id: f.name, label: f.name, val: 5 })),
      links: links.slice(0, 40)
    };
  }
};

export const synthesizeKnowledgeBase = async (files: MarkdownFile[], config: AIConfig): Promise<string> => {
  const combinedContent = files.map(f => `--- File: ${f.name} ---\n${f.content}`).join('\n\n');
  const prompt = `Read the following notes from a user's knowledge base. 
  1. Organize the information into a coherent structure.
  2. Synthesize the key findings, finding connections between different notes.
  3. Produce a new comprehensive "Master Summary" in Markdown format.
  
  Notes:
  ${combinedContent.substring(0, 30000)}
  `;

  const systemPrompt = "You are a Knowledge Manager. Summarize and organize notes into a single cohesive markdown document.";
  return generateAIResponse(prompt, config, systemPrompt);
};

export const generateMindMap = async (content: string, config: AIConfig): Promise<string> => {
  const langPrompt = config.language === 'zh' ? "Use Chinese for all node labels." : "Use English.";
  
  const prompt = `Create a hierarchical Mermaid.js MindMap syntax based on the following text.
  
  STRICT RULES FOR MINDMAP:
  1. Start directly with 'mindmap'.
  2. **Hierarchical Structure:** Do NOT create a flat list. Use indentation (2 spaces) to show at least 3-4 levels of depth.
     - Root
       - Main Concept
         - Sub-concept
           - Detail
  3. **Categorization:** Group related ideas together logically.
  4. **Concise Labels:** Keep node text short (max 3-5 words).
  5. Do not use special characters or parentheses in node labels.
  6. ${langPrompt}

  Example Output:
  mindmap
    root((Central Topic))
      Origins
        History
        Founders
      Mechanisms
        Process A
          Step 1
          Step 2
        Process B
  
  Content to visualize:
  ${content.substring(0, 15000)}
  `;
  
  const systemPrompt = "You are a Visualization Expert. Output strictly valid Mermaid mindmap syntax only. Ensure deep, branched structure.";
  const result = await generateAIResponse(prompt, config, systemPrompt);
  
  // Robust Cleanup
  let clean = cleanCodeBlock(result);
  
  if (clean.toLowerCase().startsWith('mermaid')) {
    clean = clean.split('\n').slice(1).join('\n').trim();
  }
  
  if (!clean.toLowerCase().startsWith('mindmap')) {
    clean = 'mindmap\n' + clean;
  }

  clean = clean.split('\n').filter(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) return false;
    if (trimmed === 'mermaid') return false; 
    return true;
  }).join('\n');
  
  return clean;
};

export const extractQuizFromRawContent = async (content: string, config: AIConfig): Promise<Quiz> => {
   const langPrompt = config.language === 'zh' 
    ? "IMPORTANT: If generating new content, use Chinese. If extracting, preserve original language." 
    : "Use English.";

   const prompt = `Analyze the document content below to create a Quiz JSON.
   
   MODES:
   1. **Extraction Mode**: If the content IS ALREADY a test paper (contains questions like "1.", "Q1", multiple choice options), you MUST EXTRACT every single question exactly as written. Do not summarize or skip any. Preserve options.
   2. **Generation Mode**: If the content is informational text (notes, articles), GENERATE high-quality questions based on it.
   
   OUTPUT FORMAT:
   Return strictly valid JSON matching this schema:
   {
    "id": "quiz-extracted-${Date.now()}",
    "title": "Extracted Exam",
    "description": "Quiz extracted or generated from uploaded document.",
    "questions": [
      {
        "id": "q1",
        "type": "single", // Use 'single', 'multiple', or 'text'
        "question": "The question text?",
        "options": ["A", "B", "C", "D"], // Required for single/multiple
        "correctAnswer": "A", // Or ["A", "B"] for multiple. If unknown, leave empty string or infer best answer.
        "explanation": "Detailed explanation of why this is the correct answer."
      }
    ],
    "isGraded": false
   }

   ${langPrompt}

   DOCUMENT CONTENT:
   ${content.substring(0, 45000)}
   `;

   const systemPrompt = "You are an Exam Parser AI. Your priority is to strictly extract existing questions if they exist. Otherwise, generate educational questions. Output valid JSON only.";

   try {
    const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
    const cleanedJson = extractJson(jsonStr);
    return JSON.parse(cleanedJson) as Quiz;
  } catch (e) {
    console.error("Quiz Extraction Error", e);
    throw new Error("Failed to process document into a quiz. The AI response was not valid JSON.");
  }
};

export const generateQuiz = async (content: string, config: AIConfig): Promise<Quiz> => {
  // Strategy: 1 question per 300 words, minimum 3, max 15.
  const wordCount = content.split(/\s+/).length;
  // Ensure we get at least 3 questions, and cap at 15
  const numQuestions = Math.min(15, Math.max(3, Math.ceil(wordCount / 300)));
  
  const langPrompt = config.language === 'zh' 
    ? "Generate the quiz title, description, questions, options, and explanations in Chinese." 
    : "Generate everything in English.";

  const prompt = `Based on the provided content, create a comprehensive educational quiz.
  
  REQUIREMENTS:
  - Generate EXACTLY ${numQuestions} questions.
  - Mix question types: 'single' (multiple choice), 'multiple' (select all), and 'text' (short answer).
  - Ensure questions cover different parts of the text evenly.
  - ${langPrompt}
  - Return strictly valid JSON matching this interface:
  {
    "id": "quiz-generated-1",
    "title": "Topic Title",
    "description": "Short description of what this quiz covers",
    "questions": [
      {
        "id": "q1",
        "type": "single",
        "question": "Question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"], 
        "correctAnswer": "Option A", 
        "explanation": "Detailed explanation of why A is correct."
      }
    ],
    "isGraded": false
  }

  Content:
  ${content.substring(0, 40000)}
  `;
  
  const systemPrompt = "You are an expert Teacher. Create a challenging and accurate educational quiz in JSON format.";
  
  try {
    const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
    // Use robust extractor
    const cleanedJson = extractJson(jsonStr);
    return JSON.parse(cleanedJson) as Quiz;
  } catch (e) {
    console.error("Quiz Parsing Error", e);
    throw new Error("Failed to generate quiz. The AI response was not valid JSON.");
  }
};

export const gradeQuizQuestion = async (
  question: string, 
  userAnswer: string, 
  context: string, 
  config: AIConfig
): Promise<{isCorrect: boolean, explanation: string}> => {
  const langPrompt = config.language === 'zh' 
    ? "IMPORTANT: Provide the explanation in Chinese." 
    : "Provide the explanation in English.";

  const prompt = `Task: Grade the user's answer to a quiz question.
  
  Question: ${question}
  User Answer: ${userAnswer}
  Context (for reference): ${context.substring(0, 2000)} ...

  Instructions:
  1. Determine if the User Answer is correct based on the Context or general knowledge.
  2. Provide a helpful explanation of why it is correct or incorrect.
  3. ${langPrompt}
  4. Return strictly valid JSON:
  {
    "isCorrect": boolean,
    "explanation": "string"
  }
  `;
  
  const systemPrompt = "You are a Grade 8 Teacher. You are strict but fair. Output valid JSON only.";
  
  try {
     const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
     const cleaned = extractJson(jsonStr);
     return JSON.parse(cleaned);
  } catch (e) {
     console.error("Grading failed", e);
     return { isCorrect: false, explanation: "AI Grading failed to parse response. Please check your network or try again." };
  }
};
