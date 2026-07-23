import React, { useState } from 'react';
import { Tv, X, CheckCircle2, Trash2, Smartphone, Sparkles, MonitorPlay } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

export function TVPairingModal({ isOpen, onClose }) {
  const [pinInput, setPinInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const { sessionId, hostSecret } = useSettingsStore();
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

  if (!isOpen) return null;

  const handlePair = async (e) => {
    e?.preventDefault();
    const cleanPin = pinInput.replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      toast.error('El código PIN debe tener 6 dígitos (ej: 482910)');
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
          hostSecret
        }
      });

      // Guardar la TV en el registro local del anfitrión
      const newTv = {
        id: cleanPin,
        name: `Smart TV (${cleanPin.slice(0, 3)}-${cleanPin.slice(3)})`,
        linkedAt: new Date().toISOString()
      };
      
      const updatedList = [...pairedTvs.filter(t => t.id !== cleanPin), newTv];
      setPairedTvs(updatedList);
      localStorage.setItem('bq-paired-tvs', JSON.stringify(updatedList));

      toast.success(`¡TV (${cleanPin.slice(0, 3)}-${cleanPin.slice(3)}) vinculada con éxito!`);
      setPinInput('');
      
      setTimeout(() => {
        supabase.removeChannel(pairChannel);
      }, 2000);
    } catch (err) {
      console.error(err);
      toast.error('Error al vincular la TV. Verifica el código e intenta nuevamente.');
    } finally {
      setIsPairing(false);
    }
  };

  const handleUnpair = (tvId) => {
    // Transmitir desconexión a esa TV
    const pairChannel = supabase.channel(`tv-pair-${tvId}`);
    pairChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await pairChannel.send({
          type: 'broadcast',
          event: 'pairing_result',
          payload: { type: 'UNPAIRED' }
        });
        supabase.removeChannel(pairChannel);
      }
    });

    const updatedList = pairedTvs.filter(t => t.id !== tvId);
    setPairedTvs(updatedList);
    localStorage.setItem('bq-paired-tvs', JSON.stringify(updatedList));
    toast.success('Pantalla TV desvinculada');
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-bg-elevated border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
              <Tv size={22} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-snug">Vincular Pantalla TV</h3>
              <p className="text-xs text-text-muted">Conecta Smart TVs a través de Internet</p>
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
              Código PIN de la TV (6 dígitos)
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
                {isPairing ? 'Vinculando...' : 'Vincular TV'}
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
              Abre <span className="text-white font-medium">envairo.app/tv</span> en cualquier Smart TV. Copia el PIN que aparece en la pantalla y presiona Vincular.
            </p>
          </div>
        </form>

        {/* Lista de TVs vinculadas */}
        {pairedTvs.length > 0 && (
          <div className="mt-6 pt-5 border-t border-white/10">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Pantallas Vinculadas ({pairedTvs.length})
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
                      <p className="text-[10px] text-text-muted">Conectado vía Realtime</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnpair(tv.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    title="Desvincular TV"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
