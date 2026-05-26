/**
 * Page workflow for initiating and completing password changes with OTP confirmation.
 * Handles request, verify, resend, cooldown tracking, and user feedback states.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'
import { LoginChallenge } from '../auth'
import PasswordInput from '../components/PasswordInput'

function secondsRemaining(isoTime: string | null) {
  if (!isoTime) return 0
  return Math.max(0, Math.ceil((new Date(isoTime).getTime() - Date.now()) / 1000))
}

export default function ChangePassword() {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
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

  async function handleRequestPasswordChange() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all password fields.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setSubmitting(true)
    setError(null)
    setInfo(null)
    try {
      const res = await api.post('/auth/password/change/request', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      const nextChallenge = res.data as LoginChallenge
      setChallenge(nextChallenge)
      setOtp('')
      setInfo(nextChallenge.message || `OTP sent to ${nextChallenge.masked_email}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Unable to start password change.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyOtp() {
    if (!challenge) return
    setVerifying(true)
    setError(null)
    setInfo(null)
    try {
      const res = await api.post('/auth/password/change/verify', {
        challenge_id: challenge.challenge_id,
        otp: otp.trim(),
      })
      setInfo(res.data?.message || 'Password updated successfully.')
      window.setTimeout(() => navigate('/projects'), 1200)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'OTP verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResendOtp() {
    if (!challenge) return
    setResending(true)
    setError(null)
    setInfo(null)
    try {
      const res = await api.post('/auth/password/change/resend', {
        challenge_id: challenge.challenge_id,
      })
      const nextChallenge = res.data as LoginChallenge
      setChallenge(nextChallenge)
      setOtp('')
      setInfo(`A new OTP was sent to ${nextChallenge.masked_email}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Unable to resend OTP.')
    } finally {
      setResending(false)
    }
  }

  function resetPasswordChange() {
    setChallenge(null)
    setOtp('')
    setError(null)
    setInfo(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="border-b border-orange-100 pb-6">
        <Link to="/projects" className="group flex items-center gap-1 text-[10px] font-black text-[#ED6B21] uppercase tracking-[0.2em] hover:opacity-70 transition-all">
          <span className="transition-transform group-hover:-translate-x-1">←</span> Back to Registry
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-[#005372]">Change Password</h1>
        <p className="mt-1 text-sm text-gray-500">
          {inOtpStep ? 'Confirm the change with the OTP sent to your registered email.' : 'Verify your current password before creating a new one.'}
        </p>
      </div>

      <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
        <div className="space-y-6">
          {!inOtpStep ? (
            <>
              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-[0.15em] text-[#005372]/60">Current Password</label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border-0 bg-gray-50 px-5 py-4 text-sm font-medium text-[#005372] ring-1 ring-gray-200 transition-all focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-[0.15em] text-[#005372]/60">New Password</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border-0 bg-gray-50 px-5 py-4 text-sm font-medium text-[#005372] ring-1 ring-gray-200 transition-all focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[11px] font-black uppercase tracking-[0.15em] text-[#005372]/60">Confirm New Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border-0 bg-gray-50 px-5 py-4 text-sm font-medium text-[#005372] ring-1 ring-gray-200 transition-all focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                />
              </div>
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
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/projects')}
                className="flex-1 rounded-[1.25rem] border border-gray-200 bg-gray-50 py-4 text-sm font-black uppercase tracking-widest text-gray-500 transition-all hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-[2] rounded-[1.25rem] bg-[#ED6B21] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-700/30 transition-all hover:bg-[#d45a1b] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                disabled={submitting}
                onClick={handleRequestPasswordChange}
              >
                {submitting ? 'Sending OTP...' : 'Continue'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                className="w-full rounded-[1.25rem] bg-[#ED6B21] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-700/30 transition-all hover:bg-[#d45a1b] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                disabled={verifying || otp.trim().length !== 6}
                onClick={handleVerifyOtp}
              >
                {verifying ? 'Verifying OTP...' : 'Verify and Update Password'}
              </button>

              <button
                type="button"
                className="w-full rounded-[1.25rem] border border-orange-200 bg-white py-4 text-sm font-black uppercase tracking-widest text-[#ED6B21] transition-all hover:bg-orange-50 disabled:opacity-50"
                disabled={resending || cooldown > 0}
                onClick={handleResendOtp}
              >
                {resending ? 'Sending New OTP...' : cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
              </button>

              <button
                type="button"
                className="w-full rounded-[1.25rem] border border-gray-200 bg-gray-50 py-4 text-sm font-black uppercase tracking-widest text-gray-500 transition-all hover:bg-gray-100"
                onClick={resetPasswordChange}
              >
                Start Over
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
