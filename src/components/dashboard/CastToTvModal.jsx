import React from 'react';
import { Monitor, X, Tv, Laptop, Cast, Globe } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

export function CastToTvModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const { isAdminMode } = useSettingsStore();

  return (
    <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
      <div className="card p-0 max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="relative p-6 bg-gradient-to-br from-accent/20 to-transparent border-b border-white/5 shrink-0">
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
        <div className="p-6 space-y-6 overflow-y-auto">
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
            <h3 className="font-semibold text-white">Gestor de Múltiples Pantallas</h3>

            <div className="flex flex-col gap-2 p-4 bg-accent/10 rounded-xl border border-accent/20 mt-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="bg-accent p-2 rounded-lg text-black">
                    <Monitor size={18} />
                  </div>
                  <div>
                    <h4 className="font-medium text-accent text-sm mb-0">Monitor Esclavo</h4>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                      Abre una pestaña "Esclava" en silencio que muestra el video en pantalla completa, perfecta para arrastrarla a otros televisores conectados a esta misma PC. Puedes abrir tantas como necesites.
                    </p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => window.open('/tv', '_blank')}
                className="mt-4 btn-secondary bg-white/5 hover:bg-white/10 w-full py-3 text-sm font-semibold"
              >
                Abrir Pestaña de Monitor (Silenciada)
              </button>
            </div>
            
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 shrink-0">
          <button onClick={onClose} className="btn-primary w-full py-3">
            ¡Entendido!
          </button>
        </div>

      </div>
    </div>
  );
}
