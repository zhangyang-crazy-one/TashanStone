export interface ResearchQuery {
  id: string;
  query: string;
  type: 'web' | 'academic' | 'all';
  options?: ResearchOptions;
}

export interface ResearchOptions {
  maxSources?: number;
  maxDepth?: number;
  includeCode?: boolean;
  includeAcademic?: boolean;
}

export interface ResearchSource {
  id: string;
  type: 'web' | 'arxiv' | 'pdf';
  title: string;
  url: string;
  content: string;
  relevanceScore: number;
  timestamp: string;
}

export interface ResearchResult {
  id: string;
  query: string;
  summary: string;
  sources: ResearchSource[];
  codeSnippets: CodeSnippet[];
  citations: Citation[];
  timestamp: string;
  duration: number;
}

export interface CodeSnippet {
  language: string;
  code: string;
  description: string;
  sourceUrl: string;
}

export interface Citation {
  sourceId: string;
  title: string;
  url: string;
  authors?: string[];
  year?: number;
}

export interface ResearchState {
  status: 'idle' | 'researching' | 'processing' | 'complete' | 'error';
  progress: number;
  currentStep: string;
  sourcesFound: number;
  error?: string;
}

export type ResearchEvent = 
  | { type: 'START'; query: ResearchQuery }
  | { type: 'PROGRESS'; step: string; progress: number }
  | { type: 'SOURCE_FOUND'; source: ResearchSource }
  | { type: 'COMPLETE'; result: ResearchResult }
  | { type: 'ERROR'; error: string };
