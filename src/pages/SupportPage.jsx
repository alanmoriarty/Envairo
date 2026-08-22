import React, { useState } from 'react';
import { HelpCircle, MessageCircle, ExternalLink, QrCode, Sliders, Sparkles, Tv, Gamepad2, ShieldCheck } from 'lucide-react';
import { Accordion } from '../components/ui/Accordion';
import { useTranslation } from '../store/useLanguageStore';

export default function SupportPage() {
  const { t } = useTranslation();
  const whatsappUrl = 'https://wa.me/1234567890?text=Hola,%20necesito%20ayuda%20con%20Envairo';
  
  // Resolve FAQs dynamically
  const FAQS = t('support.faqs') || [];

  const TOPIC_PILLS = [
    { icon: QrCode, label: 'Rockola QR' },
    { icon: Sliders, label: 'envAIro Filter' },
    { icon: Sparkles, label: 'Armonizar Cola' },
    { icon: Tv, label: 'Transmitir a TV' },
    { icon: Gamepad2, label: 'Actividades' },
    { icon: ShieldCheck, label: 'Seguridad' }
  ];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary flex items-center gap-2.5">
          <div className="p-2 bg-accent/10 border border-accent/20 rounded-xl">
            <HelpCircle size={24} className="text-accent" />
          </div>
          <span>{t('support.title')}</span>
        </h1>
        <p className="text-text-muted text-xs sm:text-sm mt-1.5 leading-relaxed">
          {t('support.subtitle')}
        </p>
      </div>

      {/* Feature Highlights Pills */}
      <div className="flex flex-wrap gap-2 pt-1">
        {TOPIC_PILLS.map((topic, idx) => {
          const Icon = topic.icon;
          return (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-text-muted hover:text-white hover:bg-white/10 transition-colors"
            >
              <Icon size={14} className="text-accent" />
              <span>{topic.label}</span>
            </div>
          );
        })}
      </div>

      {/* FAQ Accordion */}
      <section className="space-y-3">
        <h2 className="font-bold text-base sm:text-lg text-text-primary flex items-center gap-2">
          <span>{t('support.faq_title')}</span>
        </h2>
        <Accordion items={FAQS} />
      </section>

      {/* WhatsApp Contact */}
      <section className="card p-5 sm:p-6 border border-green-500/20 bg-green-500/5 rounded-2xl sm:rounded-3xl shadow-glow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md"
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
          >
            {/* WhatsApp SVG */}
            <svg viewBox="0 0 24 24" width="26" height="26" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-text-primary text-sm sm:text-base mb-1">{t('support.contact_title')}</h3>
            <p className="text-text-muted text-xs sm:text-sm mb-3.5 leading-relaxed">
              {t('support.contact_desc')}
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-semibold text-xs sm:text-sm text-white transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-md cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                boxShadow: '0 4px 16px rgba(37,211,102,0.3)',
              }}
            >
              <MessageCircle size={17} />
              <span>{t('support.contact_btn')}</span>
              <ExternalLink size={13} className="opacity-70 ml-0.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Version info */}
      <div className="text-center text-xs text-text-subtle pt-2">
        {t('support.version_info')}
      </div>
    </div>
  );
}
