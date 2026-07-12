import React, { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';

export function TagInput({ tags, onAdd, onRemove, placeholder = 'Añadir...' }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      onAdd(input.trim().toLowerCase());
      setInput('');
    }
    if (e.key === 'Backspace' && !input && tags.length) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div
      className="min-h-[48px] bg-bg-elevated border border-white/10 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20 rounded-xl px-3 py-2 flex flex-wrap gap-2 cursor-text transition-all duration-200"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
            className="hover:text-white transition-colors"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-text-primary placeholder-text-subtle text-sm"
      />
    </div>
  );
}
