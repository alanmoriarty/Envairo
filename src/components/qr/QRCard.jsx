import React, { useRef, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize2, RefreshCw, QrCode } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

export function QRCard() {
  const { sessionId, regenerateSession } = useSettingsStore();
  const containerRef = useRef(null);
  const guestUrl = `${window.location.origin}/guest/${sessionId}`;

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

  return (
    <div className="card p-5 flex flex-col items-center gap-4">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <QrCode size={18} className="text-accent" />
          <h3 className="font-semibold text-text-primary">Código QR</h3>
        </div>
        <div className="flex gap-2">
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
        className={`bg-white rounded-xl flex flex-col items-center cursor-pointer transition-all ${
          isFullscreen ? 'justify-center w-full h-full gap-8' : 'p-4 gap-3'
        }`}
        onDoubleClick={openFullscreen}
        style={{ background: 'white' }}
      >
        <QRCodeSVG
          value={guestUrl}
          size={qrSize}
          bgColor="#ffffff"
          fgColor="#0D0B14"
          level="H"
          includeMargin={false}
        />
        <p
          className="font-bold text-center"
          style={{ 
            color: '#0D0B14', 
            maxWidth: isFullscreen ? '90%' : 160, 
            fontSize: isFullscreen ? '3rem' : '0.75rem',
            wordBreak: 'break-all' 
          }}
        >
          Envairo
        </p>
      </div>

      <div className="w-full mt-2">
        <p className="text-xs text-text-muted text-center mb-1">URL de invitados:</p>
        <p className="text-xs text-accent text-center break-all bg-bg-elevated rounded-lg px-3 py-2">
          {guestUrl}
        </p>
      </div>
    </div>
  );
}
