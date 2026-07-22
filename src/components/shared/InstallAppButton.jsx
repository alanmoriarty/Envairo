import React from 'react';
import { Download } from 'lucide-react';
import { usePwaStore } from '../../store/usePwaStore';

export function InstallAppButton({ className = '', text = 'Instalar App', variant = 'primary' }) {
  const { isInstallable, deferredPrompt, clearPrompt } = usePwaStore();

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      import('sonner').then(({ toast }) => {
        toast.info("Abre el menú de tu navegador y busca 'Instalar app' o 'Añadir a inicio'.");
      });
      return;
    }
    
    try {
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'dismissed') {
        import('sonner').then(({ toast }) => {
          toast.info("Si la instalación no se abre, busca 'Añadir a inicio' en el menú de tu navegador.", { duration: 5000 });
        });
      }
      
      // Optionally, send analytics event with outcome of user choice
      console.log(`User response to the install prompt: ${outcome}`);
      
      // We've used the prompt, and can't use it again, throw it away
      clearPrompt();
    } catch (error) {
      console.error('Error with PWA prompt:', error);
      import('sonner').then(({ toast }) => {
        toast.info("Instalación bloqueada. Abre el menú del navegador y selecciona 'Añadir a inicio'.", { duration: 5000 });
      });
    }
  };

  return (
    <button
      onClick={handleInstallClick}
      className={`flex items-center justify-center gap-2 ${variant === 'primary' ? 'btn-primary' : ''} ${className}`}
    >
      <Download size={18} />
      {text}
    </button>
  );
}
