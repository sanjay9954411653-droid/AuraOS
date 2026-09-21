'use client';

import { useState } from 'react';
import { requestOtp, verifyOtp, setCustomerToken } from '@/lib/client';

/** Phone + OTP sign-in (uses the existing Core customer OTP endpoints). */
export default function LoginPage() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true); setError(null);
    try {
      const r = await requestOtp(phone);
      setDevCode(r.devCode ?? null);
      setStep('otp');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function confirmCode() {
    setBusy(true); setError(null);
    try {
      const r = await verifyOtp(phone, code);
      setCustomerToken(r.token);
      window.location.href = '/orders?tab=history';
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const btn = 'w-full rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50';

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold" style={{ color: 'var(--brand-primary)' }}>Sign in</h1>
      <p className="mb-6 text-sm opacity-60">Sign in to save your orders and see them on all your devices.</p>

      {error ? <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {step === 'phone' ? (
        <div className="space-y-4">
          <input
            value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
            placeholder="Mobile number" inputMode="tel"
            className="w-full rounded-lg border px-3 py-2"
          />
          <button onClick={sendCode} disabled={busy || phone.length < 8} className={btn}
            style={{ backgroundColor: 'var(--brand-primary)' }}>
            {busy ? 'Sending…' : 'Send OTP'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm font-medium">Enter 6-digit code sent to {phone}</label>
          {devCode ? <p className="text-xs opacity-60">Dev code: {devCode}</p> : null}
          <input
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••" inputMode="numeric"
            className="w-full rounded-lg border px-3 py-2 tracking-widest"
          />
          <button onClick={confirmCode} disabled={busy || code.length !== 6} className={btn}
            style={{ backgroundColor: 'var(--brand-primary)' }}>
            {busy ? 'Verifying…' : 'Verify & Continue'}
          </button>
          <button onClick={() => setStep('phone')} className="w-full text-sm underline">Change number</button>
        </div>
      )}
    </main>
  );
}
