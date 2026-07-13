import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PersistentPlayer } from './PersistentPlayer';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { useAutoDJ } from '../../hooks/useAutoDJ';
import { Menu, Music2 } from 'lucide-react';

export function RootLayout() {
  const { controls } = useSpotifySDK();
  useAutoDJ(controls);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-bg-root overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-bg-card border-b border-white/5 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <Music2 size={16} className="text-accent" />
          </div>
          <span className="font-bold text-text-primary">Envairo</span>
        </div>
        <button onClick={() => setSidebarOpen(true)} className="p-2 text-text-muted hover:text-white">
          <Menu size={24} />
        </button>
      </div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <main className="flex-1 md:ml-64 mt-16 md:mt-0 overflow-y-auto pb-24 md:pb-20">
        <div className="radial-gradient-bg min-h-full">
          <Outlet />
        </div>
      </main>
      <PersistentPlayer />
    </div>
  );
}
