
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { AIConfig, MarkdownFile, GraphData, Quiz, QuizQuestion } from "../types";

// Default configuration
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// Initialize Gemini Client
const getClient = (apiKey?: string) => new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });

// --- Function Declarations for Gemini (Google SDK format) ---

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

// --- Function Declarations for OpenAI / Ollama (JSON Schema format) ---

const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file with the given name and content. Use this to create documents.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", "description": "Name of the file (e.g. 'notes.md')" },
          content: { type: "string", "description": "Markdown content of the file" }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_file",
      description: "Update an existing file. Replaces content or appends based on logic.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", "description": "Name of the file to update" },
          content: { type: "string", "description": "New content" }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file by name.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", "description": "Name of the file to delete" }
        },
        required: ["filename"]
      }
    }
  }
];

// Helper to sanitize code blocks and extract JSON
const cleanCodeBlock = (text: string): string => {
  // Remove markdown code block syntax
  let cleaned = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  return cleaned;
};

// Robust JSON extractor that finds the first '{' and last '}' OR first '[' and last ']'
const extractJson = (text: string): string => {
  // Try finding object
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  
  // Try finding array
  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');

  // Determine which one is the outer container
  if (startArr !== -1 && (startObj === -1 || startArr < startObj)) {
     if (endArr !== -1 && endArr > startArr) {
        return text.substring(startArr, endArr + 1);
     }
  }

  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    return text.substring(startObj, endObj + 1);
  }
  return cleanCodeBlock(text);
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Segment Text (Rule 1 & 3)
const chunkText = (text: string, chunkSize: number = 800, overlap: number = 100): string[] => {
    const chunks = [];
    // Clean text slightly
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    
    if (cleanText.length <= chunkSize) return [cleanText];
    
    for (let i = 0; i < cleanText.length; i += (chunkSize - overlap)) {
        let end = Math.min(i + chunkSize, cleanText.length);
        
        // Try to break at a sentence or newline if close to end
        if (end < cleanText.length) {
            const nextPeriod = cleanText.indexOf('.', end - 50);
            const nextNewline = cleanText.indexOf('\n', end - 50);
            if (nextPeriod !== -1 && nextPeriod < end + 50) end = nextPeriod + 1;
            else if (nextNewline !== -1 && nextNewline < end + 50) end = nextNewline + 1;
        }

        chunks.push(cleanText.substring(i, end));
        if (end >= cleanText.length) break;
    }
    return chunks;
};

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
    return callOllama(fullPrompt, config, finalSystemInstruction, jsonMode, toolsCallback);
  } else if (config.provider === 'openai') {
    return callOpenAICompatible(fullPrompt, config, finalSystemInstruction, jsonMode, toolsCallback);
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

const callOllama = async (
  prompt: string, 
  config: AIConfig, 
  systemInstruction?: string, 
  jsonMode: boolean = false,
  toolsCallback?: (toolName: string, args: any) => Promise<any>
): Promise<string> => {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const model = config.model || 'llama3';
    
    // Prepare initial messages
    const messages: any[] = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: prompt });
  
    // Define tools if callback provided
    const tools = toolsCallback ? OPENAI_TOOLS : undefined;

    let iterations = 0;
    const MAX_ITERATIONS = 5;

    try {
      while (iterations < MAX_ITERATIONS) {
        const body: any = {
          model: model,
          messages: messages,
          stream: false,
          format: jsonMode ? 'json' : undefined,
          options: { temperature: config.temperature },
        };
        
        // Only attach tools if available and provider supports it (recent Ollama)
        if (tools) {
            body.tools = tools;
        }

        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        
        if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
        const data = await response.json();
        
        const message = data.message;
        const toolCalls = message.tool_calls;

        // Add assistant response to history
        messages.push(message);

        // If tool calls are present, execute them
        if (toolCalls && toolCalls.length > 0 && toolsCallback) {
            for (const tool of toolCalls) {
                const functionName = tool.function.name;
                const args = tool.function.arguments; // Ollama usually returns object, but sometimes string
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                
                const result = await toolsCallback(functionName, parsedArgs);
                
                // Add tool result to history
                messages.push({
                    role: 'tool',
                    content: JSON.stringify(result)
                    // Ollama native API might infer relationship from order, 
                    // or use 'tool' role. Standardizing on 'tool' role content.
                });
            }
            iterations++;
        } else {
            // No tool calls, return final content
            return message.content || '';
        }
      }
      return messages[messages.length - 1].content || "Max iterations reached.";

    } catch (error) { 
       console.error(error);
       throw new Error("Failed to communicate with Ollama."); 
    }
  };
  
  const callOpenAICompatible = async (
    prompt: string, 
    config: AIConfig, 
    systemInstruction?: string, 
    jsonMode: boolean = false,
    toolsCallback?: (toolName: string, args: any) => Promise<any>
  ): Promise<string> => {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    const messages: any[] = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: prompt });
    
    const tools = toolsCallback ? OPENAI_TOOLS : undefined;
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    try {
      while (iterations < MAX_ITERATIONS) {
        const body: any = {
          model: config.model,
          messages: messages,
          temperature: config.temperature,
          response_format: jsonMode ? { type: "json_object" } : undefined
        };

        if (tools) {
           body.tools = tools;
           body.tool_choice = "auto";
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey || ''}`
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        const data = await response.json();
        
        const choice = data.choices?.[0];
        if (!choice) throw new Error("No choices in response");

        const message = choice.message;
        messages.push(message); // Add to history

        if (message.tool_calls && message.tool_calls.length > 0 && toolsCallback) {
            for (const toolCall of message.tool_calls) {
                const fnName = toolCall.function.name;
                const argsStr = toolCall.function.arguments;
                const args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;

                const result = await toolsCallback(fnName, args);

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }
            iterations++;
        } else {
            return message.content || '';
        }
      }
      return messages[messages.length - 1].content || "Max iterations reached.";

    } catch (error: any) { 
        console.error(error);
        throw new Error(`Failed to connect to AI provider: ${error.message}`); 
    }
  };

export const polishContent = async (content: string, config: AIConfig): Promise<string> => {
  const defaultPrompt = "You are an expert technical editor. Improve the provided Markdown content for clarity, grammar, and flow. Return only the polished Markdown.";
  const systemPrompt = config.customPrompts?.polish || defaultPrompt;
  return generateAIResponse(content, config, systemPrompt);
};

export const expandContent = async (content: string, config: AIConfig): Promise<string> => {
  const defaultPrompt = "You are a creative technical writer. Expand on the provided Markdown content, adding relevant details, examples, or explanations. Return only the expanded Markdown.";
  const systemPrompt = config.customPrompts?.expand || defaultPrompt;
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

// Helper: Generate questions from chunks (Rule 1: Segment Text)
const generateQuestionsFromChunks = async (content: string, config: AIConfig, isExamMode: boolean = false): Promise<QuizQuestion[]> => {
    // Rule 1: Split into chunks (default 800 chars, overlaps 100)
    // Scale chunk size with content length to prevent too many requests, but keep it dense.
    const idealChunkSize = Math.max(800, Math.min(2000, Math.ceil(content.length / 15))); 
    const chunks = chunkText(content, idealChunkSize, 100);
    
    // Limit to 15 chunks to avoid API spam/costs, prioritize earlier chunks + some distributed
    const processingChunks = chunks.slice(0, 15);
    
    const langPrompt = config.language === 'zh' 
       ? "Provide questions and options in Chinese." 
       : "Provide questions in English.";

    // Rule 4: Role Prompting
    const systemPrompt = "You are a specific Quiz Designer. For the provided text segment, create 1-3 high-quality multiple choice questions. Focus on facts, definitions, and relationships. Return JSON Array.";

    const questionsPromises = processingChunks.map(async (chunk, index) => {
        const prompt = `Task: Create questions from this text segment.
        
        Text Segment:
        "${chunk}"

        Rules:
        1. Create 1-3 questions based ONLY on this text.
        2. If the text is just metadata or irrelevant, return empty array [].
        3. ${langPrompt}
        4. Output format: JSON Array of objects:
        [
           {
             "type": "single",
             "question": "...",
             "options": ["A", "B", "C", "D"],
             "correctAnswer": "Correct Option Text",
             "explanation": "..."
           }
        ]`;

        try {
            // Add slight jitter to prevent exact simultaneous burst
            await delay(index * 100); 
            const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
            const cleaned = extractJson(jsonStr);
            const parsed = JSON.parse(cleaned);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn(`Chunk ${index} generation failed`, e);
            return [];
        }
    });

    const results = await Promise.all(questionsPromises);
    
    // Flatten and assign IDs
    const flatQuestions: QuizQuestion[] = [];
    results.forEach((batch, batchIdx) => {
        batch.forEach((q: any, qIdx: number) => {
            if (q && q.question && q.options) {
                flatQuestions.push({
                    id: `gen-q-${batchIdx}-${qIdx}`,
                    type: q.type || 'single',
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    explanation: q.explanation
                });
            }
        });
    });

    return flatQuestions;
};

export const extractQuizFromRawContent = async (content: string, config: AIConfig): Promise<Quiz> => {
   // 1. Detect if it's an Exam Paper vs Prose
   // Look for numbered patterns like "1.", "2.", "Q1", "(1)" occurring frequently
   const examQuestionPattern = /(?:^|\n)\s*(?:\d+|Q\d+)[.)]/g;
   const matchCount = (content.match(examQuestionPattern) || []).length;
   
   // Heuristic: If we see > 5 numbered items, treat as Exam Extraction Mode (Legacy/Whole Doc)
   const isLikelyExam = matchCount >= 5;

   if (isLikelyExam) {
       console.log("Detected Exam Mode: Extracting existing questions...");
       const langPrompt = config.language === 'zh' 
        ? "IMPORTANT: If generating new content, use Chinese. If extracting, preserve original language." 
        : "Use English.";

       // Greatly increased context limit (approx 100k tokens safe for standard usage)
       const safeContent = content.substring(0, 500000);

       const prompt = `Analyze the exam document below to extract the Quiz JSON.
       
       CRITICAL PRIORITY: **FULL EXTRACTION**
       
       1. **FULL EXTRACTION**:
          - You must extract **EVERY SINGLE QUESTION** found in the text.
          - **DO NOT SUMMARIZE**.
          - **Cognitive Correction**: Fix OCR artifacts (e.g. '1' vs 'l'), merge split words.
          
       2. **FORMAT HANDLING**:
          - Detect standard patterns like "1.", "Q1:", "(1)".
          - Map Answer Key if found.

       OUTPUT FORMAT:
       Return strictly valid JSON matching this schema:
       {
        "id": "quiz-extracted-${Date.now()}",
        "title": "Extracted Exam",
        "description": "Quiz extracted from uploaded document.",
        "questions": [
          {
            "id": "q1",
            "type": "single",
            "question": "Exact question text",
            "options": ["A. ...", "B. ..."], 
            "correctAnswer": "A", 
            "explanation": "..."
          }
        ],
        "isGraded": false
       }

       ${langPrompt}

       DOCUMENT CONTENT:
       ${safeContent}
       `;

       const systemPrompt = "You are a Strict Exam Parser AI. Extract every question verbatim. Do not summarize.";

       try {
        const jsonStr = await generateAIResponse(prompt, config, systemPrompt, true);
        const cleanedJson = extractJson(jsonStr);
        return JSON.parse(cleanedJson) as Quiz;
      } catch (e) {
        console.error("Quiz Extraction Error", e);
        throw new Error("Failed to process document into a quiz.");
      }
   } else {
       console.log("Detected Prose Mode: Generating questions via Chunking...");
       // 2. Prose Mode: Use Chunking Strategy for high density (Rule 1-5)
       const questions = await generateQuestionsFromChunks(content, config);
       
       if (questions.length === 0) {
           throw new Error("AI could not generate any questions from this content.");
       }

       // Generate a Title/Description for the whole set (Quick Call)
       const metaPrompt = `Generate a short Title and Description for a quiz based on these questions: "${questions.slice(0, 3).map(q=>q.question).join('; ')}..."`;
       let meta = { title: "Generated Quiz", description: "Quiz generated from document." };
       try {
           const metaJson = await generateAIResponse(metaPrompt, config, "Return JSON { title, description }", true);
           const parsedMeta = JSON.parse(extractJson(metaJson));
           if(parsedMeta.title) meta = parsedMeta;
       } catch(e) {}

       return {
           id: `quiz-gen-${Date.now()}`,
           title: meta.title,
           description: meta.description,
           questions: questions,
           isGraded: false
       };
   }
};

export const generateQuiz = async (content: string, config: AIConfig): Promise<Quiz> => {
  // Use the robust chunking strategy for generation from editor content as well
  const questions = await generateQuestionsFromChunks(content, config);

  if (questions.length === 0) {
      throw new Error("AI could not generate any questions. Content might be too short or unclear.");
  }

  return {
    id: `quiz-generated-${Date.now()}`,
    title: "Knowledge Check",
    description: "Quiz generated from your notes.",
    questions: questions,
    isGraded: false
  };
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

export const generateQuizExplanation = async (
  question: string,
  correctAnswer: string,
  userAnswer: string,
  context: string,
  config: AIConfig
): Promise<string> => {
  const langPrompt = config.language === 'zh' 
    ? "IMPORTANT: Provide the explanation in Chinese." 
    : "Provide the explanation in English.";

  const prompt = `Task: Explain the answer to a multiple choice question.
  
  Question: ${question}
  Correct Answer: ${correctAnswer}
  User Selected: ${userAnswer}
  Context: ${context.substring(0, 10000)} ...

  Instructions:
  1. Explain why the Correct Answer is right.
  2. If the User Selected a different answer, explain why it is wrong.
  3. Be concise and educational.
  4. ${langPrompt}
  `;
  
  const systemPrompt = "You are a helpful Tutor. Provide clear, concise explanations.";
  
  return generateAIResponse(prompt, config, systemPrompt);
};
