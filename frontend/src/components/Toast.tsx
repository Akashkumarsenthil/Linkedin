import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastCtx { push: (kind: ToastKind, message: string) => void }
const Ctx = createContext<ToastCtx>({ push: () => {} })

export function useToast() { return useContext(Ctx) }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, kind, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800)
  }, [])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </Ctx.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 3200)
    return () => clearTimeout(t)
  }, [])
  const icon = toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i'
  return (
    <div className={`toast toast-${toast.kind}${leaving ? ' toast-leave' : ''}`} role="status">
      <span className="toast-icon">{icon}</span>
      <span className="toast-msg">{toast.message}</span>
      <button type="button" className="toast-close" onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  )
}
