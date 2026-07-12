import React from 'react';

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div className="flex-1">
        {label && <p className="text-text-primary font-medium">{label}</p>}
        {description && <p className="text-text-muted text-sm mt-0.5">{description}</p>}
      </div>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0 ml-4 ${
          checked ? 'bg-accent shadow-glow-sm' : 'bg-bg-elevated border border-white/10'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
            checked ? 'left-7' : 'left-1'
          }`}
        />
      </div>
    </label>
  );
}
