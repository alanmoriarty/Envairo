import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Tv, CheckCircle2, AlertCircle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { toast } from 'sonner';

export default function PairTVPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawPin = searchParams.get('pin') || searchParams.get('pair_pin') || '';
  const cleanPin = rawPin.replace(/\D/g, '');

  const { user, isAuthenticated } = useAuthStore();
  const { sessionId, isAdminMode, pairedTvs, setPairedTvs } = useSettingsStore();

  const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'no_session' | 'invalid_pin'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (cleanPin.length !== 6) {
      setStatus('invalid_pin');
      return;
    }

    let isMounted = true;

    const pairScreen = async () => {
      try {
        // 1. Obtener sesión de Supabase o de Zustand
        const { data: { session } } = await supabase.auth.getSession();
        const hostUser = session?.user || user;
        const currentAdmin = useSettingsStore.getState().isAdminMode;
        const currentSessionId = useSettingsStore.getState().sessionId;

        const isAuthorizedHost = !!hostUser?.id;
        const isAuthorizedRemote = currentAdmin && !!currentSessionId;

        if (!isAuthorizedHost && !isAuthorizedRemote) {
          if (isMounted) setStatus('no_session');
          return;
        }

        const activeSessionId = isAuthorizedHost ? hostUser.id : currentSessionId;

        const pairChannel = supabase.channel(`tv-pair-${cleanPin}`);
        await pairChannel.subscribe(async (subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            await pairChannel.send({
              type: 'broadcast',
              event: 'pairing_result',
              payload: {
                type: 'PAIRED',
                sessionId: activeSessionId,
                tvWithSound: false
              }
            });

            // Guardar en la lista de TVs emparejadas localmente
            const currentTvs = Array.isArray(useSettingsStore.getState().pairedTvs) ? useSettingsStore.getState().pairedTvs : [];
            const newTv = {
              id: cleanPin,
              name: `Smart TV (${cleanPin.slice(0, 3)}-${cleanPin.slice(3)})`,
              linkedAt: new Date().toISOString()
            };
            const updatedList = [...currentTvs.filter(t => t.id !== cleanPin), newTv];
            setPairedTvs(updatedList);
            window.dispatchEvent(new Event('bq-paired-tvs-updated'));

            toast.success(`¡Pantalla TV (${cleanPin.slice(0, 3)}-${cleanPin.slice(3)}) vinculada con éxito!`, { icon: '📺' });
            if (isMounted) setStatus('success');

            setTimeout(() => {
              supabase.removeChannel(pairChannel);
            }, 1500);
          }
        });
      } catch (err) {
        console.error('Error emparejando TV:', err);
        if (isMounted) {
          setStatus('error');
          setErrorMessage(err.message || 'Error al conectar con la pantalla');
        }
      }
    };

    pairScreen();

    return () => {
      isMounted = false;
    };
  }, [cleanPin, user?.id, sessionId]);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Luces decorativas */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-bg-elevated/90 border border-white/10 p-6 sm:p-8 rounded-3xl backdrop-blur-xl shadow-2xl text-center space-y-6 animate-fade-in">
        {/* Header con icono */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shadow-glow-sm">
          <Tv size={32} />
        </div>

        {status === 'processing' && (
          <div className="space-y-4 py-4">
            <Loader2 size={36} className="text-accent animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-white">Vinculando Pantalla TV...</h2>
            <p className="text-xs text-text-muted">
              Conectando código PIN <span className="font-mono text-accent font-bold">{cleanPin.slice(0, 3)} - {cleanPin.slice(3)}</span> con tu evento activo.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 py-2 animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-success/20 border border-success/40 text-success flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h2 className="text-2xl font-bold text-white">¡Pantalla TV Vinculada!</h2>
            <p className="text-xs text-text-muted leading-relaxed">
              La pantalla esclava <span className="font-mono text-accent font-semibold">{cleanPin.slice(0, 3)} - {cleanPin.slice(3)}</span> ahora mostrará la música, animaciones y solicitudes de tu evento en tiempo real.
            </p>
            <button
              onClick={() => navigate('/app/dashboard')}
              className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 mt-4 text-sm font-bold shadow-glow-sm cursor-pointer"
            >
              <span>Ir al Panel de Control</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {status === 'invalid_pin' && (
          <div className="space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-danger/20 border border-danger/40 text-danger flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <h2 className="text-xl font-bold text-white">Código PIN no válido</h2>
            <p className="text-xs text-text-muted leading-relaxed">
              El código escaneado no contiene un PIN de 6 dígitos correcto. Por favor, escanea nuevamente el código QR en la pantalla TV.
            </p>
            <button
              onClick={() => navigate('/app/dashboard')}
              className="btn-secondary w-full py-3 rounded-xl text-sm font-semibold cursor-pointer"
            >
              Volver al Inicio
            </button>
          </div>
        )}

        {status === 'no_session' && (
          <div className="space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-warning/20 border border-warning/40 text-warning flex items-center justify-center mx-auto">
              <Sparkles size={24} />
            </div>
            <h2 className="text-xl font-bold text-white">Inicia Sesión para Vincular</h2>
            <p className="text-xs text-text-muted leading-relaxed">
              Para vincular la pantalla <span className="font-mono text-accent font-bold">{cleanPin.slice(0, 3)} - {cleanPin.slice(3)}</span>, inicia sesión con tu cuenta de Anfitrión o escanea tu QR de Control Remoto.
            </p>
            <button
              onClick={() => navigate('/')}
              className="btn-primary w-full py-3 rounded-xl text-sm font-bold shadow-glow-sm cursor-pointer"
            >
              Iniciar Sesión
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-danger/20 border border-danger/40 text-danger flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <h2 className="text-xl font-bold text-white">Error de Conexión</h2>
            <p className="text-xs text-text-muted">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary w-full py-3 rounded-xl text-sm font-bold shadow-glow-sm cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
