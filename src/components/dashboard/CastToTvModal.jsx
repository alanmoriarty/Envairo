import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, X, Tv, Cast, QrCode, Trash2, CheckCircle2, Sparkles, Wifi, Volume2, VolumeX } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../lib/supabase';
import { usePlayerStore } from '../../store/usePlayerStore';
import { toast } from 'sonner';
import { useTranslation } from '../../store/useLanguageStore';

export function CastToTvModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [pinInput, setPinInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const { sessionId, hostSecret, isAdminMode } = useSettingsStore();
  const user = useAuthStore(s => s.user);
  const activeSessionId = user?.id || sessionId;
  const isPlaying = usePlayerStore(s => s.isPlaying);

  const getPairedTvs = () => {
    const tvs = useSettingsStore.getState().pairedTvs;
    return Array.isArray(tvs) ? tvs : [];
  };

  const [pairedTvs, setPairedTvs] = useState(getPairedTvs);

  useEffect(() => {
    let mounted = true;
    const handleUpdate = () => {
      if (mounted) {
        setPairedTvs(getPairedTvs());
      }
    };
    window.addEventListener('bq-paired-tvs-updated', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('bq-paired-tvs-updated', handleUpdate);
    };
  }, []);

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
      let ackReceived = false;
      const pairChannel = supabase.channel(`tv-pair-${cleanPin}`);
      pairChannel.on('broadcast', { event: 'pairing_ack' }, () => {
        ackReceived = true;
      });

      await pairChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await pairChannel.send({
            type: 'broadcast',
            event: 'pairing_result',
            payload: {
              type: 'PAIRED',
              sessionId: activeSessionId,
              tvWithSound: false
            }
          });
        }
      });

      // Esperar hasta 2 segundos para ver si la TV responde
      for (let i = 0; i < 10; i++) {
        if (ackReceived) break;
        await new Promise(r => setTimeout(r, 200));
      }

      if (!ackReceived) {
        toast.error("No se encontró ninguna TV activa con ese PIN");
        supabase.removeChannel(pairChannel);
        return;
      }

      const newTv = {
        id: cleanPin,
        name: `Smart TV (${cleanPin.slice(0, 3)}-${cleanPin.slice(3)})`,
        linkedAt: new Date().toISOString(),
        soundEnabled: false
      };

      const existing = getPairedTvs().find(t => t.id === newTv.id);
      let updatedList = getPairedTvs();
      if (!existing) {
        updatedList = [...updatedList, newTv];
      } else {
        updatedList = updatedList.map(t => t.id === newTv.id ? newTv : t);
      }
      useSettingsStore.getState().setPairedTvs(updatedList);
      setPairedTvs(updatedList);
      window.dispatchEvent(new Event('bq-paired-tvs-updated'));

      // Guardar en Base de Datos de inmediato (Directo + RPC para anfitrión o remoto)
      if (activeSessionId) {
        const secret = useSettingsStore.getState().hostSecret;
        if (secret) {
          supabase.rpc('sync_host_config', {
            p_session_id: activeSessionId,
            p_secret: secret,
            p_updates: { paired_tvs: updatedList }
          }).catch(console.error);
        }
        supabase.from('sessions').update({ paired_tvs: updatedList }).eq('id', activeSessionId).catch(() => {});
      }

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
    const cleanTvId = String(tvId || '').replace(/\D/g, '');
    const currentList = getPairedTvs();
    const updatedList = currentList.filter(t => String(t.id || '').replace(/\D/g, '') !== cleanTvId);
    
    useSettingsStore.getState().setPairedTvs(updatedList);
    setPairedTvs(updatedList);
    window.dispatchEvent(new Event('bq-paired-tvs-updated'));

    // 1. Guardar en Base de Datos de inmediato (Directo + RPC para anfitrión o remoto)
    if (activeSessionId) {
      const secret = useSettingsStore.getState().hostSecret;
      if (secret) {
        supabase.rpc('sync_host_config', {
          p_session_id: activeSessionId,
          p_secret: secret,
          p_updates: { paired_tvs: updatedList }
        }).catch(console.error);
      }
      supabase.from('sessions').update({ paired_tvs: updatedList }).eq('id', activeSessionId).catch(() => {});
    }

    // 2. Broadcast Directo al canal específico de la TV (tv-pair-{tvId})
    try {
      const directPairCh = supabase.channel(`tv-pair-${cleanTvId}`);
      directPairCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await directPairCh.send({
            type: 'broadcast',
            event: 'pairing_result',
            payload: { type: 'UNPAIRED', tvId: cleanTvId }
          }).catch(() => {});
          setTimeout(() => supabase.removeChannel(directPairCh), 1000);
        }
      });
    } catch (e) {}

    // 3. Broadcast Local
    try {
      const { getLocalTvSyncChannelName } = await import('../../lib/tvSyncChannel');
      const localChannel = new BroadcastChannel(getLocalTvSyncChannelName(activeSessionId));
      localChannel.postMessage({ type: 'UNPAIRED', tvId: cleanTvId });
      setTimeout(() => localChannel.close(), 100);
    } catch (e) {}

    // 4. Broadcast Supabase Realtime tv-sync
    try {
      const { getTvSyncChannel } = await import('../../lib/tvSyncChannel');
      const activeSbChannel = getTvSyncChannel();
      if (activeSbChannel && activeSbChannel.state === 'joined') {
        activeSbChannel.send({
          type: 'broadcast',
          event: 'tv_sync',
          payload: { type: 'UNPAIRED', tvId: cleanTvId }
        }).catch(() => {});
      }
    } catch (e) {}

    toast.success(t('cast.tv_unlinked'));
  };

  const handleToggleTvSound = async (tvId, currentSoundState) => {
    const cleanTvId = String(tvId || '').replace(/\D/g, '');
    const newVal = !currentSoundState;
    const currentList = getPairedTvs();
    const updatedList = currentList.map(t => String(t.id || '').replace(/\D/g, '') === cleanTvId ? { ...t, soundEnabled: newVal } : t);

    useSettingsStore.getState().setPairedTvs(updatedList);
    setPairedTvs(updatedList);
    window.dispatchEvent(new Event('bq-paired-tvs-updated'));

    // 1. Guardar en Base de Datos de inmediato (Directo + RPC)
    if (activeSessionId) {
      const secret = useSettingsStore.getState().hostSecret;
      if (secret) {
        supabase.rpc('sync_host_config', {
          p_session_id: activeSessionId,
          p_secret: secret,
          p_updates: { paired_tvs: updatedList }
        }).catch(console.error);
      }
      supabase.from('sessions').update({ paired_tvs: updatedList }).eq('id', activeSessionId).catch(() => {});
    }

    // 2. Broadcast Directo al canal específico de la TV (tv-pair-{tvId})
    try {
      const directPairCh = supabase.channel(`tv-pair-${cleanTvId}`);
      directPairCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await directPairCh.send({
            type: 'broadcast',
            event: 'pairing_result',
            payload: { type: 'TOGGLE_SOUND', tvWithSound: newVal, tvId: cleanTvId }
          }).catch(() => {});
          setTimeout(() => supabase.removeChannel(directPairCh), 1000);
        }
      });
    } catch (e) {}

    // 3. Broadcast Local
    try {
      const { getLocalTvSyncChannelName } = await import('../../lib/tvSyncChannel');
      const localChannel = new BroadcastChannel(getLocalTvSyncChannelName(activeSessionId));
      localChannel.postMessage({ type: 'TOGGLE_SOUND', tvWithSound: newVal, tvId: cleanTvId });
      setTimeout(() => localChannel.close(), 100);
    } catch (e) {}

    // 4. Broadcast Supabase Realtime tv-sync
    try {
      const { getTvSyncChannel } = await import('../../lib/tvSyncChannel');
      const activeSbChannel = getTvSyncChannel();
      if (activeSbChannel && activeSbChannel.state === 'joined') {
        activeSbChannel.send({
          type: 'broadcast',
          event: 'tv_sync',
          payload: { type: 'TOGGLE_SOUND', tvWithSound: newVal, tvId: cleanTvId }
        }).catch(() => {});
      }
    } catch (e) {}

    toast.success(newVal ? 'Sonido activado en TV' : 'Sonido silenciado en TV');
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[20000] animate-modal-backdrop">
      <div className="card p-0 max-w-lg w-full shadow-2xl overflow-hidden animate-modal-content flex flex-col max-h-[90vh]">

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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleTvSound(tv.id, tv.soundEnabled)}
                          className={`p-1.5 rounded-lg transition-colors ${tv.soundEnabled ? 'text-accent hover:bg-accent/10' : 'text-text-muted hover:text-white hover:bg-white/10'} ${!isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={tv.soundEnabled ? "Silenciar TV" : "Activar sonido en TV"}
                        >
                          {tv.soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                        </button>
                        <button
                          onClick={() => handleUnpair(tv.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          title={t('cast.unlink_tv')}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Opción 2: Monitor Local (Pestaña Silenciada / Conexión Directa) - Solo disponible para el Anfitrión */}
          {!isAdminMode && (
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
                onClick={() => window.open(`/tv?session=${activeSessionId}&sound=0`, '_blank')}
                className="mt-3 btn-secondary bg-white/5 hover:bg-white/10 w-full py-2.5 text-sm font-semibold"
              >
                {t('cast.local_monitor_btn')}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 shrink-0">
          <button onClick={onClose} className="btn-primary w-full py-3">
            {t('cast.done_btn')}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
