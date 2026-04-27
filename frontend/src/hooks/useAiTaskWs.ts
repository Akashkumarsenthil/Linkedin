/**
 * useAiTaskWs — WebSocket hook for live AI task progress.
 *
 * Connects to /ai/ws/{taskId} (proxied through Vite dev server).
 * Falls back to REST GET polling immediately if WebSocket is unavailable.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiGet } from '../api'

export interface WsStepEntry {
  step: string
  status: string
  timestamp: string
}

export interface WsTaskState {
  task_id?: string
  job_id?: number
  status: string
  current_step: string
  progress: number
  steps: WsStepEntry[]
  step_data?: Record<string, unknown>
  result?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

interface UseAiTaskWsResult {
  taskState: WsTaskState | null
  wsStatus: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
}

const PING_INTERVAL_MS = 25_000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2_000
const POLL_INTERVAL_MS = 3_000

const TERMINAL_STATUSES = new Set([
  'approved', 'rejected', 'failed', 'completed', 'interrupted', 'awaiting_approval'
])

async function fetchTaskRest(taskId: string): Promise<WsTaskState | null> {
  try {
    const r = await apiGet<{ success: boolean; data: WsTaskState }>(`/ai/task-status/${taskId}`)
    if (r.success && r.data) return r.data
  } catch {
    // ignore
  }
  return null
}

export function useAiTaskWs(taskId: string | null): UseAiTaskWsResult {
  const [taskState, setTaskState] = useState<WsTaskState | null>(null)
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')

  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeTaskIdRef = useRef<string | null>(null)

  const clearTimers = useCallback(() => {
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPolling = useCallback((tid: string) => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      if (activeTaskIdRef.current !== tid) { clearInterval(pollRef.current!); pollRef.current = null; return }
      const state = await fetchTaskRest(tid)
      if (state) {
        setTaskState(state)
        if (TERMINAL_STATUSES.has(state.status)) {
          clearInterval(pollRef.current!); pollRef.current = null
        }
      }
    }, POLL_INTERVAL_MS)
  }, [])

  const connect = useCallback((tid: string) => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
    clearTimers()

    // Immediately fetch via REST — shows results for already-completed tasks instantly
    fetchTaskRest(tid).then((state) => {
      if (state && activeTaskIdRef.current === tid) {
        setTaskState(state)
        setWsStatus('open') // treat as "connected" so UI doesn't show "Connecting..."
        // If task is still running, start polling for updates
        if (!TERMINAL_STATUSES.has(state.status)) {
          startPolling(tid)
        }
      }
    })

    // Also try WebSocket for real-time updates
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${proto}//${window.location.host}/ai/ws/${tid}`
      setWsStatus('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('open')
        retryCountRef.current = 0
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (evt) => {
        if (evt.data === 'pong') return
        try {
          const msg = JSON.parse(evt.data) as Partial<WsTaskState>
          setTaskState((prev) => {
            if (!prev) return msg as WsTaskState
            const mergedSteps = msg.steps ?? prev.steps ?? []
            return { ...prev, ...msg, steps: mergedSteps }
          })
        } catch { /* ignore non-JSON */ }
      }

      ws.onerror = () => { setWsStatus('error') }

      ws.onclose = () => {
        clearTimers()
        if (activeTaskIdRef.current !== tid) return
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1
          setWsStatus('connecting')
          retryTimerRef.current = setTimeout(() => connect(tid), RETRY_DELAY_MS)
        } else {
          setWsStatus('closed')
          startPolling(tid)
        }
      }
    } catch {
      // WebSocket not available — REST polling already started above
      startPolling(tid)
    }
  }, [clearTimers, startPolling])

  useEffect(() => {
    if (!taskId) {
      activeTaskIdRef.current = null
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
      clearTimers()
      setTaskState(null)
      setWsStatus('idle')
      return
    }

    activeTaskIdRef.current = taskId
    retryCountRef.current = 0
    connect(taskId)

    return () => {
      activeTaskIdRef.current = null
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
      clearTimers()
    }
  }, [taskId, connect, clearTimers])

  return { taskState, wsStatus }
}
