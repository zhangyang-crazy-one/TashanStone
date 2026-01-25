import React from 'react';
import { AlertTriangle, Box, Code2, Play, Server, Terminal, X } from 'lucide-react';
import type { AIConfig } from '../../types';
import Tooltip from '../Tooltip';

type TranslationDictionary = typeof import('../../utils/translations').translations.en;

type McpToolParameter = {
  type?: string;
  description?: string;
};

type McpToolSchema = {
  properties?: Record<string, McpToolParameter>;
  required?: string[];
};

type McpTool = {
  name: string;
  description?: string;
  parameters?: McpToolSchema;
  inputSchema?: McpToolSchema;
};

interface McpTabProps {
  t: TranslationDictionary;
  tempConfig: AIConfig;
  setTempConfig: React.Dispatch<React.SetStateAction<AIConfig>>;
  parseError: string | null;
  activeServers: string[];
  parsedTools: McpTool[];
  isLoadingMcpTools: boolean;
  handleInsertTemplate: () => void;
  testTool: string | null;
  setTestTool: React.Dispatch<React.SetStateAction<string | null>>;
  testPrompt: string;
  setTestPrompt: React.Dispatch<React.SetStateAction<string>>;
  testLog: string[];
  setTestLog: React.Dispatch<React.SetStateAction<string[]>>;
  runToolTest: () => Promise<void>;
  isTesting: boolean;
}

export const McpTab: React.FC<McpTabProps> = ({
  t,
  tempConfig,
  setTempConfig,
  parseError,
  activeServers,
  parsedTools,
  isLoadingMcpTools,
  handleInsertTemplate,
  testTool,
  setTestTool,
  testPrompt,
  setTestPrompt,
  testLog,
  setTestLog,
  runToolTest,
  isTesting
}) => (
  <div className="h-full flex flex-col lg:flex-row gap-6">
    {/* Left: Editor */}
    <div className="flex-1 flex flex-col min-h-[400px]">
      <div className="bg-white dark:bg-cyber-800 p-4 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm mb-4 shrink-0 flex justify-between items-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure MCP Servers to inject tools dynamically.
        </p>
        <button
          onClick={handleInsertTemplate}
          className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-paper-100 dark:bg-cyber-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors border border-paper-200 dark:border-cyber-600"
        >
          <Code2 size={14} /> Insert Template
        </button>
      </div>

      <div className="flex-1 relative">
        <label className="absolute top-0 right-0 p-2 text-[10px] font-mono text-slate-400 bg-paper-100 dark:bg-cyber-900/50 rounded-bl-lg border-l border-b border-paper-200 dark:border-cyber-700">JSON</label>
        <textarea
          value={tempConfig.mcpTools || '[]'}
          onChange={(e) => setTempConfig({
            ...tempConfig,
            mcpTools: e.target.value
          })}
          className={`w-full h-full min-h-[300px] px-4 py-3 rounded-lg bg-white dark:bg-cyber-800 border text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono resize-none leading-relaxed custom-scrollbar ${parseError ? 'border-red-400 dark:border-red-600' : 'border-paper-200 dark:border-cyber-600'}`}
          placeholder={`{\n  "mcpServers": {\n    "chrome-devtools": {\n      "command": "npx",\n      "args": ["-y", "chrome-devtools-mcp@latest"]\n    }\n  }\n}`}
          spellCheck={false}
        />
      </div>
      {parseError && (
        <div className="mt-2 text-red-500 text-xs flex items-center gap-1">
          <AlertTriangle size={12} /> {parseError}
        </div>
      )}
    </div>

    {/* Right: Visualization & Test */}
    <div className="w-full lg:w-96 flex flex-col gap-4 overflow-y-auto pr-1">
      {activeServers.length > 0 && (
        <div className="mb-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
            <Server size={12} /> Active Virtual Servers
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {activeServers.map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-[10px] font-mono border border-emerald-200 dark:border-emerald-700/50">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
        <Box size={16} /> Discovered Tools ({isLoadingMcpTools ? '...' : parsedTools.length})
      </h3>

      {isLoadingMcpTools ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-paper-200 dark:border-cyber-700 rounded-xl p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-2"></div>
          <p className="text-xs text-slate-400">Loading MCP tools...</p>
        </div>
      ) : parsedTools.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-paper-200 dark:border-cyber-700 rounded-xl p-8 text-center">
          <Code2 className="text-slate-300 dark:text-slate-600 mb-2" size={32} />
          <p className="text-xs text-slate-400">No tools found.<br />Configure servers on the left.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {parsedTools.map((tool, idx) => (
            <div key={`${tool.name}-${idx}`} className="bg-white dark:bg-cyber-800 rounded-lg border border-paper-200 dark:border-cyber-700 p-3 shadow-sm hover:border-emerald-500/50 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-mono font-bold">
                    {tool.name}
                  </span>
                </div>
                <Tooltip content={t.tooltips?.testTool || "Test this tool"}>
                  <button
                    onClick={() => { setTestTool(tool.name); setTestPrompt(`Use ${tool.name} to...`); setTestLog([]); }}
                    className="p-1.5 rounded-md bg-paper-100 dark:bg-cyber-700 hover:bg-emerald-500 hover:text-white text-slate-500 transition-all"
                    aria-label={t.tooltips?.testTool || "Test this tool"}
                  >
                    <Play size={12} fill="currentColor" />
                  </button>
                </Tooltip>
              </div>
              {/* Full description - no line clamp */}
              <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                {tool.description || "No description provided."}
              </p>
              {/* Parameters with descriptions */}
              {(() => {
                const schema = tool.parameters?.properties || tool.inputSchema?.properties || {};
                const required = tool.parameters?.required || tool.inputSchema?.required || [];
                const props = Object.entries(schema) as [string, McpToolParameter][];
                if (props.length === 0) return null;
                return (
                  <div className="mt-2 pt-2 border-t border-paper-100 dark:border-cyber-700/50 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Parameters:</span>
                    {props.map(([prop, toolSchema]) => (
                      <div key={prop} className="flex items-start gap-2 text-[10px]">
                        <span className={`font-mono px-1 py-0.5 rounded border ${required.includes(prop) ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 border-paper-200 dark:border-cyber-600'}`}>
                          {prop}{required.includes(prop) && '*'}
                        </span>
                        <span className="text-slate-400">
                          ({toolSchema.type || 'any'})
                          {toolSchema.description && <span className="ml-1 text-slate-500">- {toolSchema.description}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Test Playground Area */}
      {testTool && (
        <div className="mt-auto border-t-2 border-paper-200 dark:border-cyber-700 pt-4 animate-slideUp">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Terminal size={14} /> Test: {testTool}
            </h4>
            <button onClick={() => setTestTool(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded bg-white dark:bg-cyber-900 border border-paper-300 dark:border-cyber-600 text-xs text-slate-800 dark:text-slate-200"
              placeholder="Enter prompt to trigger tool..."
            />
            <button
              onClick={runToolTest}
              disabled={isTesting}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold disabled:opacity-50"
            >
              {isTesting ? '...' : 'Run'}
            </button>
          </div>

          <div className="bg-slate-900 rounded-lg p-3 h-32 overflow-y-auto custom-scrollbar font-mono text-[10px] leading-relaxed">
            {testLog.length === 0 ? (
              <span className="text-slate-500 italic">Output log...</span>
            ) : (
              testLog.map((line, i) => (
                <div key={`${line}-${i}`} className={line.startsWith('❌') ? 'text-red-400' : line.includes('✅') ? 'text-emerald-400' : 'text-slate-300'}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  </div>
);
