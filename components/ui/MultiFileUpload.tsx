'use client';

import { useState, useRef, ChangeEvent } from 'react';

interface MultiFileUploadProps {
  label?: string;
  accept?: string;
  onFilesSelect: (files: File[], base64Array: string[]) => void;
  maxFiles?: number;
  preview?: boolean;
  helperText?: string;
}

export default function MultiFileUpload({
  label,
  accept = 'image/*',
  onFilesSelect,
  maxFiles = 5,
  preview = false,
  helperText,
}: MultiFileUploadProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;
    
    // Limit number of files
    const selectedFiles = files.slice(0, maxFiles);
    
    const names = selectedFiles.map(f => f.name);
    setFileNames(names);

    const base64Array: string[] = [];
    const previewArray: string[] = [];

    for (const file of selectedFiles) {
      const reader = new FileReader();
      
      await new Promise<void>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          base64Array.push(result);
          if (preview) {
            previewArray.push(result);
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }

    if (preview) {
      setPreviews(previewArray);
    }

    onFilesSelect(selectedFiles, base64Array);
  };

  const handleRemove = (index: number) => {
    const newPreviews = previews.filter((_, i) => i !== index);
    const newFileNames = fileNames.filter((_, i) => i !== index);
    
    setPreviews(newPreviews);
    setFileNames(newFileNames);
    
    // Clear input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    
    onFilesSelect([], newPreviews);
  };

  const handleClearAll = () => {
    setPreviews([]);
    setFileNames([]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onFilesSelect([], []);
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-300"
        />
        
        {fileNames.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="px-3 py-2 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >
            Clear All
          </button>
        )}
      </div>

      {helperText && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {helperText} (Max {maxFiles} files)
        </p>
      )}

      {fileNames.length > 0 && (
        <div className="mt-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {fileNames.length} file{fileNames.length > 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      {preview && previews.length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {previews.map((previewUrl, index) => (
            <div key={index} className="relative group">
              <img
                src={previewUrl}
                alt={`Preview ${index + 1}`}
                className="w-full h-32 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700"
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                ×
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                {fileNames[index]}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

