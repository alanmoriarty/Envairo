import React, { useRef, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize2, RefreshCw, QrCode, SmartphoneNfc } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from '../../store/useLanguageStore';
import { usePlayerStore } from '../../store/usePlayerStore';

export function QRCard() {
  const { t } = useTranslation();
  const { sessionId, regenerateSession, hostSecret } = useSettingsStore();
  const playbackEngine = usePlayerStore(s => s.playbackEngine);
  const containerRef = useRef(null);
  const [showAdminQR, setShowAdminQR] = useState(false);
  const guestUrl = `${window.location.origin}/guest/${sessionId}`;
  const adminUrl = `${window.location.origin}/?session=${sessionId}&admin=${hostSecret}`;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });

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
  const currentUrl = showAdminQR ? adminUrl : guestUrl;
  
  const qrImage = playbackEngine === 'youtube' 
    ? "https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg"
    : "https://upload.wikimedia.org/wikipedia/commons/2/26/Spotify_logo_with_text.svg";

  return (
    <div className="card p-5 flex flex-col items-center gap-4">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <QrCode size={18} className={showAdminQR ? "text-danger" : "text-accent"} />
          <h3 className="font-semibold text-text-primary">{showAdminQR ? t('dashboard.qr_admin') : t('dashboard.qr_guest')}</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdminQR(!showAdminQR)}
            className={`btn-ghost p-2 ${showAdminQR ? 'text-danger hover:bg-danger/10' : ''}`}
            title="Vincular Dispositivo Host"
          >
            <SmartphoneNfc size={14} />
          </button>
          <button
            onClick={regenerateSession}
            className="btn-ghost p-2"
            title="Regenerar sesión"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={openFullscreen}
            className="btn-ghost p-2"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className={`bg-white p-4 rounded-xl transition-all relative ${isFullscreen ? 'flex flex-col items-center justify-center bg-bg-root' : ''} ${showAdminQR ? 'ring-2 ring-danger/50' : ''}`}
      >
        {isFullscreen && (
          <button
            onClick={openFullscreen}
            className="absolute top-4 right-4 p-3 bg-danger text-white rounded-full shadow-lg z-50 flex items-center justify-center border-2 border-bg-root"
            title="Cerrar pantalla completa"
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
    </div>
  );
}
