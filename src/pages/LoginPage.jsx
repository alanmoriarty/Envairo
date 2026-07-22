import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Music2, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useTranslation } from '../store/useLanguageStore';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { InstallAppButton } from '../components/shared/InstallAppButton';
import { toast } from 'sonner';
import HCaptcha from '@hcaptcha/react-hcaptcha';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Si ya estamos autenticados, redirigir automáticamente al reproductor
    if (user || isAuthenticated) {
      navigate('/app/dashboard');
    }
  }, [user, isAuthenticated, navigate]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const setUser = useAuthStore(s => s.setUser);

  const ALLOWED_EMAILS = [
    'aliriopina04@gmail.com',
    'aliriopina05@gmail.com',
    'javiercardonaaudiovisual@gmail.com',
    'alextascvers@gmail.com'
  ]; // <-- Agrega aquí los correos a los que les darás acceso a la Beta

  const handleEmailAuth = async (e) => {
    e.preventDefault();

    // Si la lista tiene elementos, validamos. Si está vacía, dejamos pasar a todos (o puedes bloquearlo por defecto).
    if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email.toLowerCase().trim())) {
      toast.error('Acceso denegado: Tu correo no está en la lista de probadores Beta.');
      return;
    }

    if (!captchaToken) {
      toast.error('Por favor, resuelve el Captcha para verificar que eres humano.');
      return;
    }

    setIsLoading(true);

    try {
      if (isRegistering) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { captchaToken }
        });

        if (error) throw error;

        if (data?.user && data?.user?.identities?.length === 0) {
          toast.error('Este correo ya está registrado.');
        } else {
          toast.success('¡Registro exitoso! Por favor revisa tu correo para confirmar tu cuenta.', { duration: 6000 });
          setIsRegistering(false); // Switch to login view
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken }
        });

        if (error) throw error;

        if (data.session) {
          const prevSessionId = useSettingsStore.getState().sessionId;
          // Si había una sesión previa de OTRO usuario en esta misma PC, limpiamos los datos viejos
          if (prevSessionId && !prevSessionId.includes('session-') && prevSessionId !== data.user.id) {
            usePlayerStore.getState().clearPlayerState();
            useSettingsStore.getState().clearSettingsState();
          }

          setUser(data.user);
          navigate('/app/dashboard');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (err.message === 'Email not confirmed') {
        toast.error('Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.');
      } else if (err.message === 'Invalid login credentials') {
        toast.error('Correo o contraseña incorrectos.');
      } else {
        toast.error(err.message || 'Error en la autenticación');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      toast.error('Por favor ingresa tu correo electrónico para enviarte el enlace de recuperación.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Te hemos enviado un enlace para restablecer tu contraseña. Revisa tu correo.', { duration: 6000 });
    } catch (err) {
      toast.error(err.message || 'Error al solicitar el restablecimiento');
    }
  };

  useEffect(() => {
    // Interceptar parámetros de "QR de Administrador" para control remoto
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    const admin = params.get('admin');

    if (session && admin) {
      const { setSessionId, setHostSecret, setIsAdminMode } = useSettingsStore.getState();
      setSessionId(session);
      setHostSecret(admin);
      setIsAdminMode(true);
      import('sonner').then(({ toast }) => toast.success('Vinculado como Control Remoto.'));
      // Redirigir directamente al dashboard sin pedir login
      navigate('/app/dashboard');
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background radial glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Language Selector Top Right */}
      <div className="absolute top-4 right-4 z-50">
        <LanguageSelector />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img 
            src="/envairo-logo.svg" 
            alt="EnvAIro Logo" 
            className="h-14 w-auto mb-6 drop-shadow-[0_0_15px_rgba(157,78,221,0.5)] animate-fade-in" 
          />
          <p className="text-text-muted text-center max-w-xs">
            {t('login.title')}
          </p>
        </div>

        {/* Auth Form */}
        <div className="card p-6 space-y-4 mb-6">
          <h2 className="text-lg font-semibold text-text-primary text-center mb-4">
            {isRegistering ? 'Crear Cuenta' : t('login.access')}
          </h2>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-black/40 border border-accent/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                placeholder="tu@correo.com"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-secondary">Contraseña</label>
                {!isRegistering && (
                  <button type="button" onClick={handleResetPassword} className="text-xs text-accent hover:text-primary transition-colors">
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-black/40 border border-accent/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div className="flex justify-center pt-2 pb-2">
              <HCaptcha
                sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY}
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
                theme="dark"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                boxShadow: '0 4px 20px rgba(157,78,221,0.3)',
              }}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isRegistering ? (
                'Registrarse'
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          <div className="text-center mt-4">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm text-accent hover:text-primary transition-colors"
            >
              {isRegistering ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate'}
            </button>
          </div>

          <div className="relative flex items-center py-4">
            <div className="flex-grow border-t border-text-secondary/20"></div>
          </div>

          {/* Botón de Instalar App */}
          <div className="pt-2">
            <a
              href="#"
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl text-white font-semibold shadow-glow transition-all duration-200 bg-white/5 hover:bg-white/10 border border-white/10"
            >
              <Download size={18} />
              Descarga Nuestra App
            </a>
          </div>
        </div>

        {/* Footer with Legal Links */}
        <div className="mt-8 text-center text-sm text-text-secondary/70 flex justify-center gap-4">
          <Link to="/privacy" className="hover:text-primary transition-colors">Política de Privacidad</Link>
          <span>&bull;</span>
          <Link to="/terms" className="hover:text-primary transition-colors">Términos y Condiciones</Link>
        </div>
      </div>
    </div>
  );
}
