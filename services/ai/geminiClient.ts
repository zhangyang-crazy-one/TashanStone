import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export const getGeminiClient = (apiKey?: string): GoogleGenAI =>
  new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });
