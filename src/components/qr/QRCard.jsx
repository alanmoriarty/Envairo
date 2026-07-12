import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize2, RefreshCw, QrCode } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

export function QRCard() {
  const { sessionId, regenerateSession } = useSettingsStore();
  const containerRef = useRef(null);
  const guestUrl = `${window.location.origin}/guest/${sessionId}`;

  const openFullscreen = () => {
    if (containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen();
    }
  };

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
            title="Pantalla completa"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="bg-white p-4 rounded-xl flex flex-col items-center gap-3 cursor-pointer"
        onDoubleClick={openFullscreen}
        style={{ background: 'white' }}
      >
        <QRCodeSVG
          value={guestUrl}
          size={160}
          bgColor="#ffffff"
          fgColor="#0D0B14"
          level="H"
          includeMargin={false}
        />
        <p
          className="text-xs font-bold text-center"
          style={{ color: '#0D0B14', maxWidth: 160, wordBreak: 'break-all' }}
        >
          Envairo
        </p>
      </div>

      <div className="w-full">
        <p className="text-xs text-text-muted text-center mb-1">URL de invitados:</p>
        <p className="text-xs text-accent text-center break-all bg-bg-elevated rounded-lg px-3 py-2">
          {guestUrl}
        </p>
      </div>

      <button className="btn-primary w-full text-sm py-2" onClick={openFullscreen}>
        <Maximize2 size={14} className="inline mr-2" />
        Proyectar en pantalla completa
      </button>
    </div>
  );
}
