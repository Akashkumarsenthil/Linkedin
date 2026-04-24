/**
 * useAiTaskWs — WebSocket hook for live AI task progress.
 *
 * Connects to /ai/ws/{taskId} (proxied through Vite dev server).
 * Sends a "ping" every 25 s to keep the connection alive.
 * Reconnects automatically on unexpected close (up to 5 attempts).
 */

import { useEffect, useRef, useState, useCallback } from 'react'

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
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 2_000

export function useAiTaskWs(taskId: string | null): UseAiTaskWsResult {
  const [taskState, setTaskState] = useState<WsTaskState | null>(null)
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')

  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTaskIdRef = useRef<string | null>(null)

  const clearTimers = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current)
      pingRef.current = null
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  const connect = useCallback((tid: string) => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    clearTimers()

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ai/ws/${tid}`

    setWsStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setWsStatus('open')
      retryCountRef.current = 0
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping')
        }
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (evt) => {
      if (evt.data === 'pong') return
      try {
        const msg = JSON.parse(evt.data) as Partial<WsTaskState>
        setTaskState((prev) => {
          if (!prev) return msg as WsTaskState
          // Merge steps (backend may send a full snapshot or a delta)
          const mergedSteps = msg.steps ?? prev.steps ?? []
          return { ...prev, ...msg, steps: mergedSteps }
        })
      } catch {
        // ignore non-JSON frames
      }
    }

    ws.onerror = () => {
      setWsStatus('error')
    }

    ws.onclose = () => {
      clearTimers()
      // Only retry if this close was for the currently active task
      if (activeTaskIdRef.current !== tid) return
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1
        setWsStatus('connecting')
        retryTimerRef.current = setTimeout(() => connect(tid), RETRY_DELAY_MS)
      } else {
        setWsStatus('closed')
      }
    }
  }, [clearTimers])

  useEffect(() => {
    if (!taskId) {
      // Disconnect when taskId is cleared
      activeTaskIdRef.current = null
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
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
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      clearTimers()
    }
  }, [taskId, connect, clearTimers])

  return { taskState, wsStatus }
}
