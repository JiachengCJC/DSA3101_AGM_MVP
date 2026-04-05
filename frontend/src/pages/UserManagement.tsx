import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../auth'
import PasswordInput from '../components/PasswordInput'

type UserRow = {
  id: number
  email: string
  full_name?: string | null
  role: 'researcher' | 'management' | 'admin'
}

export default function UserManagement() {
  const auth = useAuth()
  const navigate = useNavigate()
  const canManageUsers = auth.role === 'admin'

  const [users, setUsers] = useState<UserRow[]>([])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'researcher' | 'management' | 'admin'>('researcher')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const inputClasses = 'w-full rounded-xl border-0 bg-gray-50 px-5 py-3 text-sm font-medium text-[#005372] ring-1 ring-gray-200 focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none transition-all'

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await api.get('/auth/users')
      setUsers(res.data)
      setError(null)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Unable to load user directory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canManageUsers) loadUsers()
  }, [canManageUsers])

  if (!canManageUsers) {
    return (
      <div className="mx-auto mt-12 max-w-2xl rounded-[2rem] bg-white p-12 text-center shadow-xl shadow-orange-900/5 ring-1 ring-red-100">
        <div className="mb-4 text-4xl">🚫</div>
        <h2 className="text-xl font-black uppercase tracking-tight text-[#005372]">Access Restricted</h2>
        <p className="mt-2 text-sm text-gray-500">Only administrators can manage institutional accounts.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 border-b border-orange-100 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#005372]">Access Control</h1>
          <p className="mt-1 text-sm text-gray-500">Provision and manage SingHealth AI Portfolio accounts</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <div className="h-fit space-y-6 rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="flex items-center gap-2 border-b border-gray-50 pb-4">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#ED6B21]"></div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#005372]">Provision User</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Work Email</label>
              <input className={inputClasses} placeholder="staff@singhealth.com.sg" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Full Name</label>
              <input className={inputClasses} placeholder="John Tan" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Security Password</label>
              <PasswordInput
                className={inputClasses}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-[#005372]/50">System Role</label>
              <select className={inputClasses} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="researcher">Researcher</option>
                <option value="management">Management</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              className="w-full rounded-2xl bg-[#005372] py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-blue-900/10 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-40"
              disabled={saving || !email || !password}
              onClick={async () => {
                setSaving(true)
                setError(null)
                setSuccess(null)
                try {
                  await api.post('/auth/register', { email: email.trim(), password: password.trim(), full_name: fullName.trim() || null, role })
                  setEmail('')
                  setFullName('')
                  setPassword('')
                  setRole('researcher')
                  setSuccess('User successfully provisioned.')
                  await loadUsers()
                } catch (e: any) {
                  setError(e?.response?.data?.detail || 'Account creation failed.')
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving ? 'Processing...' : 'Create Account'}
            </button>
          </div>

          {error && <div className="rounded-xl bg-red-50 p-4 text-[10px] font-black uppercase tracking-widest text-red-600 ring-1 ring-red-100">⚠️ {error}</div>}
          {success && <div className="rounded-xl bg-teal-50 p-4 text-[10px] font-black uppercase tracking-widest text-teal-600 ring-1 ring-teal-100">✓ {success}</div>}
        </div>

        <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="border-b border-gray-100 bg-gray-50/50 px-8 py-5">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#005372]">Authorized Personnel Directory</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                  <th className="px-8 py-5">User Details</th>
                  <th className="px-8 py-5">Access Level</th>
                  <th className="px-8 py-5 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-100 border-t-orange-500"></div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">Synchronizing Directory...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="group cursor-pointer transition-all hover:bg-[#FFF9F5]/80"
                      onClick={() => navigate(`/users/${u.id}`)}
                    >
                      <td className="px-8 py-5">
                        <div className="font-bold text-[#005372] transition-colors group-hover:text-[#ED6B21]">{u.full_name || 'Unnamed Staff'}</div>
                        <div className="mt-0.5 text-[11px] font-mono font-bold text-gray-400">{u.email}</div>
                      </td>
                      <td className="px-8 py-5">
                        <span
                          className={`inline-flex rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${
                            u.role === 'admin'
                              ? 'bg-purple-50 text-purple-700 ring-purple-200'
                              : u.role === 'management'
                                ? 'bg-blue-50 text-blue-700 ring-blue-200'
                                : 'bg-teal-50 text-teal-700 ring-teal-200'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {auth?.email !== u.email && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (!window.confirm(`Revoke access for ${u.email}?`)) return
                              try {
                                await api.delete(`/auth/users/${u.id}`)
                                loadUsers()
                              } catch (e) {
                                alert('Revoke failed.')
                              }
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-gray-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
                          >
                            Revoke Access
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
