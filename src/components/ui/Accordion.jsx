import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function Accordion({ items }) {
  const [open, setOpen] = useState(null);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="card overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-5 text-left group"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="font-semibold text-text-primary group-hover:text-accent transition-colors">
              {item.question}
            </span>
            <ChevronDown
              size={18}
              className={`text-text-muted transition-transform duration-300 flex-shrink-0 ml-4 ${
                open === i ? 'rotate-180 text-accent' : ''
              }`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${
              open === i ? 'max-h-[800px]' : 'max-h-0'
            }`}
          >
            <div className="px-5 pb-5 text-text-muted text-sm sm:text-base leading-relaxed whitespace-pre-line">
              {item.answer}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
