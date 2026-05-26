/**
 * Chat-sidepanel component for assistant interactions.
 * Maintains local conversation state, sends bounded history to the backend, and handles fallback error UI.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../api'

type ChatRole = 'user' | 'assistant'

type Message = {
  id: string
  role: ChatRole
  content: string
}

const CHAT_MODE = 3

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: makeId(),
      role: 'assistant',
      content: 'Hi, I am your AGM assistant. Ask about portfolio risk, compliance, lifecycle stages, or funding.'
    }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const historyForApi = useMemo(
    () => messages.map((m) => ({ role: m.role, content: m.content })),
    [messages]
  )

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setError(null)

    const userMessage: Message = { id: makeId(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setSending(true)

    try {
      const res = await api.post('/assistant/chat', {
        message: text,
        history: historyForApi.slice(-12),
        mode: CHAT_MODE
      })

      const reply = typeof res.data?.reply === 'string' && res.data.reply.trim()
        ? res.data.reply.trim()
        : 'I could not generate a response. Please try again.'

      setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', content: reply }])
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Assistant request failed')
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          content: 'I cannot reach the assistant service right now. Please try again.'
        }
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <aside className="rounded-[2rem] bg-white shadow-xl shadow-orange-900/5 ring-1 ring-orange-100 overflow-hidden flex flex-col h-[600px] lg:sticky lg:top-6">
      
      <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#ED6B21] animate-pulse"></div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#005372]">Intelligence Assistant</h2>
        </div>
        <p className="mt-0.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Co-pilot for Portfolio Analytics</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-white px-6 py-6 custom-scrollbar">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed shadow-sm transition-all ${
                m.role === 'user'
                  ? 'bg-[#005372] text-white shadow-blue-900/10' 
                  : 'bg-[#FFF9F5] text-gray-700 ring-1 ring-orange-100' 
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-2 ring-1 ring-gray-100">
              <div className="flex gap-1">
                <span className="h-1 w-1 bg-[#ED6B21] rounded-full animate-bounce"></span>
                <span className="h-1 w-1 bg-[#ED6B21] rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="h-1 w-1 bg-[#ED6B21] rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Analyzing Registry...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-gray-50/50 border-t border-gray-100">
        <div className="relative flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-[#ED6B21] transition-all">
          <textarea
            className="h-20 w-full resize-none border-none bg-transparent px-2 py-1 text-sm font-medium text-[#005372] focus:ring-0 outline-none placeholder:text-gray-300"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <div className="flex justify-between items-center px-1">
             <div className="flex-1">
              {error && (
                <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter">Connection Error</span>
              )}
             </div>
            <button
              className="rounded-xl bg-[#ED6B21] px-6 py-2 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-lg shadow-orange-900/20 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-30 disabled:translate-y-0"
              onClick={sendMessage}
              disabled={sending || !input.trim()}
            >
              SEND
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
