import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings, BarChart2, Zap,
  HelpCircle, LogOut, Music2, ChevronRight, XCircle
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { clearSpotifyTokens } from '../../lib/spotifyAuth';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { LanguageSelector } from '../ui/LanguageSelector';
import { useTranslation } from '../../store/useLanguageStore';

const NAV_KEYS = [
  { to: '/app/dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/app/metrics', icon: BarChart2, key: 'nav.metrics' },
  { to: '/app/activities', icon: Zap, key: 'nav.activities' },
  { to: '/app/settings', icon: Settings, key: 'nav.settings' },
  { to: '/app/support', icon: HelpCircle, key: 'nav.support' },
];

export function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuthStore();
  const { isAdminMode, setSessionId, setHostSecret, setIsAdminMode } = useSettingsStore();
  const navigate = useNavigate();
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const isPremium = user?.product === 'premium';
  const { t } = useTranslation();

  const visibleNavItems = isAdminMode
    ? NAV_KEYS.filter(item => item.key === 'nav.dashboard' || item.key === 'nav.activities')
    : NAV_KEYS;

  const handleLogout = async () => {
    try {
      const { usePlayerStore } = await import('../../store/usePlayerStore');
      const state = usePlayerStore.getState();
      
      if (state.playbackEngine === 'youtube') {
        if (state.youtubePlayer) {
           state.youtubePlayer.pauseVideo();
        }
      } else {
        const { pausePlayback } = await import('../../lib/spotifyApi');
        // Attempt to pause local SDK player
        if (state.player) {
          state.player.pause().catch(() => {});
          setTimeout(() => {
             state.player.disconnect();
          }, 100);
        }
        
        // Attempt to pause active device via API
        const activeDevice = state.activeDeviceId || state.deviceId;
        if (activeDevice) {
          await pausePlayback(activeDevice).catch(() => {});
        }
      }
    } catch (err) {
      // Ignore errors during logout
    }

    if (usePlayerStore.getState().playbackEngine !== 'youtube') {
      clearSpotifyTokens();
    }
    logout();
    navigate('/');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`w-64 bg-bg-card border-r border-white/5 flex flex-col h-full fixed left-0 top-0 z-50 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shadow-glow-sm">
            <Music2 size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="font-bold text-text-primary leading-none">Envairo</h1>
            <p className="text-xs text-accent font-semibold">QR</p>
          </div>
        </div>
      </div>

      {/* User info */}
      {user ? (
        <div className="px-4 py-4 border-b border-white/5">
          <div className="flex items-center gap-3 p-3 bg-bg-elevated rounded-xl">
            {user.images?.[0]?.url ? (
              <img
                src={user.images[0].url}
                alt="avatar"
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center text-sm font-bold text-accent">
                {user.display_name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {user.display_name}
              </p>
              <p className="text-xs text-text-muted truncate">
                {user.email} {!isPremium && <span className="text-warning">(Free)</span>}
              </p>
            </div>
          </div>
        </div>
      ) : isAdminMode && (
        <div className="px-4 py-4 border-b border-white/5">
          <div className="flex items-center gap-3 p-3 bg-bg-elevated rounded-xl">
            <div className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center text-sm font-bold text-accent">
              R
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                Control Remoto
              </p>
              <p className="text-xs text-text-muted truncate">
                Modo Admin
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto pb-24">
        {visibleNavItems.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            onClick={(e) => {
              if (!isPremium && !isAdminMode && ['/app/dashboard', '/app/activities', '/app/settings'].includes(to)) {
                e.preventDefault();
                setShowPremiumModal(true);
                return;
              }
              onClose();
            }}
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={18} />
            <span className="flex-1">{t(key)}</span>
            <ChevronRight size={14} className="opacity-30" />
          </NavLink>
        ))}

        <div className="pt-4 mt-4 border-t border-white/5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-text-muted font-semibold uppercase tracking-wider">Idioma / Language</span>
            <LanguageSelector />
          </div>
          <button
            onClick={handleLogout}
            className="nav-link w-full text-danger hover:text-danger hover:bg-danger/10"
          >
            <LogOut size={18} />
            <span className="flex-1 text-left">{t('nav.logout')}</span>
          </button>
        </div>
      </nav>
    </aside>

    {showPremiumModal && (
      <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm flex flex-col items-center justify-center z-[100]">
        <div className="card p-8 flex flex-col items-center text-center max-w-md w-full animate-in zoom-in-95 fade-in mx-4">
          <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center text-warning mb-4">
            <XCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            Se requiere Spotify Premium
          </h2>
          <p className="text-text-muted text-sm mb-6">
            El Dashboard, Actividades y Configuración controlan el reproductor en tiempo real. 
            Debido a las políticas de Spotify, estas funciones son exclusivas para usuarios con una cuenta Premium activa.
          </p>
          <div className="flex flex-col w-full gap-3">
            <a 
              href="https://www.spotify.com/premium/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn-primary w-full py-3 flex items-center justify-center"
            >
              Obtener Spotify Premium
            </a>
            <button 
              onClick={() => setShowPremiumModal(false)} 
              className="btn-ghost w-full py-3 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
