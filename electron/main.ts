import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase, closeDatabase } from './database/index.js';
import { MigrationManager, migrations } from './database/migrations.js';
import { registerAllHandlers } from './ipc/index.js';
import { registerMCPHandlers } from './mcp/handlers.js';
import { registerContextHandlers } from './ipc/contextHandlers.js';
import { initLanceDB } from './lancedb/index.js';
import { mcpManager } from './mcp/index.js';
import { logger } from './utils/logger.js';
import { themeRepository } from './database/repositories/themeRepository.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default built-in themes
const DEFAULT_THEMES = [
    {
        id: 'neon-cyber',
        name: 'Neon Cyber',
        type: 'dark' as const,
        colors: {
            '--bg-main': '15 23 42',
            '--bg-panel': '30 41 59',
            '--bg-element': '51 65 85',
            '--border-main': '71 85 105',
            '--text-primary': '248 250 252',
            '--text-secondary': '148 163 184',
            '--primary-500': '6 182 212',
            '--primary-600': '8 145 178',
            '--secondary-500': '139 92 246',
            '--neutral-50': '248 250 252',
            '--neutral-100': '241 245 249',
            '--neutral-200': '226 232 240',
            '--neutral-300': '203 213 225',
            '--neutral-400': '148 163 184',
            '--neutral-500': '100 116 139',
            '--neutral-600': '71 85 105',
            '--neutral-700': '51 65 85',
            '--neutral-800': '30 41 59',
            '--neutral-900': '15 23 42'
        }
    },
    {
        id: 'clean-paper',
        name: 'Clean Paper',
        type: 'light' as const,
        colors: {
            '--bg-main': '255 255 255',
            '--bg-panel': '249 250 251',
            '--bg-element': '243 244 246',
            '--border-main': '229 231 235',
            '--text-primary': '17 24 39',
            '--text-secondary': '107 114 128',
            '--primary-500': '59 130 246',
            '--primary-600': '37 99 235',
            '--secondary-500': '99 102 241',
            '--neutral-50': '249 250 251',
            '--neutral-100': '243 244 246',
            '--neutral-200': '229 231 235',
            '--neutral-300': '209 213 219',
            '--neutral-400': '156 163 175',
            '--neutral-500': '107 114 128',
            '--neutral-600': '75 85 99',
            '--neutral-700': '55 65 81',
            '--neutral-800': '31 41 55',
            '--neutral-900': '17 24 39'
        }
    },
    {
        id: 'midnight-dracula',
        name: 'Midnight Dracula',
        type: 'dark' as const,
        colors: {
            '--bg-main': '40 42 54',
            '--bg-panel': '68 71 90',
            '--bg-element': '98 114 164',
            '--border-main': '68 71 90',
            '--text-primary': '248 248 242',
            '--text-secondary': '98 114 164',
            '--primary-500': '189 147 249',
            '--primary-600': '139 233 253',
            '--secondary-500': '255 121 198',
            '--neutral-50': '248 248 242',
            '--neutral-100': '225 225 220',
            '--neutral-200': '189 189 184',
            '--neutral-300': '152 152 148',
            '--neutral-400': '130 133 156',
            '--neutral-500': '98 114 164',
            '--neutral-600': '68 71 90',
            '--neutral-700': '54 57 72',
            '--neutral-800': '40 42 54',
            '--neutral-900': '30 32 42'
        }
    },
    {
        id: 'solarized-dawn',
        name: 'Solarized Dawn',
        type: 'light' as const,
        colors: {
            '--bg-main': '253 246 227',
            '--bg-panel': '238 232 213',
            '--bg-element': '147 161 161',
            '--border-main': '147 161 161',
            '--text-primary': '101 123 131',
            '--text-secondary': '88 110 117',
            '--primary-500': '38 139 210',
            '--primary-600': '42 161 152',
            '--secondary-500': '203 75 22',
            '--neutral-50': '253 246 227',
            '--neutral-100': '238 232 213',
            '--neutral-200': '210 205 186',
            '--neutral-300': '147 161 161',
            '--neutral-400': '131 148 150',
            '--neutral-500': '101 123 131',
            '--neutral-600': '88 110 117',
            '--neutral-700': '73 91 95',
            '--neutral-800': '7 54 66',
            '--neutral-900': '0 43 54'
        }
    }
];

let mainWindow: BrowserWindow | null = null;

// Use app.isPackaged as the primary check - it's the most reliable
const isDev = !app.isPackaged;

// Get icon path based on platform and environment
function getIconPath(): string {
    const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
    if (isDev) {
        // In dev mode, use the build directory
        // __dirname is dist-electron/electron/, so go up 2 levels to reach project root
        return path.join(__dirname, '..', '..', 'build', iconName);
    } else {
        // In production, icons are in resources
        return path.join(process.resourcesPath, iconName);
    }
}

function createWindow(): void {
    logger.info('Creating main window', { isDev });

    const iconPath = getIconPath();
    logger.info('Using icon', { iconPath });

    const preloadPath = path.join(__dirname, 'preload.cjs');
    logger.info('Preload script path', { preloadPath, __dirname });

    // Check if preload file exists
    const preloadExists = fs.existsSync(preloadPath);
    logger.info('Preload file exists', { preloadExists });

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        icon: iconPath,
        center: true,  // 强制窗口居中
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false  // Required for better-sqlite3
        },
        // Use frameless window for custom title bar on all platforms
        frame: false,
        show: true,
        backgroundColor: '#0f172a'
    });

    // Build menu
    const menu = Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [
                { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:newFile') },
                { type: 'separator' },
                { label: 'Open Folder', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:openFolder') },
                { label: 'Import File', accelerator: 'CmdOrCtrl+I', click: () => mainWindow?.webContents.send('menu:importFile') },
                { type: 'separator' },
                { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:save') },
                { label: 'Export', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('menu:export') },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu:toggleSidebar') },
                { label: 'Toggle Chat', accelerator: 'CmdOrCtrl+J', click: () => mainWindow?.webContents.send('menu:toggleChat') },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { role: 'close' }
            ]
        }
    ]);

    Menu.setApplicationMenu(menu);

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    // Load the app
    if (isDev) {
        // Support dynamic Vite port via environment variable
        const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
        mainWindow.loadURL(viteUrl);
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App lifecycle
app.whenReady().then(() => {
    logger.initialize();
    logger.info('App starting', { version: app.getVersion() });

    // Initialize database
    const db = initializeDatabase();

    // Run migrations
    try {
        logger.info('Checking for database migrations');
        const migrationManager = new MigrationManager(db);

        // Register all migrations
        migrationManager.registerAll(migrations);

        // Validate migrations
        const validation = migrationManager.validate();
        if (!validation.valid) {
            logger.error('Migration validation failed', { errors: validation.errors });
            throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
        }

        // Run migrations
        const appliedCount = migrationManager.migrateToLatest();
        if (appliedCount > 0) {
            logger.info('Migrations applied', { count: appliedCount });
        }

        // Log migration history
        const history = migrationManager.getHistory();
        logger.debug('Migration history', { history });
    } catch (error) {
        logger.error('Migration failed', error);
        // 迁移失败时，应用继续运行但记录错误
        // 可以考虑添加用户通知
    }

    // Initialize built-in themes
    themeRepository.initializeBuiltinThemes(DEFAULT_THEMES);

    // Initialize LanceDB (使用立即执行的异步函数)
    (async () => {
        try {
            logger.info('Initializing LanceDB');
            await initLanceDB();
            logger.info('LanceDB initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize LanceDB', error);
            // LanceDB 初始化失败不阻止应用启动
        }
    })();

    // Register IPC handlers
    registerAllHandlers();  // This already includes registerLanceDBHandlers()
    registerMCPHandlers();
    // Note: registerLanceDBHandlers() is called inside registerAllHandlers()
    registerContextHandlers();

    // Window control IPC handlers
    ipcMain.handle('window:minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.handle('window:maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });

    ipcMain.handle('window:close', () => {
        mainWindow?.close();
    });

    ipcMain.handle('window:isMaximized', () => {
        return mainWindow?.isMaximized() ?? false;
    });

    // Create window
    createWindow();

    // Listen for maximize/unmaximize events to notify renderer (after window created)
    mainWindow?.on('maximize', () => {
        mainWindow?.webContents.send('window:maximized', true);
    });

    mainWindow?.on('unmaximize', () => {
        mainWindow?.webContents.send('window:maximized', false);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Disconnect all MCP servers
    mcpManager.disconnectAll().catch(error => {
        logger.error('Failed to disconnect MCP servers on quit:', error);
    });

    // Close database
    closeDatabase();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
});
