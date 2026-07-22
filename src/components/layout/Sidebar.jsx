import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings, BarChart2, Zap,
  HelpCircle, LogOut, Music2, ChevronRight, XCircle, Palette, QrCode
} from 'lucide-react';
import { QRCard } from '../qr/QRCard';
import { useAuthStore } from '../../store/useAuthStore';
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
  const { isAdminMode, setSessionId, setHostSecret, setIsAdminMode, themeColor, setThemeColor } = useSettingsStore();
  const navigate = useNavigate();
  const [showQRModal, setShowQRModal] = useState(false);
  const { t } = useTranslation();

  const visibleNavItems = isAdminMode
    ? NAV_KEYS.filter(item => item.key === 'nav.dashboard' || item.key === 'nav.activities')
    : NAV_KEYS;

  const handleLogout = async () => {
    try {
      const { supabase } = await import('../../lib/supabase');
      const settingsState = useSettingsStore.getState();
      const authState = useAuthStore.getState();
      const currentSessionId = authState.user?.id || settingsState.sessionId;

      if (currentSessionId) {
        // Limpiar peticiones al cerrar sesión
        await supabase.from('requests').delete().eq('session_id', currentSessionId);
      }

      const { usePlayerStore } = await import('../../store/usePlayerStore');
      const state = usePlayerStore.getState();

      if (state.youtubePlayer) {
        state.youtubePlayer.pauseVideo();
      }

      // Limpiar cola local, peticiones e historial para no dejar rastro
      state.clearPlayerState();
      // NO llamar a clearSettingsState() aquí, ya se encarga useAuthStore.logout() al final.

    } catch (err) {
      // Ignore errors during logout
    }

    if (usePlayerStore.getState().playbackEngine !== 'youtube') {
      localStorage.removeItem('spotify_access_token');
      localStorage.removeItem('spotify_refresh_token');
    }

    await logout();
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

      <aside className={`w-64 glass rounded-none border-y-0 border-l-0 flex flex-col h-full fixed left-0 top-0 z-50 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img
                src="/envAIro-logo-horizontal.svg"
                alt="envAIro"
                className="h-10 w-auto"
              />
            </div>

            <button
              onClick={() => setShowQRModal(true)}
              className="w-10 h-10 rounded-xl bg-bg-elevated border border-white/10 hover:border-accent/50 hover:bg-accent/10 transition-all flex items-center justify-center shadow-sm"
              title="Mostrar Código QR"
            >
              <QrCode size={20} className="text-accent" />
            </button>
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
                  {user.email}
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

            <div className="pt-2 pb-2 flex justify-center">
              <div className="relative group">
                <button
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-bg-elevated border border-white/10 hover:border-white/30 transition-all shadow-sm relative overflow-hidden"
                  title={t('nav.theme') || 'Tema'}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-red-500/20 via-emerald-500/20 to-blue-500/20 opacity-40 group-hover:opacity-100 transition-opacity" />
                  <Palette size={18} className="text-white relative z-10" />
                </button>

                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 p-2 rounded-2xl bg-bg-card/95 backdrop-blur-xl border border-white/10 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 flex gap-2">
                  {[
                    { id: 'default', label: 'Default', hex: 'bg-bg-elevated border-white/20' },
                    { id: 'red', label: 'Crimson', hex: 'bg-red-500' },
                    { id: 'blue', label: 'Ocean', hex: 'bg-blue-500' },
                    { id: 'green', label: 'Emerald', hex: 'bg-emerald-500' },
                    { id: 'amber', label: 'Sunset', hex: 'bg-amber-500' }
                  ].map(color => (
                    <div key={color.id} className="relative group/tooltip flex justify-center">
                      <button
                        onClick={() => setThemeColor(color.id)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${themeColor === color.id ? 'border-white scale-110 shadow-glow-sm' : 'border-transparent hover:scale-110 opacity-60 hover:opacity-100'} ${color.hex}`}
                      />
                      <span className="absolute -top-8 bg-bg-elevated text-text-primary text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10 shadow-xl">
                        {color.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </nav>
      </aside>



      {showQRModal && (
        <div className="fixed inset-0 bg-bg-base/90 backdrop-blur-md flex flex-col items-center justify-center z-[110] p-4">
          <div className="relative w-full max-w-sm animate-in zoom-in-95 fade-in">
            <button
              onClick={() => setShowQRModal(false)}
              className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors"
            >
              <XCircle size={32} />
            </button>
            <QRCard />
          </div>
        </div>
      )}
    </>
  );
}
