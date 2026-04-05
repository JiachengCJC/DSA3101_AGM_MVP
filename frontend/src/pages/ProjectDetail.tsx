import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../auth'

type Project = {
  id: number
  title: string
  institution: string
  domain: string
  ai_type: string
  lifecycle_stage: string
  trl_level: string
  trc_category: string
  funding_amount_sgd?: number | null
  funds_received?: string | null
  funding_scope?: string | null
  grant_year_obtained?: number | null
  grant_start_date?: string | null
  grant_end_date?: string | null
  collaboration_formal_signed?: string | null
  collaboration_formal_partner?: string | null
  collaboration_formal_scope?: string | null
  collaboration_informal_partner?: string | null
  collaboration_informal_scope?: string | null
  patent_count?: number | null
  publication?: string | null
  possible_synergy?: string | null
  ai_office_involvement?: string | null
  description?: string | null
  created_at: string
  updated_at: string
  end_date?: string | null
  owner_id: number
}

type ProjectUpdateRow = {
  id: number
  project_id: number
  author_user_id: number
  status: string
  note: string
  created_at: string
}

type FundingEventRow = {
  id: number
  project_id: number
  author_user_id: number
  amount_sgd: number
  note?: string | null
  created_at: string
}

type VersionRow = {
  id: number
  project_id: number
  actor_user_id: number
  reason: string
  created_at: string
}

type AccessLevelKey = 'principal_investigator' | 'team_member' | 'viewer'

type UserRow = {
  id: number
  email: string
  full_name?: string | null
  role: 'researcher' | 'management' | 'admin'
}

type PermissionRow = {
  id: number
  project_id: number
  user_id: number
  granted_by_user_id: number
  user_email: string
  user_full_name?: string | null
  user_role: string
  access_level: AccessLevelKey
  can_view: boolean
  can_edit: boolean
  can_add_update: boolean
  can_add_funding: boolean
  can_manage_access: boolean
  override_can_view?: boolean | null
  override_can_edit?: boolean | null
  override_can_add_update?: boolean | null
  override_can_add_funding?: boolean | null
  override_can_manage_access?: boolean | null
  created_at: string
  updated_at: string
}

type PermissionDraft = {
  user_id: number
  access_level: AccessLevelKey
  can_view: boolean
  can_edit: boolean
  can_add_update: boolean
  can_add_funding: boolean
  can_manage_access: boolean
}

type PermissionFlagKey = 'can_view' | 'can_edit' | 'can_add_update' | 'can_add_funding' | 'can_manage_access'

const ACCESS_LEVEL_LABELS: Record<AccessLevelKey, string> = {
  principal_investigator: 'Principal Investigator',
  team_member: 'Team Member',
  viewer: 'Viewer',
}

const ACCESS_LEVEL_DEFAULTS: Record<AccessLevelKey, Omit<PermissionDraft, 'user_id' | 'access_level'>> = {
  principal_investigator: {
    can_view: true,
    can_edit: true,
    can_add_update: true,
    can_add_funding: true,
    can_manage_access: true,
  },
  team_member: {
    can_view: true,
    can_edit: true,
    can_add_update: true,
    can_add_funding: true,
    can_manage_access: false,
  },
  viewer: {
    can_view: true,
    can_edit: false,
    can_add_update: false,
    can_add_funding: false,
    can_manage_access: false,
  },
}

function buildPermissionDraft(userId: number, accessLevel: AccessLevelKey): PermissionDraft {
  return {
    user_id: userId,
    access_level: accessLevel,
    ...ACCESS_LEVEL_DEFAULTS[accessLevel],
  }
}

const defaultPermissionDraft: PermissionDraft = {
  ...buildPermissionDraft(0, 'team_member'),
}

export default function ProjectDetail() {
  const { id } = useParams()
  const auth = useAuth()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [updates, setUpdates] = useState<ProjectUpdateRow[]>([])
  const [fundingEvents, setFundingEvents] = useState<FundingEventRow[]>([])
  const [versions, setVersions] = useState<VersionRow[]>([])

  const [note, setNote] = useState('')
  const [postingNote, setPostingNote] = useState(false)
  const [fundingAmount, setFundingAmount] = useState('')
  const [fundingNote, setFundingNote] = useState('')
  const [fundingSaving, setFundingSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [users, setUsers] = useState<UserRow[]>([])
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [canManageProjectAccess, setCanManageProjectAccess] = useState(false)
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft>(defaultPermissionDraft)
  const [permissionSaving, setPermissionSaving] = useState(false)
  const [endingProject, setEndingProject] = useState(false)
  const isAdmin = auth.role === 'admin'

  const assignableUsers = useMemo(
    () => users.filter((user) => user.id !== project?.owner_id),
    [users, project?.owner_id]
  )

  function draftFromPermission(permission: PermissionRow): PermissionDraft {
    return {
      user_id: permission.user_id,
      access_level: permission.access_level,
      can_view: permission.can_view,
      can_edit: permission.can_edit,
      can_add_update: permission.can_add_update,
      can_add_funding: permission.can_add_funding,
      can_manage_access: permission.can_manage_access,
    }
  }

  async function loadDetailData() {
    if (!id) return
    setLoading(true)
    setLoadError(null)
    setCanManageProjectAccess(false)

    try {
      const [projectRes, updatesRes, fundingRes, versionsRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/updates`),
        api.get(`/projects/${id}/funding`),
        api.get(`/projects/${id}/versions`),
      ])
      setProject(projectRes.data)
      setUpdates(updatesRes.data)
      setFundingEvents(fundingRes.data)
      setVersions(versionsRes.data)

      try {
        const [permissionsRes, usersRes] = await Promise.all([
          api.get(`/projects/${id}/permissions`),
          api.get(`/projects/${id}/access-candidates`),
        ])
        setPermissions(permissionsRes.data)
        setUsers(usersRes.data)
        setCanManageProjectAccess(true)
      } catch {
        setPermissions([])
        setUsers([])
        setCanManageProjectAccess(false)
      }
    } catch (error: any) {
      if (error?.response?.status === 403) {
        setLoadError('You do not have access to this project details page. The registry still shows non-sensitive title and people-involved data.')
      } else if (error?.response?.status === 404) {
        setLoadError('Project not found.')
      } else {
        setLoadError(error?.response?.data?.detail || 'Failed to load project data.')
      }
      setPermissions([])
      setUsers([])
      setCanManageProjectAccess(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetailData()
  }, [id, auth.role, auth.userId])

  useEffect(() => {
    if (assignableUsers.length > 0 && permissionDraft.user_id === 0) {
      const firstUserId = assignableUsers[0].id
      const existingPermission = permissions.find((row) => row.user_id === firstUserId)
      if (existingPermission) {
        setPermissionDraft(draftFromPermission(existingPermission))
      } else {
        setPermissionDraft(buildPermissionDraft(firstUserId, 'team_member'))
      }
    }
  }, [assignableUsers, permissionDraft.user_id, permissions])

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-sm text-gray-400">
        <div className="w-12 h-12 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin"></div>
        <p className="font-black tracking-[0.2em] uppercase text-[10px]">Loading Project...</p>
      </div>
    )
  }

  if (loadError || !project) {
    return (
      <div className="space-y-4 rounded-[2rem] bg-white p-8 ring-1 ring-red-100 shadow-xl shadow-orange-900/5">
        <div className="text-lg font-black text-red-600 uppercase tracking-tight">Access Error</div>
        <p className="text-sm text-gray-600">{loadError || 'Unable to load project details.'}</p>
        <Link to="/projects" className="inline-flex rounded-xl bg-[#005372] px-5 py-2 text-[11px] font-black uppercase tracking-widest text-white">
          Back to Registry
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-orange-100 pb-6">
        <div>
          <Link to="/projects" className="group flex items-center gap-1 text-[10px] font-black text-[#ED6B21] uppercase tracking-[0.2em] hover:opacity-70 transition-all">
            <span className="transition-transform group-hover:-translate-x-1">←</span> Back to Registry
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-[#005372] tracking-tight">{project.title}</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{project.institution}</span>
            <span className="h-1 w-1 rounded-full bg-gray-300"></span>
            <span className="px-3 py-1 rounded-lg bg-teal-50 text-teal-700 text-[10px] font-black uppercase tracking-wider ring-1 ring-teal-200">
              {project.domain}
            </span>
            {project.end_date && (
              <>
                <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                <span className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-wider ring-1 ring-rose-200">
                  Ended {new Date(project.end_date).toLocaleString()}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              disabled={endingProject || Boolean(project.end_date)}
              className="rounded-xl bg-[#ED6B21] px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-xl shadow-orange-900/20 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
              onClick={async () => {
                if (!id || project.end_date) return
                if (!window.confirm('Mark this project as ended now?')) return
                setEndingProject(true)
                setActionError(null)
                try {
                  await api.post(`/projects/${id}/end`)
                  await loadDetailData()
                } catch (error: any) {
                  setActionError(error?.response?.data?.detail || 'Unable to end project')
                } finally {
                  setEndingProject(false)
                }
              }}
            >
              {project.end_date ? 'Project Ended' : endingProject ? 'Ending...' : 'End Project'}
            </button>
          )}
          <Link
            to={`/projects/${project.id}/edit`}
            className="rounded-xl bg-[#005372] px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/10 hover:-translate-y-0.5 transition-all active:scale-95"
          >
            Edit Project
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Lifecycle Stage</div>
          <div className="text-lg font-black text-[#005372] leading-tight">{project.lifecycle_stage || 'Not set'}</div>
          <div className="mt-3 text-[11px] font-bold text-gray-500">
            {project.end_date ? `Project ended on ${new Date(project.end_date).toLocaleString()}` : 'Project is active'}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Development Phase</div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-tighter">TRL</div>
            <div className="text-sm font-black text-[#005372] leading-snug">{project.trl_level || 'Not set'}</div>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-tighter pt-2">TRC</div>
            <div className="text-sm font-black text-[#ED6B21] leading-snug">{project.trc_category || 'Not set'}</div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Grant Period</div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span className="text-gray-400 uppercase tracking-tighter">Year Obtained:</span>
              <span className="text-[#005372] font-mono">{project.grant_year_obtained || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span className="text-gray-400 uppercase tracking-tighter">Start:</span>
              <span className="text-[#005372] font-mono">
                {project.grant_start_date ? new Date(project.grant_start_date).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span className="text-gray-400 uppercase tracking-tighter">End:</span>
              <span className="text-[#ED6B21] font-mono">
                {project.grant_end_date ? new Date(project.grant_end_date).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50 mb-3">Funding Amount (SGD)</div>
          <div className="text-2xl font-mono font-black text-[#ED6B21]">{`$${Number(project.funding_amount_sgd || 0).toLocaleString()}`}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
            <div className="text-[11px] font-black text-[#005372] uppercase tracking-[0.2em] border-b border-gray-50 pb-4 mb-6">Executive Summary</div>
            <div className="flex flex-wrap gap-2 mb-6">
              <span className="px-3 py-1 bg-gray-50 rounded-lg text-[9px] font-black text-[#005372] uppercase tracking-widest ring-1 ring-gray-100">Category: {project.domain}</span>
              <span className="px-3 py-1 bg-gray-50 rounded-lg text-[9px] font-black text-[#005372] uppercase tracking-widest ring-1 ring-gray-100">TRL: {project.trl_level}</span>
              <span className="px-3 py-1 bg-gray-50 rounded-lg text-[9px] font-black text-[#005372] uppercase tracking-widest ring-1 ring-gray-100">TRC: {project.trc_category}</span>
              <span className="px-3 py-1 bg-gray-50 rounded-lg text-[9px] font-black text-[#005372] uppercase tracking-widest ring-1 ring-gray-100">AI: {project.ai_type}</span>
            </div>
            <p className="text-sm leading-relaxed text-gray-600 font-medium whitespace-pre-wrap">
              {project.description || 'No description available for this project.'}
            </p>
          </div>

          <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
            <div className="text-[11px] font-black text-[#005372] uppercase tracking-[0.2em] border-b border-gray-50 pb-4 mb-6">Collaboration (Optional)</div>
            <div className="grid gap-5 md:grid-cols-2 text-sm">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Formal: RCA(s) / PA(s) Signed</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.collaboration_formal_signed || 'Not specified'}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Formal: Institution / Company</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.collaboration_formal_partner || 'Not specified'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Formal: Scope of Collaboration</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.collaboration_formal_scope || 'Not specified'}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Informal Discussions: Institution / Company</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.collaboration_informal_partner || 'Not specified'}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Number of Patents</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.patent_count ?? 'Not specified'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Informal Discussions: Potential Scope</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.collaboration_informal_scope || 'Not specified'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Publication</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.publication || 'Not specified'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Possible Synergy</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.possible_synergy || 'Not specified'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">AI Office Involvement</div>
                <div className="mt-1 text-gray-700 font-medium whitespace-pre-wrap">{project.ai_office_involvement || 'Not specified'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
            <div className="text-[11px] font-black text-[#005372] uppercase tracking-[0.2em] mb-6">Activity Updates</div>
            <div className="flex gap-3 mb-8">
              <input
                className="w-full rounded-xl border-0 bg-gray-50 px-5 py-3 text-sm font-medium text-[#005372] ring-1 ring-gray-200 focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none transition-all"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Log milestone or progress..."
              />
              <button
                disabled={postingNote}
                className="rounded-xl bg-[#005372] px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-[#003d54] transition-all shadow-lg shadow-blue-900/10 active:scale-95 disabled:opacity-50"
                onClick={async () => {
                  if (!note.trim()) return
                  setPostingNote(true)
                  setActionError(null)
                  try {
                    await api.post(`/projects/${id}/updates`, { status: 'Update', note: note.trim() })
                    setNote('')
                    await loadDetailData()
                  } catch (error: any) {
                    setActionError(error?.response?.data?.detail || 'Unable to post update')
                  } finally {
                    setPostingNote(false)
                  }
                }}
              >
                {postingNote ? 'Posting...' : 'Post'}
              </button>
            </div>

            <div className="space-y-8 border-l-2 border-orange-100 ml-3 pl-8">
              {updates.map((update) => (
                <div key={update.id} className="relative">
                  <div className="absolute -left-[37px] top-1 h-4 w-4 rounded-full bg-white ring-2 ring-orange-400"></div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{new Date(update.created_at).toLocaleString()}</div>
                  <div className="text-[10px] font-black text-[#ED6B21] mt-1 uppercase tracking-tight">{update.status}</div>
                  <div className="mt-2 text-sm font-medium text-gray-700 leading-relaxed bg-gray-50/50 p-4 rounded-2xl ring-1 ring-gray-100">{update.note}</div>
                </div>
              ))}
              {updates.length === 0 && (
                <div className="text-sm text-gray-400">No updates yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
            <div className="text-[11px] font-black text-[#005372] uppercase tracking-[0.2em] mb-6">Version History</div>
            <div className="space-y-3">
              {versions.map((version) => (
                <div key={version.id} className="rounded-2xl bg-gray-50/60 p-4 ring-1 ring-gray-100">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[#005372]">{version.reason}</div>
                      <div className="text-[10px] font-mono text-gray-400 mt-1">{new Date(version.created_at).toLocaleString()}</div>
                    </div>
                    <button
                      className="rounded-xl bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#005372] ring-1 ring-gray-200 hover:ring-[#ED6B21] hover:text-[#ED6B21] transition-all"
                      onClick={async () => {
                        if (!window.confirm(`Restore project to version #${version.id}?`)) return
                        setActionError(null)
                        try {
                          await api.post(`/projects/${id}/versions/${version.id}/restore`)
                          await loadDetailData()
                        } catch (error: any) {
                          setActionError(error?.response?.data?.detail || 'Unable to restore selected version')
                        }
                      }}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))}
              {versions.length === 0 && (
                <div className="text-sm text-gray-400">No versions recorded yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100 h-fit">
            <div className="text-[11px] font-black text-[#005372] uppercase tracking-[0.2em] border-b border-gray-50 pb-5 mb-8">Spending Ledger & Project Funding</div>
            <div className="space-y-6">
              <div className="space-y-4 rounded-2xl bg-gray-50/60 p-4 ring-1 ring-gray-100">
                <div>
                  <div className="text-[10px] font-black text-[#005372]/50 uppercase tracking-widest">Fund(s) Received</div>
                  <div className="mt-1 text-sm text-gray-700 font-medium whitespace-pre-wrap">{project.funds_received || 'Not specified'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black text-[#005372]/50 uppercase tracking-widest">Funding Scope</div>
                  <div className="mt-1 text-sm text-gray-700 font-medium whitespace-pre-wrap">{project.funding_scope || 'Not specified'}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm font-medium">
                  <div>
                    <div className="text-[10px] font-black text-[#005372]/50 uppercase tracking-widest">Year Obtained</div>
                    <div className="mt-1 text-gray-700">{project.grant_year_obtained || 'Not specified'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-[#005372]/50 uppercase tracking-widest">Grant Start</div>
                    <div className="mt-1 text-gray-700">{project.grant_start_date ? new Date(project.grant_start_date).toLocaleDateString() : 'Not specified'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-[#005372]/50 uppercase tracking-widest">Grant End</div>
                    <div className="mt-1 text-gray-700">{project.grant_end_date ? new Date(project.grant_end_date).toLocaleDateString() : 'Not specified'}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#005372]/50 uppercase tracking-widest ml-1">Additional Amount (SGD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 font-mono">$</span>
                  <input
                    type="number"
                    className="w-full rounded-2xl bg-gray-50 py-4 pl-9 pr-5 text-xl font-black text-[#005372] ring-1 ring-gray-200 focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none font-mono"
                    placeholder="0.00"
                    value={fundingAmount}
                    onChange={(e) => setFundingAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#005372]/50 uppercase tracking-widest ml-1">Allocation Note (Optional)</label>
                <input
                  className="w-full rounded-2xl bg-gray-50 py-4 px-5 text-sm font-medium text-[#005372] ring-1 ring-gray-200 focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                  placeholder="Brief justification..."
                  value={fundingNote}
                  onChange={(e) => setFundingNote(e.target.value)}
                />
              </div>

              <button
                disabled={fundingSaving || !fundingAmount}
                onClick={async () => {
                  const amount = Number(fundingAmount)
                  if (amount <= 0) {
                    setActionError('Funding amount must be greater than 0.')
                    return
                  }
                  setFundingSaving(true)
                  setActionError(null)
                  try {
                    await api.post(`/projects/${id}/funding`, { amount_sgd: amount, note: fundingNote.trim() || null })
                    setFundingAmount('')
                    setFundingNote('')
                    await loadDetailData()
                  } catch (error: any) {
                    setActionError(error?.response?.data?.detail || 'Error updating funding')
                  } finally {
                    setFundingSaving(false)
                  }
                }}
                className="w-full rounded-2xl bg-[#ED6B21] py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-orange-900/20 hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-30"
              >
                {fundingSaving ? 'Syncing...' : 'Log Funding Entry'}
              </button>

              <div className="pt-4">
                <div className="text-[10px] font-black text-[#005372]/40 uppercase mb-4 ml-1 tracking-[0.2em]">Transaction History</div>
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
                  {fundingEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl bg-gray-50/50 p-4 ring-1 ring-gray-100">
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-lg font-mono font-black text-[#005372]">${Number(event.amount_sgd || 0).toLocaleString()}</div>
                        <div className="text-[9px] font-black text-orange-400 bg-white px-2 py-1 rounded-lg ring-1 ring-orange-50 uppercase">
                          {new Date(event.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      {event.note && (
                        <div className="text-[11px] font-bold text-gray-500 italic leading-snug pt-2 border-t border-gray-100 mt-2">
                          {event.note}
                        </div>
                      )}
                    </div>
                  ))}
                  {fundingEvents.length === 0 && <div className="text-sm text-gray-400">No funding events logged yet.</div>}
                </div>
              </div>
            </div>
          </div>

          {canManageProjectAccess && (
            <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100">
              <div className="text-[11px] font-black text-[#005372] uppercase tracking-[0.2em] mb-5">Project Access Control</div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Select User</label>
                  <select
                    className="mt-1 w-full rounded-xl border-0 bg-gray-50 px-4 py-3 text-sm font-medium text-[#005372] ring-1 ring-gray-200 focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                    value={permissionDraft.user_id}
                    onChange={(event) => {
                      const userId = Number(event.target.value)
                      const existingPermission = permissions.find((row) => row.user_id === userId)
                      if (existingPermission) {
                        setPermissionDraft(draftFromPermission(existingPermission))
                      } else {
                        setPermissionDraft(buildPermissionDraft(userId, 'team_member'))
                      }
                    }}
                  >
                    {assignableUsers.length === 0 ? (
                      <option value={0}>No users available</option>
                    ) : (
                      assignableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {(user.full_name || user.email)} ({user.role})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50">Base Access Level</label>
                  <select
                    className="mt-1 w-full rounded-xl border-0 bg-gray-50 px-4 py-3 text-sm font-medium text-[#005372] ring-1 ring-gray-200 focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none"
                    value={permissionDraft.access_level}
                    onChange={(event) => {
                      const nextAccessLevel = event.target.value as AccessLevelKey
                      setPermissionDraft((prev) => ({
                        ...prev,
                        access_level: nextAccessLevel,
                        ...ACCESS_LEVEL_DEFAULTS[nextAccessLevel],
                      }))
                    }}
                  >
                    {(Object.keys(ACCESS_LEVEL_LABELS) as AccessLevelKey[]).map((key) => (
                      <option key={key} value={key}>
                        {ACCESS_LEVEL_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-[10px] text-gray-400">
                    Start from a role template, then fine-tune specific permissions below.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-gray-600">
                  {([
                    ['can_view', 'View details'],
                    ['can_edit', 'Edit project'],
                    ['can_add_update', 'Post updates'],
                    ['can_add_funding', 'Log funding'],
                    ['can_manage_access', 'Manage access'],
                  ] as [PermissionFlagKey, string][]).map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                      <input
                        type="checkbox"
                        checked={permissionDraft[key]}
                        onChange={(event) => setPermissionDraft((prev) => ({ ...prev, [key]: event.target.checked }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <button
                  disabled={permissionSaving || permissionDraft.user_id === 0}
                  className="rounded-xl bg-[#005372] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                  onClick={async () => {
                    setPermissionSaving(true)
                    setActionError(null)
                    try {
                      await api.post(`/projects/${id}/permissions`, permissionDraft)
                      await loadDetailData()
                    } catch (error: any) {
                      setActionError(error?.response?.data?.detail || 'Unable to update project permissions')
                    } finally {
                      setPermissionSaving(false)
                    }
                  }}
                >
                  {permissionSaving ? 'Saving...' : 'Save Permission Set'}
                </button>
              </div>

              <div className="mt-6 space-y-2">
                {permissions.map((permission) => {
                  const effectiveAccess = [
                    permission.can_view && 'view',
                    permission.can_edit && 'edit',
                    permission.can_add_update && 'update',
                    permission.can_add_funding && 'funding',
                    permission.can_manage_access && 'manage-access',
                  ]
                    .filter(Boolean)
                    .join(', ')

                  const overrideLabels = [
                    permission.override_can_view !== null && permission.override_can_view !== undefined && 'view',
                    permission.override_can_edit !== null && permission.override_can_edit !== undefined && 'edit',
                    permission.override_can_add_update !== null && permission.override_can_add_update !== undefined && 'update',
                    permission.override_can_add_funding !== null && permission.override_can_add_funding !== undefined && 'funding',
                    permission.override_can_manage_access !== null && permission.override_can_manage_access !== undefined && 'manage-access',
                  ].filter(Boolean)

                  return (
                    <div key={permission.id} className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black text-[#005372]">
                            {permission.user_full_name || permission.user_email}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {permission.user_role} • {ACCESS_LEVEL_LABELS[permission.access_level]}
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">{effectiveAccess}</div>
                          {overrideLabels.length > 0 && (
                            <div className="mt-1 text-[10px] text-[#ED6B21]">
                              Custom overrides: {overrideLabels.join(', ')}
                            </div>
                          )}
                        </div>
                        <button
                          className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700"
                          onClick={async () => {
                            if (!window.confirm('Revoke this user permission for the project?')) return
                            setActionError(null)
                            try {
                              await api.delete(`/projects/${id}/permissions/${permission.user_id}`)
                              await loadDetailData()
                            } catch (error: any) {
                              setActionError(error?.response?.data?.detail || 'Unable to revoke permission')
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  )
                })}
                {permissions.length === 0 && (
                  <div className="text-sm text-gray-400">No explicit project permissions configured yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
