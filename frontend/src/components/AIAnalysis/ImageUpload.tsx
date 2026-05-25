import { useRef, useState, useCallback, useEffect } from 'react';

interface ImageUploadProps {
  onImageSelect: (file: File, preview: string) => void;
  isAnalyzing: boolean;
}

export default function ImageUpload({ onImageSelect, isAnalyzing }: ImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      setPreview(url);
      onImageSelect(file, url);
    },
    [onImageSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Clipboard paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (i) => i.type.startsWith('image/')
      );
      if (item) {
        const file = item.getAsFile();
        if (file) handleFile(file);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFile]);

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {preview ? (
        /* Preview state */
        <div className="relative rounded-lg overflow-hidden border border-terminal-border bg-terminal-bg group">
          <img
            src={preview}
            alt="Chart preview"
            className="w-full object-contain max-h-72"
          />
          {/* Analyzing overlay */}
          {isAnalyzing && (
            <div className="absolute inset-0 bg-terminal-bg/70 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
              <span className="text-terminal-cyan text-sm font-medium">Analyzing...</span>
            </div>
          )}
          {/* Re-upload overlay */}
          {!isAnalyzing && (
            <div className="absolute inset-0 bg-terminal-bg/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleClick}
                className="px-4 py-2 bg-terminal-card border border-terminal-border text-terminal-text-primary text-sm font-medium rounded-lg hover:border-terminal-cyan hover:text-terminal-cyan transition-colors"
              >
                Re-upload
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Drop zone */
        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            relative flex flex-col items-center justify-center gap-3 p-10 rounded-lg border-2 border-dashed cursor-pointer transition-colors
            ${isDragOver
              ? 'border-terminal-cyan bg-terminal-cyan/5'
              : 'border-terminal-border bg-terminal-bg hover:border-terminal-cyan/50 hover:bg-terminal-cyan/5'
            }
          `}
        >
          <div className={`transition-colors ${isDragOver ? 'text-terminal-cyan' : 'text-terminal-text-secondary'}`}>
            <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium transition-colors ${isDragOver ? 'text-terminal-cyan' : 'text-terminal-text-primary'}`}>
              Drop chart screenshot here
            </p>
            <p className="text-xs text-terminal-text-secondary mt-1">
              or click to browse &middot; supports paste (Ctrl+V)
            </p>
          </div>
          <p className="text-[11px] text-terminal-text-secondary/60">
            PNG, JPG, WebP, GIF supported
          </p>
        </div>
      )}
    </div>
  );
}
