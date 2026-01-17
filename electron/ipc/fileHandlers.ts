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

            // Ensure parent directory exists before writing
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
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
            // Handle relative paths - convert to userData path
            let resolvedPath = dirPath;
            if (dirPath.startsWith('.memories') || dirPath === '.memories') {
                resolvedPath = path.join(ALLOWED_BASE_PATH, dirPath);
            }
            
            if (!fs.existsSync(resolvedPath)) {
                return [];
            }
            const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
            const files: any[] = [];
            for (const entry of entries) {
                if (entry.isFile()) {
                    const filePath = path.join(resolvedPath, entry.name);
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

    // Save pasted image to assets folder
    ipcMain.handle('image:save', async (_, options: { imageData: string; fileName?: string }) => {
        try {
            const { imageData, fileName } = options;

            // Create assets directory if it doesn't exist
            const assetsDir = path.join(ALLOWED_BASE_PATH, 'assets');
            if (!fs.existsSync(assetsDir)) {
                fs.mkdirSync(assetsDir, { recursive: true });
            }

            // Generate unique filename
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 8);
            const ext = getImageExtension(imageData);
            // Clean filename: remove spaces, special chars, non-ASCII characters
            const baseName = fileName
                ? path.basename(fileName, path.extname(fileName))
                    .replace(/[\s\u4e00-\u9fa5()[\]{}<>!@#$%^&*=+~`,;:'"\\|]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '')
                : 'image';
            const safeFileName = `${baseName}-${timestamp}-${randomId}${ext}`;
            const filePath = path.join(assetsDir, safeFileName);

            // Decode base64 data URL and save
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(filePath, buffer);

            // Return relative path for Markdown
            const relativePath = `assets/${safeFileName}`;
            logger.info('Image saved successfully', { filePath: relativePath });

            return {
                success: true,
                path: relativePath,
                fullPath: filePath
            };
        } catch (error) {
            logger.error('image:save failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    
    // Get image URL from relative path (for proper rendering in Electron)
    ipcMain.handle('image:getUrl', async (_, relativePath: string) => {
        try {
            // Handle data URLs directly
            if (relativePath.startsWith('data:')) {
                return { success: true, url: relativePath };
            }

            // Handle already absolute paths
            if (path.isAbsolute(relativePath)) {
                return { success: true, url: `file://${relativePath}` };
            }

            // Decode URL-encoded paths (e.g., %E5%B1%8F -> 屏)
            const decodedPath = decodeURIComponent(relativePath);

            // Build absolute path
            const assetsDir = path.join(ALLOWED_BASE_PATH, 'assets');
            let absolutePath: string;

            // Handle paths that already contain 'assets/' prefix
            if (decodedPath.startsWith('assets/')) {
                // Extract just the filename from 'assets/xxx.png'
                // assets/ 是 7 个字符 (索引 0-6)，所以从索引 7 开始取
                const fileName = decodedPath.substring(7);
                // Use path.join to properly join path components
                absolutePath = path.join(assetsDir, fileName);
            } else {
                // Use as-is (shouldn't normally happen)
                absolutePath = path.join(assetsDir, decodedPath);
            }

            // Normalize path separators
            absolutePath = path.normalize(absolutePath);

            logger.info('image:getUrl', {
                relativePath,
                decodedPath,
                assetsDir,
                absolutePath,
                exists: fs.existsSync(absolutePath)
            });

            // Validate path is within allowed directory
            if (!validateFilePath(absolutePath)) {
                return { success: false, error: 'Invalid path' };
            }

            // Check if file exists
            if (!fs.existsSync(absolutePath)) {
                return { success: false, error: 'File not found' };
            }

            // Read file and return as base64 data URL to avoid browser security restrictions
            const imageBuffer = fs.readFileSync(absolutePath);
            const mimeType = getMimeType(absolutePath);
            const base64Data = imageBuffer.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Data}`;

            return { success: true, url: dataUrl };
        } catch (error) {
            logger.error('image:getUrl failed', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    logger.info('File system IPC handlers registered');
}

/**
 * Get image extension from data URL or mime type
 */
function getImageExtension(dataUrl: string): string {
    if (dataUrl.startsWith('data:')) {
        const mimeType = dataUrl.split(';')[0];
        const mimeToExt: Record<string, string> = {
            'data:image/png': '.png',
            'data:image/jpeg': '.jpg',
            'data:image/jpg': '.jpg',
            'data:image/gif': '.gif',
            'data:image/webp': '.webp',
            'data:image/svg+xml': '.svg',
            'data:image/bmp': '.bmp',
        };
        return mimeToExt[mimeType] || '.png';
    }
    return '.png';
}

/**
 * Get mime type from file extension
 */
function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const extToMime: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
    };
    return extToMime[ext] || 'image/png';
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
