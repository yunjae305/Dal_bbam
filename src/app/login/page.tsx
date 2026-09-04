'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Loader2, Mail, Sparkles, UserRound } from 'lucide-react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const { locale } = useLocale();
  const ui = uiMessages[locale].auth;
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [demoEnabled, setDemoEnabled] = useState(false);

  const isSignup = mode === 'signup';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginError = params.get('error');

    const loginErrors: Record<string, string> = {
      kakao_not_configured: ui.kakaoNotConfigured,
      kakao_cancelled: ui.kakaoCancelled,
      kakao_authorization_failed: ui.kakaoAuthorizationFailed,
      kakao_code_missing: ui.kakaoCodeMissing,
      kakao_state_mismatch: ui.kakaoStateMismatch,
      kakao_token_failed: ui.kakaoTokenFailed,
      kakao_user_failed: ui.kakaoUserFailed,
      kakao_user_persistence_failed: ui.kakaoPersistenceFailed,
      // 이전 URL과 세션에서 돌아오는 사용자를 위한 호환 메시지입니다.
      kakao_state: ui.kakaoStateExpired,
      kakao_login: ui.kakaoLoginFailed,
      google_not_configured: ui.googleNotConfigured,
      google_authorization_failed: ui.googleAuthorizationFailed,
      auth_callback_failed: ui.callbackFailed
    };

    if (loginError && loginErrors[loginError]) {
      setError(loginErrors[loginError]);
    }

    void fetch('/api/auth/demo', { cache: 'no-store' })
      .then(response => response.json())
      .then((payload: { enabled?: boolean }) => setDemoEnabled(payload.enabled === true))
      .catch(() => setDemoEnabled(false));
  }, [ui]);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
  }

  function startGoogleLogin() {
    window.location.assign('/api/auth/google/login');
  }

  function startKakaoLogin() {
    window.location.assign('/api/auth/kakao/login');
  }

  async function startDemoLogin() {
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/demo', { method: 'POST', credentials: 'include' });
      const result = await res.json() as { error?: string };

      if (!res.ok) {
        setError(result.error ?? ui.demoFailed);
      } else {
        window.location.replace('/');
      }
    } catch {
      setError(ui.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    setError('');
    setMessage('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(ui.enterResetEmail);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) setError(payload.error ?? ui.resetMailFailed);
      else setMessage(ui.resetMailSent);
    } catch {
      setError(ui.networkError);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isSignup) {
      if (name.trim().length < 2) {
        setError(ui.nameTooShort);
        return;
      }
      if (password !== passwordConfirm) {
        setError(ui.passwordMismatch);
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name.trim(), password })
      });
      const result = await res.json() as { error?: string };

      if (!res.ok) {
        setError(result.error ?? ui.genericError);
      } else if (isSignup) {
        setMessage(ui.verificationSent);
      } else {
        window.location.replace('/');
      }
    } catch {
      setError(ui.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#1d1d1d] text-white">
      <section
        className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-cover bg-center px-6 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+16px)] shadow-2xl"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0.08) 33%, rgba(0,0,0,0.36) 66%, rgba(0,0,0,0.64) 100%), url('/login-spring-bg.webp')"
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />

        <header className="relative z-10 text-[12px] font-semibold tracking-[-0.01em] text-white/85">
          {ui.header}
        </header>

        <div className="relative z-10 flex flex-1 flex-col justify-end">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[340px] pb-4">
            <div className="mb-4 flex items-center justify-center rounded-full bg-black/24 p-1 text-[12px] font-bold backdrop-blur-sm">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`h-8 flex-1 rounded-full transition ${!isSignup ? 'bg-white text-[#2f2928]' : 'text-white/80'}`}
              >
                {ui.login}
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`h-8 flex-1 rounded-full transition ${isSignup ? 'bg-white text-[#2f2928]' : 'text-white/80'}`}
              >
                {ui.signup}
              </button>
            </div>

            {isSignup ? (
              <div className="mb-5 grid gap-4">
                <AuthInput
                  icon={Mail}
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  placeholder={ui.email}
                  value={email}
                  onChange={setEmail}
                />
                <AuthInput
                  icon={UserRound}
                  type="text"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder={ui.name}
                  value={name}
                  onChange={setName}
                />
                <AuthInput
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder={ui.password}
                  value={password}
                  onChange={setPassword}
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#7b8080]"
                      aria-label={showPassword ? ui.hidePassword : ui.showPassword}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                />
                <AuthInput
                  icon={Lock}
                  type={showPasswordConfirm ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder={ui.passwordConfirm}
                  value={passwordConfirm}
                  onChange={setPasswordConfirm}
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirm(v => !v)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#7b8080]"
                      aria-label={showPasswordConfirm ? ui.hidePasswordConfirm : ui.showPasswordConfirm}
                    >
                      {showPasswordConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                />
              </div>
            ) : (
              <div className="mb-5 grid gap-4">
                <AuthInput
                  icon={Mail}
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  placeholder={ui.email}
                  value={email}
                  onChange={setEmail}
                />
                <AuthInput
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={1}
                  autoComplete="current-password"
                  placeholder={ui.password}
                  value={password}
                  onChange={setPassword}
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#7b8080]"
                      aria-label={showPassword ? ui.hidePassword : ui.showPassword}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                />
              </div>
            )}

            {(error || message) && (
              <p
                className={`mb-3 rounded-2xl px-4 py-3 text-center text-[12px] font-bold shadow-lg backdrop-blur-md ${
                  error ? 'bg-red-50/95 text-red-700' : 'bg-white/90 text-[#385145]'
                }`}
              >
                {error || message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#3d353a]/95 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(0,0,0,0.34)] transition-[transform,opacity] active:scale-[0.96] disabled:opacity-65"
            >
              {loading && <Loader2 className="animate-spin" size={17} />}
              {isSignup ? ui.join : ui.login}
            </button>

            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-semibold text-white/75">
              <button type="button" className="min-h-11 px-1" onClick={() => void requestPasswordReset()}>
                {ui.forgotPassword}
              </button>
              <span className="text-white/45">·</span>
              <button
                type="button"
                className="px-1"
                onClick={() => switchMode(isSignup ? 'login' : 'signup')}
              >
                {isSignup ? ui.login : ui.signup}
              </button>
            </div>

            {!isSignup && (
              <div className="mt-6 grid gap-3 px-3">
                <button
                  type="button"
                  onClick={startKakaoLogin}
                  className="flex h-[45px] w-full items-center justify-center rounded-xl transition-transform active:scale-[0.96]"
                  aria-label={ui.kakaoLogin}
                >
                  <img
                    src="/assets/auth/images/카카오-로그인-버튼.png"
                    alt=""
                    aria-hidden="true"
                    className="h-[45px] w-[183px] object-contain shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
                  />
                </button>
                <button
                  type="button"
                  onClick={startGoogleLogin}
                  className="flex h-11 w-full items-center justify-center transition-transform active:scale-[0.96]"
                  aria-label={ui.googleLogin}
                >
                  <img
                    src="/assets/auth/images/구글-로그인-버튼.png"
                    alt=""
                    aria-hidden="true"
                    className="h-10 w-[189px] object-contain shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
                  />
                </button>
                {demoEnabled && (
                  <button
                    type="button"
                    onClick={startDemoLogin}
                    disabled={loading}
                    className="flex h-11 items-center justify-center gap-2 rounded-sm bg-[#2f7567]/95 text-[12px] font-black text-white shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition-[transform,opacity] active:scale-[0.96] disabled:opacity-65"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    {ui.demoLogin}
                  </button>
                )}
              </div>
            )}
            <p className="mt-5 text-center text-[10px] font-semibold leading-5 text-white/70">
              {ui.continuePrefix}{' '}<a href="/legal/terms" className="underline underline-offset-2">{ui.terms}</a>{' · '}
              <a href="/legal/privacy" className="underline underline-offset-2">{ui.privacy}</a>{ui.continueSuffix}
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

function AuthInput({
  icon: Icon,
  type,
  required,
  inputMode,
  autoComplete,
  minLength,
  placeholder,
  value,
  onChange,
  trailing
}: {
  icon: typeof Mail;
  type: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  minLength?: number;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <label className="flex h-14 items-center gap-3 rounded-xl bg-white/94 px-4 text-[#777] shadow-[0_8px_22px_rgba(0,0,0,0.2)] ring-1 ring-black/5 focus-within:ring-4 focus-within:ring-white/35">
      <Icon size={20} className="shrink-0 text-[#777]" />
      <input
        type={type}
        required={required}
        inputMode={inputMode}
        autoComplete={autoComplete}
        minLength={minLength}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#2f2928] outline-none placeholder:text-[#777]"
        placeholder={placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
      {trailing}
    </label>
  );
}
