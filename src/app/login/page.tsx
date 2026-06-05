'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, Mail, Sparkles } from 'lucide-react';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await res.json() as { error?: string };

      if (!res.ok) {
        setError(result.error ?? '오류가 발생했습니다.');
      } else if (mode === 'signup') {
        setMessage('가입 확인 이메일을 발송했습니다. 메일함을 확인해주세요.');
      } else {
        router.push('/');
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#09221e] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mb-4 inline-grid h-16 w-16 place-items-center rounded-full border-2 border-white/20 bg-[#12372f] text-white">
            <Sparkles size={28} />
          </span>
          <h1 className="text-[32px] font-black text-white">AI 경주</h1>
          <p className="mt-1 text-[13px] font-bold text-white/60">History Travel PWA</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 flex rounded-lg bg-[#f2f6f2] p-1">
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-[13px] font-black transition ${mode === 'login' ? 'bg-white text-[#12372f] shadow' : 'text-[#697672]'}`}
              onClick={() => switchMode('login')}
            >
              로그인
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-[13px] font-black transition ${mode === 'signup' ? 'bg-white text-[#12372f] shadow' : 'text-[#697672]'}`}
              onClick={() => switchMode('signup')}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-black text-[#697672]">이메일</span>
              <div className="flex h-12 items-center gap-3 rounded-lg border border-[#dbe6df] bg-[#f7faf6] px-4">
                <Mail size={16} className="shrink-0 text-[#12372f]" />
                <input
                  type="email"
                  required
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-black outline-none placeholder:text-[#8b9894]"
                  placeholder="이메일 주소"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </label>

            <label className="grid gap-1.5">
              <span className="text-[12px] font-black text-[#697672]">비밀번호</span>
              <div className="flex h-12 items-center gap-3 rounded-lg border border-[#dbe6df] bg-[#f7faf6] px-4">
                <Lock size={16} className="shrink-0 text-[#12372f]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'signup' ? 6 : 1}
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-black outline-none placeholder:text-[#8b9894]"
                  placeholder={mode === 'signup' ? '6자 이상 입력' : '비밀번호'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="shrink-0"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPassword
                    ? <EyeOff size={16} className="text-[#697672]" />
                    : <Eye size={16} className="text-[#697672]" />}
                </button>
              </div>
            </label>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-[13px] font-bold text-green-700">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#12372f] text-[14px] font-black text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="animate-spin" size={18} />}
              {mode === 'login' ? '로그인' : '가입하기'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
