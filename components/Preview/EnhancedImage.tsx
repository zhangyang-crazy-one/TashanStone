import React, { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

import Tooltip from '../Tooltip';

interface ImageGetUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

type EnhancedImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

const imageUrlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 10000;

export const EnhancedImage: React.FC<EnhancedImageProps> = ({ src, alt, ...props }) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const loadIdRef = useRef(0);

  useEffect(() => {
    if (!src) {
      setImageSrc(null);
      setLoading(false);
      setError(false);
      return;
    }

    if (src.startsWith('data:')) {
      setImageSrc(src);
      setLoading(false);
      setError(false);
      return;
    }

    if (src.startsWith('file://') || src.startsWith('http://') || src.startsWith('https://')) {
      setImageSrc(src);
      setLoading(false);
      setError(false);
      return;
    }

    loadIdRef.current += 1;
    const currentLoadId = loadIdRef.current;
    let isCancelled = false;

    const loadImage = async () => {
      if (imageUrlCache.has(src)) {
        const cached = imageUrlCache.get(src);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          if (!isCancelled) {
            setImageSrc(cached.url);
            setLoading(false);
            setError(false);
          }
          return;
        }
      }

      if (src.startsWith('assets/')) {
        try {
          const result = await window.electronAPI.ipcInvoke('image:getUrl', src) as ImageGetUrlResult;
          if (isCancelled || currentLoadId !== loadIdRef.current) {
            return;
          }

          if (result.success && result.url) {
            imageUrlCache.set(src, { url: result.url, timestamp: Date.now() });
            setImageSrc(result.url);
            setLoading(false);
            setError(false);
            return;
          }
          setError(true);
          setLoading(false);
        } catch {
          if (isCancelled || currentLoadId !== loadIdRef.current) {
            return;
          }
          setError(true);
          setLoading(false);
        }
        return;
      }

      setImageSrc(src);
      setLoading(false);
      setError(false);
    };

    loadImage();

    return () => {
      isCancelled = true;
    };
  }, [src]);

  if (!src) {
    return null;
  }

  if (!imageSrc) {
    return (
      <span className="block my-4 relative">
        <span className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-cyber-800 rounded-lg animate-pulse">
          <span className="text-xs text-slate-400">Loading...</span>
        </span>
        {alt && (
          <span className="block mt-2 text-center text-xs text-slate-500 dark:text-slate-400 italic">{alt}</span>
        )}
      </span>
    );
  }

  if (error) {
    return (
      <span className="block my-4 p-4 rounded-lg bg-slate-100 dark:bg-cyber-800 border border-slate-200 dark:border-cyber-700 text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-3">
          <ImageOff size={24} className="text-slate-400 dark:text-slate-500" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-slate-600 dark:text-slate-300">Image failed to load</span>
            <Tooltip content={src}>
              <span className="block text-xs truncate opacity-70">{alt || src}</span>
            </Tooltip>
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className="block my-4 relative">
      <img
        src={imageSrc}
        alt={alt || ''}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        className={`max-w-full h-auto rounded-lg shadow-md border border-paper-200 dark:border-cyber-700 transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
        {...props}
      />
      {alt && !loading && (
        <span className="block mt-2 text-center text-xs text-slate-500 dark:text-slate-400 italic">{alt}</span>
      )}
    </span>
  );
};
