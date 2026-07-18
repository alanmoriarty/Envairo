import React from 'react';
import { useTranslation } from '../../store/useLanguageStore';
import { Languages } from 'lucide-react';

/**
 * Compact ES | EN language toggle.
 * Can be used in sidebar, navbar, or guest page header.
 */
export function LanguageSelector({ compact = false }) {
  const { lang, setLang } = useTranslation();

  return (
    <div
      className="flex items-center rounded-lg overflow-hidden border border-white/10 text-xs font-bold"
      title="Cambiar idioma / Change language"
    >
      <button
        onClick={() => setLang('es')}
        className={`px-2.5 py-1.5 transition-colors ${
          lang === 'es'
            ? 'bg-accent text-white'
            : 'text-text-muted hover:text-white hover:bg-white/5'
        }`}
      >
        ES
      </button>
      <button
        onClick={() => setLang('en')}
        className={`px-2.5 py-1.5 transition-colors ${
          lang === 'en'
            ? 'bg-accent text-white'
            : 'text-text-muted hover:text-white hover:bg-white/5'
        }`}
      >
        EN
      </button>
    </div>
  );
}
