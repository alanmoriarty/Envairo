import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Tv, X, CheckCircle2, Trash2, Smartphone, Sparkles, MonitorPlay } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from '../../store/useLanguageStore';

export function TVPairingModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [pinInput, setPinInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const { sessionId, hostSecret } = useSettingsStore();
  const user = useAuthStore(s => s.user);
  const activeSessionId = user?.id || sessionId;

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
              sessionId: activeSessionId
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
        setIsPairing(false);
        return;
      }

      // Guardar la TV en el registro local del anfitrión
      const newTv = {
        id: cleanPin,
        name: `Smart TV (${cleanPin.slice(0, 3)}-${cleanPin.slice(3)})`,
        linkedAt: new Date().toISOString()
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

      if (activeSessionId) {
        const secret = useSettingsStore.getState().hostSecret;
        if (secret) {
          try {
            await supabase.rpc('sync_host_config', {
              p_session_id: activeSessionId,
              p_secret: secret,
              p_updates: { paired_tvs: updatedList }
            });
          } catch (rpcErr) {
            console.error('Error syncing paired_tvs via RPC:', rpcErr);
          }
        }
        try {
          await supabase.from('sessions').update({ paired_tvs: updatedList }).eq('id', activeSessionId);
        } catch (dbErr) {
          console.error('Error updating paired_tvs table:', dbErr);
        }
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
    // Transmitir desconexión a esa TV
    const pairChannel = supabase.channel(`tv-pair-${tvId}`);
    pairChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await pairChannel.send({
          type: 'broadcast',
          event: 'pairing_result',
          payload: { type: 'UNPAIRED', tvId }
        });
        setTimeout(() => supabase.removeChannel(pairChannel), 500);
      }
    });

    const updatedList = getPairedTvs().filter(t => t.id !== tvId);
    useSettingsStore.getState().setPairedTvs(updatedList);
    setPairedTvs(updatedList);
    window.dispatchEvent(new Event('bq-paired-tvs-updated'));

    if (activeSessionId) {
      const secret = useSettingsStore.getState().hostSecret;
      if (secret) {
        try {
          await supabase.rpc('sync_host_config', {
            p_session_id: activeSessionId,
            p_secret: secret,
            p_updates: { paired_tvs: updatedList }
          });
        } catch (rpcErr) {
          console.error('Error syncing paired_tvs via RPC:', rpcErr);
        }
      }
      try {
        await supabase.from('sessions').update({ paired_tvs: updatedList }).eq('id', activeSessionId);
      } catch (dbErr) {
        console.error('Error updating paired_tvs table:', dbErr);
      }
    }

    toast.success(t('cast.tv_unlinked'));
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-modal-backdrop"
      onClick={onClose}
    >
      <div 
        className="bg-bg-elevated border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-text-primary animate-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
              <Tv size={22} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-snug">{t('cast.tv_pairing_title')}</h3>
              <p className="text-xs text-text-muted">{t('cast.tv_pairing_subtitle')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="btn-ghost p-2 rounded-xl text-text-muted hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handlePair} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
              {t('cast.pin_label')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="482910"
                className="input-field text-center font-mono text-xl tracking-[0.3em] font-bold uppercase py-3 border-white/20 focus:border-accent"
              />
              <button
                type="submit"
                disabled={isPairing || pinInput.length !== 6}
                className="btn-accent px-5 font-semibold text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
              >
                {isPairing ? t('cast.pairing_btn') : t('cast.pair_btn')}
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t('cast.pin_desc')) }} />
          </div>
        </form>

        {/* Lista de TVs vinculadas */}
        {pairedTvs.length > 0 && (
          <div className="mt-6 pt-5 border-t border-white/10">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {t('cast.linked_screens', { count: pairedTvs.length })}
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {pairedTvs.map((tv) => (
                <div 
                  key={tv.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MonitorPlay size={18} className="text-accent" />
                    <div>
                      <p className="text-xs font-semibold">{tv.name}</p>
                      <p className="text-[10px] text-text-muted">{t('cast.realtime_connected')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnpair(tv.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    title={t('cast.unlink_tv')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
