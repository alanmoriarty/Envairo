import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Music2, Download, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useTranslation } from '../store/useLanguageStore';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import { InstallAppButton } from '../components/shared/InstallAppButton';
import { toast } from 'sonner';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { AdSense } from '../components/ads/AdSense';

// Lista de correos con suscripción activa (Beta)
export const ALLOWED_EMAILS = [
  'aliriopina04@gmail.com',
  'javiercardonaaudiovisual@gmail.com'
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // 1. Interceptar parámetros de "QR de Administrador" para control remoto (tiene máxima prioridad)
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    const admin = params.get('admin');

    if (session && admin) {
      const { setSessionId, setHostSecret, setIsAdminMode } = useSettingsStore.getState();
      setSessionId(session);
      setHostSecret(admin);
      setIsAdminMode(true);

      // Limpiar cualquier estado del reproductor local para no interferir
      usePlayerStore.getState().clearPlayerState();

      import('sonner').then(({ toast }) => toast.success(t('login.remote_linked')));
      // Redirigir directamente al dashboard, limpiando el secreto del historial para evitar fugas
      navigate('/app/dashboard', { replace: true });
      return;
    }

    const checkSubscriptionAndRedirect = async (currentUser) => {
      // 2. Si no hay parámetros de admin y ya estamos autenticados, redirigir
      if (currentUser || isAuthenticated) {
        useSettingsStore.getState().setIsAdminMode(false);

        const userEmail = currentUser?.email || '';
        let isSubscribed = ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes(userEmail.toLowerCase().trim());

        // Si no está en la lista de beta, comprobamos en la base de datos
        if (!isSubscribed && currentUser?.id) {
          const { data } = await supabase
            .from('subscriptions')
            .select('status')
            .eq('user_id', currentUser.id)
            .eq('status', 'active')
            .single();

          if (data) isSubscribed = true;
        }

        // Por el momento, acceso directo
        navigate('/app/dashboard');
      }
    };

    checkSubscriptionAndRedirect(user);
  }, [user, isAuthenticated, navigate]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const captchaRef = useRef(null);
  const setUser = useAuthStore(s => s.setUser);

  const ALLOWED_EMAILS = [
    'aliriopina04@gmail.com',
    'aliriopina05@gmail.com',
    'javiercardonaaudiovisual@gmail.com',
    'alextascvers@gmail.com',
    'bernabeite@gmail.com',
    'camiloardila.1803@gmail.com',
    'julian.10barrera@gmail.com'
  ]; // <-- Agrega aquí los correos a los que les darás acceso a la Beta

  const handleEmailAuth = async (e) => {
    e.preventDefault();

    if (!captchaToken) {
      toast.error(t('login.captcha_required'));
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
          toast.error(t('login.email_exists'));
        } else {
          toast.success(t('login.register_success'), { duration: 6000 });
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
          // Si había una sesión previa, siempre la limpiamos al iniciar sesión con otro usuario
          if (prevSessionId && prevSessionId !== data.user.id) {
            usePlayerStore.getState().clearPlayerState();
            useSettingsStore.getState().clearSettingsState();
            localStorage.removeItem('bq-player');
            localStorage.removeItem('bq-settings');
          }

          setUser(data.user);
          let isSubscribed = ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes(data.user.email.toLowerCase().trim());

          if (!isSubscribed) {
            const { data: subData } = await supabase
              .from('subscriptions')
              .select('status')
              .eq('user_id', data.user.id)
              .eq('status', 'active')
              .single();

            if (subData) isSubscribed = true;
          }

          // Por el momento, acceso directo
          navigate('/app/dashboard');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (err.message === 'Email not confirmed') {
        toast.error(t('login.confirm_email'));
      } else if (err.message === 'Invalid login credentials') {
        toast.error(t('login.invalid_credentials'));
      } else {
        toast.error(err.message || t('login.auth_error'));
      }
    } finally {
      setIsLoading(false);
      if (captchaRef.current) {
        captchaRef.current.resetCaptcha();
      }
      setCaptchaToken(null);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      toast.error(t('login.email_required'));
      return;
    }
    if (!captchaToken) {
      toast.error(t('login.captcha_required'));
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken
      });
      if (error) throw error;
      toast.success(t('login.reset_link_sent'), { duration: 6000 });
    } catch (err) {
      toast.error(err.message || t('login.reset_error'));
    } finally {
      if (captchaRef.current) {
        captchaRef.current.resetCaptcha();
      }
      setCaptchaToken(null);
    }
  };



  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <AdSense />
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
            src="/envairo-logo-sin-fondo.svg"
            alt="EnvAIro Logo"
            className="h-28 w-auto mb-6 drop-shadow-[0_0_15px_rgba(157,78,221,0.5)] animate-fade-in"
          />
          <p className="text-text-muted text-center max-w-xs">
            {t('login.title')}
          </p>
        </div>

        {/* Auth Form */}
        <div className="card p-6 space-y-4 mb-6">
          <h2 className="text-lg font-semibold text-text-primary text-center mb-4">
            {isRegistering ? t('login.create_account') : t('login.access')}
          </h2>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">{t('login.email_label')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={100}
                className="w-full bg-black/40 border border-accent/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                placeholder={t('login.email_placeholder')}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-secondary">{t('login.password_label')}</label>
                {!isRegistering && (
                  <button type="button" onClick={handleResetPassword} className="text-xs text-accent hover:text-primary transition-colors">
                    {t('login.forgot_password')}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isRegistering ? 8 : 6}
                  maxLength={64}
                  pattern={isRegistering ? "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,64}" : undefined}
                  title={isRegistering ? "Debe tener al menos 8 caracteres, incluir una mayúscula, una minúscula y un número." : undefined}
                  className="w-full bg-black/40 border border-accent/20 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:border-accent transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors flex items-center justify-center"
                  aria-label={showPassword ? t('login.hide_password') : t('login.show_password')}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {isRegistering && (
                <p className="text-[11px] text-text-muted mt-2 ml-1 leading-tight">
                  {t('login.password_hint')}
                </p>
              )}
            </div>

            <div className="flex justify-center pt-2 pb-2">
              <HCaptcha
                ref={captchaRef}
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
                t('login.register_btn')
              ) : (
                t('login.login_btn')
              )}
            </button>
          </form>

          <div className="text-center mt-4">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm text-accent hover:text-primary transition-colors"
            >
              {isRegistering ? t('login.already_have_account') : t('login.dont_have_account')}
            </button>
          </div>

          <div className="relative flex items-center py-4">
            <div className="flex-grow border-t border-text-secondary/20"></div>
          </div>

          {/* Botón de Instalar App */}
          <div className="pt-2">
            <InstallAppButton
              variant="custom"
              text={t('login.download_app')}
              className="w-full py-4 px-6 rounded-xl text-white font-semibold shadow-glow transition-all duration-200 bg-white/5 hover:bg-white/10 border border-white/10"
            />
          </div>
        </div>

        {/* Footer with Legal Links */}
        <div className="mt-8 text-center text-sm text-text-secondary/70 flex justify-center gap-4">
          <Link to="/privacy" className="hover:text-primary transition-colors">{t('login.privacy_policy')}</Link>
          <span>&bull;</span>
          <Link to="/terms" className="hover:text-primary transition-colors">{t('login.terms_conditions')}</Link>
        </div>
      </div>
    </div>
  );
}
