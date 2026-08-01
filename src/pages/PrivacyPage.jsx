import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../store/useLanguageStore';

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 md:p-12 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link to="/" className="text-primary hover:underline">&larr; {t('privacy.back')}</Link>

        <h1 className="text-4xl font-bold">{t('privacy.title')}</h1>
        <p className="text-text-secondary">{t('privacy.last_updated')} {new Date().toLocaleDateString()}</p>

        <div className="space-y-6 text-lg leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('privacy.s1_title')}</h2>
            <p>{t('privacy.s1_desc')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('privacy.s2_title')}</h2>
            <p>{t('privacy.s2_desc')}</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-text-secondary">
              <li>{t('privacy.s2_i1')}</li>
              <li>{t('privacy.s2_i2')}</li>
              <li>{t('privacy.s2_i3')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('privacy.s3_title')}</h2>
            <p>{t('privacy.s3_desc')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('privacy.s4_title')}</h2>
            <p>{t('privacy.s4_desc')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('privacy.s5_title')}</h2>
            <p>
              {t('privacy.s5_desc')} <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">{t('privacy.s5_yt_terms')}</a> {t('privacy.s5_and')} <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">{t('privacy.s5_google_privacy')}</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">{t('privacy.s6_title')}</h2>
            <p>{t('privacy.s6_desc')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
