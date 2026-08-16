import React from 'react';

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group gap-2.5">
      <div className="flex-1 min-w-0">
        {label && <p className="text-text-primary font-medium text-xs sm:text-sm leading-snug">{label}</p>}
        {description && <p className="text-text-muted text-[11px] sm:text-xs mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0 ${
          checked ? 'bg-accent shadow-glow-sm' : 'bg-bg-elevated border border-white/10'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </div>
    </label>
  );
}
