'use client'

import { useReadContracts } from 'wagmi'
import { WARDEN_CLOB_ADDRESS, CLOB_ABI } from '@/lib/clob'

export default function StatsCards() {
  const { data } = useReadContracts({
    contracts: [
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'bestBid' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'bestAsk' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'nextOrderId' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'totalDOTLocked' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'totalUSDCLocked' },
    ],
  })

  const bestBid         = data?.[0]?.result as bigint | undefined
  const bestAsk         = data?.[1]?.result as bigint | undefined
  const nextOrderId     = data?.[2]?.result as bigint | undefined
  const totalDOTLocked  = data?.[3]?.result as bigint | undefined
  const totalUSDCLocked = data?.[4]?.result as bigint | undefined

  const spread =
    bestBid !== undefined && bestAsk !== undefined && bestAsk > 0n && bestBid > 0n
      ? Number(bestAsk - bestBid) / 1e6
      : null

  const cards = [
    {
      label: 'Best Bid',
      value: bestBid !== undefined ? `$${(Number(bestBid) / 1e6).toFixed(4)}` : '—',
      color: 'var(--db-success)',
      glow: 'rgba(34,197,94,0.1)',
    },
    {
      label: 'Best Ask',
      value: bestAsk !== undefined ? `$${(Number(bestAsk) / 1e6).toFixed(4)}` : '—',
      color: 'var(--db-danger)',
      glow: 'rgba(239,68,68,0.1)',
    },
    {
      label: 'Spread',
      value: spread !== null ? `$${spread.toFixed(4)}` : '—',
      color: 'var(--db-text-primary)',
      glow: null,
    },
    {
      label: 'Total Orders',
      value: nextOrderId !== undefined ? String(nextOrderId) : '—',
      color: 'var(--db-neon-cyan)',
      glow: 'rgba(0,255,224,0.08)',
    },
    {
      label: 'DOT Locked',
      value: totalDOTLocked !== undefined ? `${(Number(totalDOTLocked) / 1e6).toFixed(4)}` : '—',
      color: 'var(--db-accent)',
      glow: null,
    },
    {
      label: 'USDC Locked',
      value: totalUSDCLocked !== undefined ? `$${(Number(totalUSDCLocked) / 1e6).toFixed(4)}` : '—',
      color: 'var(--db-accent)',
      glow: null,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
      {cards.map(({ label, value, color, glow }) => (
        <div
          key={label}
          className="db-stat-card"
          style={{ boxShadow: glow ? `0 0 24px ${glow}` : undefined }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {label}
            </span>
          </div>
          <p style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 14, fontWeight: 700, color }}>{value}</p>
        </div>
      ))}
    </div>
  )
}
