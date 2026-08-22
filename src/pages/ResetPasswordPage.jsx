import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../store/useLanguageStore';
import { LanguageSelector } from '../components/ui/LanguageSelector';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const checkRecoverySession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (isMounted) {
        if (session) {
          setIsRecoveryReady(true);
        }
        setIsCheckingSession(false);
      }
    };

    checkRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        if (isMounted) {
          setIsRecoveryReady(true);
          setIsCheckingSession(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const level = score <= 1 ? 1 : score <= 2 ? 2 : score <= 3 ? 3 : 4;
    const labels = ['', 'Muy débil', 'Débil', 'Buena', 'Fuerte'];
    const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e'];
    return { score: level, label: labels[level], color: colors[level] };
  };

  const pwdStrength = getPasswordStrength(newPassword);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (newPassword.length < 8) {
      setAuthError(t('reset.password_short'));
      return;
    }

    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasDigit = /\d/.test(newPassword);

    if (!hasUpper || !hasLower || !hasDigit) {
      setAuthError(t('reset.password_complexity'));
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      setNewPassword('');
      toast.success(t('reset.password_success'), { duration: 4000 });
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
    } catch (err) {
      console.error('Error updating password:', err);
      setAuthError(err.message || t('reset.password_error'));
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/envairo-logo-sin-fondo.svg" 
            alt="EnvAIro Logo" 
            className="h-24 w-auto mb-4 drop-shadow-[0_0_15px_rgba(157,78,221,0.5)] animate-fade-in" 
          />
          <h1 className="text-xl font-bold text-text-primary text-center">
            {t('reset.title')}
          </h1>
          <p className="text-text-muted text-center max-w-xs text-sm mt-1">
            {t('reset.subtitle')}
          </p>
        </div>

        <div className="card p-6 space-y-4">
          {isCheckingSession ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-muted">Verificando enlace de seguridad...</p>
            </div>
          ) : !isRecoveryReady ? (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-full p-4 text-red-400">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-text-primary">Enlace no válido o expirado</h2>
                <p className="text-sm text-text-muted leading-relaxed">
                  {t('reset.invalid_session')}
                </p>
              </div>
              <Link
                to="/"
                className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95 text-center text-sm mt-2"
                style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))' }}
              >
                {t('reset.back_to_login')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t('reset.new_password_label')}
                </label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setAuthError(''); }}
                    required
                    minLength={8}
                    maxLength={64}
                    autoFocus
                    className="w-full bg-black/40 border border-accent/20 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:border-accent transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors flex items-center justify-center"
                    aria-label={showPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {newPassword.length > 0 && (
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
                    {/* Strength label */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium transition-colors duration-300" style={{ color: pwdStrength.color }}>
                        {pwdStrength.label}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {newPassword.length}/64
                      </span>
                    </div>
                    {/* Criteria checklist */}
                    {pwdStrength.score < 4 && (
                      <ul className="space-y-0.5">
                        {[
                          { ok: newPassword.length >= 8, label: 'Mínimo 8 caracteres' },
                          { ok: /[A-Z]/.test(newPassword), label: 'Una letra mayúscula' },
                          { ok: /[a-z]/.test(newPassword), label: 'Una letra minúscula' },
                          { ok: /\d/.test(newPassword), label: 'Un número' },
                        ].map(({ ok, label }) => (
                          <li key={label} className="flex items-center gap-1.5 text-[11px] transition-colors duration-200"
                            style={{ color: ok ? '#4ade80' : 'rgba(255,255,255,0.35)' }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              {ok
                                ? <polyline points="20 6 9 17 4 12" />
                                : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
                            </svg>
                            {label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

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
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
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
                ) : (
                  t('reset.save_btn')
                )}
              </button>

              <div className="text-center pt-2">
                <Link to="/" className="text-sm text-accent hover:text-primary transition-colors">
                  ← {t('reset.back_to_login')}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
