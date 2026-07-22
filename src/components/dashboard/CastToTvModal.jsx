import React from 'react';
import { Monitor, X, Tv, Laptop, Cast, Globe } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

export function CastToTvModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const { isAdminMode, youtubeNativeCast, setYoutubeNativeCast } = useSettingsStore();

  const handleToggleNativeCast = () => {
    setYoutubeNativeCast(!youtubeNativeCast);
    window.location.reload(); // Re-iniciar la página para aplicar los playerVars de YouTube
  };

  return (
    <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
      <div className="card p-0 max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-accent/20 to-transparent border-b border-white/5">
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
              <h2 className="text-xl font-bold text-white">Transmitir a TV</h2>
              <p className="text-text-muted text-sm mt-1">
                Lleva la experiencia de envAIro a la pantalla grande
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isAdminMode ? (
            <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex gap-4">
              <Laptop className="text-accent shrink-0" size={24} />
              <div>
                <h3 className="font-semibold text-white mb-2">Instrucción para el Anfitrión</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  Dado que estás usando el <strong>Control Remoto</strong>, la transmisión debe hacerse desde el dispositivo principal (la PC o laptop que está reproduciendo la música).
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <h3 className="font-semibold text-white">Método Recomendado (Screen Mirroring)</h3>

            <div className="flex gap-4 items-start p-4 bg-black/20 rounded-xl border border-white/5">
              <div className="bg-[#4285F4]/20 p-2 rounded-lg text-[#4285F4] shrink-0 mt-1">
                <Globe size={20} />
              </div>
              <div>
                <h4 className="font-medium text-white text-sm mb-1">Usando Google Chrome o Edge</h4>
                <ol className="text-sm text-text-muted space-y-2 list-decimal list-inside marker:text-accent">
                  <li>Haz clic derecho en cualquier parte vacía de esta página.</li>
                  <li>Selecciona la opción <strong>"Enviar..."</strong> o <strong>"Transmitir..."</strong>.</li>
                  <li>Elige tu Smart TV o Chromecast de la lista.</li>
                  <li>Asegúrate de transmitir la pestaña completa para ver las animaciones y el QR.</li>
                </ol>
              </div>
            </div>

            <div className="flex gap-4 items-start p-4 bg-black/20 rounded-xl border border-white/5">
              <div className="bg-accent/20 p-2 rounded-lg text-accent shrink-0 mt-1">
                <Tv size={20} />
              </div>
              <div>
                <h4 className="font-medium text-white text-sm mb-1">Alternativa: Navegador del Smart TV</h4>
                <p className="text-sm text-text-muted">
                  Si tu televisor tiene un navegador web, simplemente entra a la página de EnvAIro desde ahí e ingresa como Anfitrión. ¡Es la opción con mejor calidad visual!
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-4 bg-black/20 rounded-xl border border-white/5 mt-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-[#FF0000]/20 p-2 rounded-lg text-[#FF0000]">
                    <Monitor size={18} />
                  </div>
                  <h4 className="font-medium text-white text-sm">Cast Nativo de YouTube</h4>
                </div>
                <button
                  onClick={handleToggleNativeCast}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-base ${youtubeNativeCast ? 'bg-accent' : 'bg-white/20'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${youtubeNativeCast ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
              <p className="text-xs text-text-muted leading-relaxed mt-2">
                Habilita los controles originales de YouTube para usar su botón integrado de Cast con tu Chromecast. Al activarlo, la página se recargará.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          <button onClick={onClose} className="btn-primary w-full py-3">
            ¡Entendido!
          </button>
        </div>

      </div>
    </div>
  );
}
