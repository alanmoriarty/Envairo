import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings, BarChart2, Zap,
  HelpCircle, LogOut, Music2, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { clearSpotifyTokens } from '../../lib/spotifyAuth';

const NAV_ITEMS = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/metrics', icon: BarChart2, label: 'Métricas' },
  { to: '/app/activities', icon: Zap, label: 'Actividades' },
  { to: '/app/settings', icon: Settings, label: 'Configuración' },
  { to: '/app/support', icon: HelpCircle, label: 'Soporte' },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearSpotifyTokens();
    logout();
    navigate('/');
  };

  return (
    <aside className="w-64 bg-bg-card border-r border-white/5 flex flex-col h-full fixed left-0 top-0 z-40">
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
      {user && (
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
              <p className="text-xs text-text-muted truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            <ChevronRight size={14} className="opacity-30" />
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="nav-link w-full text-danger hover:text-danger hover:bg-danger/10"
        >
          <LogOut size={18} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
