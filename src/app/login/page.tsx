'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Loader2, Mail, MessageCircle, UserRound } from 'lucide-react';

type Mode = 'login' | 'signup';

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

export default function LoginPage() {
  const router = useRouter();
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

  const isSignup = mode === 'signup';

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
  }

  function fillDemo() {
    setEmail('demo@gyeongju.com');
    setName('');
    setPassword('gyeongju2024');
    setPasswordConfirm('');
    setError('');
    setMessage('');
  }

  function showSocialNotice(provider: string) {
    setError('');
    setMessage(`${provider} 로그인은 준비 중입니다.`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isSignup) {
      if (name.trim().length < 2) {
        setError('이름은 2자 이상 입력해 주세요.');
        return;
      }
      if (password !== passwordConfirm) {
        setError('비밀번호가 일치하지 않습니다.');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name.trim(), password })
      });
      const result = await res.json() as { error?: string };

      if (!res.ok) {
        setError(result.error ?? '오류가 발생했습니다.');
      } else if (isSignup) {
        setMessage('인증 메일을 보냈습니다. 메일의 링크를 눌러 인증하면 회원가입이 완료됩니다.');
      } else {
        router.push('/');
        router.refresh();
      }
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
            "linear-gradient(180deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0.08) 33%, rgba(0,0,0,0.36) 66%, rgba(0,0,0,0.64) 100%), url('/login-spring-bg.png')"
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />

        <header className="relative z-10 text-[12px] font-semibold tracking-[-0.01em] text-white/85">
          로그인/회원가입
        </header>

        <div className="relative z-10 flex flex-1 flex-col justify-end">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[340px] pb-4">
            <div className="mb-4 flex items-center justify-center rounded-full bg-black/24 p-1 text-[12px] font-bold backdrop-blur-sm">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`h-8 flex-1 rounded-full transition ${!isSignup ? 'bg-white text-[#2f2928]' : 'text-white/80'}`}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`h-8 flex-1 rounded-full transition ${isSignup ? 'bg-white text-[#2f2928]' : 'text-white/80'}`}
              >
                회원가입
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
                  placeholder="이메일 주소"
                  value={email}
                  onChange={setEmail}
                />
                <AuthInput
                  icon={UserRound}
                  type="text"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="이름 (2자 이상)"
                  value={name}
                  onChange={setName}
                />
                <AuthInput
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={setPassword}
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#7b8080]"
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
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
                  placeholder="비밀번호 확인"
                  value={passwordConfirm}
                  onChange={setPasswordConfirm}
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirm(v => !v)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#7b8080]"
                      aria-label={showPasswordConfirm ? '비밀번호 확인 숨기기' : '비밀번호 확인 보기'}
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
                  placeholder="이메일 주소"
                  value={email}
                  onChange={setEmail}
                />
                <AuthInput
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={1}
                  autoComplete="current-password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={setPassword}
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#7b8080]"
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
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
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#3d353a]/95 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(0,0,0,0.34)] transition active:scale-[0.99] disabled:opacity-65"
            >
              {loading && <Loader2 className="animate-spin" size={17} />}
              {isSignup ? '가입하기' : '로그인'}
            </button>

            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-semibold text-white/75">
              <button type="button" className="px-1" onClick={() => setMessage('비밀번호 찾기는 준비 중입니다.')}>
                비밀번호 찾기
              </button>
              <span className="text-white/45">·</span>
              <button
                type="button"
                className="px-1"
                onClick={() => switchMode(isSignup ? 'login' : 'signup')}
              >
                {isSignup ? '로그인' : '회원가입'}
              </button>
            </div>

            {!isSupabaseConfigured && !isSignup && (
              <button
                type="button"
                onClick={fillDemo}
                className="mx-auto mt-3 block rounded-full bg-black/30 px-4 py-2 text-[11px] font-bold text-white/85 backdrop-blur-sm"
              >
                데모 계정으로 채우기
              </button>
            )}

            {!isSignup && (
              <div className="mt-6 grid gap-3 px-3">
                <button
                  type="button"
                  onClick={() => showSocialNotice('카카오')}
                  className="flex h-11 items-center justify-center gap-3 rounded-sm bg-[#fee500] text-[13px] font-black text-[#191919] shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
                >
                  <MessageCircle size={19} fill="#191919" strokeWidth={0} />
                  카카오 로그인
                </button>
                <button
                  type="button"
                  onClick={() => showSocialNotice('Google')}
                  className="flex h-10 items-center justify-center gap-3 rounded-sm bg-white text-[12px] font-black text-[#4a4a4a] shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
                >
                  <img src="/google-logo.svg" alt="" className="h-[18px] w-[18px]" aria-hidden="true" />
                  Continue with Google
                </button>
              </div>
            )}
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
