/**
 * Login page with two-step authentication flow.
 * Handles credential submission, OTP verification/resend, trusted-device preference, and cooldown UI.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginChallenge, useAuth } from '../auth'
import PasswordInput from '../components/PasswordInput'

function secondsRemaining(isoTime: string | null) {
  if (!isoTime) return 0
  return Math.max(0, Math.ceil((new Date(isoTime).getTime() - Date.now()) / 1000))
}

export default function Login() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('dsa10ademo@gmail.com')
  const [password, setPassword] = useState('password')
  const [rememberDevice, setRememberDevice] = useState(false)
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    setCooldown(secondsRemaining(challenge?.resend_available_at ?? null))
  }, [challenge])

  useEffect(() => {
    if (!challenge) return
    const timer = window.setInterval(() => {
      setCooldown(secondsRemaining(challenge.resend_available_at))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [challenge])

  const inOtpStep = Boolean(challenge)
  const expiresAtLabel = useMemo(() => {
    if (!challenge) return null
    return new Date(challenge.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [challenge])

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const nextChallenge = await auth.login(email, password, rememberDevice)
      if (nextChallenge.access_token) {
        navigate('/projects')
        return
      }
      setChallenge(nextChallenge)
      setOtp('')
      setInfo(nextChallenge.message || `OTP sent to ${nextChallenge.masked_email}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!challenge) return
    setOtpLoading(true)
    setError(null)
    setInfo(null)
    try {
      await auth.verifyOtp(challenge.challenge_id, otp.trim(), rememberDevice)
      navigate('/projects')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'OTP verification failed.')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (!challenge) return
    setResendLoading(true)
    setError(null)
    setInfo(null)
    try {
      const nextChallenge = await auth.resendOtp(challenge.challenge_id)
      setChallenge(nextChallenge)
      setOtp('')
      setInfo(`A new OTP was sent to ${nextChallenge.masked_email}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Unable to resend OTP.')
    } finally {
      setResendLoading(false)
    }
  }

  const resetLogin = () => {
    setChallenge(null)
    setOtp('')
    setError(null)
    setInfo(null)
  }

  return (
    <div className="flex min-h-[90vh] flex-col items-center justify-center bg-[#FFF9F5] p-6">
      <div className="w-full max-w-md rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-orange-900/10 ring-1 ring-orange-100 transition-all">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-orange-100 text-[#ED6B21] shadow-inner">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#005372]">AGM Portal</h1>
          <p className="mt-2 text-sm font-medium text-gray-400">
            {inOtpStep ? 'Enter the verification code from your email' : 'Portfolio Intelligence & Analytics'}
          </p>
        </div>

        <div className="space-y-6">
          {!inOtpStep ? (
            <>
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-[0.15em] text-[#005372]/60">Email Address</label>
                <input
                  className="w-full rounded-2xl border-0 bg-gray-50 px-5 py-4 text-sm font-medium text-[#005372] ring-1 ring-gray-200 transition-all focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@singhealth.com.sg"
                />
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-[0.15em] text-[#005372]/60">Password</label>
                <PasswordInput
                  className="w-full rounded-2xl border-0 bg-gray-50 px-5 py-4 text-sm font-medium text-[#005372] ring-1 ring-gray-200 transition-all focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-[#FFF9F5] px-4 py-3 text-[11px] font-bold text-[#005372]">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="h-4 w-4 rounded border-orange-200 text-[#ED6B21] focus:ring-[#ED6B21]"
                />
                Remember this device for 1 hour
              </label>
            </>
          ) : (
            <>
              <div className="rounded-[1.5rem] border border-orange-100 bg-[#FFF9F5] p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/60">OTP Verification</div>
                <p className="mt-3 text-sm font-medium text-[#005372]">
                  Code sent to <span className="font-black text-[#ED6B21]">{challenge?.masked_email}</span>
                </p>
                <p className="mt-2 text-[11px] font-medium text-gray-500">
                  Expires at {expiresAtLabel}. Request a new code if this one expires.
                </p>
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-[0.15em] text-[#005372]/60">6-Digit OTP</label>
                <input
                  className="w-full rounded-2xl border-0 bg-gray-50 px-5 py-4 text-center text-lg font-black tracking-[0.4em] text-[#005372] ring-1 ring-gray-200 transition-all focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                />
              </div>

              {rememberDevice && (
                <div className="rounded-[1.25rem] border border-orange-100 bg-[#FFF9F5] px-4 py-3 text-[11px] font-bold text-[#005372]">
                  This browser will be remembered for 1 hour after successful verification.
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-[11px] font-bold text-red-600 ring-1 ring-red-100">
              <span>!</span> {error}
            </div>
          )}

          {info && (
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-[11px] font-bold text-teal-700 ring-1 ring-teal-100">
              <span>i</span> {info}
            </div>
          )}

          {!inOtpStep ? (
            <button
              className="w-full rounded-[1.25rem] bg-[#ED6B21] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-700/30 transition-all hover:bg-[#d45a1b] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
              disabled={loading}
              onClick={handleLogin}
            >
              {loading ? 'Authenticating...' : 'Sign In to Portal'}
            </button>
          ) : (
            <div className="space-y-3">
              <button
                className="w-full rounded-[1.25rem] bg-[#ED6B21] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-700/30 transition-all hover:bg-[#d45a1b] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                disabled={otpLoading || otp.trim().length !== 6}
                onClick={handleVerifyOtp}
              >
                {otpLoading ? 'Verifying OTP...' : 'Verify and Continue'}
              </button>

              <button
                className="w-full rounded-[1.25rem] border border-orange-200 bg-white py-4 text-sm font-black uppercase tracking-widest text-[#ED6B21] transition-all hover:bg-orange-50 disabled:opacity-50"
                disabled={resendLoading || cooldown > 0}
                onClick={handleResendOtp}
              >
                {resendLoading ? 'Sending New OTP...' : cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
              </button>

              <button
                className="w-full rounded-[1.25rem] border border-gray-200 bg-gray-50 py-4 text-sm font-black uppercase tracking-widest text-gray-500 transition-all hover:bg-gray-100"
                onClick={resetLogin}
              >
                Use Different Account
              </button>
            </div>
          )}

          <div className="mt-8 rounded-[1.5rem] bg-[#FFF9F5] p-6 border border-orange-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-[10px]">D</div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]">Demo Access</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-orange-100/50 pb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Admin</span>
                <code className="text-[10px] font-black text-[#ED6B21]">dsa10ademo@gmail.com</code>
              </div>
              <div className="flex items-center justify-between border-b border-orange-100/50 pb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Demo Admin</span>
                <code className="text-[10px] font-black text-[#ED6B21]">dsa10ademo+admin@gmail.com</code>
              </div>
              <div className="flex items-center justify-between border-b border-orange-100/50 pb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Management</span>
                <code className="text-[10px] font-black text-[#ED6B21]">dsa10ademo+management@gmail.com</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Researcher</span>
                <code className="text-[10px] font-black text-[#ED6B21]">dsa10ademo+researcher@gmail.com</code>
              </div>
            </div>

            <p className="mt-4 text-center text-[10px] font-bold text-[#005372]/40 uppercase tracking-tighter">
              Default Password: <span className="text-[#ED6B21] font-mono lowercase font-black text-[11px]">password</span>
            </p>
          </div>
        </div>
      </div>

      <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.2em] text-[#005372]/40 text-center max-w-sm leading-relaxed">
        SingHealth • MVP for <span className="text-orange-600/60">DSA3101 AI Project Management & Analytics Portal</span> • 2026
      </p>
    </div>
  )
}
