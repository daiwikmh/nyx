'use client'

import { useState, useEffect } from 'react'
import { usePublicClient, useReadContract } from 'wagmi'
import { WARDEN_CLOB_ADDRESS, CLOB_ABI } from '@/lib/clob'

type StakeEvent = {
  amount: bigint
  poolId: bigint
  blockNumber: bigint
}

const STAKED_EVENT = {
  type: 'event' as const,
  name: 'IdleDOTStaked',
  inputs: [
    { name: 'amount', type: 'uint256' as const, indexed: false },
    { name: 'poolId', type: 'uint256' as const, indexed: false },
  ],
}

export default function YieldDashboard() {
  const publicClient = usePublicClient()
  const [events, setEvents] = useState<StakeEvent[]>([])
  const [loading, setLoading] = useState(false)

  const { data: poolIdRaw } = useReadContract({
    address: WARDEN_CLOB_ADDRESS,
    abi: CLOB_ABI,
    functionName: 'stakingPoolId',
  })

  useEffect(() => {
    if (!publicClient) return
    setLoading(true)
    publicClient
      .getLogs({
        address: WARDEN_CLOB_ADDRESS,
        event: STAKED_EVENT,
        fromBlock: 0n,
      })
      .then((logs) => {
        setEvents(
          logs.map((l) => ({
            amount: (l.args as { amount: bigint }).amount,
            poolId: (l.args as { poolId: bigint }).poolId,
            blockNumber: l.blockNumber ?? 0n,
          })).reverse()
        )
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [publicClient])

  const totalStaked = events.reduce((sum, e) => sum + e.amount, 0n)
  const poolId = poolIdRaw !== undefined ? String(poolIdRaw as bigint) : '—'

  const stats = [
    {
      label: 'Total PAS Staked',
      value: events.length > 0 ? `${(Number(totalStaked) / 1e8).toFixed(4)}` : '0',
      color: 'var(--db-neon-cyan)',
      glow: 'rgba(0,255,224,0.08)',
    },
    {
      label: 'Stake Events',
      value: String(events.length),
      color: 'var(--db-accent)',
      glow: null,
    },
    {
      label: 'Pool ID',
      value: poolId,
      color: 'var(--db-text-primary)',
      glow: null,
    },
  ]

  return (
    <div className="db-card">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--db-border)',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)' }}>
          Yield — Idle PAS Staking
        </h3>
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono), monospace',
          padding: '2px 8px', borderRadius: 10,
          background: 'rgba(0,255,224,0.06)', color: 'var(--db-neon-cyan)',
          border: '1px solid rgba(0,255,224,0.15)',
        }}>
          ~15% est. APR
        </span>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '1rem 1.25rem' }}>
        {stats.map(({ label, value, color, glow }) => (
          <div
            key={label}
            className="db-stat-card"
            style={{ boxShadow: glow ? `0 0 24px ${glow}` : undefined }}
          >
            <div style={{ fontSize: 10, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {label}
            </div>
            <p style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 14, fontWeight: 700, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{
        padding: '0 1.25rem 0.5rem',
        fontSize: 10, color: 'var(--db-text-muted)', fontFamily: 'var(--font-mono), monospace',
      }}>
        Paseo Nomination Pool — idle PAS auto-staked via precompile
      </div>

      {/* Events table */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          Loading...
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          No staking events yet
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="db-table">
            <thead>
              <tr>
                {['Amount (PAS)', 'Pool', 'Block'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 20).map((e, i) => (
                <tr key={i} className="db-table-row">
                  <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--db-neon-cyan)' }}>
                    {(Number(e.amount) / 1e8).toFixed(4)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>
                    {String(e.poolId)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>
                    {String(e.blockNumber)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
