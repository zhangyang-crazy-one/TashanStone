
import { GoogleGenAI, Type } from "@google/genai";
import { AIConfig, MarkdownFile, GraphData, Quiz, ChatMessage, QuizQuestion, GradingResult } from "../types";

// --- Types for Local Usage ---
interface Tool {
  functionDeclarations?: FunctionDeclaration[];
}

interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: any;
}

// --- Tool Definitions ---
const FILESYSTEM_TOOLS: Tool = {
  functionDeclarations: [
    {
      name: 'list_files',
      description: 'List all available files in the current workspace with their paths.',
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: 'read_file',
      description: 'Read the content of a specific file. Use list_files to find paths first.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          filename: { type: Type.STRING, description: 'The name or path of the file to read.' }
        },
        required: ['filename']
      }
    },
    {
      name: 'create_file',
      description: 'Create a new file with the specified content.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          filename: { type: Type.STRING, description: 'The name of the file to create (e.g., notes.md).' },
          content: { type: Type.STRING, description: 'The content to write to the file.' }
        },
        required: ['filename', 'content']
      }
    },
    {
      name: 'update_file',
      description: 'Update an existing file. defaults to append mode unless overwrite is specified.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          filename: { type: Type.STRING, description: 'The name of the file to update.' },
          content: { type: Type.STRING, description: 'The content to append or write.' },
          mode: { type: Type.STRING, description: 'Mode: "append" (default) or "overwrite".', enum: ['append', 'overwrite'] }
        },
        required: ['filename', 'content']
      }
    },
    {
      name: 'delete_file',
      description: 'Delete a file.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          filename: { type: Type.STRING, description: 'The name of the file to delete.' }
        },
        required: ['filename']
      }
    }
  ]
};

// --- Helper: Schema Sanitization ---
const sanitizeSchema = (schema: any): any => {
  if (!schema) return undefined;
  
  // Deep clone to safely modify
  let newSchema;
  try {
      newSchema = JSON.parse(JSON.stringify(schema));
  } catch (e) {
      return schema; // Fallback if circular
  }
  
  const processNode = (node: any) => {
      // 1. Convert Gemini 'Type' enum (uppercase strings) to JSON Schema (lowercase)
      if (node.type && typeof node.type === 'string') {
          const typeMap: Record<string, string> = {
              'TYPE_UNSPECIFIED': 'string',
              'STRING': 'string',
              'NUMBER': 'number',
              'INTEGER': 'integer',
              'BOOLEAN': 'boolean',
              'ARRAY': 'array',
              'OBJECT': 'object'
          };
          if (typeMap[node.type]) {
              node.type = typeMap[node.type];
          } else {
               node.type = node.type.toLowerCase();
          }
      }
      
      // 2. Handle nested properties
      if (node.properties) {
          for (const key in node.properties) {
              processNode(node.properties[key]);
          }
      }
      
      // 3. Handle array items
      if (node.items) {
          processNode(node.items);
      }
  };

  processNode(newSchema);
  return newSchema;
};

// --- Helper: Convert Tools for OpenAI/Ollama ---
const convertToolsToOpenAI = (tools: Tool): any[] | undefined => {
  if (!tools.functionDeclarations) return undefined;
  return tools.functionDeclarations.map(fd => ({
    type: "function",
    function: {
      name: fd.name,
      description: fd.description,
      // OpenAI requires parameters to be an object
      parameters: sanitizeSchema(fd.parameters) || { type: 'object', properties: {} }
    }
  }));
};

// --- Helper: Configuration Resolver ---
const resolveOpenAIConfig = (config: AIConfig) => {
    let baseUrl = config.baseUrl;
    const apiKey = config.apiKey;
    let model = config.model;

    // Default URLs if missing
    if (!baseUrl || baseUrl.trim() === '') {
        if (config.provider === 'openai') {
            baseUrl = 'https://api.openai.com/v1';
        } else if (config.provider === 'ollama') {
            baseUrl = 'http://localhost:11434/v1';
        }
    }

    // Default Models if missing
    if (!model) {
        if (config.provider === 'openai') model = 'gpt-4o';
        else if (config.provider === 'ollama') model = 'llama3';
    }

    // URL Normalization
    if (baseUrl) {
        // Remove trailing slash
        baseUrl = baseUrl.replace(/\/+$/, '');
        
        // Auto-fix for Ollama: If user entered "http://localhost:11434" without /v1, append it
        // This ensures compatibility with standard OpenAI client libraries
        if (config.provider === 'ollama' && !baseUrl.endsWith('/v1')) {
            baseUrl = `${baseUrl}/v1`;
        }
    }

    return { baseUrl: baseUrl || '', apiKey, model };
};

// --- Helper: Embedding ---
export const getEmbedding = async (text: string, config: AIConfig): Promise<number[]> => {
    if (!text) return [];
    
    try {
        if (config.provider === 'gemini') {
            if (!config.apiKey) return [];
            const ai = new GoogleGenAI({ apiKey: config.apiKey });
            const result = await ai.models.embedContent({
                model: config.embeddingModel || 'text-embedding-004',
                contents: text
            });
            return result.embeddings?.[0]?.values || [];
        } 
        
        // OpenAI / Ollama Logic (Unified)
        const { baseUrl, apiKey } = resolveOpenAIConfig(config);
        
        // Determine model name
        let model = config.embeddingModel;
        if (!model) {
            model = config.provider === 'openai' ? 'text-embedding-3-small' : 'nomic-embed-text';
        }

        const headers: any = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        // OpenAI-compatible embedding endpoint is /embeddings
        // resolveOpenAIConfig ensures baseUrl ends in /v1 for Ollama/OpenAI
        const response = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: model,
                input: text
            })
        });

        if (!response.ok) {
            console.warn(`Embedding failed (${response.status}):`, await response.text());
            return [];
        }
        
        const data = await response.json();
        return data.data?.[0]?.embedding || [];

    } catch (e) {
        console.warn("Embedding failed", e);
        return [];
    }
};

// --- Agentic Loop for Gemini ---
const callGemini = async (
    prompt: string, 
    config: AIConfig, 
    sysParams: any, 
    toolCallback?: (name: string, args: any) => Promise<any>
): Promise<string> => {
    if (!config.apiKey) throw new Error("API Key required for Gemini");

    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    
    // Convert our generic tool definition to Gemini format
    const tools = config.enableWebSearch 
        ? [{ googleSearch: {} }] 
        : (toolCallback ? [FILESYSTEM_TOOLS] : undefined);

    const chat = ai.chats.create({
        model: config.model || 'gemini-2.5-flash',
        config: {
            systemInstruction: sysParams.systemInstruction,
            tools: tools
        },
        history: sysParams.history || []
    });

    try {
        let result = await chat.sendMessage({ message: prompt });
        
        // Loop for Tool Calls (Max 10 turns)
        let turns = 0;
        const MAX_TURNS = 10;

        while (turns < MAX_TURNS) {
            const functionCalls = result.functionCalls;
            
            if (functionCalls && functionCalls.length > 0 && toolCallback) {
                const parts: any[] = [];
                
                for (const call of functionCalls) {
                    console.log(`[Gemini] Tool Call: ${call.name}`, call.args);
                    const toolResult = await toolCallback(call.name, call.args);
                    parts.push({
                        functionResponse: {
                            name: call.name,
                            id: call.id,
                            response: { result: toolResult }
                        }
                    });
                }
                
                result = await chat.sendMessage({ message: parts });
                turns++;
            } else {
                return result.text || "";
            }
        }
        
        return result.text || "";

    } catch (e: any) {
        throw new Error(`Gemini Error: ${e.message}`);
    }
};

// --- Agentic Loop for OpenAI / Ollama ---
const callOpenAICompatible = async (
    prompt: string,
    config: AIConfig,
    sysParams: any,
    toolCallback?: (name: string, args: any) => Promise<any>
): Promise<string> => {
    const { baseUrl, apiKey, model } = resolveOpenAIConfig(config);

    // Prepare Tools
    const tools = toolCallback ? convertToolsToOpenAI(FILESYSTEM_TOOLS) : undefined;

    // Prepare Messages
    const messages: any[] = [
        { role: 'system', content: sysParams.systemInstruction },
        { role: 'user', content: prompt }
    ];

    let turns = 0;
    const MAX_TURNS = 10;

    while (turns < MAX_TURNS) {
        const body: any = {
            model,
            messages,
            temperature: config.temperature
        };

        // Only add tools property if tools exist
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = "auto";
        }

        // Helper to execute fetch with optional auth retry
        const executeFetch = async (includeAuth: boolean) => {
            const headers: any = {
                'Content-Type': 'application/json',
            };
            if (includeAuth && apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            return fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
        };

        try {
            let response = await executeFetch(true);

            // Retry Logic:
            // If we get a 401 Unauthorized AND we are using Ollama AND we sent an API Key,
            // it's very likely the user has a leftover key from another provider that is being rejected.
            // Retry without the key.
            if (response.status === 401 && config.provider === 'ollama' && apiKey) {
                console.warn("Ollama returned 401 with API Key. Retrying request without Authorization header...");
                response = await executeFetch(false);
            }

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`${config.provider.toUpperCase()} Error (${response.status}): ${text}`);
            }

            const data = await response.json();
            const choice = data.choices?.[0];
            const message = choice?.message;

            if (!message) throw new Error("Empty response from AI provider");

            // Add assistant response to history
            messages.push(message); 

            // Handle Tool Calls
            if (message.tool_calls && message.tool_calls.length > 0) {
                 if (!toolCallback) break;

                 for (const toolCall of message.tool_calls) {
                     const fnName = toolCall.function.name;
                     let args = {};
                     try {
                        args = JSON.parse(toolCall.function.arguments);
                     } catch(e) {
                        console.error("Failed to parse tool arguments", e);
                     }

                     console.log(`[${config.provider}] Executing tool: ${fnName}`, args);
                     let result = await toolCallback(fnName, args);
                     
                     // Convert result to string for the API
                     let resultStr = "";
                     if (typeof result === 'string') {
                         resultStr = result;
                     } else {
                         resultStr = JSON.stringify(result);
                     }

                     messages.push({
                         role: 'tool',
                         tool_call_id: toolCall.id,
                         content: resultStr
                     });
                 }
                 turns++;
            } else {
                // Final text response
                return message.content || "";
            }

        } catch (e: any) {
            console.error("AI Call Failed", e);
            
            const isOllama = config.provider === 'ollama';
            const isFetchError = e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'));
            
            if (isOllama && isFetchError) {
                 throw new Error(`Ollama Connection Failed.\n1. Ensure Ollama is running.\n2. You MUST set 'OLLAMA_ORIGINS="*"' in your environment variables to allow browser access.\n3. Check URL: ${baseUrl}`);
            }
            
            throw e;
        }
    }

    return "Max turns reached.";
};

export const generateAIResponse = async (
  prompt: string,
  config: AIConfig,
  systemInstruction: string,
  simpleMode: boolean = false,
  contextFiles: MarkdownFile[] = [],
  toolCallback?: (name: string, args: any) => Promise<any>,
  ragContext?: string
): Promise<string> => {
  // Safety check
  if (config.provider === 'openai' && !config.apiKey && !config.baseUrl) {
      throw new Error("API Key or Custom URL is required for OpenAI.");
  }

  // Build Context Block
  let contextBlock = "";
  
  if (ragContext && ragContext.trim().length > 0) {
      contextBlock += `
<ReferenceContext>
The following is retrieved information from the user's knowledge base. 
Treat this as a helpful reference, not a strict limitation.
1. If the reference is relevant, cite it and use it to improve your answer.
2. If the reference is irrelevant or insufficient, ignore it and rely on your general knowledge.
3. Synthesize this information naturally with the current file context.

${ragContext}
</ReferenceContext>
`;
  }

  if (contextFiles.length > 0) {
      const active = contextFiles[0];
      contextBlock += `
<ActiveFile name="${active.name}">
${active.content}
</ActiveFile>
`;
  }

  const finalSystemInstruction = `
${systemInstruction}

[Workflow Rules]
- You are an intelligent assistant embedded in a Markdown editor.
- You can perform multi-step reasoning.
- If a tool fails (e.g., file not found), analyze the error and try a corrective action (e.g., create file, then update).

${contextBlock}
`;

  if (config.provider === 'gemini') {
      return callGemini(prompt, config, { systemInstruction: finalSystemInstruction }, toolCallback);
  } else {
      return callOpenAICompatible(prompt, config, { systemInstruction: finalSystemInstruction }, toolCallback);
  }
};

// --- Other Services ---

export const polishContent = async (content: string, config: AIConfig): Promise<string> => {
    const prompt = `Review and improve the following Markdown content. Fix grammar, improve clarity, and fix formatting. Return ONLY the polished markdown content.\n\n${content}`;
    return generateAIResponse(prompt, config, config.customPrompts?.polish || "You are a professional editor.", true);
};

export const expandContent = async (content: string, config: AIConfig): Promise<string> => {
    const prompt = `Expand upon the following content. Add details, examples, and depth. Return ONLY the expanded markdown.\n\n${content}`;
    return generateAIResponse(prompt, config, config.customPrompts?.expand || "You are a creative writer.", true);
};

export const enhanceUserPrompt = async (
    currentInput: string, 
    history: ChatMessage[], 
    config: AIConfig,
    ragContext: string
): Promise<string> => {
    const systemPrompt = config.customPrompts?.enhance || "You are an expert prompt engineer. Rewrite the user's draft prompt to be more precise, effective, and context-aware. Use the provided conversation history and knowledge base context to resolve ambiguities. Return ONLY the enhanced prompt string without quotes or explanations.";
    
    // Summarize history briefly to save tokens if needed, or pass last few messages
    const recentHistory = history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n');

    const metaPrompt = `
    [Goal]
    Refine the user's input based on context.

    [Conversation History]
    ${recentHistory}

    [Knowledge Base Context]
    ${ragContext}

    [User's Draft Input]
    ${currentInput}
    `;

    return generateAIResponse(metaPrompt, config, systemPrompt, true);
};

export const generateSummary = async (content: string, config: AIConfig): Promise<string> => {
    const prompt = `Generate a concise 2-3 sentence summary of the following content. Focus on key concepts and main ideas.\n\n${content.substring(0, 3000)}`;
    return generateAIResponse(prompt, config, "You are a knowledge organizer.", true);
};

export const suggestTags = async (content: string, config: AIConfig): Promise<string[]> => {
    const prompt = `Analyze the following content and suggest 3-5 relevant hierarchical tags (e.g. #topic/subtopic). 
    Return ONLY a JSON array of strings. Example: ["#project/ui", "#dev/react"]
    
    Content:
    ${content.substring(0, 1000)}...`;

    const res = await generateAIResponse(prompt, config, "You are a taxonomy expert.", true);
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

export const suggestCategory = async (content: string, config: AIConfig): Promise<string> => {
    const prompt = `Analyze this content and suggest a single, short logical folder path (e.g. "Work/Projects" or "Personal/Journal"). Do not start with slash. Return ONLY the path string.
    
    Content:
    ${content.substring(0, 1000)}...`;

    return await generateAIResponse(prompt, config, "You are a librarian.", true);
};

export const assessImportance = async (content: string, config: AIConfig): Promise<{ score: number, keyConcepts: string[] }> => {
    const prompt = `
    Analyze this text. 
    1. Score importance from 1-10 based on information density and uniqueness (1=Draft/Scratchpad, 10=Critical/Core Knowledge).
    2. Extract top 3 key concepts. 
    
    Return JSON: { "score": number, "concepts": string[] }.
    
    Content:
    ${content.substring(0, 2000)}...
    `;

    const res = await generateAIResponse(prompt, config, "You are a critical thinker.", true);
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        return { 
            score: typeof data.score === 'number' ? Math.min(10, Math.max(1, data.score)) : 5, 
            keyConcepts: Array.isArray(data.concepts) ? data.concepts : [] 
        };
    } catch (e) {
        return { score: 0, keyConcepts: [] };
    }
};

export const extractEntitiesAndRelationships = async (content: string, config: AIConfig): Promise<GraphData> => {
    if (!content.trim()) return { nodes: [], links: [] };

    const prompt = `
    Analyze the provided text and perform entity-relationship abstraction.
    Identify key entities (concepts, people, places, organizations) and their semantic relationships.
    
    Return a JSON object with this exact structure:
    {
      "nodes": [
        { "id": "Entity Name", "label": "Entity Name", "group": 5, "val": 2 } 
      ],
      "links": [
        { "source": "Entity Name 1", "target": "Entity Name 2", "relationship": "verb or phrase" }
      ]
    }
    
    Rules:
    1. Entities should be concise (1-3 words).
    2. 'group' should be 5 for these extracted entities to distinguish them visually.
    3. 'val' represents importance (1-10).
    4. Return ONLY valid JSON. Do not use Markdown code blocks.
    
    Text to analyze:
    ${content.substring(0, 4000)}
    `;

    const res = await generateAIResponse(prompt, config, "You are a knowledge graph engineer.", true);
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        // Validate structure basics
        if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
            return data;
        }
        return { nodes: [], links: [] };
    } catch (e) {
        console.error("Failed to parse extracted graph", e);
        return { nodes: [], links: [] };
    }
};

export const generateKnowledgeGraph = async (files: MarkdownFile[], config: AIConfig): Promise<GraphData> => {
    const context = files.slice(0, 5).map(f => `File: ${f.name}\n${f.content.substring(0, 500)}...`).join('\n\n');
    const prompt = `Analyze these files and generate a knowledge graph JSON.
    Format: { "nodes": [{"id": "NodeName", "label": "NodeName", "group": 1, "val": 10}], "links": [{"source": "NodeName", "target": "OtherNode"}] }
    Return ONLY JSON. No markdown blocks.`;
    
    const res = await generateAIResponse(prompt, config, "You are a data visualization expert.", true, files);
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        return { nodes: [], links: [] };
    }
};

export const generateMindMap = async (content: string, config: AIConfig): Promise<string> => {
    const prompt = `Create a Mermaid.js MindMap from this content. Return ONLY the mermaid code. Start with 'mindmap'.
    
    IMPORTANT SYNTAX RULES:
    1. Do NOT use [[ ]] or [ ] in node text. It crashes the parser.
    2. Replace wikilinks like [[Page Name]] with just "Page Name".
    3. Keep text concise. 
    
    ${content}`;
    const res = await generateAIResponse(prompt, config, "You are a diagram expert.", true);
    return res.replace(/```mermaid/g, '').replace(/```/g, '').trim();
};

export const generateQuiz = async (content: string, config: AIConfig): Promise<Quiz> => {
    const prompt = `Generate a diverse quiz from this content in JSON format.
    Include Multiple Choice, Fill-in-the-blank, and Short Answer questions if suitable content exists.
    
    Schema:
    {
      "title": "Quiz Title",
      "description": "Short description",
      "questions": [
         {
           "type": "single" | "multiple" | "text" | "fill_blank",
           "question": "Question text. For 'fill_blank', use {{blank}} to denote the missing part.",
           "options": ["A", "B", "C", "D"], // Only for single/multiple
           "correctAnswer": "Answer string",
           "explanation": "Why this is correct",
           "difficulty": "easy" | "medium" | "hard",
           "tags": ["tag1", "tag2"],
           "knowledgePoints": ["KP1", "KP2"]
         }
      ]
    }
    
    Rules:
    1. For 'fill_blank', the question should look like: "The capital of France is {{blank}}." and correctAnswer is "Paris".
    2. Tags should be short and relevant.
    3. Determine difficulty based on complexity.
    
    Return ONLY valid JSON.`;
    
    const res = await generateAIResponse(prompt, config, "You are a teacher.", true);
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        
        // Post-process to ensure IDs
        if (data.questions) {
            data.questions = data.questions.map((q: any, i: number) => ({
                ...q,
                id: `gen-q-${Date.now()}-${i}`,
                created: Date.now()
            }));
        }

        return { ...data, id: `quiz-${Date.now()}`, isGraded: false };
    } catch (e) {
        console.error("Quiz Parse Error", e);
        throw new Error("Failed to parse quiz JSON");
    }
};

export const generateStructuredExam = async (
    topics: string, 
    count: number, 
    difficultyDist: string, 
    files: MarkdownFile[], 
    config: AIConfig
): Promise<Quiz> => {
    const context = files.slice(0, 3).map(f => f.content.substring(0, 1000)).join('\n\n'); // Sample content
    
    const prompt = `Generate a structured exam based on these requirements:
    Topics: ${topics}
    Total Questions: ${count}
    Difficulty Distribution: ${difficultyDist}
    
    Context Source (Reference Style):
    ${context}
    
    Schema:
    {
      "title": "Exam Title",
      "description": "Exam Description",
      "questions": [
         {
           "type": "single" | "multiple" | "text" | "fill_blank",
           "question": "Question text",
           "options": ["Option A", "Option B", "Option C", "Option D"],
           "correctAnswer": "Answer",
           "explanation": "Detailed explanation",
           "difficulty": "easy" | "medium" | "hard",
           "tags": ["Topic Tag"],
           "knowledgePoints": ["Key Concept"]
         }
      ]
    }
    
    Ensure questions are well-balanced and strictly follow the requested count and difficulty distribution.
    Return ONLY valid JSON.`;

    const res = await generateAIResponse(prompt, config, "You are an expert exam setter.", true);
    
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        
        if (data.questions) {
            data.questions = data.questions.map((q: any, i: number) => ({
                ...q,
                id: `exam-q-${Date.now()}-${i}`,
                created: Date.now()
            }));
        }

        return { ...data, id: `exam-${Date.now()}`, isGraded: false };
    } catch (e) {
        console.error("Exam Gen Error", e);
        throw new Error("Failed to generate exam structure");
    }
};

export const extractQuizFromRawContent = async (text: string, config: AIConfig): Promise<Quiz> => {
    return generateQuiz(text, config);
};

export const gradeQuizQuestion = async (question: string, userAnswer: string, context: string, config: AIConfig): Promise<{isCorrect: boolean, explanation: string}> => {
    const prompt = `Grade this answer.
    Context: ${context.substring(0, 1000)}
    Question: ${question}
    User Answer: ${userAnswer}
    
    Return JSON: { "isCorrect": boolean, "explanation": "string" }`;
    
    const res = await generateAIResponse(prompt, config, "You are a grader.", true);
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        return { isCorrect: false, explanation: "Grading failed." };
    }
};

export const gradeSubjectiveAnswer = async (
    question: string, 
    userAnswer: string, 
    referenceAnswer: string,
    context: string, 
    config: AIConfig
): Promise<GradingResult> => {
    const prompt = `
    You are an expert exam grader. Evaluate the User Answer based on the Question and Reference Answer (or Context).
    
    Grading Criteria:
    1. Semantic Similarity (50%): Does the answer convey the correct meaning?
    2. Key Information (30%): Are key terms or concepts present?
    3. Clarity & Completeness (20%): Is it well-explained?

    Context / Reference Material:
    ${context.substring(0, 1000)}

    Question: ${question}
    Reference Answer (if any): ${referenceAnswer}
    User Answer: ${userAnswer}

    Return a JSON object:
    {
        "score": number, // 0 to 100
        "feedback": "Concise justification for the score.",
        "keyPointsMatched": ["List of key concepts the user got right"],
        "keyPointsMissed": ["List of key concepts missing or incorrect"],
        "suggestion": "Optional tip for improvement"
    }
    `;

    const res = await generateAIResponse(prompt, config, "You are a strict but fair academic grader.", true);
    
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(jsonStr);
        return {
            score: typeof result.score === 'number' ? Math.min(100, Math.max(0, result.score)) : 0,
            feedback: result.feedback || "No feedback provided.",
            keyPointsMatched: Array.isArray(result.keyPointsMatched) ? result.keyPointsMatched : [],
            keyPointsMissed: Array.isArray(result.keyPointsMissed) ? result.keyPointsMissed : [],
            suggestion: result.suggestion
        };
    } catch (e) {
        console.error("Grading Parse Error", e);
        return {
            score: 0,
            feedback: "Error parsing AI grading result.",
            keyPointsMatched: [],
            keyPointsMissed: []
        };
    }
};

export const generateQuizExplanation = async (question: string, correct: string, user: string, context: string, config: AIConfig): Promise<string> => {
    const prompt = `Explain why the answer is ${correct} and why ${user} might be wrong/right.
    Question: ${question}
    Context: ${context.substring(0, 500)}`;
    return generateAIResponse(prompt, config, "You are a tutor.", true);
};

export const synthesizeKnowledgeBase = async (files: MarkdownFile[], config: AIConfig): Promise<string> => {
    const summaries = files.slice(0, 10).map(f => `File: ${f.name}\n${f.content.substring(0, 200)}...`).join('\n\n');
    const prompt = `Synthesize a comprehensive summary of the following knowledge base fragments. Identify overarching themes and connections.\n\n${summaries}`;
    return generateAIResponse(prompt, config, "You are a research synthesist.", true);
};

export class VirtualMCPClient {
    private config: any;
    constructor(configStr: string) {
        try {
            this.config = JSON.parse(configStr);
        } catch (e) {
            this.config = {};
        }
    }

    getTools(): any[] {
        if (this.config && this.config.mcpServers) {
            // Return dummy tools for validation display in UI
            return [];
        }
        return [];
    }
}

export const compactConversation = async (messages: ChatMessage[], config: AIConfig): Promise<ChatMessage[]> => {
    if (messages.length <= 4) return messages;

    const systemMsg = messages.find(m => m.role === 'system');
    const recent = messages.slice(-2);
    const toSummarize = messages.filter(m => m !== systemMsg && !recent.includes(m));

    if (toSummarize.length === 0) return messages;

    const conversationText = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `Summarize the key points of this conversation history to retain context for future turns. Return only the summary text.\n\n${conversationText}`;

    try {
        const summary = await generateAIResponse(prompt, config, "You are a helpful assistant.", true);
        
        const summaryMsg: ChatMessage = {
            id: `summary-${Date.now()}`,
            role: 'system',
            content: `[Previous Context Summary]: ${summary}`,
            timestamp: Date.now()
        };

        return [
            ...(systemMsg ? [systemMsg] : []),
            summaryMsg,
            ...recent
        ];
    } catch (e) {
        console.error("Compaction failed", e);
        return messages;
    }
};
