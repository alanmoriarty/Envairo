import React, { useEffect } from 'react';

export function AdSense({ slot, style = { display: 'block' }, format = 'auto', responsive = 'true' }) {
  useEffect(() => {
    try {
      // Evitar empujar anuncios repetidos si ya se cargó para este componente en particular.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Error cargando el anuncio de AdSense:', e);
    }
  }, []);

  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID;

  if (!clientId) {
    // Si no hay ID de cliente en desarrollo, mostramos un placeholder (comenta esto en prod si prefieres)
    if (import.meta.env.DEV) {
      return (
        <div className="w-full h-[100px] bg-bg-elevated border border-dashed border-white/20 rounded-xl flex items-center justify-center text-text-muted text-sm">
          [AdSense Placeholder: {slot}]
        </div>
      );
    }
    return null; // En producción, si no hay clave, mejor no mostrar nada
  }

  return (
    <div className="adsense-container w-full overflow-hidden text-center mx-auto my-4">
      <ins
        className="adsbygoogle"
        style={style}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive}
      />
    </div>
  );
}
