import { ipcMain, dialog, net, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

import type { MarkdownFile } from '../database/repositories/fileRepository.js';

// Get the allowed base directory (userData)
const ALLOWED_BASE_PATH = app.getPath('userData');

/**
 * Validate that a file path is within the allowed directory
 * This prevents directory traversal attacks (e.g., ../../../etc/passwd)
 * @param filePath The file path to validate
 * @returns true if path is safe, false otherwise
 */
function validateFilePath(filePath: string): boolean {
    try {
        const resolvedPath = path.resolve(filePath);
        const basePath = path.resolve(ALLOWED_BASE_PATH);

        // Check if the resolved path is within the allowed base path
        const isWithinBase = resolvedPath.startsWith(basePath);

        if (!isWithinBase) {
            logger.warn('Path validation failed - path outside allowed directory', {
                filePath,
                resolvedPath,
                basePath
            });
            return false;
        }

        return true;
    } catch (error) {
        logger.error('Path validation error', error);
        return false;
    }
}

/**
 * Validate that a directory path is within the allowed directory
 * @param dirPath The directory path to validate
 * @returns true if path is safe, false otherwise
 */
function validateDirPath(dirPath: string): boolean {
    try {
        const resolvedPath = path.resolve(dirPath);
        const basePath = path.resolve(ALLOWED_BASE_PATH);

        // For directories, allow user-selected paths (dialog-based)
        // but still validate for read/write operations
        const isWithinBase = resolvedPath.startsWith(basePath);

        if (!isWithinBase) {
            logger.warn('Directory path validation failed - path outside allowed directory', {
                dirPath,
                resolvedPath,
                basePath
            });
            return false;
        }

        return true;
    } catch (error) {
        logger.error('Directory path validation error', error);
        return false;
    }
}

export interface FileFilter {
    name: string;
    extensions: string[];
}

export function registerFileHandlers(): void {
    logger.info('Registering file system IPC handlers');

    // Open directory picker and read markdown files
    ipcMain.handle('fs:openDirectory', async () => {
        try {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory']
            });

            if (result.canceled || !result.filePaths[0]) {
                return null;
            }

            const dirPath = result.filePaths[0];
            const files = await readMarkdownDirectory(dirPath);

            return {
                path: dirPath,
                files
            };
        } catch (error) {
            logger.error('fs:openDirectory failed', error);
            throw error;
        }
    });

    // Read a single file
    ipcMain.handle('fs:readFile', async (_, filePath: string) => {
        try {
            // Validate path is within allowed directory
            if (!validateFilePath(filePath)) {
                throw new Error('Access denied: file path outside allowed directory');
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            return content;
        } catch (error) {
            logger.error('fs:readFile failed', error);
            throw error;
        }
    });

    // Write content to a file
    ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
        try {
            // Validate path is within allowed directory
            if (!validateFilePath(filePath)) {
                throw new Error('Access denied: file path outside allowed directory');
            }

            fs.writeFileSync(filePath, content, 'utf-8');
            return true;
        } catch (error) {
            logger.error('fs:writeFile failed', error);
            throw error;
        }
    });

    // Delete a file
    ipcMain.handle('fs:deleteFile', async (_, filePath: string) => {
        try {
            // Validate path is within allowed directory
            if (!validateFilePath(filePath)) {
                throw new Error('Access denied: file path outside allowed directory');
            }

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
            return false;
        } catch (error) {
            logger.error('fs:deleteFile failed', error);
            throw error;
        }
    });

    // Ensure directory exists
    ipcMain.handle('fs:ensureDir', async (_, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            return true;
        } catch (error) {
            logger.error('fs:ensureDir failed', error);
            throw error;
        }
    });

    // List files in a directory
    ipcMain.handle('fs:listFiles', async (_, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) {
                return [];
            }
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const files: any[] = [];
            for (const entry of entries) {
                if (entry.isFile()) {
                    const filePath = path.join(dirPath, entry.name);
                    const stats = fs.statSync(filePath);
                    files.push({
                        name: entry.name,
                        path: filePath,
                        size: stats.size,
                        lastModified: stats.mtimeMs,
                    });
                }
            }
            return files;
        } catch (error) {
            logger.error('fs:listFiles failed', error);
            throw error;
        }
    });

    // Select a file with optional filters
    ipcMain.handle('fs:selectFile', async (_, filters?: FileFilter[]) => {
        try {
            const result = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: filters || [
                    { name: 'Markdown Files', extensions: ['md', 'markdown'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePaths[0]) {
                return null;
            }

            const filePath = result.filePaths[0];
            const content = fs.readFileSync(filePath, 'utf-8');

            return {
                path: filePath,
                content
            };
        } catch (error) {
            logger.error('fs:selectFile failed', error);
            throw error;
        }
    });

    // Save file with dialog
    ipcMain.handle('fs:saveFileAs', async (_, content: string, defaultName: string) => {
        try {
            const result = await dialog.showSaveDialog({
                defaultPath: defaultName,
                filters: [
                    { name: 'Markdown Files', extensions: ['md'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePath) {
                return null;
            }

            fs.writeFileSync(result.filePath, content, 'utf-8');
            return result.filePath;
        } catch (error) {
            logger.error('fs:saveFileAs failed', error);
            throw error;
        }
    });

    // Select PDF file
    ipcMain.handle('fs:selectPdf', async () => {
        try {
            const result = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [
                    { name: 'PDF Files', extensions: ['pdf'] }
                ]
            });

            if (result.canceled || !result.filePaths[0]) {
                return null;
            }

            const filePath = result.filePaths[0];
            const buffer = fs.readFileSync(filePath);

            return {
                path: filePath,
                name: path.basename(filePath, '.pdf'),
                buffer: buffer.toString('base64')  // Send as base64 for renderer
            };
        } catch (error) {
            logger.error('fs:selectPdf failed', error);
            throw error;
        }
    });

    // Open file path in system file explorer
    ipcMain.handle('fs:openPath', async (_, filePath: string) => {
        try {
            const { shell } = await import('electron');
            await shell.showItemInFolder(path.resolve(filePath));
            return true;
        } catch (error) {
            logger.error('fs:openPath failed', { filePath, error });
            return false;
        }
    });

    logger.info('File system IPC handlers registered');
}

/**
 * Read all markdown files from a directory
 */
async function readMarkdownDirectory(dirPath: string): Promise<MarkdownFile[]> {
    const files: MarkdownFile[] = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
            const filePath = path.join(dirPath, entry.name);
            const content = fs.readFileSync(filePath, 'utf-8');
            const stats = fs.statSync(filePath);

            files.push({
                id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: entry.name.replace(/\.(md|markdown)$/, ''),
                content,
                lastModified: stats.mtimeMs,
                filePath,
                isLocal: true
            });
        }
    }

    return files;
}
