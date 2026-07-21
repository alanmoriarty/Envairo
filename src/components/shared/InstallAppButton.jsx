import React from 'react';
import { Download } from 'lucide-react';
import { usePwaStore } from '../../store/usePwaStore';

export function InstallAppButton({ className = '', text = 'Instalar App' }) {
  const { isInstallable, deferredPrompt, clearPrompt } = usePwaStore();

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    // Optionally, send analytics event with outcome of user choice
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    clearPrompt();
  };

  if (!isInstallable) return null;

  return (
    <button
      onClick={handleInstallClick}
      className={`btn-primary flex items-center justify-center gap-2 ${className}`}
    >
      <Download size={18} />
      {text}
    </button>
  );
}
