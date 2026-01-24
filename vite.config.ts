import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isElectron = process.env.ELECTRON === 'true';

    return {
      server: {
        port: 3000,
        strictPort: false,
        host: '0.0.0.0',
        proxy: {
          // Proxy for DeepSeek API to bypass CORS in browser dev mode
          '/api/deepseek': {
            target: 'https://api.deepseek.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
            secure: true,
          },
          // Proxy for OpenAI API
          '/api/openai': {
            target: 'https://api.openai.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/openai/, ''),
            secure: true,
          },
        },
        // Allow serving files from node_modules for onnxruntime-web
        fs: {
          allow: ['..', 'node_modules/onnxruntime-web']
        }
      },
      base: '/',
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1600,
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              if (!id.includes('node_modules')) return undefined;

              const matchers = (pkgs: string[]) =>
                pkgs.some((pkg) => id.includes(`/node_modules/${pkg}/`) || id.includes(`/node_modules/${pkg}`));

              if (matchers(['react', 'react-dom'])) return 'vendor-react';
              if (matchers(['@uiw', '@codemirror', 'codemirror', '@lezer', 'lezer-'])) return 'codemirror';
              if (matchers(['rehype-katex', 'katex'])) return 'katex';
              if (matchers(['d3'])) return 'd3';
              if (matchers(['pdfjs-dist'])) return 'pdf';
              if (matchers(['cytoscape', 'cose-bilkent', 'cytoscape-cose-bilkent', 'cytoscape-fcose', 'layout-base', 'cose-base'])) return 'cytoscape';
              if (matchers(['dagre', 'dagre-d3-es', 'graphlib'])) return 'dagre';
              if (matchers(['react-window', 'react-virtualized-auto-sizer'])) return 'virtual';
              if (matchers(['lucide-react'])) return 'icons';
              if (matchers(['@google'])) return 'ai-sdk';
              if (matchers(['onnxruntime-web', '@paddlejs', 'sherpa-onnx'])) return 'ml';
              if (matchers(['mammoth', 'jszip', 'xmlbuilder', 'xmldom', 'dingbat-to-unicode'])) return 'documents';
              if (matchers(['react-markdown', 'remark-', 'rehype-', 'micromark', 'mdast-', 'hast-', 'unist-', 'vfile', 'unified', 'lowlight', 'highlight.js', 'property-information', 'space-separated-tokens', 'comma-separated-tokens', 'html-void-elements', 'web-namespaces', 'zwitch', 'trough', 'bail'])) return 'markdown';
              if (matchers(['mermaid', '@mermaid-js', 'langium', 'chevrotain', 'khroma', 'roughjs', 'ts-dedent', 'uuid', 'marked', 'stylis', 'dayjs', 'lodash-es', 'dompurify', '@iconify'])) return 'mermaid';

              return 'vendor';
            }
          }
        }
      },
      plugins: [
        react(),
        viteStaticCopy({
          targets: [
            {
              src: 'src/fonts/*',
              dest: 'assets/fonts'
            }
          ]
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Fix for CommonJS modules that check for Node.js Module
        'Module': '{}'
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        exclude: ['better-sqlite3'],
        include: ['pdfjs-dist', '@paddlejs-models/ocr', '@paddlejs/paddlejs-core', '@paddlejs/paddlejs-backend-webgl']
      },
      worker: {
        format: 'es'
      }
    };
});
