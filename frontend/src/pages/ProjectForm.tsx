/**
 * Create/edit form for project records.
 * Loads standardized option catalogs, supports inline option creation, and submits normalized payloads.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api'

type ProjectPayload = {
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
}

type StandardizedField =
  | 'institution'
  | 'domain'
  | 'ai_type'
  | 'lifecycle_stage'
  | 'trl_level'
  | 'trc_category'

type ProjectFieldOptions = Record<StandardizedField, string[]>

const NEW_OPTION_SENTINEL = '__add_new_option__'

const STANDARDIZED_OPTION_ENDPOINTS: Record<StandardizedField, string> = {
  institution: '/projects/options/institutions',
  domain: '/projects/options/domains',
  ai_type: '/projects/options/ai-types',
  lifecycle_stage: '/projects/options/lifecycle-stages',
  trl_level: '/projects/options/trl-levels',
  trc_category: '/projects/options/trc-categories',
}

const DEFAULT_PROJECT_FIELD_OPTIONS: ProjectFieldOptions = {
  institution: [
    'Changi General Hospital (CGH)', 
    'KK Women’s and Children’s Hospital (KKH)', 
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
  ],
  domain: [
    'Cardiology',
    'Clinical Decision Support',
    'Oncology',
    'Operations',
    'Pathology',
    'Population Health',
    'Radiology',
  ],
  ai_type: [
    'Computer Vision',
    'Generative AI',
    'Natural Language Processing',
    'Optimization',
    'Predictive Analytics',
    'Recommender System',
  ],
  lifecycle_stage: [
    'Research & ideation',
    'Design & validation',
    'IP Generation & Productization',
    'Market entry & Growth',
  ],
  trl_level: [
    'TRL 1 - basic concept',
    'TRL 2 - concept formulation',
    'TRL 3 - proof of concept',
    'TRL 4 - lab validation',
    'TRL 5 - prototype validation',
    'TRL 6 - pilot testing',
    'TRL 7 - system prototype',
    'TRL 8 - complete system',
    'TRL 9 - deployed system',
  ],
  trc_category: ['Research', 'Development', 'Validation', 'Commercialisation', 'Licensing', 'Spin-off'],
}

const defaultPayload: ProjectPayload = {
  title: '',
  institution: '',
  domain: '',
  ai_type: '',
  lifecycle_stage: DEFAULT_PROJECT_FIELD_OPTIONS.lifecycle_stage[0],
  trl_level: DEFAULT_PROJECT_FIELD_OPTIONS.trl_level[0],
  trc_category: DEFAULT_PROJECT_FIELD_OPTIONS.trc_category[0],
  funding_amount_sgd: null,
  funds_received: '',
  funding_scope: '',
  grant_year_obtained: null,
  grant_start_date: '',
  grant_end_date: '',
  collaboration_formal_signed: '',
  collaboration_formal_partner: '',
  collaboration_formal_scope: '',
  collaboration_informal_partner: '',
  collaboration_informal_scope: '',
  patent_count: null,
  publication: '',
  possible_synergy: '',
  ai_office_involvement: '',
  description: '',
}

const defaultNewOptionDrafts: Record<StandardizedField, string> = {
  institution: '',
  domain: '',
  ai_type: '',
  lifecycle_stage: '',
  trl_level: '',
  trc_category: '',
}

const defaultShowNewOptionInput: Record<StandardizedField, boolean> = {
  institution: false,
  domain: false,
  ai_type: false,
  lifecycle_stage: false,
  trl_level: false,
  trc_category: false,
}

function nullIfEmpty(value?: string | null) {
  const cleaned = (value || '').trim()
  return cleaned ? cleaned : null
}

function mergeUniqueOptions(...optionSets: string[][]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []

  optionSets.forEach((optionSet) => {
    optionSet.forEach((option) => {
      const cleaned = option.trim()
      if (!cleaned) return
      const key = cleaned.toLocaleLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      merged.push(cleaned)
    })
  })

  return merged
}

export default function ProjectForm() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()

  const [payload, setPayload] = useState<ProjectPayload>(defaultPayload)
  const [fieldOptions, setFieldOptions] = useState<ProjectFieldOptions>(DEFAULT_PROJECT_FIELD_OPTIONS)
  const [newOptionDrafts, setNewOptionDrafts] = useState<Record<StandardizedField, string>>(defaultNewOptionDrafts)
  const [showNewOptionInput, setShowNewOptionInput] =
    useState<Record<StandardizedField, boolean>>(defaultShowNewOptionInput)
  const [addingOptionField, setAddingOptionField] = useState<StandardizedField | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)

  const canSave = useMemo(
    () =>
      Boolean(
        payload.title.trim() &&
          payload.institution.trim() &&
          payload.domain.trim() &&
          payload.ai_type.trim()
      ),
    [payload.title, payload.institution, payload.domain, payload.ai_type]
  )

  const updateStandardizedField = (field: StandardizedField, value: string) => {
    setPayload((current) => ({ ...current, [field]: value }))
  }

  const addNewOption = async (field: StandardizedField) => {
    let candidate = newOptionDrafts[field].trim()
    if (!candidate || addingOptionField === field) return

    setAddingOptionField(field)
    setError(null)
    try {
      const res = await api.post(STANDARDIZED_OPTION_ENDPOINTS[field], { name: candidate })
      const persistedName = (res?.data?.name || '').trim()
      if (persistedName) candidate = persistedName

      setFieldOptions((current) => ({
        ...current,
        [field]: mergeUniqueOptions(current[field], [candidate]),
      }))
      updateStandardizedField(field, candidate)
      setNewOptionDrafts((current) => ({ ...current, [field]: '' }))
      setShowNewOptionInput((current) => ({ ...current, [field]: false }))
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to add new option.')
    } finally {
      setAddingOptionField((current) => (current === field ? null : current))
    }
  }

  const onSelectStandardizedField = (field: StandardizedField, selectedValue: string) => {
    if (selectedValue === NEW_OPTION_SENTINEL) {
      setShowNewOptionInput((current) => ({ ...current, [field]: true }))
      return
    }

    updateStandardizedField(field, selectedValue)
    setShowNewOptionInput((current) => ({ ...current, [field]: false }))
  }

  useEffect(() => {
    let cancelled = false

    const loadOptions = async () => {
      try {
        const res = await api.get('/projects/options')
        if (cancelled) return

        const data = res.data || {}
        setFieldOptions({
          institution: mergeUniqueOptions(
            DEFAULT_PROJECT_FIELD_OPTIONS.institution,
            Array.isArray(data.institution) ? data.institution : []
          ),
          domain: mergeUniqueOptions(
            DEFAULT_PROJECT_FIELD_OPTIONS.domain,
            Array.isArray(data.domain) ? data.domain : []
          ),
          ai_type: mergeUniqueOptions(
            DEFAULT_PROJECT_FIELD_OPTIONS.ai_type,
            Array.isArray(data.ai_type) ? data.ai_type : []
          ),
          lifecycle_stage: mergeUniqueOptions(
            DEFAULT_PROJECT_FIELD_OPTIONS.lifecycle_stage,
            Array.isArray(data.lifecycle_stage) ? data.lifecycle_stage : []
          ),
          trl_level: mergeUniqueOptions(
            DEFAULT_PROJECT_FIELD_OPTIONS.trl_level,
            Array.isArray(data.trl_level) ? data.trl_level : []
          ),
          trc_category: mergeUniqueOptions(
            DEFAULT_PROJECT_FIELD_OPTIONS.trc_category,
            Array.isArray(data.trc_category) ? data.trc_category : []
          ),
        })
      } catch {
        setFieldOptions(DEFAULT_PROJECT_FIELD_OPTIONS)
      }
    }

    loadOptions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!editing) return

    api
      .get(`/projects/${id}`)
      .then((res) => {
        const data = res.data || {}
        const nextPayload = {
          ...defaultPayload,
          ...data,
          grant_start_date: data.grant_start_date || '',
          grant_end_date: data.grant_end_date || '',
        }
        setPayload(nextPayload)
        setFieldOptions((current) => ({
          institution: mergeUniqueOptions(current.institution, [nextPayload.institution || '']),
          domain: mergeUniqueOptions(current.domain, [nextPayload.domain || '']),
          ai_type: mergeUniqueOptions(current.ai_type, [nextPayload.ai_type || '']),
          lifecycle_stage: mergeUniqueOptions(current.lifecycle_stage, [nextPayload.lifecycle_stage || '']),
          trl_level: mergeUniqueOptions(current.trl_level, [nextPayload.trl_level || '']),
          trc_category: mergeUniqueOptions(current.trc_category, [nextPayload.trc_category || '']),
        }))
      })
      .catch((e: any) => {
        setError(e?.response?.data?.detail || 'Failed to load project details.')
      })
  }, [id, editing])

  useEffect(() => {
    if (payload.grant_start_date && payload.grant_end_date) {
      if (payload.grant_end_date < payload.grant_start_date) {
        setDateError('Grant end date must be after start date')
      } else {
        setDateError(null)
      }
    }
  }, [payload.grant_start_date, payload.grant_end_date])

  const handleSave = async () => {

    if (!canSave) {
      setError('Please fill in Project Title, Institution, Medical Domain, and AI Methodology.')
      return
    }

    if (dateError) {
      setError(dateError)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const updateData = {
        title: payload.title.trim(),
        institution: payload.institution.trim(),
        domain: payload.domain.trim(),
        ai_type: payload.ai_type.trim(),
        lifecycle_stage: payload.lifecycle_stage.trim(),
        trl_level: payload.trl_level.trim(),
        trc_category: payload.trc_category.trim(),
        funding_amount_sgd: payload.funding_amount_sgd,
        funds_received: nullIfEmpty(payload.funds_received),
        funding_scope: nullIfEmpty(payload.funding_scope),
        grant_year_obtained: payload.grant_year_obtained,
        grant_start_date: payload.grant_start_date || null,
        grant_end_date: payload.grant_end_date || null,
        collaboration_formal_signed: nullIfEmpty(payload.collaboration_formal_signed),
        collaboration_formal_partner: nullIfEmpty(payload.collaboration_formal_partner),
        collaboration_formal_scope: nullIfEmpty(payload.collaboration_formal_scope),
        collaboration_informal_partner: nullIfEmpty(payload.collaboration_informal_partner),
        collaboration_informal_scope: nullIfEmpty(payload.collaboration_informal_scope),
        patent_count: payload.patent_count,
        publication: nullIfEmpty(payload.publication),
        possible_synergy: nullIfEmpty(payload.possible_synergy),
        ai_office_involvement: nullIfEmpty(payload.ai_office_involvement),
        description: nullIfEmpty(payload.description),
      }

      if (editing) {
        await api.patch(`/projects/${id}`, updateData)
      } else {
        await api.post('/projects', updateData)
      }
      navigate('/projects')

    } catch (e: any) {
      console.error("Error Detail:", e.response?.data);
      setError(e?.response?.data?.detail || 'Failed to sync with registry.');
    } finally {
      setIsSaving(false);
    }
  }

  const inputClasses =
    'w-full rounded-2xl border-0 bg-gray-50 px-5 py-4 text-sm font-medium text-[#005372] ring-1 ring-gray-200 focus:bg-white focus:ring-2 focus:ring-[#ED6B21] outline-none transition-all'

  const renderStandardizedSelect = (
    field: StandardizedField,
    label: string,
    placeholder: string,
    containerClassName = 'space-y-2'
  ) => {
    const options = mergeUniqueOptions(fieldOptions[field], [payload[field]])

    return (
      <div className={containerClassName}>
      <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
        {label}{' '}
        {(field === 'institution' || field === 'domain' || field === 'ai_type') && (
          <span className="text-red-600 font-bold">*</span>
        )}
      </label>
        <select
          className={inputClasses}
          value={payload[field] || ''}
          onChange={(e) => onSelectStandardizedField(field, e.target.value)}
        >
          {!payload[field] && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={NEW_OPTION_SENTINEL}>+ Add new option...</option>
        </select>

        {showNewOptionInput[field] && (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClasses}
              placeholder={`Enter new ${label.toLowerCase()}`}
              value={newOptionDrafts[field]}
              onChange={(e) =>
                setNewOptionDrafts((current) => ({
                  ...current,
                  [field]: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addNewOption(field)
                }
              }}
            />
            <button
              type="button"
              onClick={() => void addNewOption(field)}
              disabled={!newOptionDrafts[field].trim() || addingOptionField === field}
              className="shrink-0 rounded-xl bg-[#ED6B21] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/10 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-40 disabled:translate-y-0"
            >
              {addingOptionField === field ? 'Adding...' : 'Add'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-orange-100 pb-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-[10px] font-black text-[#ED6B21] uppercase tracking-[0.2em] mb-1 hover:opacity-70 transition-all flex items-center gap-1"
          >
            ← Back to Portfolio
          </button>
          <h1 className="text-3xl font-bold text-[#005372]">
            {editing ? 'Edit Project' : 'Initialize New Project'}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {editing
              ? `Modifying registry data for: ${payload.title || '...'}`
              : 'Register a new AI initiative into the SingHealth registry'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            <span className="text-red-500">*</span> Required Fields
          </p>
        </div>
      </div>

      <div className="grid gap-8 rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-orange-900/5 ring-1 ring-orange-100 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Project Title <span className="text-red-500">*</span>
          </label>
          <input
            className={inputClasses}
            placeholder="e.g., AI-Driven Oncology Screening"
            value={payload.title}
            onChange={(e) => setPayload({ ...payload, title: e.target.value })}
          />
        </div>

        {renderStandardizedSelect('institution', 'Institution', 'Select institution')}
        {renderStandardizedSelect('domain', 'Medical Domain', 'Select category')}
        {renderStandardizedSelect('ai_type', 'AI Methodology', 'Select AI methodology')}

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Funding Amount (SGD)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 font-mono">
              $
            </span>
            <input
              type="number"
              className={`${inputClasses} pl-8 font-mono`}
              placeholder="0.00"
              value={payload.funding_amount_sgd || ''}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  funding_amount_sgd: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
        </div>

        {renderStandardizedSelect(
          'lifecycle_stage',
          'Lifecycle Stage',
          'Select lifecycle stage',
          'space-y-2 md:col-span-2 pt-2'
        )}
        {renderStandardizedSelect('trl_level', 'Technology Readiness Level (TRL)', 'Select TRL')}
        {renderStandardizedSelect('trc_category', 'Technology Readiness Category (TRC)', 'Select TRC')}

        <div className="space-y-2 md:col-span-2 pt-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Fund(s) Received
          </label>
          <textarea
            className={`${inputClasses} min-h-[100px] leading-relaxed`}
            placeholder="e.g., Institutional grants, SCOUT grant, NHIC i2d grant"
            value={payload.funds_received || ''}
            onChange={(e) => setPayload({ ...payload, funds_received: e.target.value })}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Funding Scope
          </label>
          <textarea
            className={`${inputClasses} min-h-[100px] leading-relaxed`}
            placeholder="e.g., Proof of concept via 3 prototypes"
            value={payload.funding_scope || ''}
            onChange={(e) => setPayload({ ...payload, funding_scope: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Year Obtained
          </label>
          <input
            type="number"
            className={inputClasses}
            placeholder="e.g., 2026"
            value={payload.grant_year_obtained ?? ''}
            onChange={(e) =>
              setPayload({
                ...payload,
                grant_year_obtained: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Grant Start Date
          </label>
          <input
            type="date"
            className={inputClasses}
            value={payload.grant_start_date || ''}
            onChange={(e) => setPayload({ ...payload, grant_start_date: e.target.value || null })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Grant End Date
          </label>
          <input
            type="date"
            className={inputClasses}
            value={payload.grant_end_date || ''}
            onChange={(e) => setPayload({ ...payload, grant_end_date: e.target.value || null })}
          />
        </div>

        <div className="space-y-2 md:col-span-2 pt-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
            Executive Summary
          </label>
          <textarea
            className={`${inputClasses} min-h-[160px] leading-relaxed`}
            placeholder="Outline the clinical significance and technical approach..."
            value={payload.description || ''}
            onChange={(e) => setPayload({ ...payload, description: e.target.value })}
          />
        </div>

        <div className="md:col-span-2 border-t border-orange-100 pt-6">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#005372] mb-4">
            Collaboration (Optional)
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Formal: RCA(s) / PA(s) Signed
              </label>
              <input
                className={inputClasses}
                placeholder="e.g., Signed / In review"
                value={payload.collaboration_formal_signed || ''}
                onChange={(e) => setPayload({ ...payload, collaboration_formal_signed: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Formal: Institution / Company
              </label>
              <input
                className={inputClasses}
                placeholder="Partner organization"
                value={payload.collaboration_formal_partner || ''}
                onChange={(e) => setPayload({ ...payload, collaboration_formal_partner: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Formal: Scope of Collaboration
              </label>
              <textarea
                className={`${inputClasses} min-h-[90px] leading-relaxed`}
                placeholder="Scope and deliverables"
                value={payload.collaboration_formal_scope || ''}
                onChange={(e) => setPayload({ ...payload, collaboration_formal_scope: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Informal Discussions: Institution / Company
              </label>
              <input
                className={inputClasses}
                placeholder="Potential partner"
                value={payload.collaboration_informal_partner || ''}
                onChange={(e) => setPayload({ ...payload, collaboration_informal_partner: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Number of Patents
              </label>
              <input
                type="number"
                className={inputClasses}
                placeholder="0"
                value={payload.patent_count ?? ''}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    patent_count: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Informal Discussions: Potential Scope
              </label>
              <textarea
                className={`${inputClasses} min-h-[90px] leading-relaxed`}
                placeholder="Potential scope of collaboration"
                value={payload.collaboration_informal_scope || ''}
                onChange={(e) => setPayload({ ...payload, collaboration_informal_scope: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Publication
              </label>
              <textarea
                className={`${inputClasses} min-h-[90px] leading-relaxed`}
                placeholder="Key publications"
                value={payload.publication || ''}
                onChange={(e) => setPayload({ ...payload, publication: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                Possible Synergy
              </label>
              <textarea
                className={`${inputClasses} min-h-[90px] leading-relaxed`}
                placeholder="Potential synergies"
                value={payload.possible_synergy || ''}
                onChange={(e) => setPayload({ ...payload, possible_synergy: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#005372]/50 ml-1">
                AI Office Involvement
              </label>
              <textarea
                className={`${inputClasses} min-h-[90px] leading-relaxed`}
                placeholder="Current or planned involvement"
                value={payload.ai_office_involvement || ''}
                onChange={(e) => setPayload({ ...payload, ai_office_involvement: e.target.value })}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="md:col-span-2 rounded-xl bg-red-50 p-4 text-[10px] font-black text-red-600 uppercase tracking-widest ring-1 ring-red-100">
            ⚠️ {error}
          </div>
        )}

        <div className="md:col-span-2 flex gap-4 pt-6 border-t border-orange-50">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => navigate('/projects')}
            className="flex-1 rounded-2xl border-2 border-gray-100 py-4 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={isSaving || !canSave}
            onClick={handleSave}
            className="flex-[2] rounded-2xl bg-[#005372] py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/10 hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-30 disabled:translate-y-0"
          >
            {isSaving ? 'Synchronizing...' : editing ? 'Update Project' : 'Submit to Portfolio'}
          </button>
        </div>
      </div>
    </div>
  )
}
