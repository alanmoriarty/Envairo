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
import { ALLOWED_EMAILS, isAllowedEmail } from '../utils/constants';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isAuthenticated, setUser } = useAuthStore();

  useEffect(() => {
    // 0. Listener para auto-login cuando el usuario confirma su correo desde el enlace mágico
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        setUser(session.user);
        toast.success(t('login.login_success') || '¡Sesión iniciada con éxito!');
        navigate('/app/dashboard', { replace: true });
      }
    });

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
        let isSubscribed = isAllowedEmail(userEmail);

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

    return () => {
      subscription?.unsubscribe();
    };
  }, [user, isAuthenticated, navigate, setUser, t]);

  const [isRegistering, setIsRegistering] = useState(false);
  const [registerSent, setRegisterSent] = useState(false);   // Post-registration confirmation
  const [isResetting, setIsResetting] = useState(false);     // Forgot-password mode
  const [resetSent, setResetSent] = useState(false);         // Reset link sent confirmation
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // Inline error: shown persistently below the form (doesn't disappear like a toast)
  const [authError, setAuthError] = useState('');
  const captchaRef = useRef(null);

  // Password strength: scored 0-4 based on 5 criteria
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    // Normalize 5-point scale → 4 levels
    const level = score <= 1 ? 1 : score <= 2 ? 2 : score <= 3 ? 3 : score <= 4 ? 4 : 4;
    const labels = ['', 'Muy débil', 'Débil', 'Buena', 'Fuerte'];
    const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e'];
    return { score: level, label: labels[level], color: colors[level] };
  };
  const pwdStrength = getPasswordStrength(password);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError(''); // Clear previous inline error on each new submit attempt

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
          // Email already in use — show inline error instead of a toast
          setAuthError(t('login.email_exists'));
        } else {
          // Success: show confirmation screen instead of just switching to login
          setRegisterSent(true);
          setPassword(''); // Clear password from memory
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
          // Solo limpiar estado si la sesión anterior pertenecía a OTRO usuario autenticado distinto (UUID real)
          if (prevSessionId && !prevSessionId.startsWith('session-') && prevSessionId !== data.user.id) {
            usePlayerStore.getState().clearPlayerState();
            useSettingsStore.getState().clearSettingsState();
            localStorage.removeItem('bq-player');
            localStorage.removeItem('bq-settings');
          }

          setUser(data.user);
          let isSubscribed = isAllowedEmail(data.user.email);

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
      // Show error inline (persistent) instead of a transient toast
      if (err.message === 'Email not confirmed') {
        setAuthError(t('login.confirm_email'));
      } else if (err.message === 'Invalid login credentials') {
        setAuthError(t('login.invalid_credentials'));
      } else {
        setAuthError(err.message || t('login.auth_error'));
      }
    } finally {
      setIsLoading(false);
      if (captchaRef.current) {
        captchaRef.current.resetCaptcha();
      }
      setCaptchaToken(null);
    }
  };

  const handleResetPassword = async (e) => {
    e?.preventDefault();
    setAuthError('');

    if (!email) {
      setAuthError(t('login.email_required'));
      return;
    }
    if (!captchaToken) {
      setAuthError(t('login.captcha_required'));
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken
      });
      if (error) throw error;
      setResetSent(true); // Switch to confirmation screen
    } catch (err) {
      setAuthError(err.message || t('login.reset_error'));
    } finally {
      setIsLoading(false);
      if (captchaRef.current) captchaRef.current.resetCaptcha();
      setCaptchaToken(null);
    }
  };

  // Helper: go back to login and clear all transient state
  const goBackToLogin = () => {
    setIsResetting(false);
    setResetSent(false);
    setAuthError('');
    setPassword('');
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

        {/* ── FORGOT PASSWORD FLOW ── */}
        {isResetting ? (
          <div className="card p-6 space-y-4 mb-6 animate-fade-in">
            {resetSent ? (
              /* Confirmation screen */
              <div className="flex flex-col items-center text-center gap-4 py-4">
                <div className="bg-accent/10 border border-accent/30 rounded-full p-5">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 7L2 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary mb-1">Revisa tu correo</h2>
                  <p className="text-sm text-text-muted">
                    Enviamos un enlace de recuperación a <span className="text-accent font-medium">{email}</span>.
                    El enlace expira en 1 hora.
                  </p>
                </div>
                <button
                  onClick={goBackToLogin}
                  className="text-sm text-accent hover:text-primary transition-colors mt-2"
                >
                  ← Volver al inicio de sesión
                </button>
              </div>
            ) : (
              /* Reset request form */
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <button
                    type="button"
                    onClick={goBackToLogin}
                    className="text-text-muted hover:text-white transition-colors"
                    aria-label="Volver"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-semibold text-text-primary">Recuperar contraseña</h2>
                </div>

                <p className="text-sm text-text-muted leading-relaxed">
                  Ingresa el correo de tu cuenta y te enviaremos un enlace para restablecer tu contraseña.
                </p>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t('login.email_label')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setAuthError(''); }}
                    required
                    autoFocus
                    maxLength={100}
                    className="w-full bg-black/40 border border-accent/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                    placeholder={t('login.email_placeholder')}
                  />
                </div>

                <div className="flex justify-center pt-1 pb-1">
                  <HCaptcha
                    ref={captchaRef}
                    sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY}
                    onVerify={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                    theme="dark"
                  />
                </div>

                {authError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: '#f87171' }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', boxShadow: '0 4px 20px rgba(157,78,221,0.3)' }}
                >
                  {isLoading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : 'Enviar enlace de recuperación'
                  }
                </button>
              </form>
            )}
          </div>
        ) : (
          /* ── LOGIN / REGISTER FORM ── */
          <div className="card p-6 space-y-4 mb-6">
            {registerSent ? (
              /* ── POST-REGISTRATION CONFIRMATION ── */
              <div className="flex flex-col items-center text-center gap-5 py-4 animate-fade-in">
                {/* Animated checkmark circle */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="relative bg-green-500/10 border border-green-500/30 rounded-full p-5">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#4ade80' }}>
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-10 7L2 7" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-text-primary">¡Cuenta creada!</h2>
                  <p className="text-sm text-text-muted leading-relaxed max-w-[260px]">
                    Enviamos un correo de confirmación a
                  </p>
                  <p className="text-sm font-semibold text-accent break-all">{email}</p>
                  <p className="text-sm text-text-muted leading-relaxed max-w-[260px]">
                    Abre el enlace del correo antes de iniciar sesión.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2 w-full">
                  <button
                    onClick={() => { setIsRegistering(false); setRegisterSent(false); setAuthError(''); }}
                    className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', boxShadow: '0 4px 20px rgba(157,78,221,0.3)' }}
                  >
                    Ir al inicio de sesión
                  </button>
                  <p className="text-xs text-text-muted mt-1">
                    ¿No llegó el correo?{' '}
                    <button
                      type="button"
                      onClick={() => { setIsResetting(true); setIsRegistering(false); setRegisterSent(false); }}
                      className="text-accent hover:text-primary transition-colors underline"
                    >
                      Solicitar reenvío
                    </button>
                  </p>
                </div>
              </div>
            ) : ( /* key forces remount → retriggers animate-slide-up-sm on mode switch */
              <div key={isRegistering ? 'register' : 'login'} className="animate-slide-up-sm">
                <h2 className="text-lg font-semibold text-text-primary text-center mb-4">
                  {isRegistering ? t('login.create_account') : t('login.access')}
                </h2>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t('login.email_label')}</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setAuthError(''); }}
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
                        <button
                          type="button"
                          onClick={() => { setIsResetting(true); setAuthError(''); }}
                          className="text-xs text-accent hover:text-primary transition-colors"
                        >
                          {t('login.forgot_password')}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
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
                    {isRegistering && password.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {/* 4-bar strength meter */}
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4].map((level) => (
                            <div
                              key={level}
                              className="h-1.5 flex-1 rounded-full transition-all duration-300"
                              style={{
                                background: pwdStrength.score >= level
                                  ? pwdStrength.color
                                  : 'rgba(255,255,255,0.1)'
                              }}
                            />
                          ))}
                        </div>
                        {/* Strength label + active criteria */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium transition-colors duration-300" style={{ color: pwdStrength.color }}>
                            {pwdStrength.label}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {password.length}/64
                          </span>
                        </div>
                        {/* Criteria checklist — only shown until all pass */}
                        {pwdStrength.score < 4 && (
                          <ul className="space-y-0.5">
                            {[
                              { ok: password.length >= 8, label: 'Mínimo 8 caracteres' },
                              { ok: /[A-Z]/.test(password), label: 'Una letra mayúscula' },
                              { ok: /[a-z]/.test(password), label: 'Una letra minúscula' },
                              { ok: /\d/.test(password), label: 'Un número' },
                              { ok: /[^A-Za-z0-9]/.test(password), label: 'Un carácter especial (opcional +)' },
                            ].map(({ ok, label }) => (
                              <li key={label} className="flex items-center gap-1.5 text-[11px] transition-colors duration-200"
                                style={{ color: ok ? '#4ade80' : 'rgba(255,255,255,0.35)' }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  {ok
                                    ? <><polyline points="20 6 9 17 4 12" /></>
                                    : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
                                </svg>
                                {label}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {/* Keep static hint in login mode so the field label area doesn't collapse */}
                    {isRegistering && password.length === 0 && (
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

                  {/* Inline auth error — persistent, visible until the user corrects their input */}
                  {authError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm animate-fade-in"
                      style={{
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.35)',
                        color: '#fca5a5'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: '#f87171' }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{authError}</span>
                    </div>
                  )}

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
                    onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
                    className="text-sm text-accent hover:text-primary transition-colors"
                  >
                    {isRegistering ? t('login.already_have_account') : t('login.dont_have_account')}
                  </button>
                </div>

              </div>
            )} {/* end registerSent ternary */}
          </div>
        )} {/* end isResetting ternary */}

        {/* Install App — secondary action, outside the auth card so it doesn't compete */}
        <div className="mt-4">
          <InstallAppButton
            variant="custom"
            text={t('login.download_app')}
            className="w-full py-3 px-6 rounded-xl text-sm text-text-muted font-medium transition-all duration-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.15] hover:text-text-primary"
          />
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
