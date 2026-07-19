import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

export function TagInput({ tags, onAdd, onRemove, placeholder = 'Añadir...', suggestions = [] }) {
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      onAdd(input.trim().toLowerCase());
      setInput('');
      setShowDropdown(false);
    }
    if (e.key === 'Backspace' && !input && tags.length) {
      onRemove(tags[tags.length - 1]);
    }
  };

  const selectSuggestion = (suggestion) => {
    onAdd(suggestion.toLowerCase());
    setInput('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filteredSuggestions = suggestions.filter(
    s => normalize(s).includes(normalize(input)) && !tags.includes(s.toLowerCase())
  );

  return (
    <div className="relative">
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
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-text-primary placeholder-text-subtle text-sm"
        />
      </div>

      {showDropdown && suggestions.length > 0 && filteredSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 bg-bg-elevated border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        >
          <ul className="max-h-60 overflow-y-auto custom-scrollbar py-1">
            {filteredSuggestions.map((suggestion) => (
              <li
                key={suggestion}
                onClick={() => selectSuggestion(suggestion)}
                className="px-4 py-2 hover:bg-white/5 cursor-pointer text-sm text-text-primary transition-colors"
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
