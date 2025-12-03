
import { GoogleGenAI, Type } from "@google/genai";
import { AIConfig, MarkdownFile, GraphData, Quiz, ChatMessage } from "../types";

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
    let apiKey = config.apiKey;
    let model = config.model;

    if (config.provider === 'openai') {
        // Only set default if not provided, allowing user to override for proxies
        if (!baseUrl || baseUrl.trim() === '') {
            baseUrl = 'https://api.openai.com/v1';
        }
        if (!model) model = 'gpt-4o';
    } else if (config.provider === 'ollama') {
        if (!baseUrl || baseUrl.trim() === '') {
            baseUrl = 'http://localhost:11434';
        }
        // Normalize: Ensure we point to the v1 compatible endpoint for Ollama
        if (!baseUrl.includes('/v1')) {
            // Remove trailing slash if present then append /v1
            baseUrl = `${baseUrl.replace(/\/$/, '')}/v1`;
        }
        if (!model) model = 'llama3';
    }

    // Ensure no trailing slash for clean concatenation later
    baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';

    return { baseUrl, apiKey, model };
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
        
        // OpenAI / Ollama Logic
        const { baseUrl, apiKey } = resolveOpenAIConfig(config);
        let model = config.embeddingModel;
        
        if (!model) {
            model = config.provider === 'openai' ? 'text-embedding-3-small' : 'nomic-embed-text';
        }

        const headers: any = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const response = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: model,
                input: text
            })
        });

        if (!response.ok) return [];
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

    const headers: any = {
        'Content-Type': 'application/json',
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

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

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

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
    const prompt = `Analyze this content and suggest a single folder path (e.g. "Work/Projects" or "Personal/Journal"). Return ONLY the path string.
    
    Content:
    ${content.substring(0, 1000)}...`;

    return await generateAIResponse(prompt, config, "You are a librarian.", true);
};

export const extractEntitiesAndRelationships = async (content: string, config: AIConfig): Promise<GraphData> => {
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
    const prompt = `Create a Mermaid.js MindMap from this content. Return ONLY the mermaid code. Start with 'mindmap'.\n\n${content}`;
    const res = await generateAIResponse(prompt, config, "You are a diagram expert.", true);
    return res.replace(/```mermaid/g, '').replace(/```/g, '').trim();
};

export const generateQuiz = async (content: string, config: AIConfig): Promise<Quiz> => {
    const prompt = `Generate a quiz from this content in JSON format.
    Schema:
    {
      "title": "Quiz Title",
      "description": "Short description",
      "questions": [
         {
           "id": "q1",
           "type": "single",
           "question": "What is...?",
           "options": ["A", "B", "C", "D"],
           "correctAnswer": "A",
           "explanation": "Because..."
         }
      ]
    }
    Return ONLY JSON.`;
    
    const res = await generateAIResponse(prompt, config, "You are a teacher.", true);
    try {
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        return { ...data, id: `quiz-${Date.now()}`, isGraded: false };
    } catch (e) {
        throw new Error("Failed to parse quiz JSON");
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

export const generateQuizExplanation = async (question: string, correct: string, user: string, context: string, config: AIConfig): Promise<string> => {
    const prompt = `Explain why the answer is ${correct} and why ${user} might be wrong/right.
    Question: ${question}
    Context: ${context.substring(0, 500)}`;
    return generateAIResponse(prompt, config, "You are a tutor.", true);
};

export const compactConversation = async (messages: ChatMessage[], config: AIConfig): Promise<ChatMessage[]> => {
    if (messages.length <= 4) return messages;
    
    const textToSummarize = messages.slice(0, -2).map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `Summarize this conversation history into a concise context paragraph.`;
    const summary = await generateAIResponse(prompt, config, "You are a summarizer.", true);
    
    const systemMsg: ChatMessage = { 
        id: 'summary-' + Date.now(), 
        role: 'system', 
        content: `Previous Context: ${summary}`, 
        timestamp: Date.now() 
    };
    
    return [systemMsg, ...messages.slice(-2)];
};

export const synthesizeKnowledgeBase = async (files: MarkdownFile[], config: AIConfig): Promise<string> => {
    const context = files.slice(0, 5).map(f => `File: ${f.name}\n${f.content.substring(0, 500)}...`).join('\n\n');
    const prompt = `Analyze these files and synthesize the key information into a cohesive summary.\n\n${context}`;
    return generateAIResponse(prompt, config, "You are a research analyst.", true);
};

// --- Virtual MCP Client for Settings ---
export class VirtualMCPClient {
    constructor(private configStr: string) {}
    
    getTools() {
        try {
            const config = JSON.parse(this.configStr);
            if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
                 return [
                     { name: 'mcp_read_resource', description: 'Read a resource from the MCP server.', inputSchema: { properties: { uri: { type: 'string' } } } },
                     { name: 'mcp_list_resources', description: 'List available resources.', inputSchema: { properties: {} } }
                 ];
            }
            return [];
        } catch { return []; }
    }
}
