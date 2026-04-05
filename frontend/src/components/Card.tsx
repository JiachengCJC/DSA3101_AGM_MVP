import React from 'react'

export function Card({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="group rounded-[2rem] bg-white p-7 shadow-xl shadow-orange-900/5 ring-1 ring-orange-100 transition-all hover:-translate-y-1 hover:shadow-orange-900/10 hover:ring-orange-200">
      
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#005372]/50">
        {title}
      </div>
      
      <div className="mt-3 text-3xl font-black text-[#005372] tracking-tight group-hover:text-[#ED6B21] transition-colors">
        {value}
      </div>
      
      {subtitle ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ED6B21] animate-pulse"></span>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {subtitle}
          </span>
        </div>
      ) : (
        <div className="mt-4 h-[15px]" />
      )}
    </div>
  )
}