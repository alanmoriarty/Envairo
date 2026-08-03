import React, { useEffect } from 'react';

export function AdSense({ slot, style = { display: 'block' }, format = 'auto', responsive = 'true' }) {
  // Usar el client provisto por el usuario por defecto
  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-3924851573190687';

  useEffect(() => {
    if (!clientId) return;

    // Inyectar el script de AdSense dinámicamente si no existe
    let script = document.getElementById('adsense-script');
    if (!script) {
      script = document.createElement('script');
      script.id = 'adsense-script';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    if (slot) {
      try {
        // Evitar empujar anuncios repetidos si ya se cargó para este componente en particular.
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error('Error cargando el anuncio de AdSense:', e);
      }
    }
  }, [clientId, slot]);

  if (!slot) {
    // Si no hay slot, solo queremos cargar el script (ideal para Auto Ads de AdSense)
    return null; 
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
