import React, { useState, useRef, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function ArtistTagInput({ tags, onAdd, onRemove, placeholder = 'Buscar artista...' }) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const typingTimeout = useRef(null);

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

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    if (val.trim() === '') {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    typingTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      setShowDropdown(true);
      try {
        const { data, error } = await supabase.functions.invoke('search-spotify', {
          body: { query: val, limit: 5, type: 'artist' }
        });
        if (error) throw error;
        if (data && data.artists && data.artists.items) {
          setResults(data.artists.items);
        }
      } catch (err) {
        console.error('Error searching artists:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500); 
  };

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      if (results.length > 0) {
        onAdd(results[0].name);
        setInput('');
        setResults([]);
        setShowDropdown(false);
      } else {
        onAdd(input.trim());
        setInput('');
      }
    }
    if (e.key === 'Backspace' && !input && tags.length) {
      onRemove(tags[tags.length - 1]);
    }
  };

  const selectArtist = (artistName) => {
    onAdd(artistName);
    setInput('');
    setResults([]);
    setShowDropdown(false);
  };

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
        <div className="flex-1 flex items-center min-w-[120px]">
          <input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0 || input.trim()) setShowDropdown(true);
            }}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="flex-1 bg-transparent outline-none text-text-primary placeholder-text-subtle text-sm"
          />
        </div>
      </div>

      {showDropdown && input.trim() && (
        <div ref={dropdownRef} className="absolute top-full left-0 right-0 mt-2 bg-bg-elevated border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
          {isSearching ? (
            <div className="p-4 text-center text-text-subtle text-sm">Buscando...</div>
          ) : results.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto custom-scrollbar py-1">
              {results.map((artist) => (
                <li
                  key={artist.id}
                  onMouseDown={(e) => { e.preventDefault(); selectArtist(artist.name); }}
                  className="px-4 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition-colors"
                >
                  {artist.images && artist.images.length > 0 ? (
                    <img src={artist.images[artist.images.length - 1].url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-bg-card flex items-center justify-center">
                      <Search size={14} className="text-text-muted" />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-text-primary">{artist.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-text-subtle text-sm">No se encontraron artistas</div>
          )}
        </div>
      )}
    </div>
  );
}
