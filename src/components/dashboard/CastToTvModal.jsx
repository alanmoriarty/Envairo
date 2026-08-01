import React, { useState } from 'react';
import { Monitor, X, Tv, Cast, QrCode, Trash2, CheckCircle2, Sparkles, Wifi, Volume2, VolumeX } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from '../../store/useLanguageStore';

export function CastToTvModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [pinInput, setPinInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const { sessionId, hostSecret, isAdminMode } = useSettingsStore();
  const user = useAuthStore(s => s.user);
  const activeSessionId = user?.id || sessionId;

  // TV vinculadas guardadas
  const [pairedTvs, setPairedTvs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bq-paired-tvs') || '[]');
    } catch {
      return [];
    }
  });

  // Preferencia de sonido para la TV remota
  const [tvWithSound, setTvWithSound] = useState(false);

  if (!isOpen) return null;

  const handlePair = async (e) => {
    e?.preventDefault();
    const cleanPin = pinInput.replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      toast.error(t('cast.pin_length_error'));
      return;
    }

    setIsPairing(true);
    try {
      // Broadcast la aprobación de emparejamiento a la TV en el canal tv-pair-{cleanPin}
      const pairChannel = supabase.channel(`tv-pair-${cleanPin}`);
      await pairChannel.subscribe();

      await pairChannel.send({
        type: 'broadcast',
        event: 'pairing_result',
        payload: {
          type: 'PAIRED',
          sessionId: activeSessionId,
          hostSecret,
          tvWithSound
        }
      });

      // Guardar la TV en el registro local
      const newTv = {
        id: cleanPin,
        name: `Smart TV (${cleanPin.slice(0, 3)}-${cleanPin.slice(3)})`,
        linkedAt: new Date().toISOString()
      };

      const updatedList = [...pairedTvs.filter(t => t.id !== cleanPin), newTv];
      setPairedTvs(updatedList);
      localStorage.setItem('bq-paired-tvs', JSON.stringify(updatedList));

      toast.success(t('cast.tv_linked', { pin: `${cleanPin.slice(0, 3)}-${cleanPin.slice(3)}` }));
      setPinInput('');

      setTimeout(() => {
        supabase.removeChannel(pairChannel);
      }, 2000);
    } catch (err) {
      console.error(err);
      toast.error(t('cast.link_error'));
    } finally {
      setIsPairing(false);
    }
  };

  const handleUnpair = async (tvId) => {
    // Canal 1: tv-pair-{PIN} — para TVs que aún están en pantalla de vinculación o la escuchan siempre
    const pairChannel = supabase.channel(`tv-pair-${tvId}`);
    await pairChannel.subscribe();
    await pairChannel.send({
      type: 'broadcast',
      event: 'pairing_result',
      payload: { type: 'UNPAIRED' }
    });
    supabase.removeChannel(pairChannel);

    // Canal 2: tv-sync-{sessionId} — para TVs ya sincronizadas que escuchan el canal de reproducción
    if (activeSessionId) {
      const syncChannel = supabase.channel(`tv-sync-${activeSessionId}`);
      await syncChannel.subscribe();
      await syncChannel.send({
        type: 'broadcast',
        event: 'tv_sync',
        payload: { type: 'UNPAIRED', tvId }
      });
      supabase.removeChannel(syncChannel);
    }

    const updatedList = pairedTvs.filter(t => t.id !== tvId);
    setPairedTvs(updatedList);
    localStorage.setItem('bq-paired-tvs', JSON.stringify(updatedList));
    toast.success(t('cast.tv_unlinked'));
  };

  return (
    <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
      <div className="card p-0 max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-accent/20 to-transparent border-b border-white/5 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-text-muted hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent/20 rounded-2xl text-accent shadow-glow-sm">
              <Cast size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{t('cast.title')}</h2>
              <p className="text-text-muted text-sm mt-1">
                {t('cast.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Opción 1: Smart TV por Internet (QR / PIN) */}
          <div className="bg-white/5 rounded-2xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/20 text-accent">
                <Tv size={22} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">{t('cast.smart_tv_title')}</h3>
                <p className="text-xs text-text-muted">{t('cast.smart_tv_desc')}</p>
              </div>
            </div>

            {/* Toggle de sonido en la TV */}
            <button
              type="button"
              onClick={() => setTvWithSound(v => !v)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                tvWithSound
                  ? 'bg-accent/10 border-accent/40 hover:bg-accent/15'
                  : 'bg-black/20 border-white/10 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg transition-colors ${tvWithSound ? 'bg-accent/20 text-accent' : 'bg-white/10 text-text-muted'}`}>
                  {tvWithSound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </div>
                <div className="text-left">
                  <p className={`text-xs font-semibold leading-tight ${tvWithSound ? 'text-accent' : 'text-white'}`}>
                    {t('cast.sound_title')}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {tvWithSound ? t('cast.sound_on') : t('cast.sound_off')}
                  </p>
                </div>
              </div>
              {/* Switch */}
              <div className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 ${
                tvWithSound ? 'bg-accent' : 'bg-white/20'
              }`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${
                  tvWithSound ? 'left-[22px]' : 'left-0.5'
                }`} />
              </div>
            </button>

            <form onSubmit={handlePair} className="flex gap-2 pt-2">
              <input
                type="text"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="482910"
                className="input-field text-center font-mono text-lg tracking-[0.25em] font-bold uppercase py-2.5 border-white/20 focus:border-accent flex-1"
              />
              <button
                type="submit"
                disabled={isPairing || pinInput.length !== 6}
                className="btn-accent px-5 font-semibold text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
              >
                {isPairing ? t('cast.pairing_btn') : t('cast.pair_btn')}
              </button>
            </form>

            {/* Lista de Smart TVs vinculadas */}
            {pairedTvs.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                  {t('cast.linked_tvs', { count: pairedTvs.length })}
                </h4>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {pairedTvs.map((tv) => (
                    <div
                      key={tv.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5"
                    >
                      <div className="flex items-center gap-2.5">
                        <Wifi size={16} className="text-accent" />
                        <div>
                          <p className="text-xs font-semibold text-white">{tv.name}</p>
                          <p className="text-[10px] text-text-muted">{t('cast.sync_active')}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnpair(tv.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title={t('cast.unlink_tv')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Opción 2: Monitor Local (Pestaña Silenciada) */}
          <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="bg-white/10 p-2.5 rounded-xl text-white">
                  <Monitor size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm">{t('cast.local_monitor_title')}</h4>
                  <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                    {t('cast.local_monitor_desc')}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => window.open(`/tv?session=${activeSessionId}`, '_blank')}
              className="mt-3 btn-secondary bg-white/5 hover:bg-white/10 w-full py-2.5 text-sm font-semibold"
            >
              {t('cast.local_monitor_btn')}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 shrink-0">
          <button onClick={onClose} className="btn-primary w-full py-3">
            {t('cast.done_btn')}
          </button>
        </div>

      </div>
    </div>
  );
}
