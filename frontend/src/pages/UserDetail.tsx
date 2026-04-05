import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api'

type UserProjectAccess = {
  project_id: number
  title: string
  relationship_type: 'owner' | 'permission'
  access_level: string
  can_view: boolean
  can_edit: boolean
  can_add_update: boolean
  can_add_funding: boolean
  can_manage_access: boolean
}

type UserDetailData = {
  id: number
  email: string
  full_name?: string | null
  role: 'researcher' | 'management' | 'admin'
  created_at: string
  projects: UserProjectAccess[]
}

function formatAccessSummary(project: UserProjectAccess) {
  const labels = [
    project.can_view && 'view',
    project.can_edit && 'edit',
    project.can_add_update && 'update',
    project.can_add_funding && 'funding',
    project.can_manage_access && 'manage-access',
  ].filter(Boolean)

  return labels.length > 0 ? labels.join(', ') : 'none'
}

export default function UserDetail() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserDetailData | null>(null)

  useEffect(() => {
    if (!id) return

    let cancelled = false
    setLoading(true)
    setError(null)

    api.get(`/auth/users/${id}`)
      .then((res) => {
        if (cancelled) return
        setUser(res.data)
      })
      .catch((e: any) => {
        if (cancelled) return
        setError(e?.response?.data?.detail || 'Unable to load user profile.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-sm text-gray-400">
        <div className="w-12 h-12 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin"></div>
        <p className="font-black tracking-[0.2em] uppercase text-[10px]">Loading User Profile...</p>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="space-y-4 rounded-[2rem] bg-white p-8 ring-1 ring-red-100 shadow-xl shadow-orange-900/5">
        <div className="text-lg font-black text-red-600 uppercase tracking-tight">Unable To Load User</div>
        <p className="text-sm text-gray-600">{error || 'Unknown error.'}</p>
        <Link to="/users" className="inline-flex rounded-xl bg-[#005372] px-5 py-2 text-[11px] font-black uppercase tracking-widest text-white">
          Back to Users
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <Link to="/users" className="group inline-flex items-center gap-1 text-[10px] font-black text-[#ED6B21] uppercase tracking-[0.2em] hover:opacity-70 transition-all">
        <span className="transition-transform group-hover:-translate-x-1">←</span> Back to Users
      </Link>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Name</div>
          <div className="text-lg font-black text-[#005372]">{user.full_name || 'Unnamed Staff'}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Email</div>
          <div className="text-sm font-mono font-bold text-[#005372] break-all">{user.email}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Role</div>
          <div className="text-lg font-black text-[#ED6B21] uppercase">{user.role}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Profile Created</div>
          <div className="text-sm font-bold text-[#005372]">{new Date(user.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="rounded-[2rem] bg-white shadow-xl shadow-orange-900/5 ring-1 ring-orange-100 overflow-hidden">
        <div className="bg-gray-50/50 px-8 py-5 border-b border-gray-100">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#005372]">Project Involvement</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 bg-white">
                <th className="px-8 py-5">Project</th>
                <th className="px-8 py-5">Access Level</th>
                <th className="px-8 py-5">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {user.projects.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-8 py-16 text-center text-sm text-gray-400">
                    No project involvement recorded.
                  </td>
                </tr>
              ) : user.projects.map((project) => (
                <tr key={`${project.relationship_type}-${project.project_id}`} className="hover:bg-[#FFF9F5]/70 transition-all">
                  <td className="px-8 py-5">
                    <div className="font-bold text-[#005372]">{project.title}</div>
                    <div className="text-[10px] font-mono text-gray-400 mt-1">#{project.project_id}</div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`inline-flex rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${
                      project.access_level === 'owner'
                        ? 'bg-orange-50 text-[#ED6B21] ring-orange-200'
                        : 'bg-gray-50 text-gray-600 ring-gray-200'
                    }`}>
                      {project.access_level.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-[11px] font-bold text-gray-500">
                    {formatAccessSummary(project)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
