import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Get the user data directory for storing app data
 * - Windows: %APPDATA%\TashanStone
 * - macOS: ~/Library/Application Support/TashanStone
 * - Linux: ~/.config/TashanStone
 */
export function getUserDataPath(): string {
    return app.getPath('userData');
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
    return path.join(getUserDataPath(), 'neonmark.db');
}

/**
 * Ensure the user data directory exists
 */
export function ensureUserDataDir(): void {
    const userDataPath = getUserDataPath();
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }
}

/**
 * Get the logs directory path
 */
export function getLogsPath(): string {
    return path.join(getUserDataPath(), 'logs');
}

/**
 * Ensure the logs directory exists
 */
export function ensureLogsDir(): void {
    const logsPath = getLogsPath();
    if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
    }
}
