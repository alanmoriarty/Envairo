import React from 'react';
import { createPortal } from 'react-dom';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useTranslation } from '../../store/useLanguageStore';
import { Clock, Play, Sparkles } from 'lucide-react';

export function PlaybackLimitModal() {
  const show = usePlayerStore((s) => s.showPlaybackLimitModal);
  const resumeAfterPlaybackLimit = usePlayerStore((s) => s.resumeAfterPlaybackLimit);
  const { t } = useTranslation();

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-bg-card/95 border border-white/10 rounded-3xl p-6 sm:p-8 text-center shadow-2xl overflow-hidden">
        {/* Glow backdrop effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-accent/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Animated Icon */}
        <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center rounded-3xl bg-accent/15 border border-accent/30 text-accent shadow-[0_0_30px_rgba(var(--color-accent),0.3)]">
          <Clock size={38} className="animate-pulse" />
          <div className="absolute -top-1 -right-1 p-1.5 rounded-full bg-accent text-white shadow-sm">
            <Sparkles size={12} />
          </div>
        </div>

        {/* Title & Description */}
        <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-3 tracking-tight">
          {t('playback_limit.title')}
        </h2>
        <p className="text-sm sm:text-base text-text-muted leading-relaxed mb-8">
          {t('playback_limit.desc')}
        </p>

        {/* Continue Button */}
        <button
          onClick={resumeAfterPlaybackLimit}
          className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-accent hover:bg-accent-light text-white font-bold text-base sm:text-lg shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
        >
          <Play size={20} fill="currentColor" />
          <span>{t('playback_limit.continue_btn')}</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
