import React, { useState, useRef, useEffect } from 'react';
import { X, Search, Music } from 'lucide-react';
import { searchTracks } from '../../lib/spotifyApi';

export function SongTagInput({ tags, onAdd, onRemove, placeholder = 'Buscar canción...' }) {
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
        const data = await searchTracks(val, 5);
        if (data && data.tracks && data.tracks.items) {
          setResults(data.tracks.items);
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

  const selectTrack = (track) => {
    onAdd(track.name);
    setInput('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
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
            results.map((track) => {
              const imageUrl = track.album?.images?.[0]?.url;
              const artistNames = track.artists?.map(a => a.name).join(', ');
              return (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-3 hover:bg-white/10 cursor-pointer transition-colors"
                  onClick={() => selectTrack(track)}
                >
                  {imageUrl ? (
                    <img src={imageUrl} alt={track.name} className="w-10 h-10 rounded-md object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-white/5 flex items-center justify-center">
                      <Music size={16} className="text-text-muted" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">{track.name}</span>
                    <span className="text-xs text-text-muted">{artistNames}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-sm text-text-muted">
              No se encontraron canciones
            </div>
          )}
        </div>
      )}
    </div>
  );
}
