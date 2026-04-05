import React, { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

// --- Types ---
type ProjectPerson = { user_id: number; email: string; full_name?: string | null; role: string }
type ProjectRow = {
  id: number; title: string; people_involved: ProjectPerson[]
  can_view_details: boolean; institution?: string | null; domain?: string | null
  ai_type?: string | null; lifecycle_stage?: string | null; funding_amount_sgd?: number | null
  updated_at: string
}

type FilterFieldKey = 'title' | 'institution' | 'domain' | 'ai_type' | 'lifecycle_stage' | 'funding_amount_sgd' | 'access'
type FieldType = 'text' | 'number' | 'categorical'
type FilterRule = { id: string; field: FilterFieldKey; condition: string; value: string; values?: string[] }

type SortKey = 'title' | 'updated_at' | 'institution' | 'funding_amount_sgd'
type SortDir = 'asc' | 'desc'
type SortRule = { id: string; key: SortKey; dir: SortDir }

// --- Static option lists (mirrors ProjectForm defaults + fetched options) ---
const INSTITUTION_OPTIONS = [
  'Changi General Hospital (CGH)',
  'KK Women\'s and Children\'s Hospital (KKH)',
  'National Cancer Center Singapore (NCCS)',
  'National Dental Center Singapore (NDCS)',
  'National Heart Center Singapore (NHCS)',
  'National Neuroscience Institute (NNI)',
  'Outram Community Hospitals (OCH)',
  'Singapore General Hospital (SGH)',
  'Singapore National Eye Center (SNEC)',
  'SingHealth',
  'SingHealth Polyclinics (SHP)',
  'Sengkang General Hospital (SKH)',
]
const DOMAIN_OPTIONS = [
  'Cardiology', 'Clinical Decision Support', 'Oncology',
  'Operations', 'Pathology', 'Population Health', 'Radiology',
]
const AI_TYPE_OPTIONS = [
  'Computer Vision', 'Generative AI', 'Natural Language Processing',
  'Optimization', 'Predictive Analytics', 'Recommender System',
]
const LIFECYCLE_STAGE_OPTIONS = [
  'Research & ideation',
  'Design & validation',
  'IP Generation & Productization',
  'Market entry & Growth',
]

// --- Metadata ---
const FIELD_META: { key: FilterFieldKey; label: string; type: FieldType }[] = [
  { key: 'title',               label: 'Title',          type: 'text'        },
  { key: 'institution',         label: 'Institution',    type: 'categorical' },
  { key: 'domain',              label: 'Domain',         type: 'categorical' },
  { key: 'ai_type',             label: 'AI Type',        type: 'categorical' },
  { key: 'lifecycle_stage',     label: 'Lifecycle Stage', type: 'categorical' },
  { key: 'funding_amount_sgd',  label: 'Funding (SGD)',  type: 'number'      },
  { key: 'access',              label: 'Data Access',    type: 'categorical' },
]

const SORT_FIELDS: { key: SortKey; label: string; isNumeric?: boolean; isDate?: boolean }[] = [
  { key: 'title',              label: 'Title'        },
  { key: 'updated_at',         label: 'Last Updated', isDate: true },
  { key: 'institution',        label: 'Institution'  },
  { key: 'funding_amount_sgd', label: 'Funding', isNumeric: true },
]

const CONDITIONS: Record<FieldType, { value: string; label: string; hasInput: boolean }[]> = {
  text: [
    { value: 'contains',      label: 'contains',          hasInput: true },
    { value: 'not_contains',  label: 'does not contain',  hasInput: true },
    { value: 'is',            label: 'is',                hasInput: true },
    { value: 'is_not',        label: 'is not',            hasInput: true },
  ],
  categorical: [
    { value: 'is',            label: 'is',                hasInput: true },
    { value: 'is_not',        label: 'is not',            hasInput: true },
    { value: 'in',            label: 'in',                hasInput: true },
  ],
  number: [
    { value: 'eq',            label: '=',                 hasInput: true },
    { value: 'neq',           label: '≠',                 hasInput: true },
    { value: 'gt',            label: '>',                 hasInput: true },
    { value: 'gte',           label: '≥',                 hasInput: true },
    { value: 'lt',            label: '<',                 hasInput: true },
    { value: 'lte',           label: '≤',                 hasInput: true },
  ],
}

// --- Helpers ---
function uid() { return Math.random().toString(36).slice(2) }

function getFieldType(field: FilterFieldKey): FieldType {
  return FIELD_META.find(f => f.key === field)!.type
}

function getDefaultCondition(field: FilterFieldKey): string {
  const type = getFieldType(field)
  if (type === 'number') return 'eq'
  if (type === 'categorical') return 'is'
  return 'contains'
}

function getCategoryOptions(field: FilterFieldKey, rows: ProjectRow[]): string[] {
  const fromRows = (key: keyof ProjectRow) =>
    rows.map(r => r[key]).filter(Boolean) as string[]
  if (field === 'institution') return [...new Set([...INSTITUTION_OPTIONS, ...fromRows('institution')])].sort()
  if (field === 'domain')      return [...new Set([...DOMAIN_OPTIONS,      ...fromRows('domain')])].sort()
  if (field === 'ai_type')     return [...new Set([...AI_TYPE_OPTIONS,     ...fromRows('ai_type')])].sort()
  if (field === 'lifecycle_stage') return [...new Set([...LIFECYCLE_STAGE_OPTIONS, ...fromRows('lifecycle_stage')])].sort()
  if (field === 'access')      return ['Granted', 'Restricted']
  return []
}

function isActiveFilter(rule: FilterRule): boolean {
  if (getFieldType(rule.field) === 'categorical' && rule.condition === 'in') {
    return (rule.values?.length ?? 0) > 0
  }
  return rule.value !== ''
}

function matchesFilter(row: ProjectRow, rule: FilterRule): boolean {
  const { field, condition, value } = rule
  let raw: string | number | null | undefined

  if (field === 'title')              raw = row.title
  else if (field === 'institution')   raw = row.institution
  else if (field === 'domain')        raw = row.domain
  else if (field === 'ai_type')       raw = row.ai_type
  else if (field === 'lifecycle_stage') raw = row.lifecycle_stage
  else if (field === 'funding_amount_sgd') raw = row.funding_amount_sgd
  else if (field === 'access')        raw = row.can_view_details ? 'Granted' : 'Restricted'

  const type = getFieldType(field)
  if (type === 'number') {
    const n = raw as number | null | undefined
    const v = parseFloat(value)
    if (isNaN(v) || n == null) return true
    if (condition === 'eq')  return n === v
    if (condition === 'neq') return n !== v
    if (condition === 'gt')  return n > v
    if (condition === 'gte') return n >= v
    if (condition === 'lt')  return n < v
    if (condition === 'lte') return n <= v
  } else {
    const s = String(raw ?? '').toLowerCase()
    const v = value.toLowerCase()
    const values = (rule.values ?? []).map(item => item.toLowerCase())
    if (condition === 'contains')     return s.includes(v)
    if (condition === 'not_contains') return !s.includes(v)
    if (condition === 'is')           return s === v
    if (condition === 'is_not')       return s !== v
    if (condition === 'in')           return values.length === 0 ? true : values.includes(s)
  }
  return true
}

function compareForSort(a: ProjectRow, b: ProjectRow, rules: SortRule[]): number {
  for (const rule of rules) {
    let va: string | number | null | undefined
    let vb: string | number | null | undefined
    if (rule.key === 'title')             { va = a.title.toLowerCase();              vb = b.title.toLowerCase() }
    else if (rule.key === 'updated_at')   { va = a.updated_at;                       vb = b.updated_at }
    else if (rule.key === 'institution')  { va = (a.institution ?? '').toLowerCase(); vb = (b.institution ?? '').toLowerCase() }
    else if (rule.key === 'funding_amount_sgd') { va = a.funding_amount_sgd != null ? Number(a.funding_amount_sgd) : -Infinity; vb = b.funding_amount_sgd != null ? Number(b.funding_amount_sgd) : -Infinity }

    if ((va == null || va === '') && (vb == null || vb === '')) continue
    if (va == null || va === '') return 1
    if (vb == null || vb === '') return -1
    if (va < vb) return rule.dir === 'asc' ? -1 : 1
    if (va > vb) return rule.dir === 'asc' ? 1 : -1
  }
  return 0
}

function personLabel(p: ProjectPerson) { return p.full_name?.trim() || p.email }

function getInFilterLabel(values: string[] | undefined): string {
  if (!values || values.length === 0) return 'Select...'
  if (values.length === 1) return values[0]
  return `${values.length} selected`
}

// --- Component ---
export default function Projects() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [activePanel, setActivePanel] = useState<'filter' | 'sort' | null>(null)
  const [openInFilterId, setOpenInFilterId] = useState<string | null>(null)

  const [filters, setFilters] = useState<FilterRule[]>([])
  const [filterLogic, setFilterLogic] = useState<'and' | 'or'>('and')
  const [sorts, setSorts] = useState<SortRule[]>([
    { id: uid(), key: 'updated_at', dir: 'desc' },
  ])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/projects', { params: q ? { q } : {} })
      setRows(res.data)
    } catch (e) {
      console.error('Search failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const displayed = useMemo(() => {
    const activeFilters = filters.filter(
      (f: FilterRule) => isActiveFilter(f)
    )
    let result = [...rows]
    if (activeFilters.length > 0) {
      result = result.filter((r: ProjectRow) =>
        filterLogic === 'and'
          ? activeFilters.every((rule: FilterRule) => matchesFilter(r, rule))
          : activeFilters.some((rule: FilterRule) => matchesFilter(r, rule))
      )
    }
    if (sorts.length > 0) result.sort((a, b) => compareForSort(a, b, sorts))
    return result
  }, [rows, filters, filterLogic, sorts])

  // --- Filter helpers ---
  function addFilter() {
    setFilters((prev: FilterRule[]) => [...prev, { id: uid(), field: 'domain', condition: 'is', value: '' }])
  }

  function removeFilter(id: string) {
    setFilters((prev: FilterRule[]) => prev.filter((f: FilterRule) => f.id !== id))
    setOpenInFilterId(prev => prev === id ? null : prev)
  }

  function updateFilter(id: string, patch: Partial<FilterRule>) {
    setFilters((prev: FilterRule[]) => prev.map((f: FilterRule) => {
      if (f.id !== id) return f
      const updated = { ...f, ...patch }
      if (patch.field) {
        updated.condition = getDefaultCondition(patch.field)
        updated.value = ''
        updated.values = []
      }
      if (patch.condition) {
        const type = getFieldType(updated.field)
        const cond = CONDITIONS[type].find(c => c.value === patch.condition)
        if (cond && !cond.hasInput) updated.value = ''
        if (type === 'categorical') {
          if (patch.condition === 'in') {
            updated.value = ''
            updated.values = []
          } else {
            updated.values = []
          }
        }
      }
      return updated
    }))
  }

  // --- Sort helpers ---
  function addSort() {
    if (sorts.length >= 2) return
    const usedKeys = sorts.map(s => s.key)
    const available = SORT_FIELDS.find(f => !usedKeys.includes(f.key))
    if (!available) return
    setSorts(prev => [...prev, { id: uid(), key: available.key, dir: 'asc' }])
  }

  function removeSort(id: string) {
    setSorts(prev => prev.filter(s => s.id !== id))
  }

  function updateSort(id: string, patch: Partial<SortRule>) {
    setSorts(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function toggleInFilterValue(id: string, option: string) {
    setFilters((prev: FilterRule[]) => prev.map((f: FilterRule) => {
      if (f.id !== id) return f
      const values = f.values ?? []
      const nextValues = values.includes(option)
        ? values.filter(value => value !== option)
        : [...values, option]
      return { ...f, values: nextValues }
    }))
  }

  const activeFilterCount = filters.filter(
    f => isActiveFilter(f)
  ).length

  const selectCls = "rounded-lg border-0 bg-gray-50 px-3 py-1.5 text-xs font-bold text-[#005372] ring-1 ring-gray-200 focus:ring-2 focus:ring-[#ED6B21] outline-none cursor-pointer"

  return (
    <div className="space-y-4 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-orange-100 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#005372]">Project Registry</h1>
          <p className="text-sm text-gray-500 mt-1">Project-level access model with non-sensitive global listing</p>
        </div>
        <div className="flex items-center gap-3 flex-nowrap">
          <input
            type="text"
            placeholder="Search registry..."
            className="w-48 sm:w-64 rounded-xl border-0 bg-white px-5 py-2.5 text-sm font-medium text-[#005372] ring-1 ring-orange-100 shadow-sm transition-all focus:ring-2 focus:ring-[#ED6B21] outline-none"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
          <Link
            to="/projects/new"
            className="whitespace-nowrap rounded-xl bg-[#ED6B21] px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-xl shadow-orange-900/20 hover:-translate-y-0.5 transition-all active:scale-95"
          >
            + New Project
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filter button */}
        <button
          onClick={() => setActivePanel(p => p === 'filter' ? null : 'filter')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all border ${
            activePanel === 'filter' || activeFilterCount > 0
              ? 'bg-[#005372] text-white border-[#005372] shadow-md'
              : 'bg-white text-[#005372] border-orange-100 hover:border-[#005372]'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4h18M7 8h10M10 12h4" />
          </svg>
          Filter
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#ED6B21] text-white text-[9px] font-black">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort button */}
        <button
          onClick={() => setActivePanel(p => p === 'sort' ? null : 'sort')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all border ${
            activePanel === 'sort' || sorts.length > 0
              ? 'bg-[#005372] text-white border-[#005372] shadow-md'
              : 'bg-white text-[#005372] border-orange-100 hover:border-[#005372]'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 6h18M6 12h12M10 18h4" />
          </svg>
          Sort
          {sorts.length > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#ED6B21] text-white text-[9px] font-black">
              {sorts.length}
            </span>
          )}
        </button>

        {/* Result count */}
        <div className="ml-auto text-[10px] font-black text-gray-400 uppercase tracking-widest">
          {displayed.length} / {rows.length} records
        </div>
      </div>

      {/* Filter Panel */}
      {activePanel === 'filter' && (
        <div className="rounded-2xl bg-white ring-1 ring-orange-100 shadow-sm px-6 py-5 space-y-2.5">
          {/* Header row with AND/OR toggle */}
          <div className="flex items-center gap-3 pb-1">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {filters.length === 0 ? 'No filters — add a condition below' : 'Show records where'}
            </p>
            {filters.length >= 2 && (
              <div className="flex items-center rounded-lg ring-1 ring-gray-200 overflow-hidden text-[10px] font-black uppercase tracking-widest">
                <button
                  onClick={() => setFilterLogic('and')}
                  className={`px-3 py-1.5 transition-colors ${
                    filterLogic === 'and' ? 'bg-[#005372] text-white' : 'bg-white text-gray-400 hover:text-[#005372]'
                  }`}
                >
                  And
                </button>
                <button
                  onClick={() => setFilterLogic('or')}
                  className={`px-3 py-1.5 transition-colors ${
                    filterLogic === 'or' ? 'bg-[#ED6B21] text-white' : 'bg-white text-gray-400 hover:text-[#ED6B21]'
                  }`}
                >
                  Or
                </button>
              </div>
            )}
          </div>

          {filters.map((rule, i) => {
            const fieldMeta = FIELD_META.find(f => f.key === rule.field)!
            const conditions = CONDITIONS[fieldMeta.type]
            const activeCond = conditions.find(c => c.value === rule.condition)
            const categoryOptions = getCategoryOptions(rule.field, rows)
            const isInDropdownOpen = openInFilterId === rule.id

            return (
              <div key={rule.id} className="flex items-center gap-2 flex-wrap relative">
                {/* connector label */}
                {i === 0 ? (
                  <span className="w-8 shrink-0" />
                ) : (
                  <span className={`text-[10px] font-black uppercase tracking-widest w-8 shrink-0 ${
                    filterLogic === 'or' ? 'text-[#ED6B21]' : 'text-gray-400'
                  }`}>
                    {filterLogic === 'or' ? 'or' : 'and'}
                  </span>
                )}

                {/* Field */}
                <select
                  value={rule.field}
                  onChange={e => updateFilter(rule.id, { field: e.target.value as FilterFieldKey })}
                  className={selectCls}
                >
                  {FIELD_META.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>

                {/* Condition */}
                <select
                  value={rule.condition}
                  onChange={e => updateFilter(rule.id, { condition: e.target.value })}
                  className={selectCls}
                >
                  {conditions.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>

                {/* Value */}
                {activeCond?.hasInput && (
                  fieldMeta.type === 'categorical' && categoryOptions.length > 0 && rule.condition === 'in' ? (
                    <div className="relative min-w-[180px]">
                      <button
                        type="button"
                        onClick={() => setOpenInFilterId(prev => prev === rule.id ? null : rule.id)}
                        onBlur={e => {
                          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) {
                            setOpenInFilterId(prev => prev === rule.id ? null : prev)
                          }
                        }}
                        className={`${selectCls} min-w-[180px] w-full flex items-center justify-between gap-2 text-left`}
                      >
                        <span className="truncate">{getInFilterLabel(rule.values)}</span>
                        <svg className={`w-3 h-3 shrink-0 transition-transform ${isInDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isInDropdownOpen && (
                        <div
                          tabIndex={-1}
                          className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-orange-100"
                        >
                          <button
                            type="button"
                            onClick={() => updateFilter(rule.id, { values: [] })}
                            className="mb-1 w-full rounded-lg px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 hover:text-red-500 transition-colors"
                          >
                            Clear
                          </button>
                          {categoryOptions.map(opt => {
                            const checked = (rule.values ?? []).includes(opt)
                            return (
                              <button
                                key={opt}
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => toggleInFilterValue(rule.id, opt)}
                                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${
                                  checked ? 'bg-orange-50 text-[#ED6B21]' : 'text-[#005372] hover:bg-gray-50'
                                }`}
                              >
                                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                                  checked ? 'border-[#ED6B21] bg-[#ED6B21] text-white' : 'border-gray-300 bg-white text-transparent'
                                }`}>
                                  ✓
                                </span>
                                <span className="truncate">{opt}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : fieldMeta.type === 'categorical' && categoryOptions.length > 0 ? (
                    <select
                      value={rule.value}
                      onChange={e => updateFilter(rule.id, { value: e.target.value })}
                      className={`${selectCls} min-w-[120px]`}
                    >
                      <option value="">Select…</option>
                      {categoryOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={fieldMeta.type === 'number' ? 'number' : 'text'}
                      value={rule.value}
                      onChange={e => updateFilter(rule.id, { value: e.target.value })}
                      placeholder={fieldMeta.type === 'number' ? '0' : 'Enter value…'}
                      className="rounded-lg border-0 bg-gray-50 px-3 py-1.5 text-xs font-bold text-[#005372] ring-1 ring-gray-200 focus:ring-2 focus:ring-[#ED6B21] outline-none min-w-[140px]"
                    />
                  )
                )}

                {/* Remove */}
                <button
                  onClick={() => removeFilter(rule.id)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={addFilter}
              className="flex items-center gap-1.5 text-[11px] font-black text-[#ED6B21] uppercase tracking-widest hover:underline"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
              </svg>
              Add condition
            </button>
            {filters.length > 0 && (
              <button
                onClick={() => setFilters([])}
                className="ml-auto text-[11px] font-black text-gray-400 uppercase tracking-widest hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sort Panel */}
      {activePanel === 'sort' && (
        <div className="rounded-2xl bg-white ring-1 ring-orange-100 shadow-sm px-6 py-5 space-y-2.5">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pb-1">
            {sorts.length === 0 ? 'No sorts — add one below' : 'Sort by'}
          </p>

          {sorts.map((rule, i) => {
            const fieldMeta = SORT_FIELDS.find(f => f.key === rule.key)!
            return (
              <div key={rule.id} className="flex items-center gap-3">
                {/* Priority number */}
                <span className="text-[10px] font-black text-gray-300 w-4 shrink-0 text-center">{i + 1}</span>

                {/* Field */}
                <select
                  value={rule.key}
                  onChange={e => updateSort(rule.id, { key: e.target.value as SortKey })}
                  className={selectCls}
                >
                  {SORT_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>

                {/* Direction */}
                <select
                  value={rule.dir}
                  onChange={e => updateSort(rule.id, { dir: e.target.value as SortDir })}
                  className={selectCls}
                >
                  <option value="asc">{fieldMeta.isNumeric ? 'Ascending' : fieldMeta.isDate ? 'Earliest → Latest' : 'A → Z'}</option>
                  <option value="desc">{fieldMeta.isNumeric ? 'Descending' : fieldMeta.isDate ? 'Latest → Earliest' : 'Z → A'}</option>
                </select>

                {/* Remove */}
                <button
                  onClick={() => removeSort(rule.id)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={addSort}
              disabled={sorts.length >= 2}
              className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                sorts.length >= 2
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-[#ED6B21] hover:underline'
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
              </svg>
              Add sort{sorts.length >= 2 ? ' (max 2)' : ''}
            </button>
            {sorts.length > 0 && (
              <button
                onClick={() => setSorts([])}
                className="ml-auto text-[11px] font-black text-gray-400 uppercase tracking-widest hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-[2rem] bg-white shadow-xl shadow-orange-900/5 ring-1 ring-orange-100 overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/50 px-8 py-5">
          <div className="text-[11px] font-black text-[#005372] uppercase tracking-[0.2em]">Registry Records</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-white">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Project</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">People Involved</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Data Access</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Funding</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin" />
                      <p className="font-black text-[10px] text-gray-300 uppercase tracking-widest">Syncing Registry…</p>
                    </div>
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-gray-400 font-medium text-sm">No projects match the current filters.</p>
                      {activeFilterCount > 0 && (
                        <button onClick={() => setFilters([])} className="text-[#ED6B21] text-xs font-black uppercase tracking-widest hover:underline">
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayed.map(project => {
                  const primaryPeople = project.people_involved.slice(0, 3).map(personLabel)
                  const remainingPeople = project.people_involved.length - primaryPeople.length
                  return (
                    <tr
                      key={project.id}
                      onClick={() => project.can_view_details && navigate(`/projects/${project.id}`)}
                      className={`transition-all group ${
                        project.can_view_details ? 'hover:bg-[#FFF9F5]/80 cursor-pointer' : 'bg-gray-50/40'
                      }`}
                    >
                      <td className="px-8 py-5">
                        <div className={`font-bold transition-colors ${
                          project.can_view_details ? 'text-[#005372] group-hover:text-[#ED6B21]' : 'text-gray-600'
                        }`}>
                          {project.title}
                        </div>
                        {project.can_view_details && project.domain && project.ai_type && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 text-[9px] font-black uppercase tracking-wider ring-1 ring-teal-100">
                              {project.domain}
                            </span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                              {project.ai_type}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-wrap gap-2">
                          {primaryPeople.map(person => (
                            <span
                              key={`${project.id}-${person}`}
                              className="inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold text-gray-600 ring-1 ring-gray-200 bg-white"
                            >
                              {person}
                            </span>
                          ))}
                          {remainingPeople > 0 && (
                            <span className="inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold text-[#005372] ring-1 ring-orange-200 bg-orange-50">
                              +{remainingPeople} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {project.can_view_details ? (
                          <div className="space-y-1">
                            <span className="inline-flex rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-teal-50 text-teal-700 ring-1 ring-teal-200">
                              Granted
                            </span>
                            {project.institution && (
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">
                                {project.institution}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 ring-1 ring-gray-200">
                            Title + People only
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        {project.can_view_details && project.funding_amount_sgd != null ? (
                          <span className="text-xs font-bold text-[#005372]">
                            SGD {project.funding_amount_sgd.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                        {new Date(project.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
