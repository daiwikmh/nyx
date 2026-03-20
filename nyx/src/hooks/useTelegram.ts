'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const BOT_USERNAME = 'nyx_polkabot'

export function useTelegram(wallet: string | undefined) {
  const [linked, setLinked] = useState(false)
  const [checking, setChecking] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setChecking(false)
  }, [])

  const checkStatus = useCallback(async () => {
    if (!wallet) return false
    const res = await fetch(`/api/telegram/status?wallet=${wallet}`)
    const { linked: ok } = await res.json()
    if (ok) {
      setLinked(true)
      stopPolling()
    }
    return ok
  }, [wallet, stopPolling])

  // check on mount
  useEffect(() => {
    if (!wallet) return
    checkStatus()
  }, [wallet, checkStatus])

  const openLink = useCallback(() => {
    if (!wallet) return
    window.open(`https://t.me/${BOT_USERNAME}?start=${wallet}`, '_blank')
    setChecking(true)
    // poll every 3s, stop after 2 min
    intervalRef.current = setInterval(checkStatus, 3000)
    setTimeout(stopPolling, 120_000)
  }, [wallet, checkStatus, stopPolling])

  // cleanup on unmount
  useEffect(() => stopPolling, [stopPolling])

  const notify = useCallback(
    (event: string, data: Record<string, string | number>) => {
      if (!wallet) return
      fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, event, data }),
      }).catch(() => {})
    },
    [wallet],
  )

  return { linked, checking, openLink, notify, BOT_USERNAME }
}
