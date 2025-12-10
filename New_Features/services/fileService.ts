
import { MarkdownFile, Quiz, QuizQuestion } from '../types';
import { GoogleGenAI } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import Papa from 'papaparse';

// Configure PDF.js Worker
const pdfjs: any = pdfjsLib;
try {
  if (typeof window !== 'undefined' && pdfjs) {
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    } else if (pdfjs.default && pdfjs.default.GlobalWorkerOptions) {
      pdfjs.default.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
  }
} catch (e) {
  console.warn("Failed to configure PDF.js worker. PDF import may fail.", e);
}

declare global {
  interface Window {
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
  }
}

// Supported Extensions for Folder Scan
export const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.csv', '.pdf', '.docx', '.doc'];

export const isExtensionSupported = (filename: string): boolean => {
  const name = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
};

// Helper to check for binary content (heuristic)
const isBinary = (bytes: Uint8Array): boolean => {
  // Check first 1024 bytes for nulls or high frequency of control chars
  const checkLen = Math.min(bytes.length, 1024);
  let nullCount = 0;
  let controlCount = 0;
  
  for (let i = 0; i < checkLen; i++) {
    if (bytes[i] === 0) nullCount++;
    else if (bytes[i] < 32 && bytes[i] !== 9 && bytes[i] !== 10 && bytes[i] !== 13) controlCount++;
  }
  
  // If > 0% nulls or significant control chars, treat as binary
  if (nullCount > 0) return true;
  if (controlCount > checkLen * 0.1) return true;
  return false;
};

// Helper to extract printable strings from binary data (e.g. .xls masquerading as .csv)
const extractStringsFromBinary = (bytes: Uint8Array): string => {
  let result = "";
  let currentRun = "";
  
  // Basic filter for printable ASCII and common UTF-8 start bytes
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const isPrintable = (b >= 32 && b <= 126) || // ASCII printable
                        (b === 9 || b === 10 || b === 13) || // Tab, CR, LF
                        (b >= 192); // Start of UTF-8 multi-byte
                        
    if (isPrintable) {
      currentRun += String.fromCharCode(b);
    } else {
      if (currentRun.length > 4) { // Only keep strings longer than 4 chars
         result += currentRun + "\n";
      }
      currentRun = "";
    }
  }
  if (currentRun.length > 4) result += currentRun;
  return result;
};


// Helper to read a directory recursively
export const readDirectory = async (
  dirHandle: FileSystemDirectoryHandle
): Promise<MarkdownFile[]> => {
  const results: MarkdownFile[] = [];
  
  const traverse = async (dir: FileSystemDirectoryHandle, currentPath: string) => {
    // Critical Fix: Buffer entries first. 
    // Async operations inside a 'for await...of' loop on a directory handle can 
    // sometimes invalidate the iterator in certain browsers/environments.
    const entries: (FileSystemFileHandle | FileSystemDirectoryHandle)[] = [];
    try {
        for await (const entry of dir.values()) {
            entries.push(entry as FileSystemFileHandle | FileSystemDirectoryHandle);
        }
    } catch(e) {
        console.warn("Error iterating directory:", e);
        return;
    }

    for (const entry of entries) {
        try {
            if (entry.name.startsWith('.') && entry.name !== '.writer') continue;
            const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

            if (entry.kind === 'file') {
                if (isExtensionSupported(entry.name)) {
                    const fileHandle = entry as FileSystemFileHandle;
                    const file = await fileHandle.getFile();
                    const content = await extractTextFromFile(file);

                    results.push({
                        id: `local-${entryPath.replace(/[^\w-]/g, '_')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        name: entry.name.replace(/\.[^/.]+$/, ""),
                        content: content,
                        lastModified: file.lastModified,
                        handle: fileHandle,
                        isLocal: true,
                        path: entryPath
                    });
                }
            } else if (entry.kind === 'directory') {
                await traverse(entry as FileSystemDirectoryHandle, entryPath);
            }
        } catch (e) {
            console.warn(`Failed to process ${entry.name}`, e);
        }
    }
  };

  await traverse(dirHandle, '');
  return results;
};

export const saveFileToDisk = async (file: MarkdownFile): Promise<void> => {
  if (file.handle) {
    const writable = await file.handle.createWritable();
    await writable.write(file.content);
    await writable.close();
  }
};

// Generic Text Extractor for Import
export const extractTextFromFile = async (file: File, apiKey?: string): Promise<string> => {
  const name = file.name.toLowerCase();
  
  try {
    if (name.endsWith('.pdf')) {
      return await processPdfFile(file, apiKey);
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
      return await processDocxFile(file);
    } else if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.json')) {
      // Smart handling for CSV/Text/JSON: Detect if it's actually binary (e.g. .xls named .csv)
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      if (isBinary(bytes)) {
         console.warn("Binary file detected in text importer. Extracting strings.");
         // Attempt to recover strings from binary soup
         return extractStringsFromBinary(bytes);
      }
      
      return new TextDecoder().decode(bytes);
    } else {
      return await file.text();
    }
  } catch (e: any) {
    console.error(`Extraction failed for ${file.name}`, e);
    return `[Error reading file: ${e.message}]`;
  }
};

const processDocxFile = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } catch (e: any) {
        console.error("DOCX Error", e);
        return `[Error extracting DOCX: ${e.message}]`;
    }
};

// CSV Parser for Quiz Mode
export const parseCsvToQuiz = (file: File): Promise<Quiz | null> => {
    return new Promise(async (resolve) => {
        // 0. Binary Guard Check
        try {
            const buffer = await file.slice(0, 1024).arrayBuffer();
            const view = new Uint8Array(buffer);
            
            // OLE Compound File (XLS) signature
            if (view[0] === 0xD0 && view[1] === 0xCF && view[2] === 0x11 && view[3] === 0xE0) {
                 console.warn("Detected Binary Excel (XLS) file masked as CSV.");
                 resolve(null);
                 return;
            }

            if (isBinary(view)) {
                console.warn("Binary detected in CSV parser, aborting structured parse.");
                resolve(null);
                return;
            }
        } catch (e) {
            resolve(null);
            return;
        }

        Papa.parse(file, {
            header: false, // Read as raw array first to inspect layout
            skipEmptyLines: true,
            encoding: 'UTF-8',
            complete: (results) => {
                const rows = results.data as string[][];
                if (!rows || rows.length === 0) {
                    resolve(null); 
                    return;
                }

                // 1. Column Detection (Heuristic)
                let headerRowIdx = -1;
                const colMap = { q: -1, a: -1, b: -1, c: -1, d: -1, ans: -1, exp: -1 };
                
                const keywords = {
                    q: ['question', '题目', 'content', 'prompt', 'problem', 'stem', '题干', 'desc', 'q.'],
                    a: ['option a', 'choice a', 'op_a', '选项a', 'a.'],
                    b: ['option b', 'choice b', 'op_b', '选项b', 'b.'],
                    c: ['option c', 'choice c', 'op_c', '选项c', 'c.'],
                    d: ['option d', 'choice d', 'op_d', '选项d', 'd.'],
                    ans: ['answer', 'correct', 'ans', '答案', 'key', 'result'],
                    exp: ['explanation', '解析', 'reason', 'analysis']
                };

                // Scan first few rows for header keywords
                for (let i = 0; i < Math.min(rows.length, 10); i++) {
                    const row = rows[i].map(c => c?.toString().toLowerCase().trim());
                    // If row has "question" or just "q", highly likely a header
                    if (row.some(c => keywords.q.some(k => c.includes(k) || c === k))) {
                        headerRowIdx = i;
                        row.forEach((cell, idx) => {
                             if (keywords.q.some(k => cell.includes(k) || cell === k)) colMap.q = idx;
                             else if (keywords.a.some(k => cell === k || cell.includes(k))) colMap.a = idx;
                             else if (keywords.b.some(k => cell === k || cell.includes(k))) colMap.b = idx;
                             else if (keywords.c.some(k => cell === k || cell.includes(k))) colMap.c = idx;
                             else if (keywords.d.some(k => cell === k || cell.includes(k))) colMap.d = idx;
                             else if (keywords.ans.some(k => cell === k || cell.includes(k))) colMap.ans = idx;
                             else if (keywords.exp.some(k => cell === k || cell.includes(k))) colMap.exp = idx;
                        });
                        break;
                    }
                }

                // Fallback: Statistical Analysis
                if (colMap.q === -1) {
                    // Find column with max average length -> Question
                    let maxAvgLen = 0;
                    const numCols = rows[0].length;
                    
                    for(let c=0; c<numCols; c++) {
                         let totalLen = 0;
                         let populated = 0;
                         // Sample first 20 rows
                         for(let r=0; r<Math.min(rows.length, 20); r++) {
                             if(rows[r][c]) {
                                 totalLen += rows[r][c].toString().length;
                                 populated++;
                             }
                         }
                         const avg = populated > 0 ? totalLen / populated : 0;
                         if (avg > maxAvgLen && avg > 10) { // Require min length to avoid IDs
                             maxAvgLen = avg; 
                             colMap.q = c; 
                         }
                    }

                    // Heuristic for Options (A, B, C, D usually follow Q)
                    if (colMap.q !== -1) {
                         const nextCols = [colMap.q + 1, colMap.q + 2, colMap.q + 3, colMap.q + 4];
                         if (nextCols[0] < numCols) colMap.a = nextCols[0];
                         if (nextCols[1] < numCols) colMap.b = nextCols[1];
                         if (nextCols[2] < numCols) colMap.c = nextCols[2];
                         if (nextCols[3] < numCols) colMap.d = nextCols[3];
                    }
                }

                // If completely failed to find structure, fail so AI can handle raw text
                if (colMap.q === -1) {
                    resolve(null);
                    return;
                }

                const dataRows = headerRowIdx !== -1 ? rows.slice(headerRowIdx + 1) : rows;
                const questions: QuizQuestion[] = [];

                dataRows.forEach((row, idx) => {
                    const qText = row[colMap.q]?.trim();
                    if (!qText) return;

                    let options: string[] = [];
                    // Extract from columns if mapped
                    if (colMap.a > -1 && row[colMap.a]) options.push(row[colMap.a]);
                    if (colMap.b > -1 && row[colMap.b]) options.push(row[colMap.b]);
                    if (colMap.c > -1 && row[colMap.c]) options.push(row[colMap.c]);
                    if (colMap.d > -1 && row[colMap.d]) options.push(row[colMap.d]);

                    // If no column options, try parsing from question text
                    // Handles "1. Question... A. opt1 B. opt2"
                    if (options.length === 0) {
                        const regex = /(?:^|\s|\\n)([A-E])[\.\)]\s+(.*?)(?=(?:^|\s|\\n)[A-E][\.\)]|$)/gs;
                        const matches = [...qText.matchAll(regex)];
                        if (matches.length >= 2) {
                            options = matches.map(m => `${m[1]}. ${m[2].trim()}`);
                        }
                    }

                    questions.push({
                        id: `csv-${idx}`,
                        type: options.length > 0 ? 'single' : 'text',
                        question: qText,
                        options: options.length > 0 ? options : undefined,
                        correctAnswer: colMap.ans > -1 ? row[colMap.ans] : undefined,
                        explanation: colMap.exp > -1 ? row[colMap.exp] : undefined
                    });
                });

                if (questions.length > 0) {
                    resolve({
                        id: `imported-csv-${Date.now()}`,
                        title: file.name.replace(/\.[^/.]+$/, ""),
                        description: 'Imported from CSV',
                        questions: questions,
                        isGraded: false
                    });
                } else {
                    resolve(null);
                }
            },
            error: (err: any) => {
                console.warn("CSV Parse Error", err);
                resolve(null);
            }
        });
    });
};

export const parseJsonToQuiz = async (file: File): Promise<Quiz | null> => {
  try {
    const text = await file.text();
    let jsonString = text;

    // 1. Intelligent JSON Extraction
    // Check if the content is wrapped in a markdown code block (common for exported files)
    const codeBlockRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = text.match(codeBlockRegex);
    if (match && match[1]) {
        jsonString = match[1];
    } else {
        // Fallback: Try to find the outermost object structure if not in a code block
        const firstOpen = text.indexOf('{');
        const lastClose = text.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            jsonString = text.substring(firstOpen, lastClose + 1);
        }
    }

    let json: any;
    try {
        json = JSON.parse(jsonString);
    } catch (e) {
        console.error("JSON parse failed. File might be plain text or invalid format.", e);
        return null;
    }

    // 2. Structure Identification
    let questionsData: any[] = [];
    let title = file.name.replace(/\.[^/.]+$/, "");
    let description = "Imported from file";

    // Case A: Root is array
    if (Array.isArray(json)) {
        questionsData = json;
    } 
    // Case B: Root is object with 'questions' array (Standard Format)
    else if (json && typeof json === 'object') {
        if (Array.isArray(json.questions)) {
            questionsData = json.questions;
        }
        if (json.title) title = json.title;
        if (json.description) description = json.description;
    }

    if (questionsData.length === 0) return null;

    // 3. Strict Field Mapping & Validation
    const validQuestions: QuizQuestion[] = [];
    
    questionsData.forEach((q, idx) => {
        // Essential field: Question Text
        if (!q.question || typeof q.question !== 'string') return;

        const questionObj: QuizQuestion = {
            id: q.id || `imported-q-${Date.now()}-${idx}`,
            type: q.type || (Array.isArray(q.options) && q.options.length > 0 ? 'single' : 'text'),
            question: q.question,
            options: Array.isArray(q.options) ? q.options : undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            tags: Array.isArray(q.tags) ? q.tags : [],
            knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
            difficulty: q.difficulty // Optional
        };
        
        validQuestions.push(questionObj);
    });

    if (validQuestions.length === 0) return null;

    return {
        id: `quiz-imported-${Date.now()}`,
        title,
        description,
        questions: validQuestions,
        isGraded: false
    };

  } catch (e) {
    console.error("JSON Quiz Parse Error", e);
    return null;
  }
};

export const processPdfFile = async (file: File, apiKey?: string): Promise<string> => {
  try {
      const arrayBuffer = await file.arrayBuffer();
      const docInit = pdfjs.default?.getDocument ? pdfjs.default.getDocument : pdfjs.getDocument;
      const pdf = await docInit({ data: arrayBuffer }).promise;
      
      let fullText = "";
      let useVision = false;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Intelligent whitespace handling
        const pageText = textContent.items.map((item: any) => {
             // Basic join, relying on AI to fix flow later
             return item.str;
        }).join(" ");
        
        if (pageText.trim().length < 50 && apiKey) {
          useVision = true;
          if (apiKey) break; 
        }
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }

      if (useVision && apiKey) {
        fullText = ""; 
        const ai = new GoogleGenAI({ apiKey });
        
        // Process max 10 pages for Vision to save tokens/time
        for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context!, viewport: viewport }).promise;
          const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

          try {
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: {
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                  { text: "Extract text from this exam page verbatim. Preserve question numbers and options." }
                ]
              }
            });
            fullText += `--- Page ${i} (OCR) ---\n${response.text}\n\n`;
          } catch (e) {
            fullText += `[AI OCR Failed for Page ${i}]\n`;
          }
        }
      }

      return fullText;
  } catch (e: any) {
      console.error("PDF Process Error", e);
      return `[Error processing PDF: ${e.message}]`;
  }
};
