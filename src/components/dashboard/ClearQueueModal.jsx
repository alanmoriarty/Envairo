import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../store/useLanguageStore';
import { Trash2, AlertTriangle } from 'lucide-react';

export function ClearQueueModal({ isOpen, onClose, onConfirm }) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-bg-card/95 border border-white/10 rounded-3xl p-6 sm:p-8 text-center shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Glow backdrop effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-danger/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-accent/15 rounded-full blur-3xl pointer-events-none" />

        {/* Animated Icon Badge */}
        <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center rounded-3xl bg-danger/15 border border-danger/30 text-danger shadow-[0_0_30px_rgba(239,68,68,0.25)]">
          <Trash2 size={36} className="animate-bounce" />
          <div className="absolute -top-1 -right-1 p-1.5 rounded-full bg-danger text-white shadow-sm">
            <AlertTriangle size={12} />
          </div>
        </div>

        {/* Title & Description */}
        <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-3 tracking-tight">
          {t('dashboard.clear_queue_title')}
        </h2>
        <p className="text-sm sm:text-base text-text-muted leading-relaxed mb-8">
          {t('dashboard.clear_queue_desc')}
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 px-5 rounded-2xl bg-white/5 hover:bg-white/10 text-text-primary font-semibold text-sm sm:text-base border border-white/5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            {t('dashboard.clear_queue_cancel_btn')}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl bg-danger hover:bg-danger/90 text-white font-bold text-sm sm:text-base shadow-[0_0_20px_rgba(239,68,68,0.35)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Trash2 size={18} />
            <span>{t('dashboard.clear_queue_confirm_btn')}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
