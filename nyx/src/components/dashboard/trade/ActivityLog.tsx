'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { Terminal } from 'lucide-react'
import { WARDEN_CLOB_ADDRESS } from '@/lib/clob'

type LogEntry = {
  id: string
  kind: 'placed' | 'filled' | 'settled' | 'staked'
  message: string
  ts: number
}

const KIND_COLOR: Record<LogEntry['kind'], string> = {
  placed:  'var(--db-accent)',
  filled:  'var(--db-success)',
  settled: 'var(--db-success)',
  staked:  'var(--db-warning)',
}

const PLACED_ABI = [{
  type: 'event' as const, name: 'OrderPlaced',
  inputs: [
    { name: 'orderId',  type: 'uint256' as const, indexed: true  },
    { name: 'user',     type: 'address' as const, indexed: true  },
    { name: 'side',     type: 'uint8'   as const, indexed: false },
    { name: 'price',    type: 'uint256' as const, indexed: false },
    { name: 'quantity', type: 'uint256' as const, indexed: false },
  ],
}] as const

const FILLED_ABI = [{
  type: 'event' as const, name: 'OrderFilled',
  inputs: [
    { name: 'orderId',         type: 'uint256' as const, indexed: true  },
    { name: 'filledAmount',    type: 'uint256' as const, indexed: false },
    { name: 'remainingAmount', type: 'uint256' as const, indexed: false },
  ],
}] as const

const STAKED_ABI = [{
  type: 'event' as const, name: 'IdleDOTStaked',
  inputs: [
    { name: 'amount', type: 'uint256' as const, indexed: false },
    { name: 'poolId', type: 'uint256' as const, indexed: false },
  ],
}] as const

export default function ActivityLog() {
  const publicClient = usePublicClient()
  const [logs, setLogs] = useState<LogEntry[]>([])

  const add = (entry: LogEntry) =>
    setLogs((prev) => [entry, ...prev].slice(0, 60))

  useEffect(() => {
    if (!publicClient) return

    const unwatchPlaced = publicClient.watchContractEvent({
      address: WARDEN_CLOB_ADDRESS,
      abi: PLACED_ABI,
      eventName: 'OrderPlaced',
      onLogs: (evts) =>
        evts.forEach((e) => {
          const a = e.args as { orderId: bigint; side: number; price: bigint; quantity: bigint }
          add({
            id: `${e.transactionHash}-placed`,
            kind: 'placed',
            message: `Order #${a.orderId} — ${a.side === 0 ? 'BUY' : 'SELL'} ${(Number(a.quantity) / 1e6).toFixed(4)} DOT @ $${(Number(a.price) / 1e6).toFixed(4)}`,
            ts: Date.now(),
          })
        }),
    })

    const unwatchFilled = publicClient.watchContractEvent({
      address: WARDEN_CLOB_ADDRESS,
      abi: FILLED_ABI,
      eventName: 'OrderFilled',
      onLogs: (evts) =>
        evts.forEach((e) => {
          const a = e.args as { orderId: bigint; filledAmount: bigint; remainingAmount: bigint }
          add({
            id: `${e.transactionHash}-filled`,
            kind: 'filled',
            message: `Order #${a.orderId} filled ${(Number(a.filledAmount) / 1e6).toFixed(4)}, remaining ${(Number(a.remainingAmount) / 1e6).toFixed(4)}`,
            ts: Date.now(),
          })
        }),
    })

    const unwatchStaked = publicClient.watchContractEvent({
      address: WARDEN_CLOB_ADDRESS,
      abi: STAKED_ABI,
      eventName: 'IdleDOTStaked',
      onLogs: (evts) =>
        evts.forEach((e) => {
          const a = e.args as { amount: bigint; poolId: bigint }
          add({
            id: `${e.transactionHash}-staked`,
            kind: 'staked',
            message: `${(Number(a.amount) / 1e6).toFixed(4)} DOT staked → pool #${a.poolId}`,
            ts: Date.now(),
          })
        }),
    })

    return () => {
      unwatchPlaced()
      unwatchFilled()
      unwatchStaked()
    }
  }, [publicClient])

  return (
    <div className="db-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--db-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal style={{ width: 16, height: 16, color: 'var(--db-accent)' }} />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)' }}>Activity</h3>
        </div>
        <span style={{ fontSize: 10, color: 'var(--db-text-muted)', fontFamily: 'var(--font-mono), monospace' }}>
          {logs.length} events
        </span>
      </div>

      {/* Log body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', fontFamily: 'var(--font-mono), monospace', fontSize: 11, maxHeight: 320 }}>
        {logs.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: 'var(--db-text-muted)' }}>
            Watching for events...
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 6px', borderRadius: 4, transition: 'background 0.15s' }}>
              <span style={{ fontSize: 9, color: 'var(--db-text-muted)', flexShrink: 0, paddingTop: 1 }}>
                {new Date(log.ts).toLocaleTimeString()}
              </span>
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                color: KIND_COLOR[log.kind],
                background: `${KIND_COLOR[log.kind]}14`,
              }}>
                {log.kind}
              </span>
              <span style={{ color: 'var(--db-text-secondary)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
