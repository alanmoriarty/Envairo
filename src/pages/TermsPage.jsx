import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../store/useLanguageStore';

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 md:p-12 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link to="/" className="text-primary hover:underline">&larr; {t('terms.back')}</Link>

        <h1 className="text-4xl font-bold">{t('terms.title')}</h1>
        <p className="text-text-secondary">{t('terms.last_updated')} {new Date().toLocaleDateString()}</p>

        <div className="space-y-6 text-lg leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('terms.s1_title')}</h2>
            <p>{t('terms.s1_desc')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('terms.s2_title')}</h2>
            <p>{t('terms.s2_desc')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('terms.s3_title')}</h2>
            <p>{t('terms.s3_desc')}</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-text-secondary">
              <li>{t('terms.s3_i1')}</li>
              <li>{t('terms.s3_i2')}</li>
              <li>{t('terms.s3_i3')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('terms.s4_title')}</h2>
            <p>{t('terms.s4_desc')}</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-text-secondary">
              <li><a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">YouTube</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('terms.s5_title')}</h2>
            <p>{t('terms.s5_desc')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('terms.s6_title')}</h2>
            <p>{t('terms.s6_desc')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
