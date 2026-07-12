import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PersistentPlayer } from './PersistentPlayer';
import { useSpotifySDK } from '../../hooks/useSpotifySDK';
import { useAutoDJ } from '../../hooks/useAutoDJ';

export function RootLayout() {
  const { controls } = useSpotifySDK();
  useAutoDJ(controls);

  return (
    <div className="flex h-screen bg-bg-root overflow-hidden">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-y-auto pb-20">
        <div className="radial-gradient-bg min-h-full">
          <Outlet />
        </div>
      </main>
      <PersistentPlayer />
    </div>
  );
}
