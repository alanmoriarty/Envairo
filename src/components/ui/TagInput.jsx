import React, { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';

export function TagInput({ tags, onAdd, onRemove, placeholder = 'Añadir...', suggestions = [] }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  
  // Use useMemo to keep the list ID stable across renders
  const listId = React.useMemo(() => `tag-suggestions-${Math.random().toString(36).substring(2, 9)}`, []);

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
        list={suggestions.length > 0 ? listId : undefined}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-text-primary placeholder-text-subtle text-sm"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
    </div>
  );
}
