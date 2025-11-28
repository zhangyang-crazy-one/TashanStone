
import { MarkdownFile } from '../types';
import { GoogleGenAI } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js Worker using the ESM build + minified worker script
// We use .mjs to match the ESM module type of the main library to prevent "Failed to fetch dynamically imported module" errors
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

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

// PDF Processing
export const processPdfFile = async (file: File, apiKey?: string): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Use the imported module instead of window.pdfjsLib
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
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
