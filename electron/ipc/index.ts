import { registerDbHandlers } from './dbHandlers.js';
import { registerFileHandlers } from './fileHandlers.js';
import { registerAiHandlers } from './aiHandlers.js';
import { registerBackupHandlers } from './backupHandlers.js';
import { registerWhisperHandlers } from './whisperHandlers.js';
import { registerSherpaHandlers } from './sherpaHandlers.js';
import { logger } from '../utils/logger.js';

export function registerAllHandlers(): void {
    logger.info('Registering all IPC handlers');

    registerDbHandlers();
    registerFileHandlers();
    registerAiHandlers();
    registerBackupHandlers();
    registerWhisperHandlers();
    registerSherpaHandlers();

    logger.info('All IPC handlers registered');
}

export { registerDbHandlers } from './dbHandlers.js';
export { registerFileHandlers } from './fileHandlers.js';
export { registerAiHandlers } from './aiHandlers.js';
export { registerBackupHandlers } from './backupHandlers.js';
export { registerWhisperHandlers } from './whisperHandlers.js';
export { registerSherpaHandlers } from './sherpaHandlers.js';
