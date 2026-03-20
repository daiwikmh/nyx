'use client'

import { useState, useEffect } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { Terminal } from 'lucide-react'
import { WARDEN_CLOB_ADDRESS } from '@/lib/clob'
import { useTelegram } from '@/hooks/useTelegram'

type LogEntry = {
  id: string
  kind: 'placed' | 'filled' | 'settled' | 'staked'
  message: string
  ts: number
  blockNumber: bigint
  logIndex: number
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

const SETTLED_ABI = [{
  type: 'event' as const, name: 'OrderSettled',
  inputs: [
    { name: 'orderId',      type: 'uint256' as const, indexed: true  },
    { name: 'user',         type: 'address' as const, indexed: true  },
    { name: 'filledAmount', type: 'uint256' as const, indexed: false },
  ],
}] as const

export default function ActivityLog() {
  const publicClient = usePublicClient()
  const { address } = useAccount()
  const { notify } = useTelegram(address)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  const add = (entry: LogEntry) =>
    setLogs((prev) => {
      if (prev.some((l) => l.id === entry.id)) return prev
      return [entry, ...prev]
        .sort((a, b) => {
          const bd = Number(b.blockNumber - a.blockNumber)
          return bd !== 0 ? bd : b.logIndex - a.logIndex
        })
        .slice(0, 80)
    })

  // fetch past events on mount
  useEffect(() => {
    if (!publicClient) return
    let cancelled = false

    async function fetchHistory() {
      try {
        const [placedLogs, filledLogs, settledLogs, stakedLogs] = await Promise.all([
          publicClient!.getLogs({ address: WARDEN_CLOB_ADDRESS, event: PLACED_ABI[0],  fromBlock: 0n, toBlock: 'latest' }),
          publicClient!.getLogs({ address: WARDEN_CLOB_ADDRESS, event: FILLED_ABI[0],  fromBlock: 0n, toBlock: 'latest' }),
          publicClient!.getLogs({ address: WARDEN_CLOB_ADDRESS, event: SETTLED_ABI[0], fromBlock: 0n, toBlock: 'latest' }),
          publicClient!.getLogs({ address: WARDEN_CLOB_ADDRESS, event: STAKED_ABI[0],  fromBlock: 0n, toBlock: 'latest' }),
        ])
        if (cancelled) return

        const entries: LogEntry[] = []

        for (const e of placedLogs) {
          const a = e.args as { orderId: bigint; user: string; side: number; price: bigint; quantity: bigint }
          entries.push({
            id: `${e.transactionHash}-placed`,
            kind: 'placed',
            message: `Order #${a.orderId} — ${a.side === 0 ? 'BUY' : 'SELL'} ${(Number(a.quantity) / 1e8).toFixed(4)} PAS @ $${(Number(a.price) / 1e6).toFixed(4)}`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
        }
        for (const e of filledLogs) {
          const a = e.args as { orderId: bigint; filledAmount: bigint; remainingAmount: bigint }
          entries.push({
            id: `${e.transactionHash}-filled`,
            kind: 'filled',
            message: `Order #${a.orderId} filled ${(Number(a.filledAmount) / 1e8).toFixed(4)}, remaining ${(Number(a.remainingAmount) / 1e8).toFixed(4)}`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
        }
        for (const e of settledLogs) {
          const a = e.args as { orderId: bigint; user: string; filledAmount: bigint }
          entries.push({
            id: `${e.transactionHash}-settled`,
            kind: 'settled',
            message: `Order #${a.orderId} settled ${(Number(a.filledAmount) / 1e8).toFixed(4)} PAS`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
        }
        for (const e of stakedLogs) {
          const a = e.args as { amount: bigint; poolId: bigint }
          entries.push({
            id: `${e.transactionHash}-staked`,
            kind: 'staked',
            message: `${(Number(a.amount) / 1e8).toFixed(4)} PAS staked → pool #${a.poolId}`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
        }

        entries.sort((a, b) => {
          const bd = Number(b.blockNumber - a.blockNumber)
          return bd !== 0 ? bd : b.logIndex - a.logIndex
        })

        if (!cancelled) setLogs(entries.slice(0, 80))
      } catch (err) {
        console.error('ActivityLog: history fetch failed', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchHistory()
    return () => { cancelled = true }
  }, [publicClient])

  // real-time watchers
  useEffect(() => {
    if (!publicClient) return

    const unwatchPlaced = publicClient.watchContractEvent({
      address: WARDEN_CLOB_ADDRESS,
      abi: PLACED_ABI,
      eventName: 'OrderPlaced',
      onLogs: (evts) =>
        evts.forEach((e) => {
          const a = e.args as { orderId: bigint; user: string; side: number; price: bigint; quantity: bigint }
          add({
            id: `${e.transactionHash}-placed`,
            kind: 'placed',
            message: `Order #${a.orderId} — ${a.side === 0 ? 'BUY' : 'SELL'} ${(Number(a.quantity) / 1e8).toFixed(4)} PAS @ $${(Number(a.price) / 1e6).toFixed(4)}`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
          if (address && a.user.toLowerCase() === address.toLowerCase()) {
            notify('OrderPlaced', {
              orderId: String(a.orderId),
              side: a.side,
              price: String(a.price),
              quantity: String(a.quantity),
            })
          }
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
            message: `Order #${a.orderId} filled ${(Number(a.filledAmount) / 1e8).toFixed(4)}, remaining ${(Number(a.remainingAmount) / 1e8).toFixed(4)}`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
          notify('OrderFilled', {
            orderId: String(a.orderId),
            filledAmount: String(a.filledAmount),
            remainingAmount: String(a.remainingAmount),
          })
        }),
    })

    const unwatchSettled = publicClient.watchContractEvent({
      address: WARDEN_CLOB_ADDRESS,
      abi: SETTLED_ABI,
      eventName: 'OrderSettled',
      onLogs: (evts) =>
        evts.forEach((e) => {
          const a = e.args as { orderId: bigint; user: string; filledAmount: bigint }
          add({
            id: `${e.transactionHash}-settled`,
            kind: 'settled',
            message: `Order #${a.orderId} settled ${(Number(a.filledAmount) / 1e8).toFixed(4)} PAS`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
          if (address && a.user.toLowerCase() === address.toLowerCase()) {
            notify('OrderSettled', { orderId: String(a.orderId) })
          }
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
            message: `${(Number(a.amount) / 1e8).toFixed(4)} PAS staked → pool #${a.poolId}`,
            ts: Date.now(),
            blockNumber: e.blockNumber ?? 0n,
            logIndex: e.logIndex ?? 0,
          })
          notify('IdleDOTStaked', {
            amount: String(a.amount),
            poolId: String(a.poolId),
          })
        }),
    })

    return () => {
      unwatchPlaced()
      unwatchFilled()
      unwatchSettled()
      unwatchStaked()
    }
  }, [publicClient, address, notify])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--db-text-muted)', fontFamily: 'var(--font-mono), monospace' }}>
            {loading ? 'loading...' : `${logs.length} events`}
          </span>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--db-text-muted)', fontSize: 14, padding: '2px 6px',
              lineHeight: 1,
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '+' : '\u2013'}
          </button>
        </div>
      </div>

      {/* Log body */}
      {!collapsed && <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', fontFamily: 'var(--font-mono), monospace', fontSize: 11, maxHeight: 320 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: 'var(--db-text-muted)' }}>
            Fetching history...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, color: 'var(--db-text-muted)' }}>
            No events found
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 6px', borderRadius: 4, transition: 'background 0.15s' }}>
              <span style={{ fontSize: 9, color: 'var(--db-text-muted)', flexShrink: 0, paddingTop: 1 }}>
                blk {String(log.blockNumber)}
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
      </div>}
    </div>
  )
}
