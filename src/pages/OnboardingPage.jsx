import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Play, CheckCircle2, Music2, Tv, Sparkles, CreditCard, LogOut, Zap } from 'lucide-react';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Cargar el script de Lemon Squeezy
  useEffect(() => {
    const scriptId = 'lemonsqueezy-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://assets.lemonsqueezy.com/lemon.js';
      script.async = true;
      script.onload = () => {
        if (window.createLemonSqueezy) {
          window.createLemonSqueezy();
        }
      };
      document.body.appendChild(script);
    } else if (window.createLemonSqueezy) {
      window.createLemonSqueezy();
    }
  }, []);

  // Preparar el enlace de Lemon Squeezy con el ID del usuario
  const checkoutUrl = user?.id 
    ? `https://envairoqr.lemonsqueezy.com/checkout/buy/83e978c3-4231-475d-975d-5284c586fc4c?checkout[custom][user_id]=${user.id}`
    : '#';

  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-4 md:p-8 flex items-center justify-center relative overflow-hidden">
      {/* Elementos decorativos de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-6xl z-10 space-y-8 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-lg shadow-accent/20">
              <Music2 size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Envairo</h1>
              <p className="text-xs text-text-muted">Gestión Musical Inteligente</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-semibold">{user?.email}</p>
              <p className="text-xs text-text-muted">Cuenta Básica</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Columna Izquierda: Información y Video */}
          <div className="lg:col-span-7 space-y-6">
            <div className="card p-6 md:p-8 border border-white/10 bg-black/20 backdrop-blur-xl">
              <h2 className="text-3xl font-bold text-white mb-2">¡Bienvenido a Envairo! 🎉</h2>
              <p className="text-text-muted text-lg mb-8 leading-relaxed">
                Estás a un paso de revolucionar la experiencia musical en tu negocio. 
                Envairo te permite gestionar la música de forma colaborativa y sin esfuerzo gracias a nuestra Inteligencia Artificial.
              </p>

              {/* Video Placeholder */}
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/40 border border-white/10 group flex items-center justify-center mb-8">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <button className="relative z-10 w-16 h-16 rounded-full bg-accent/80 text-white flex items-center justify-center backdrop-blur-md transition-transform group-hover:scale-110 shadow-[0_0_30px_rgba(157,78,221,0.5)]">
                  <Play size={28} className="ml-1" />
                </button>
                <div className="absolute bottom-4 left-4 z-10">
                  <p className="font-semibold text-white">¿Cómo funciona Envairo?</p>
                  <p className="text-xs text-white/70">Video explicativo (1:24)</p>
                </div>
              </div>

              {/* Beneficios */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex gap-3 items-start p-4 rounded-xl bg-white/5 border border-white/5">
                  <Sparkles className="text-accent shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-semibold text-sm text-white">AutoDJ Inteligente</h4>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">Nuestra IA toma el control cuando la cola está vacía, asegurando que la música nunca se detenga.</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start p-4 rounded-xl bg-white/5 border border-white/5">
                  <Tv className="text-blue-400 shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-semibold text-sm text-white">Pantallas TV (Digital Signage)</h4>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">Vincula Smart TVs para mostrar lo que está sonando y códigos QR para tus clientes.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Plataforma de Pago */}
          <div className="lg:col-span-5">
            <div className="card p-0 border border-accent/30 bg-gradient-to-b from-accent/10 to-bg-elevated h-full flex flex-col overflow-hidden relative">
              {/* Badge */}
              <div className="absolute top-0 right-0 bg-accent text-white text-xs font-bold px-3 py-1 rounded-bl-lg z-10">
                PRO
              </div>

              <div className="p-6 md:p-8 flex-grow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-accent/20 text-accent rounded-xl">
                    <CreditCard size={24} />
                  </div>
                  <h3 className="text-2xl font-bold text-white">Activa tu cuenta</h3>
                </div>
                
                <p className="text-sm text-text-muted mb-6">
                  Para acceder al panel de control y empezar a recibir peticiones musicales, necesitas una suscripción activa.
                </p>

                <ul className="space-y-3 mb-8">
                  {['Peticiones ilimitadas vía QR', 'Integración con YouTube sin anuncios', 'Modo AutoDJ con IA', 'Control multi-dispositivo y pantallas TV', 'Soporte prioritario'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-white/90">
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="bg-white/5 rounded-2xl p-6 border border-accent/20 mb-8 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/10 to-accent/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Zap size={20} className="text-accent" />
                    <span className="text-white font-bold text-lg">Suscripción PRO</span>
                  </div>
                  <a 
                    href={checkoutUrl}
                    className="lemonsqueezy-button btn-accent w-full py-4 text-lg font-bold shadow-[0_0_20px_rgba(157,78,221,0.3)] hover:shadow-[0_0_30px_rgba(157,78,221,0.6)] transition-all flex items-center justify-center gap-2 rounded-xl"
                  >
                    Suscribirse ahora
                  </a>
                  <p className="text-[10px] text-text-muted mt-4">
                    Pago seguro procesado por Lemon Squeezy.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-black/20 border-t border-white/5 mt-auto">
                <button 
                  onClick={() => navigate('/app/dashboard')}
                  className="w-full py-3 text-sm font-medium text-text-muted hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                >
                  Omitir por ahora (Acceso Temporal)
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
