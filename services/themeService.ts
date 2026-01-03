

import { AppTheme } from '../types';

export const DEFAULT_THEMES: AppTheme[] = [
  {
    id: 'neon-cyber',
    name: 'Neon Cyber',
    type: 'dark',
    colors: {
      '--bg-main': '11 17 33',       // #0b1121
      '--bg-panel': '21 30 50',      // #151e32
      '--bg-element': '42 59 85',    // #2a3b55
      '--border-main': '42 59 85',   // #2a3b55
      '--text-primary': '203 213 225',
      '--text-secondary': '148 163 184',
      '--primary-500': '6 182 212',  // cyan-500
      '--primary-600': '34 211 238', // cyan-400
      '--secondary-500': '139 92 246', // violet-500

      '--neutral-50': '248 250 252',
      '--neutral-100': '241 245 249',
      '--neutral-200': '226 232 240',
      '--neutral-300': '203 213 225',
      '--neutral-400': '148 163 184',
      '--neutral-500': '100 116 139',
      '--neutral-600': '71 85 105',
      '--neutral-700': '51 65 85',
      '--neutral-800': '30 41 59',
      '--neutral-900': '15 23 42',

      '--font-primary': '"Inter", "Noto Sans SC", sans-serif',
      '--font-header': '"Inter", "Noto Sans SC", sans-serif',
    }
  },
  {
    id: 'clean-paper',
    name: 'Clean Paper',
    type: 'light',
    colors: {
      '--bg-main': '248 250 252',    // paper-50 (#f8fafc)
      '--bg-panel': '241 245 249',   // paper-100 (#f1f5f9)
      '--bg-element': '226 232 240', // paper-200 (#e2e8f0)
      '--border-main': '226 232 240',
      '--text-primary': '30 41 59',
      '--text-secondary': '100 116 139',
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
      '--neutral-900': '15 23 42',

      '--font-primary': '"Inter", "Noto Sans SC", sans-serif',
      '--font-header': '"Inter", "Noto Sans SC", sans-serif',
    }
  },
  {
    id: 'sketch-notebook',
    name: 'Sketchbook',
    type: 'light',
    colors: {
      '--bg-main': '253 251 247',    // Cream paper
      '--bg-panel': '255 255 255',   // White overlay
      '--bg-element': '245 242 235', // Slightly darker cream
      '--border-main': '229 221 208', // sketch line color
      '--text-primary': '43 43 43',   // Ink Black/Grey
      '--text-secondary': '85 85 85', // Pencil Grey
      '--primary-500': '59 130 246',  // Blue Pen
      '--primary-600': '37 99 235',   // Darker Blue Pen
      '--secondary-500': '245 158 11', // Highlighter Orange/Yellow

      '--neutral-50': '253 251 247',
      '--neutral-100': '255 255 255',
      '--neutral-200': '245 242 235',
      '--neutral-300': '156 163 175',
      '--neutral-400': '107 114 128',
      '--neutral-500': '75 85 99',
      '--neutral-600': '55 65 81',
      '--neutral-700': '43 43 43',
      '--neutral-800': '43 43 43',
      '--neutral-900': '17 24 39',

      '--font-primary': '"Ma Shan Zheng", "Noto Serif SC", cursive',
      '--font-header': '"Ma Shan Zheng", "Noto Serif SC", cursive',
    }
  },
  {
    id: 'midnight-dracula',
    name: 'Midnight Dracula',
    type: 'dark',
    colors: {
      '--bg-main': '40 42 54',       // #282a36 (Dracula Background)
      '--bg-panel': '68 71 90',      // #44475a (Current Line)
      '--bg-element': '98 114 164',  // #6272a4 (Comment)
      '--border-main': '98 114 164',
      '--text-primary': '248 248 242', // Foreground
      '--text-secondary': '189 147 249', // Purple
      '--primary-500': '255 121 198',  // Pink
      '--primary-600': '255 85 85',    // Red (for hover/contrast)
      '--secondary-500': '139 233 253', // Cyan

      '--neutral-50': '248 248 242',
      '--neutral-100': '248 248 242',
      '--neutral-200': '248 248 242',
      '--neutral-300': '248 248 242', // Text color in dark mode
      '--neutral-400': '189 147 249',
      '--neutral-500': '98 114 164',
      '--neutral-600': '68 71 90',
      '--neutral-700': '40 42 54',
      '--neutral-800': '40 42 54',
      '--neutral-900': '25 25 35',

      '--font-primary': '"Inter", "Noto Sans SC", sans-serif',
      '--font-header': '"Inter", "Noto Sans SC", sans-serif',
    }
  },
  {
    id: 'solarized-dawn',
    name: 'Solarized Dawn',
    type: 'light',
    colors: {
      '--bg-main': '253 246 227',    // #fdf6e3 (Base3)
      '--bg-panel': '238 232 213',   // #eee8d5 (Base2)
      '--bg-element': '211 204 187', // #d3ccbb (Base2 darkened)
      '--border-main': '211 204 187',
      '--text-primary': '101 123 131', // #657b83 (Base00)
      '--text-secondary': '147 161 161', // #93a1a1 (Base1)
      '--primary-500': '38 139 210',   // #268bd2 (Blue)
      '--primary-600': '42 161 152',   // #2aa198 (Cyan)
      '--secondary-500': '211 54 130', // #d33682 (Magenta)

      '--neutral-50': '253 246 227',
      '--neutral-100': '238 232 213',
      '--neutral-200': '211 204 187',
      '--neutral-300': '147 161 161',
      '--neutral-400': '131 148 150',
      '--neutral-500': '101 123 131',
      '--neutral-600': '88 110 117',
      '--neutral-700': '7 54 66',
      '--neutral-800': '7 54 66',    // Text color main
      '--neutral-900': '0 43 54',

      '--font-primary': '"Noto Serif SC", "Inter", serif',
      '--font-header': '"Noto Serif SC", "Inter", serif',
    }
  },
  // Pixel Retro Theme - Dark
  {
    id: 'pixel-dark',
    name: 'Pixel Dark',
    type: 'dark',
    colors: {
      '--bg-main': '15 15 35',        // #0f0f23 - CRT screen background
      '--bg-panel': '26 26 46',       // #1a1a2e - Slightly brighter
      '--bg-element': '22 33 62',     // #16213e - Game UI box
      '--border-main': '15 52 96',    // #0f3460 - Blue pixel border
      '--text-primary': '238 242 255', // #eef2ff - Pixel white
      '--text-secondary': '148 163 184', // #94a3b8 - Blue-grey
      '--primary-500': '233 69 96',   // #e94560 - Retro red (HP bar)
      '--primary-600': '233 69 96',   // #e94560
      '--secondary-500': '0 217 255', // #00d9ff - Electric blue (MP bar)

      '--neutral-50': '238 242 255',
      '--neutral-100': '238 242 255',
      '--neutral-200': '203 213 225',
      '--neutral-300': '148 163 184',
      '--neutral-400': '100 116 139',
      '--neutral-500': '71 85 105',
      '--neutral-600': '51 65 85',
      '--neutral-700': '30 41 59',
      '--neutral-800': '22 33 62',
      '--neutral-900': '15 15 35',

      '--font-primary': '"Press Start 2P", "VT323", "ZCOOL QingKe HuangYou", monospace',
      '--font-header': '"Press Start 2P", "VT323", "ZCOOL QingKe HuangYou", monospace',
    }
  },
  // Pixel Retro Theme - Light
  {
    id: 'pixel-light',
    name: 'Pixel Light',
    type: 'light',
    colors: {
      '--bg-main': '240 240 232',     // #f0f0e8 - Retro off-white (Game Boy)
      '--bg-panel': '232 232 216',    // #e8e8d8 - Slightly darker
      '--bg-element': '216 216 200',  // #d8d8c8 - Pixel box bg
      '--border-main': '139 139 122', // #8b8b7a - Green-grey border
      '--text-primary': '45 52 54',   // #2d3436 - Dark grey
      '--text-secondary': '99 110 114', // #636e72 - Medium grey
      '--primary-500': '214 48 49',   // #d63031 - Red buttons
      '--primary-600': '214 48 49',
      '--secondary-500': '9 132 227', // #0984e3 - Blue highlight

      '--neutral-50': '240 240 232',
      '--neutral-100': '240 240 232',
      '--neutral-200': '216 216 200',
      '--neutral-300': '99 110 114',
      '--neutral-400': '99 110 114',
      '--neutral-500': '71 85 105',
      '--neutral-600': '55 65 81',
      '--neutral-700': '45 52 54',
      '--neutral-800': '45 52 54',
      '--neutral-900': '45 52 54',

      '--font-primary': '"Press Start 2P", "VT323", "ZCOOL QingKe HuangYou", monospace',
      '--font-header': '"Press Start 2P", "VT323", "ZCOOL QingKe HuangYou", monospace',
    }
  }
];

export const applyTheme = (theme: AppTheme) => {
  const root = document.documentElement;
  
  // Set Color Variables
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  // Handle Dark/Light Mode Class
  if (theme.type === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  
  // Save to storage
  localStorage.setItem('neon-active-theme-id', theme.id);
  // Track preference for this mode (Fix for toggle reset bug)
  localStorage.setItem(`neon-last-${theme.type}-theme-id`, theme.id);
};

export const getSavedThemeId = (): string => {
  return localStorage.getItem('neon-active-theme-id') || 'neon-cyber';
};

export const getLastUsedThemeIdForMode = (type: 'light' | 'dark'): string | null => {
  return localStorage.getItem(`neon-last-${type}-theme-id`);
};

export const getAllThemes = (): AppTheme[] => {
  const custom = localStorage.getItem('neon-custom-themes');
  let customThemes: AppTheme[] = [];
  if (custom) {
    try {
      customThemes = JSON.parse(custom);
    } catch (e) { console.error("Failed to load custom themes", e); }
  }
  return [...DEFAULT_THEMES, ...customThemes];
};

export const saveCustomTheme = (theme: AppTheme) => {
  const custom = localStorage.getItem('neon-custom-themes');
  let customThemes: AppTheme[] = [];
  if (custom) {
    try {
      customThemes = JSON.parse(custom);
    } catch (e) {}
  }
  // Remove existing if id matches (update)
  customThemes = customThemes.filter(t => t.id !== theme.id);
  customThemes.push({ ...theme, isCustom: true });
  localStorage.setItem('neon-custom-themes', JSON.stringify(customThemes));
};

export const deleteCustomTheme = (id: string) => {
   const custom = localStorage.getItem('neon-custom-themes');
  if (custom) {
    let customThemes: AppTheme[] = JSON.parse(custom);
    customThemes = customThemes.filter(t => t.id !== id);
    localStorage.setItem('neon-custom-themes', JSON.stringify(customThemes));
  }
};