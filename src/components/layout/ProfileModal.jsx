import React, { useState, useEffect } from 'react';
import { XCircle, Save, UserCircle2 } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from '../../store/useLanguageStore';
import { toast } from 'sonner';

export const STOCK_AVATARS = [
  { id: 'avatar1', url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&h=150&fit=crop&q=80', label: 'Microphone' },
  { id: 'avatar2', url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&h=150&fit=crop&q=80', label: 'Festival' },
  { id: 'avatar3', url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&h=150&fit=crop&q=80', label: 'Concert' },
  { id: 'avatar4', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=150&h=150&fit=crop&q=80', label: 'Headphones' },
];

export function ProfileModal({ onClose }) {
  const { t } = useTranslation();
  const { djName, setDjName, djAvatar, setDjAvatar } = useSettingsStore();

  const [localName, setLocalName] = useState(djName);
  const [localAvatar, setLocalAvatar] = useState(djAvatar);

  const handleSave = () => {
    // Sanitización y reglas de seguridad
    const sanitizedName = localName
      .trim()
      .replace(/[<>'"&;]/g, '') // Eliminar caracteres peligrosos
      .slice(0, 30); // Límite de 30 caracteres

    if (!sanitizedName) {
      toast.error(t('profile.empty_nickname'));
      return;
    }

    setDjName(sanitizedName);
    setDjAvatar(localAvatar);
    toast.success(t('profile.updated'));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center z-[20000] p-3 sm:p-4">
      <div className="relative w-full max-w-md bg-bg-card rounded-2xl border border-white/10 shadow-2xl p-6 animate-in zoom-in-95 fade-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-white transition-colors"
        >
          <XCircle size={24} />
        </button>

        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <UserCircle2 className="text-accent" />
          {t('profile.title')}
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('profile.nickname_label')}
            </label>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value.slice(0, 30))}
              maxLength={30}
              placeholder={t('profile.nickname_placeholder')}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              {t('profile.avatar_label')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {STOCK_AVATARS.map((avatar) => (
                <button
                  key={avatar.id}
                  onClick={() => setLocalAvatar(avatar.id)}
                  className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all ${localAvatar === avatar.id
                      ? 'border-accent shadow-glow-sm scale-105'
                      : 'border-transparent hover:scale-105 opacity-60 hover:opacity-100'
                    }`}
                  title={avatar.label}
                >
                  <img
                    src={avatar.url}
                    alt={avatar.label}
                    className="w-full h-full object-cover"
                  />
                  {localAvatar === avatar.id && (
                    <div className="absolute inset-0 bg-accent/20" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-white transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors font-medium shadow-glow-sm"
            >
              <Save size={16} />
              {t('profile.save_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
