

import React, { forwardRef, useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { AppShortcut } from '../types';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onScroll?: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  shortcuts?: AppShortcut[];
}

export const Editor = forwardRef<HTMLTextAreaElement, EditorProps>(({ content, onChange, onUndo, onRedo, onScroll, shortcuts = [] }, ref) => {
  const [isDragging, setIsDragging] = useState(false);

  // --- Text Manipulation Helpers ---

  const getLineRange = (value: string, index: number) => {
    const start = value.lastIndexOf('\n', index - 1) + 1;
    let end = value.indexOf('\n', index);
    if (end === -1) end = value.length;
    return { start, end };
  };

  const insertText = (textarea: HTMLTextAreaElement, text: string, cursorOffset = 0) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const newVal = val.substring(0, start) + text + val.substring(end);
    onChange(newVal);
    
    // Defer cursor update to next tick to allow render
    setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length + cursorOffset;
    }, 0);
  };

  const wrapSelection = (textarea: HTMLTextAreaElement, wrapper: string, wrapperEnd?: string) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.substring(start, end);
    const wEnd = wrapperEnd || wrapper;
    
    const newVal = val.substring(0, start) + wrapper + selected + wEnd + val.substring(end);
    onChange(newVal);

    setTimeout(() => {
        if (selected.length > 0) {
            textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
        } else {
            textarea.setSelectionRange(start + wrapper.length, start + wrapper.length);
        }
    }, 0);
  };

  const setHeading = (textarea: HTMLTextAreaElement, level: number) => {
    const start = textarea.selectionStart;
    const val = textarea.value;
    const { start: lineStart, end: lineEnd } = getLineRange(val, start);
    const lineText = val.substring(lineStart, lineEnd);
    
    let newLineText = lineText.replace(/^#+\s*/, ''); // remove existing
    if (level > 0) {
        newLineText = '#'.repeat(level) + ' ' + newLineText;
    }
    
    const newVal = val.substring(0, lineStart) + newLineText + val.substring(lineEnd);
    onChange(newVal);
    
    // Restore cursor position relative to line start, adjusting for added chars
    const diff = newLineText.length - lineText.length;
    setTimeout(() => {
        textarea.setSelectionRange(start + diff, start + diff);
    }, 0);
  };

  const toggleLinePrefix = (textarea: HTMLTextAreaElement, prefix: string) => {
    const start = textarea.selectionStart;
    const val = textarea.value;
    const { start: lineStart, end: lineEnd } = getLineRange(val, start);
    const lineText = val.substring(lineStart, lineEnd);
    
    let newLineText = lineText;
    if (lineText.trim().startsWith(prefix.trim())) {
        // Remove
        newLineText = lineText.replace(prefix, '');
        // If regex didn't catch due to spacing, try simpler replace
        if (newLineText === lineText) newLineText = lineText.replace(prefix.trim() + ' ', '');
    } else {
        // Add
        newLineText = prefix + lineText;
    }
    
    const newVal = val.substring(0, lineStart) + newLineText + val.substring(lineEnd);
    onChange(newVal);
    setTimeout(() => textarea.setSelectionRange(start + (newLineText.length - lineText.length), start + (newLineText.length - lineText.length)), 0);
  };

  // --- Main Key Handler ---

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    
    // --- 1. Special Handling: Table Navigation (Tab) ---
    // We check this before general shortcuts because Tab is often "Indent" in shortcuts
    if (e.key === 'Tab') {
        const start = textarea.selectionStart;
        const { start: lineStart, end: lineEnd } = getLineRange(textarea.value, start);
        const line = textarea.value.substring(lineStart, lineEnd);
        
        // If line looks like a table row (has pipes)
        if (line.trim().startsWith('|')) {
            e.preventDefault();
            const currentLineRelativePos = start - lineStart;
            
            if (e.shiftKey) {
                // Move Back
                const prevPipeIdx = line.lastIndexOf('|', currentLineRelativePos - 2);
                if (prevPipeIdx !== -1) {
                    // Try to find the pipe before that one to jump to content
                    const prevPrevPipeIdx = line.lastIndexOf('|', prevPipeIdx - 1);
                    if (prevPrevPipeIdx !== -1) {
                        textarea.setSelectionRange(lineStart + prevPrevPipeIdx + 2, lineStart + prevPrevPipeIdx + 2);
                    } else {
                        // Start of line
                        textarea.setSelectionRange(lineStart + prevPipeIdx + 2, lineStart + prevPipeIdx + 2); 
                    }
                }
            } else {
                // Move Forward
                const nextPipeIdx = line.indexOf('|', currentLineRelativePos);
                if (nextPipeIdx !== -1 && nextPipeIdx < line.length - 1) {
                    textarea.setSelectionRange(lineStart + nextPipeIdx + 2, lineStart + nextPipeIdx + 2);
                } else {
                    // If last pipe, maybe move to next line? For now, standard behavior implies stay or simple tab.
                    // We'll insert a pipe? The request says "Navigate". 
                    // Let's create a new row if at end of line?
                    if (currentLineRelativePos > line.lastIndexOf('|')) {
                         // End of row, Tab -> New Row
                         insertText(textarea, '\n|  |  |');
                    }
                }
            }
            return;
        }
    }

    // --- 2. Smart Lists & Enter ---
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        const start = textarea.selectionStart;
        const val = textarea.value;
        const { start: lineStart } = getLineRange(val, start);
        const lineText = val.substring(lineStart, start); // Text up to cursor

        // Horizontal Rule Detection (--- or ***)
        if (lineText.trim() === '---' || lineText.trim() === '***') {
            // Do default behavior (newline), but ensure we don't accidentally trigger list logic if there was a dash
            return; 
        }

        // Regex for unordered list
        const ulMatch = lineText.match(/^(\s*)([-*+])\s+(.*)/);
        // Regex for ordered list
        const olMatch = lineText.match(/^(\s*)(\d+)\.\s+(.*)/);

        if (ulMatch) {
            e.preventDefault();
            // If empty list item (just marker), clear line (enter twice to exit list)
            if (!ulMatch[3].trim()) {
                const newVal = val.substring(0, lineStart) + val.substring(start);
                onChange(newVal);
                setTimeout(() => textarea.setSelectionRange(lineStart, lineStart), 0);
            } else {
                // Continue list
                const indent = ulMatch[1];
                const marker = ulMatch[2];
                insertText(textarea, `\n${indent}${marker} `);
            }
            return;
        }

        if (olMatch) {
            e.preventDefault();
            if (!olMatch[3].trim()) {
                const newVal = val.substring(0, lineStart) + val.substring(start);
                onChange(newVal);
                setTimeout(() => textarea.setSelectionRange(lineStart, lineStart), 0);
            } else {
                const indent = olMatch[1];
                const num = parseInt(olMatch[2], 10);
                insertText(textarea, `\n${indent}${num + 1}. `);
            }
            return;
        }
    }

    // --- 3. Shortcut Handling ---
    
    // Construct key combo string
    const combo = [
      e.ctrlKey ? 'Ctrl' : '',
      e.metaKey ? 'Cmd' : '',
      e.altKey ? 'Alt' : '',
      e.shiftKey ? 'Shift' : '',
      e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
    ].filter(Boolean).join('+');

    // Find matching action from config
    const action = shortcuts.find(s => s.keys.toUpperCase() === combo.toUpperCase());

    if (action) {
        e.preventDefault();
        e.stopPropagation();

        switch (action.actionId) {
            case 'format_bold': wrapSelection(textarea, '**'); break;
            case 'format_italic': wrapSelection(textarea, '*'); break;
            case 'format_strike': wrapSelection(textarea, '~~'); break;
            case 'format_code_inline': wrapSelection(textarea, '`'); break;
            case 'format_blockquote': toggleLinePrefix(textarea, '> '); break;
            case 'format_code_block': wrapSelection(textarea, '```\n', '\n```'); break;
            
            case 'format_h1': setHeading(textarea, 1); break;
            case 'format_h2': setHeading(textarea, 2); break;
            case 'format_h3': setHeading(textarea, 3); break;
            case 'format_h4': setHeading(textarea, 4); break;
            case 'format_h5': setHeading(textarea, 5); break;
            case 'format_h6': setHeading(textarea, 6); break;
            case 'format_p': setHeading(textarea, 0); break;

            case 'list_ul': toggleLinePrefix(textarea, '- '); break;
            case 'list_ol': toggleLinePrefix(textarea, '1. '); break; 
            
            case 'indent': 
                insertText(textarea, '  '); 
                break;
            case 'outdent':
                const start = textarea.selectionStart;
                const { start: lineStart, end: lineEnd } = getLineRange(textarea.value, start);
                const line = textarea.value.substring(lineStart, lineEnd);
                if (line.startsWith('  ')) {
                    const newVal = textarea.value.substring(0, lineStart) + line.substring(2) + textarea.value.substring(lineEnd);
                    onChange(newVal);
                    setTimeout(() => textarea.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, start - 2)), 0);
                } else if (line.startsWith('\t')) {
                     const newVal = textarea.value.substring(0, lineStart) + line.substring(1) + textarea.value.substring(lineEnd);
                     onChange(newVal);
                     setTimeout(() => textarea.setSelectionRange(Math.max(lineStart, start - 1), Math.max(lineStart, start - 1)), 0);
                }
                break;
                
            case 'table_add_row':
                insertText(textarea, '\n|  |  |');
                break;

            case 'undo': onUndo?.(); break;
            case 'redo': onRedo?.(); break;
        }
        return;
    }

    // Default Undo/Redo fallback (standard OS behavior usually works, but explicit support is good)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo?.();
        else onUndo?.();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo?.();
        return;
    }
  };

  // --- Multimedia Handling ---

  const compressImage = async (file: File): Promise<string> => {
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
              const img = new Image();
              img.src = event.target?.result as string;
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  
                  // Max dimensions
                  const MAX_WIDTH = 1024;
                  const MAX_HEIGHT = 1024;
                  let width = img.width;
                  let height = img.height;

                  if (width > height) {
                      if (width > MAX_WIDTH) {
                          height *= MAX_WIDTH / width;
                          width = MAX_WIDTH;
                      }
                  } else {
                      if (height > MAX_HEIGHT) {
                          width *= MAX_HEIGHT / height;
                          height = MAX_HEIGHT;
                      }
                  }

                  canvas.width = width;
                  canvas.height = height;
                  ctx?.drawImage(img, 0, 0, width, height);
                  
                  // Compress to JPEG 0.7 quality
                  resolve(canvas.toDataURL('image/jpeg', 0.7));
              };
          };
      });
  };

  const processFile = async (file: File, textarea: HTMLTextAreaElement) => {
      let insertion = '';
      
      if (file.type.startsWith('image/')) {
          const base64 = await compressImage(file);
          // Sanitize filename to prevent Markdown link breakage if it contains brackets
          const safeName = file.name.replace(/[\[\]]/g, '_');
          insertion = `\n![${safeName}](${base64})\n`;
      } else if (file.type === 'application/pdf') {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const base64 = reader.result as string;
              // Use embed tag for PDF
              insertion = `\n<embed src="${base64}" width="100%" height="600px" type="application/pdf" />\n`;
              insertText(textarea, insertion);
          };
          return; // Async handle
      } else if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const base64 = reader.result as string;
              if (file.type.startsWith('video/')) {
                   insertion = `\n<video controls width="100%" src="${base64}"></video>\n`;
              } else {
                   insertion = `\n<audio controls src="${base64}"></audio>\n`;
              }
              insertText(textarea, insertion);
          };
          return;
      } else {
          // Default: Link
          insertion = `\n[${file.name}](File_Content_Not_Embedded)\n`;
      }

      insertText(textarea, insertion);
  };

  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      setIsDragging(false);
      
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const textarea = e.currentTarget;
      
      for (const file of files) {
          await processFile(file, textarea);
      }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const textarea = e.currentTarget;

      for (const item of items) {
          if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file) {
                  e.preventDefault(); // Prevent default paste of file name
                  await processFile(file, textarea);
              }
          }
      }
  };

  return (
    <div className="h-full w-full bg-paper-100 dark:bg-cyber-800 relative group transition-colors duration-300">
      {isDragging && (
          <div className="absolute inset-0 z-20 bg-cyan-500/10 backdrop-blur-sm border-2 border-dashed border-cyan-500 flex flex-col items-center justify-center text-cyan-600 dark:text-cyan-400 pointer-events-none">
              <UploadCloud size={48} className="mb-2" />
              <p className="font-bold text-lg">Drop media here</p>
              <p className="text-sm opacity-80">Images will be compressed automatically</p>
          </div>
      )}
      <textarea
        ref={ref}
        className="w-full h-full p-8 bg-transparent text-slate-800 dark:text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-0 custom-scrollbar overflow-y-auto selection:bg-cyan-200 dark:selection:bg-cyber-500/30 placeholder-slate-400 dark:placeholder-slate-600"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={onScroll}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onPaste={handlePaste}
        placeholder="Type Markdown here... Drag & Drop images/PDFs supported."
        spellCheck={false}
      />
      <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono pointer-events-none bg-white/80 dark:bg-cyber-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-200 dark:border-white/5 transition-colors">
        {content.length} chars
      </div>
    </div>
  );
});

Editor.displayName = 'Editor';
