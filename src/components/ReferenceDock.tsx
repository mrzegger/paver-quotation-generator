import React, { useState } from 'react';
import { Eye, EyeOff, ZoomIn, ZoomOut, RotateCcw, X, FileImage } from 'lucide-react';

interface ReferenceDockProps {
  imageUrl: string | null;
  onClose: () => void;
}

export const ReferenceDock: React.FC<ReferenceDockProps> = ({ imageUrl, onClose }) => {
  const [zoom, setZoom] = useState(1);

  if (!imageUrl) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 bg-white rounded-xl shadow-2xl border border-gray-300 w-80 md:w-96 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="bg-gray-900 text-white p-2.5 px-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-bold">
          <FileImage className="w-4 h-4 text-amber-400" />
          <span>Reference Request</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom(prev => Math.min(prev + 0.25, 2.5))}
            className="p-1 hover:bg-gray-800 rounded text-gray-300 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.5))}
            className="p-1 hover:bg-gray-800 rounded text-gray-300 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-1 hover:bg-gray-800 rounded text-gray-300 hover:text-white"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded text-gray-300 hover:text-white ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div className="p-2 bg-gray-100 max-h-80 overflow-auto flex items-center justify-center">
        <img
          src={imageUrl}
          alt="Reference Document"
          className="rounded shadow-sm transition-transform duration-150 origin-top"
          style={{ transform: `scale(${zoom})` }}
        />
      </div>

      <div className="p-1.5 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500 text-center">
        Pinned request dock • Drag or zoom to inspect client fields
      </div>
    </div>
  );
};
