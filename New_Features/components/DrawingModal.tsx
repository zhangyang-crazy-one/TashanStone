import React, { useRef, useState, useEffect } from 'react';
import { X, Save, Trash2, Eraser, PenTool, Undo } from 'lucide-react';

interface DrawingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (base64: string) => void;
}

export const DrawingModal: React.FC<DrawingModalProps> = ({ isOpen, onClose, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [bgColor, setBgColor] = useState('#ffffff');
  
  // Initialize Canvas
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [isOpen, bgColor]);

  if (!isOpen) return null;

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = tool === 'eraser' ? bgColor : color;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
  };

  const handleSave = () => {
      if (canvasRef.current) {
          const base64 = canvasRef.current.toDataURL('image/png');
          onSave(base64);
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-w-4xl w-full h-[80vh]">
         {/* Toolbar */}
         <div className="p-4 border-b border-gray-200 dark:border-zinc-700 flex justify-between items-center bg-gray-50 dark:bg-zinc-900">
             <div className="flex items-center gap-4">
                 <div className="flex bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-700 p-1">
                     <button 
                        onClick={() => setTool('pen')}
                        className={`p-2 rounded ${tool === 'pen' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                     >
                        <PenTool size={20} />
                     </button>
                     <button 
                        onClick={() => setTool('eraser')}
                        className={`p-2 rounded ${tool === 'eraser' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                     >
                        <Eraser size={20} />
                     </button>
                 </div>
                 
                 <input 
                    type="color" 
                    value={color} 
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-none bg-transparent"
                    title="Pen Color"
                 />
                 
                 <div className="flex items-center gap-2">
                     <span className="text-xs text-gray-500 uppercase font-bold">Size</span>
                     <input 
                        type="range" 
                        min="1" max="20" 
                        value={lineWidth} 
                        onChange={(e) => setLineWidth(parseInt(e.target.value))}
                        className="w-24 accent-cyan-500"
                     />
                 </div>
             </div>

             <div className="flex gap-2">
                 <button onClick={clearCanvas} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Clear Canvas">
                     <Trash2 size={20} />
                 </button>
                 <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded">
                     <X size={20} />
                 </button>
             </div>
         </div>

         {/* Canvas Area */}
         <div className="flex-1 bg-gray-200 dark:bg-zinc-900 relative overflow-hidden flex items-center justify-center p-4">
             <canvas 
                ref={canvasRef}
                width={800}
                height={600}
                className="bg-white shadow-lg cursor-crosshair touch-none max-w-full max-h-full object-contain"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
             />
         </div>

         {/* Footer */}
         <div className="p-4 border-t border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex justify-end">
             <button 
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-bold shadow-lg shadow-cyan-500/30 transition-all"
             >
                 <Save size={18} /> Save & Insert
             </button>
         </div>
      </div>
    </div>
  );
};