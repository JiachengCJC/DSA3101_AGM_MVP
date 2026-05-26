/**
 * Management dashboard page backed by `/analytics/portfolio`.
 * Transforms analytics payloads into charts, cards, and risk-oriented tables.
 */
import React, { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useAuth } from '../auth'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const CHART_COLORS = ['#005372', '#ED6B21', '#009494', '#5BA6A6', '#CF5C5C', '#617D8A', '#2563EB', '#4B5563']

type CountByKey = {
  key: string
  count: number
}

type FundingByKey = {
  key: string
  amount_sgd: number
}

type FundingByInstitutionDomain = {
  institution: string
  domain: string
  amount_sgd: number
}

type ProjectCycle = {
  id: number
  title: string
  institution: string
  domain: string
  lifecycle_stage: string
  trl_level: string
  trc_category: string
  start_time: string
  end_time?: string | null
  updated_at: string
  grant_end_date?: string | null
  duration_days: number
  spent_sgd: number
}

type OverdueOrInactiveProject = {
  id: number
  title: string
  institution: string
  domain: string
  updated_at: string
  days_since_update: number
  is_overdue_update: boolean
  is_inactive: boolean
  is_past_due: boolean
  due_date?: string | null
  deployment_status: string
  governance_status: string
  risk_level: string
  spent_sgd: number
}

type PortfolioSnapshot = {
  total_projects: number
  active_projects: number
  total_spent_sgd: number
  by_institution: CountByKey[]
  by_domain: CountByKey[]
  by_lifecycle_stage: CountByKey[]
  by_deployment_status: CountByKey[]
  by_governance_status: CountByKey[]
  by_risk_level: CountByKey[]
  overdue_or_inactive_count: number
  funding_by_domain: FundingByKey[]
  funding_by_institution: FundingByKey[]
  funding_by_institution_and_domain: FundingByInstitutionDomain[]
  overdue_or_inactive_projects: OverdueOrInactiveProject[]
  project_cycles: ProjectCycle[]
}

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString()}`
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${Math.round(value).toLocaleString()}`
}

function countFor(rows: CountByKey[], key: string) {
  return rows.find((row) => row.key === key)?.count ?? 0
}

function topCounts(rows: CountByKey[], limit = 8) {
  const sorted = [...rows].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  if (sorted.length <= limit) return sorted

  const head = sorted.slice(0, limit)
  const tailCount = sorted.slice(limit).reduce((sum, row) => sum + row.count, 0)
  return [...head, { key: 'Others', count: tailCount }]
}

function topFunding(rows: FundingByKey[], limit = 8) {
  const sorted = [...rows].sort((a, b) => b.amount_sgd - a.amount_sgd || a.key.localeCompare(b.key))
  if (sorted.length <= limit) return sorted

  const head = sorted.slice(0, limit)
  const tailAmount = sorted.slice(limit).reduce((sum, row) => sum + row.amount_sgd, 0)
  return [...head, { key: 'Others', amount_sgd: tailAmount }]
}

function riskBadgeClass(riskLevel: string) {
  if (riskLevel === 'High') return 'bg-red-50 text-red-700 ring-red-200'
  if (riskLevel === 'Medium') return 'bg-orange-50 text-orange-700 ring-orange-200'
  return 'bg-green-50 text-green-700 ring-green-200'
}

function governanceBadgeClass(status: string) {
  if (status === 'Needs Attention') return 'bg-red-50 text-red-700 ring-red-200'
  if (status === 'In Progress') return 'bg-blue-50 text-blue-700 ring-blue-200'
  return 'bg-teal-50 text-teal-700 ring-teal-200'
}

function deploymentBadgeClass(status: string) {
  if (status === 'On Hold') return 'bg-red-50 text-red-700 ring-red-200'
  if (status === 'Completed' || status === 'Deployed') return 'bg-green-50 text-green-700 ring-green-200'
  if (status === 'Pre-deployment' || status === 'Validation') return 'bg-blue-50 text-blue-700 ring-blue-200'
  return 'bg-gray-50 text-gray-700 ring-gray-200'
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2rem] bg-white p-7 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100 ${className}`}>
      <div className="mb-5">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#005372]">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs font-medium text-gray-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  )
}

function MetricCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string
  value: string | number
  subtitle: string
  accent: 'teal' | 'orange' | 'blue' | 'red'
}) {
  const accentMap = {
    teal: 'from-teal-500/10 to-teal-100/40 text-teal-700 ring-teal-200',
    orange: 'from-orange-500/10 to-orange-100/40 text-orange-700 ring-orange-200',
    blue: 'from-blue-500/10 to-blue-100/40 text-blue-700 ring-blue-200',
    red: 'from-red-500/10 to-red-100/40 text-red-700 ring-red-200',
  }

  return (
    <div className="rounded-[1.5rem] bg-white p-5 shadow-lg shadow-orange-900/5 ring-1 ring-orange-100">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-[#005372]">{value}</div>
      <div className={`mt-3 inline-flex rounded-full bg-gradient-to-r px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${accentMap[accent]}`}>
        {subtitle}
      </div>
    </div>
  )
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 text-xs font-bold uppercase tracking-widest text-gray-400">
      {label}
    </div>
  )
}

export default function Dashboard() {
  const auth = useAuth()
  const [data, setData] = useState<PortfolioSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await api.get('/analytics/portfolio')
        setData(res.data)
        setError(null)
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Unable to load dashboard (management/admin only).')
      }
    })()
  }, [])

  const institutionData = useMemo(() => topCounts(data?.by_institution || []), [data])
  const domainData = useMemo(() => topCounts(data?.by_domain || []), [data])
  const lifecycleData = useMemo(() => topCounts(data?.by_lifecycle_stage || []), [data])
  const deploymentData = useMemo(() => topCounts(data?.by_deployment_status || []), [data])
  const governanceData = useMemo(() => topCounts(data?.by_governance_status || []), [data])
  const riskData = useMemo(() => topCounts(data?.by_risk_level || []), [data])

  const fundingByInstitution = useMemo(() => topFunding(data?.funding_by_institution || []), [data])
  const fundingByDomain = useMemo(() => topFunding(data?.funding_by_domain || []), [data])
  const fundingMatrixRows = useMemo(() => (data?.funding_by_institution_and_domain || []).slice(0, 12), [data])

  const overdueRows = useMemo(() => (data?.overdue_or_inactive_projects || []).slice(0, 12), [data])
  const lifecycleRows = useMemo(
    () =>
      [...(data?.project_cycles || [])]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 12),
    [data]
  )
  const canViewLifecycleAndOverduePanels = auth.role === 'admin'

  const deployedAndCompleted = useMemo(() => {
    const rows = data?.by_deployment_status || []
    return countFor(rows, 'Deployed') + countFor(rows, 'Completed')
  }, [data])

  const highRiskCount = useMemo(() => countFor(data?.by_risk_level || [], 'High'), [data])

  return (
    <div className="space-y-7 pb-10">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#005372] via-[#0d6f8d] to-[#009494] p-8 shadow-2xl shadow-blue-900/20 ring-1 ring-white/20">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-8 h-56 w-56 rounded-full bg-orange-400/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-black tracking-tight text-white">Portfolio Intelligence Dashboard</h1>
            <p className="mt-2 text-sm font-medium text-white/80">
              Portfolio-wide view using your existing project registry data only. No project information was altered.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                'Overall portfolio overview',
                'Projects by institution',
                'Projects by specialty',
                'Lifecycle/maturity pipeline',
                'Deployment status tracking',
                'Overdue/inactive projects',
                'Funding by institution and specialty',
              ].map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white ring-1 ring-white/30"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="inline-flex items-center gap-2 self-start rounded-xl bg-white/10 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.15em] text-white ring-1 ring-white/30 backdrop-blur-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-300 opacity-80" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-300" />
            </span>
            Live Portfolio Snapshot
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700 ring-1 ring-red-200">⚠️ {error}</div>
      )}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Total Projects" value={data.total_projects} subtitle="Portfolio volume" accent="teal" />
            <MetricCard label="Active Projects" value={data.active_projects} subtitle="Current workload" accent="orange" />
            <MetricCard
              label="Deployed / Completed"
              value={deployedAndCompleted}
              subtitle="Operationalized initiatives"
              accent="blue"
            />
            <MetricCard
              label="Overdue or Inactive"
              value={data.overdue_or_inactive_count}
              subtitle="Needs follow-up"
              accent="red"
            />
            <MetricCard
              label="High Risk Signals"
              value={highRiskCount}
              subtitle="Operational risk flags"
              accent="red"
            />
            <MetricCard
              label="Funding Committed"
              value={formatCurrency(data.total_spent_sgd)}
              subtitle="All institutions and specialties"
              accent="teal"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="Projects by Institution"
              subtitle="Distribution of registered projects across institutions"
            >
              <div className="h-[340px]">
                {institutionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={institutionData} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="key"
                        axisLine={false}
                        tickLine={false}
                        width={120}
                        tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                      />
                      <Tooltip cursor={{ fill: '#FFF9F5' }} formatter={(value: number) => [`${value}`, 'Projects']} />
                      <Bar dataKey="count" radius={[0, 10, 10, 0]} barSize={22} fill="#005372" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty label="No institution data" />
                )}
              </div>
            </Panel>

            <Panel
              title="Projects by Specialty / Clinical Area"
              subtitle="Specialty concentration of the current portfolio"
            >
              <div className="h-[340px]">
                {domainData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={domainData}
                        dataKey="count"
                        nameKey="key"
                        innerRadius={72}
                        outerRadius={104}
                        paddingAngle={4}
                      >
                        {domainData.map((entry, index) => (
                          <Cell key={`domain-pie-${entry.key}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value}`, 'Projects']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty label="No specialty data" />
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {domainData.map((row, index) => (
                  <span
                    key={`domain-legend-${row.key}`}
                    className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-tight text-gray-600 ring-1 ring-gray-200"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    {row.key} ({row.count})
                  </span>
                ))}
              </div>
            </Panel>
          </div>

          <Panel
            title="Lifecycle / Maturity Pipeline"
            subtitle="Portfolio progress from ideation through productization and growth"
          >
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/60">Lifecycle Stage</div>
            <div className="h-[290px]">
              {lifecycleData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lifecycleData} margin={{ top: 8, right: 16, left: 0, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="key" angle={-20} textAnchor="end" height={56} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value: number) => [`${value}`, 'Projects']} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#ED6B21" barSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No lifecycle data" />
              )}
            </div>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="Funding Committed by Institution"
              subtitle="Committed funding across institutions"
            >
              <div className="h-[330px]">
                {fundingByInstitution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fundingByInstitution} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value: number) => formatCompactCurrency(value)}
                      />
                      <YAxis
                        type="category"
                        dataKey="key"
                        axisLine={false}
                        tickLine={false}
                        width={120}
                        tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                      />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Funding (SGD)']} />
                      <Bar dataKey="amount_sgd" radius={[0, 10, 10, 0]} barSize={22} fill="#005372" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty label="No funding data" />
                )}
              </div>
            </Panel>

            <Panel
              title="Funding Committed by Specialty"
              subtitle="Committed funding across specialties / clinical areas"
            >
              <div className="h-[330px]">
                {fundingByDomain.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fundingByDomain} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value: number) => formatCompactCurrency(value)}
                      />
                      <YAxis
                        type="category"
                        dataKey="key"
                        axisLine={false}
                        tickLine={false}
                        width={130}
                        tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                      />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Funding (SGD)']} />
                      <Bar dataKey="amount_sgd" radius={[0, 10, 10, 0]} barSize={22} fill="#ED6B21" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty label="No funding data" />
                )}
              </div>
            </Panel>
          </div>

          <Panel
            title="Funding Matrix: Institution × Specialty"
            subtitle="Top institution-specialty combinations by committed funding"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                    <th className="px-4 py-3">Institution</th>
                    <th className="px-4 py-3">Specialty</th>
                    <th className="px-4 py-3 text-right">Funding (SGD)</th>
                    <th className="px-4 py-3 text-right">Portfolio Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fundingMatrixRows.map((row) => (
                    <tr key={`${row.institution}-${row.domain}`} className="hover:bg-[#FFF9F5]/80">
                      <td className="px-4 py-3 font-bold text-[#005372]">{row.institution}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700 ring-1 ring-teal-200">
                          {row.domain}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#005372]">
                        {formatCurrency(row.amount_sgd)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-gray-500">
                        {data.total_spent_sgd > 0
                          ? `${((row.amount_sgd / data.total_spent_sgd) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </td>
                    </tr>
                  ))}
                  {fundingMatrixRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm font-medium text-gray-400">
                        No funding combinations available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {canViewLifecycleAndOverduePanels && (
            <>
              <Panel
                title="Overdue Updates / Inactive Projects"
                subtitle="Projects with overdue updates (>30 days), inactivity (>90 days), or past due dates"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                        <th className="px-4 py-3">Project</th>
                        <th className="px-4 py-3">Status Signals</th>
                        <th className="px-4 py-3">Last Update</th>
                        <th className="px-4 py-3">Due Date</th>
                        <th className="px-4 py-3 text-right">Funding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {overdueRows.map((row) => (
                        <tr key={`overdue-${row.id}`} className="hover:bg-[#FFF9F5]/80">
                          <td className="px-4 py-3">
                            <div className="font-bold text-[#005372]">{row.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-400">
                              <span>{row.institution}</span>
                              <span>•</span>
                              <span>{row.domain}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ring-1 ${riskBadgeClass(row.risk_level)}`}>
                                {row.risk_level} Risk
                              </span>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ring-1 ${governanceBadgeClass(row.governance_status)}`}>
                                {row.governance_status}
                              </span>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ring-1 ${deploymentBadgeClass(row.deployment_status)}`}>
                                {row.deployment_status}
                              </span>
                              {row.is_overdue_update && (
                                <span className="inline-flex rounded-full bg-orange-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-orange-700 ring-1 ring-orange-200">
                                  Overdue Update
                                </span>
                              )}
                              {row.is_inactive && (
                                <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-red-700 ring-1 ring-red-200">
                                  Inactive
                                </span>
                              )}
                              {row.is_past_due && (
                                <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-red-700 ring-1 ring-red-200">
                                  Past Due
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs font-bold text-gray-600">
                            {new Date(row.updated_at).toLocaleDateString()}
                            <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-gray-400">
                              {row.days_since_update} days ago
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs font-bold text-gray-600">
                            {row.due_date ? new Date(row.due_date).toLocaleDateString() : '—'}
                          </td>

                          <td className="px-4 py-3 text-right font-mono font-bold text-[#005372]">
                            {formatCurrency(row.spent_sgd)}
                          </td>
                        </tr>
                      ))}

                      {overdueRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm font-medium text-gray-400">
                            No overdue or inactive projects detected.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel
                title="Recent Lifecycle Records"
                subtitle="Most recently updated projects with lifecycle, deployment, and funding context"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                        <th className="px-4 py-3">Project</th>
                        <th className="px-4 py-3">Lifecycle</th>
                        <th className="px-4 py-3">Deployment Context</th>
                        <th className="px-4 py-3">Timeline</th>
                        <th className="px-4 py-3 text-right">Funding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lifecycleRows.map((row) => (
                        <tr key={`cycle-${row.id}`} className="hover:bg-[#FFF9F5]/80">
                          <td className="px-4 py-3">
                            <div className="font-bold text-[#005372]">{row.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-400">
                              <span>{row.institution}</span>
                              <span>•</span>
                              <span>{row.domain}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="text-xs font-black text-[#005372]">{row.lifecycle_stage}</div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-tight text-gray-500">
                              {row.trc_category}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700 ring-1 ring-blue-200">
                              {row.trl_level}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs font-bold text-gray-600">
                            <div>
                              {new Date(row.start_time).toLocaleDateString()} →{' '}
                              {row.end_time ? new Date(row.end_time).toLocaleDateString() : 'Ongoing'}
                            </div>
                            <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-gray-400">
                              {row.duration_days} days • updated {new Date(row.updated_at).toLocaleDateString()}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right font-mono font-bold text-[#005372]">
                            {formatCurrency(row.spent_sgd)}
                          </td>
                        </tr>
                      ))}

                      {lifecycleRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm font-medium text-gray-400">
                            No lifecycle records available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </>
      ) : (
        <div className="flex h-96 flex-col items-center justify-center gap-4 text-sm text-gray-400">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-100 border-t-orange-500" />
          <p className="text-[10px] font-black uppercase tracking-widest">Analyzing Portfolio Data...</p>
        </div>
      )}
    </div>
  )
}
