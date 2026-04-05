import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from './api'

type UserRole = 'researcher' | 'management' | 'admin'

export type LoginChallenge = {
  access_token?: string | null
  challenge_id?: string | null
  masked_email?: string | null
  resend_available_at?: string | null
  expires_at?: string | null
  message?: string | null
}

type AuthState = {
  token: string | null
  role: UserRole | null
  email: string | null
  userId: number | null
  fullName: string | null
}

type AuthContextValue = AuthState & {
  login: (email: string, password: string, rememberDevice: boolean) => Promise<LoginChallenge>
  verifyOtp: (challengeId: string, otp: string, rememberDevice: boolean) => Promise<void>
  resendOtp: (challengeId: string) => Promise<LoginChallenge>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeRoleFromJwt(token: string): UserRole | null {
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(atob(payload))
    return (json.role as UserRole) || null
  } catch {
    return null
  }
}

function decodeEmailFromJwt(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(atob(payload))
    return (json.sub as string) || null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('agm_token'))
  const [role, setRole] = useState<UserRole | null>(token ? decodeRoleFromJwt(token) : null)
  const [email, setEmail] = useState<string | null>(token ? decodeEmailFromJwt(token) : null)
  const [userId, setUserId] = useState<number | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    if (token) {
      localStorage.setItem('agm_token', token)
      setRole(decodeRoleFromJwt(token))
      setEmail(decodeEmailFromJwt(token))
      ;(async () => {
        try {
          const res = await api.get('/auth/me')
          if (!mounted) return
          setUserId(res.data.id ?? null)
          setFullName(res.data.full_name ?? null)
          setRole(res.data.role ?? decodeRoleFromJwt(token))
          setEmail(res.data.email ?? decodeEmailFromJwt(token))
        } catch {
          if (!mounted) return
          setToken(null)
        }
      })()
    } else {
      localStorage.removeItem('agm_token')
      setRole(null)
      setEmail(null)
      setUserId(null)
      setFullName(null)
    }

    return () => {
      mounted = false
    }
  }, [token])

  const value = useMemo<AuthContextValue>(() => ({
    token,
    role,
    email,
    userId,
    fullName,
    login: async (emailAddress: string, password: string, rememberDevice: boolean) => {
      const data = new URLSearchParams()
      data.set('username', emailAddress)
      data.set('password', password)
      data.set('remember_device', rememberDevice ? 'true' : 'false')

      const res = await api.post('/auth/token', data, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      const payload = res.data as Partial<LoginChallenge>
      if (payload.access_token) {
        setToken(payload.access_token)
      }
      return payload as LoginChallenge
    },
    verifyOtp: async (challengeId: string, otp: string, rememberDevice: boolean) => {
      const res = await api.post('/auth/otp/verify', {
        challenge_id: challengeId,
        otp,
        remember_device: rememberDevice,
      })
      setToken(res.data.access_token)
    },
    resendOtp: async (challengeId: string) => {
      const res = await api.post('/auth/otp/resend', {
        challenge_id: challengeId
      })
      return res.data as LoginChallenge
    },
    logout: async () => {
      try {
        await api.post('/auth/logout')
      } catch {
        // Clear local auth state even if the server-side logout request fails.
      } finally {
        setToken(null)
      }
    }
  }), [token, role, email, userId, fullName])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
