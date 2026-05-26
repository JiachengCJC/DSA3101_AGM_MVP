/**
 * CSV import page for AMGrant integration uploads.
 * Submits multipart data to the ingest endpoint and surfaces created/updated counts.
 */
import React, { useState } from 'react'
import api from '../api'

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setMsg(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await api.post('/integrations/amgrant/ingest', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setMsg({ 
        type: 'success', 
        text: `Data Ingested Successfully: ${res.data.created} created, ${res.data.updated} updated.` 
      })
      setFile(null)
    } catch (e: any) {
      setMsg({ 
        type: 'error', 
        text: e?.response?.data?.detail || 'Import failed. Please check your CSV format.' 
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-orange-100 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#005372]">AMGrant Integration</h1>
          <p className="text-sm text-gray-500 mt-1">Securely sync project records from the AMGrant system</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 mt-8">
        <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100 space-y-6">
          <div className="text-[11px] font-black text-[#005372]/60 uppercase tracking-[0.2em]">Upload CSV Interface</div>
          
          <div 
            className={`border-2 border-dashed rounded-[1.5rem] p-10 text-center transition-all duration-300 ${
              file 
                ? 'border-orange-400 bg-orange-50/50 shadow-inner' 
                : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50/30'
            }`}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-[#ED6B21] shadow-sm">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            
            <div className="mt-5">
              <label className="cursor-pointer">
                <span className="text-lg font-bold text-[#005372] hover:text-[#ED6B21] transition-colors">
                  {file ? 'Change file selection' : 'Click to upload AMGrant Data'}
                </span>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".csv" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)} 
                />
              </label>
              <p className="text-xs text-gray-400 mt-2 font-medium">Standard AMGrant CSV format required</p>
            </div>

            {file && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-xs font-bold text-orange-700 ring-1 ring-orange-200 animate-in fade-in zoom-in-95">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500"></span>
                Selected: {file.name}
              </div>
            )}
          </div>

          <button
            className="w-full rounded-2xl bg-[#ED6B21] px-4 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-700/20 transition-all hover:bg-[#d45a1b] hover:-translate-y-0.5 disabled:opacity-30 active:scale-[0.98]"
            disabled={!file || loading}
            onClick={handleUpload}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Syncing Records...
              </div>
            ) : 'Sync & Ingest Records'}
          </button>

          {msg && (
            <div className={`rounded-2xl p-4 text-sm font-bold flex items-center gap-3 animate-in slide-in-from-bottom-2 ${
              msg.type === 'success' 
                ? 'bg-green-50 text-green-700 ring-1 ring-green-200' 
                : 'bg-red-50 text-red-700 ring-1 ring-red-200'
            }`}>
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                msg.type === 'success' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
              }`}>
                {msg.type === 'success' ? '✓' : '!'}
              </div>
              {msg.text}
            </div>
          )}

          <div className="border-t border-gray-100 pt-6">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/60 mb-4 text-center">Required Data Schema</div>
            <div className="flex flex-wrap justify-center gap-2">
              {['title', 'institution', 'domain', 'ai_type', 'lifecycle_stage', 'trl_level', 'trc_category', 'funding_amount_sgd', 'grant_year_obtained'].map((col) => (
                <code key={col} className="rounded-lg bg-gray-50 px-3 py-1.5 text-[10px] font-bold text-[#005372] border border-gray-200 shadow-sm">
                  {col}
                </code>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-[1.5rem] bg-[#FFF9F5] p-5 text-xs text-orange-900/80 ring-1 ring-orange-100 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-xl shadow-inner">
            💡
          </div>
          <div>
            <strong className="block text-[#005372] mb-0.5">Integration Guidelines</strong>
            Ensure dates are <span className="font-bold">YYYY-MM-DD</span> and currency values are <span className="font-bold text-orange-600 underline decoration-orange-300 underline-offset-2">numeric-only</span> (e.g., 50000).
          </div>
        </div>
      </div>
    </div>
  )
}
