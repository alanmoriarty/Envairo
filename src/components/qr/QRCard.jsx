import React, { useRef, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize2, RefreshCw, QrCode, SmartphoneNfc } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from '../../store/useLanguageStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { supabase } from '../../lib/supabase';

export function QRCard() {
  const { t } = useTranslation();
  const { sessionId, regenerateSession, hostSecret } = useSettingsStore();
  const playbackEngine = usePlayerStore(s => s.playbackEngine);
  const containerRef = useRef(null);
  const [showAdminQR, setShowAdminQR] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [qrToken, setQrToken] = useState(null); // Token de acceso embebido en la URL del QR

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Cargar el token QR actual desde Supabase
  useEffect(() => {
    if (!sessionId) return;
    supabase
      .from('sessions')
      .select('qr_token, qr_issued_at')
      .eq('id', sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.qr_token) setQrToken(data.qr_token);
      });
  }, [sessionId]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const openFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen();
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const qrSize = isFullscreen ? Math.min(windowSize.w, windowSize.h) * 0.7 : 160;

  // URL de invitado con token embebido (expira en 6h desde que se emitió el QR)
  const guestUrl = qrToken
    ? `${window.location.origin}/guest/${sessionId}?t=${qrToken}`
    : `${window.location.origin}/guest/${sessionId}`;
  const adminUrl = `${window.location.origin}/?session=${sessionId}&admin=${hostSecret}`;
  const currentUrl = showAdminQR ? adminUrl : guestUrl;
  
  const handleRegenerate = async () => {
    // 1. Invalidar la sesión actual (QR anterior deja de funcionar)
    await supabase.rpc('sync_host_config', { 
      p_session_id: sessionId, 
      p_secret: hostSecret, 
      p_updates: { active: false, secret: 'regenerated' } 
    });
    // 2. Rotar el token QR → el QR anterior queda invalido inmediatamente
    const { data: newToken } = await supabase.rpc('rotate_qr_token', {
      p_session_id: sessionId,
      p_secret: hostSecret
    });
    if (newToken) setQrToken(newToken);
    // 3. Generar nueva sesión (nuevo sessionId)
    regenerateSession();
    setShowConfirm(false);
  };

  const qrImage = playbackEngine === 'youtube' 
    ? "https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
    : "https://upload.wikimedia.org/wikipedia/commons/2/26/Spotify_logo_with_text.svg";

  return (
    <div className="card p-5 flex flex-col items-center gap-4 relative overflow-hidden">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <QrCode size={18} className={showAdminQR ? "text-danger" : "text-accent"} />
          <h3 className="font-semibold text-text-primary">{showAdminQR ? t('dashboard.qr_admin') : t('dashboard.qr_guest')}</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdminQR(!showAdminQR)}
            className={`btn-ghost p-2 ${showAdminQR ? 'text-danger hover:bg-danger/10' : ''}`}
            title={t('dashboard.link_host_device')}
          >
            <SmartphoneNfc size={14} />
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            className="btn-ghost p-2"
            title={t('dashboard.regenerate_session')}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={openFullscreen}
            className="btn-ghost p-2"
            title={isFullscreen ? t('dashboard.exit_fullscreen') : t('dashboard.fullscreen')}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className={`bg-white p-4 rounded-xl transition-all relative ${isFullscreen ? 'flex flex-col items-center justify-center bg-bg-root' : ''} ${showAdminQR ? 'ring-2 ring-danger/50' : ''} ${!showAdminQR ? 'cursor-pointer hover:opacity-90' : ''}`}
        onClick={() => {
          if (!showAdminQR) {
            window.open(guestUrl, '_blank');
          }
        }}
        title={!showAdminQR ? t('dashboard.open_guest_view') : ""}
      >
        {isFullscreen && (
          <button
            onClick={openFullscreen}
            className="absolute top-4 right-4 p-3 bg-danger text-white rounded-full shadow-lg z-50 flex items-center justify-center border-2 border-bg-root"
            title={t('dashboard.exit_fullscreen')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
        <QRCodeSVG
          value={currentUrl}
          size={qrSize}
          level="H"
          includeMargin={true}
          imageSettings={{
            src: qrImage,
            x: undefined,
            y: undefined,
            height: 24,
            width: 24,
            excavate: true,
          }}
        />
        {isFullscreen && (
          <div className="mt-8 text-center px-6">
            <h2 className={`text-3xl sm:text-4xl font-bold mb-4 ${showAdminQR ? 'text-danger' : 'text-white'}`}>
              {showAdminQR ? t('dashboard.qr_admin_title') : t('dashboard.qr_guest_title')}
            </h2>
            <p className="text-lg sm:text-xl text-white/70">
              {showAdminQR ? t('dashboard.qr_admin_sub') : t('dashboard.qr_guest_sub')}
            </p>
          </div>
        )}
      </div>

      {!isFullscreen && (
        <div className="w-full">
          <p className="text-sm text-center text-text-muted mb-2 font-medium">
            {t('dashboard.qr_share_link')}
          </p>
          <div className={`p-3 rounded-lg flex items-center justify-between gap-2 border ${showAdminQR ? 'bg-danger/10 border-danger/20' : 'bg-bg-elevated border-white/5'}`}>
            <span className={`text-xs truncate ${showAdminQR ? 'text-danger/80' : 'text-text-subtle'}`}>{currentUrl}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(currentUrl);
                import('sonner').then(({ toast }) => toast.success(t('common.copied')));
              }}
              className="text-accent hover:text-accent-light text-xs font-semibold px-2 py-1 rounded hover:bg-accent/10 transition-colors whitespace-nowrap"
            >
              {t('common.copy')}
            </button>
          </div>
          {showAdminQR && (
            <p className="text-xs text-danger mt-2 text-center animate-pulse">
              ⚠️ {t('dashboard.admin_warning')}
            </p>
          )}
        </div>
      )}

      {showConfirm && (
        <div className="absolute inset-0 bg-bg-root/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
          <RefreshCw size={32} className="text-danger mb-3" />
          <h4 className="font-bold text-text-primary mb-2">{t('dashboard.regenerate_qr_title')}</h4>
          <p className="text-xs text-text-muted mb-6 leading-relaxed">
            {t('dashboard.regenerate_qr_desc')}
          </p>
          <div className="flex gap-3 w-full">
            <button 
              onClick={() => setShowConfirm(false)} 
              className="px-4 py-2 flex-1 rounded-xl bg-bg-elevated text-text-primary hover:bg-white/10 transition-colors font-semibold"
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={handleRegenerate} 
              className="px-4 py-2 flex-1 rounded-xl bg-danger hover:bg-danger/80 text-white transition-colors font-semibold shadow-glow-sm"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
