

import { MarkdownFile } from '../types';
import { GoogleGenAI } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure PDF.js Worker
// Handle ESM import inconsistencies (sometimes it's on .default, sometimes root)
const pdfjs: any = pdfjsLib;
if (typeof window !== 'undefined' && pdfjs) {
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  } else if (pdfjs.default && pdfjs.default.GlobalWorkerOptions) {
    pdfjs.default.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
}

declare global {
  interface Window {
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
  }
}

// Helper to read a directory recursively
export const readDirectory = async (
  dirHandle: FileSystemDirectoryHandle, 
  parentId: string = 'root'
): Promise<MarkdownFile[]> => {
  const files: MarkdownFile[] = [];
  
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.text();
      
      files.push({
        id: `${parentId}-${entry.name}`,
        name: entry.name.replace('.md', ''),
        content: content,
        lastModified: file.lastModified,
        handle: fileHandle,
        isLocal: true
      });
    } else if (entry.kind === 'directory') {
      // Optional: Recursion could go here
    }
  }
  return files;
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
  
  if (name.endsWith('.pdf')) {
    return processPdfFile(file, apiKey);
  } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
    return processDocxFile(file);
  } else if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.md')) {
    return await file.text();
  } else {
    throw new Error("Unsupported file format for text extraction.");
  }
};

const processDocxFile = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } catch (e: any) {
        throw new Error(`DOCX processing failed: ${e.message}`);
    }
};

// PDF Processing
export const processPdfFile = async (file: File, apiKey?: string): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Use the imported module, handling potential default export wrapper
  const docInit = pdfjs.default?.getDocument ? pdfjs.default.getDocument : pdfjs.getDocument;
  const pdf = await docInit({ data: arrayBuffer }).promise;
  
  let fullText = "";
  let useVision = false;

  // First pass: Try to extract text normally
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    
    // Heuristic: If page has very little text, it might be a scan/image
    if (pageText.trim().length < 50) {
      useVision = true;
      break;
    }
    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
  }

  // If detected as scan and we have an API Key, use Vision Model
  if (useVision && apiKey) {
    fullText = ""; // Reset
    const ai = new GoogleGenAI({ apiKey });
    
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) { // Limit to 5 pages
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context!, viewport: viewport }).promise;
      const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
              { text: "Transcribe the text in this document image to Markdown exactly." }
            ]
          }
        });
        fullText += `--- Page ${i} (OCR) ---\n${response.text}\n\n`;
      } catch (e) {
        console.error(`Error processing page ${i} with vision:`, e);
        fullText += `[Error processing page ${i} with AI Vision]\n`;
      }
    }
    if (pdf.numPages > 5) {
      fullText += `\n... (PDF truncated at 5 pages for efficiency in this demo) ...`;
    }
  } else if (useVision && !apiKey) {
    return "Error: This appears to be a scanned PDF. Please configure a Gemini API Key to use OCR capabilities.";
  }

  return fullText;
};
