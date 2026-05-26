/**
 * Primary authenticated shell layout for navigation, account menu, and page outlet.
 * Also renders the assistant panel beside routed content on larger screens.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import AssistantChat from './AssistantChat'

export default function Layout() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const canSeeDashboard = auth.role === 'admin' || auth.role === 'management'
  const canManageUsers = auth.role === 'admin'
  const canImport = auth.role === 'admin' || auth.role === 'management'

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [])

  const navClass = ({ isActive }: { isActive: boolean }) => 
    `transition-all duration-300 py-2 border-b-2 text-[11px] font-black uppercase tracking-[0.2em] ${
      isActive 
        ? 'text-[#ED6B21] border-[#ED6B21]' 
        : 'text-gray-400 border-transparent hover:text-white hover:translate-y-[-1px]'
    }`

  return (
    <div className="min-h-screen bg-[#FFF9F5]">
      
      <header className="bg-[#005372] shadow-2xl shadow-blue-900/20 sticky top-0 z-50 ring-1 ring-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
          
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="flex gap-1">
                <span className="h-5 w-1 bg-[#ED6B21] rounded-full transition-transform group-hover:scale-y-125"></span>
                <span className="h-5 w-1 bg-white/40 rounded-full"></span>
              </div>
              <span className="text-sm font-black tracking-[0.3em] text-white uppercase">AGM Portal</span>
            </Link>
          </div>

          <nav className="flex items-center gap-10">
            <div className="hidden lg:flex items-center gap-8">
              <NavLink to="/projects" className={navClass}>Projects</NavLink>
              {canSeeDashboard && <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>}
              
              {canManageUsers && (
                <NavLink to="/users" className={navClass}>Users</NavLink>
              )}
              
              {canImport && <NavLink to="/import" className={navClass}>Import</NavLink>}
            </div>
            
            <div className="flex items-center gap-5 ml-6 border-l border-white/10 pl-8">
              <div ref={accountMenuRef} className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen(prev => !prev)}
                  className="text-right transition-opacity hover:opacity-90"
                >
                  <div className="text-[10px] font-black text-white uppercase tracking-widest">
                    {auth.fullName || auth.email || 'Staff User'}
                  </div>
                  <div className="text-[9px] font-bold text-[#ED6B21] uppercase tracking-tighter opacity-80">
                    {auth.role}
                  </div>
                </button>

                {accountMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-3 w-56 rounded-2xl bg-white p-2 shadow-2xl shadow-blue-900/10 ring-1 ring-orange-100">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false)
                        navigate('/change-password')
                      }}
                      className="w-full rounded-xl px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-[#005372] transition-colors hover:bg-[#FFF9F5] hover:text-[#ED6B21]"
                    >
                      Change Password
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setAccountMenuOpen(false)
                        await auth.logout()
                        navigate('/login')
                      }}
                      className="w-full rounded-xl px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-10 lg:grid lg:grid-cols-[1fr_380px] lg:gap-12">
        <section className="min-w-0">
          <Outlet />
        </section>
        
        <aside className="mt-12 lg:mt-0">
          <div className="lg:sticky lg:top-28">
            <AssistantChat />
          </div>
        </aside>
      </main>

      <footer className="mx-auto max-w-7xl px-8 py-16">
        <div className="border-t border-orange-200/30 pt-8 text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-900/40">
            SingHealth • MVP for DSA3101 AI Project Management & Analytics Portal • 2026
          </div>
        </div>
      </footer>
    </div>
  )
}
