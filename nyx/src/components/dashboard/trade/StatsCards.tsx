'use client'

import { useLastPrice } from '@/hooks/useLastPrice'
import { useOrderBook } from '@/hooks/useOrderBook'

export default function StatsCards() {
  const { bestBid, bestAsk, totalDOTLocked, totalUSDCLocked } = useOrderBook()
  const { lastPrice, direction } = useLastPrice()

  const spread =
    bestBid > 0n && bestAsk > 0n
      ? Number(bestAsk - bestBid) / 1e6
      : null

  const lastPriceColor = direction === 'up' ? 'var(--db-success)'
    : direction === 'down' ? 'var(--db-danger)' : 'var(--db-neon-cyan)'

  const cards = [
    {
      label: 'Last Price',
      value: lastPrice ? `$${(Number(lastPrice) / 1e6).toFixed(4)}` : '—',
      color: lastPriceColor,
      glow: 'rgba(0,255,224,0.08)',
    },
    {
      label: 'Best Bid',
      value: bestBid > 0n ? `$${(Number(bestBid) / 1e6).toFixed(4)}` : '—',
      color: 'var(--db-success)',
      glow: 'rgba(34,197,94,0.1)',
    },
    {
      label: 'Best Ask',
      value: bestAsk > 0n ? `$${(Number(bestAsk) / 1e6).toFixed(4)}` : '—',
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
      label: 'PAS Locked',
      value: totalDOTLocked !== undefined ? `${(Number(totalDOTLocked) / 1e8).toFixed(4)}` : '—',
      color: 'var(--db-accent)',
      glow: null,
    },
    {
      label: 'USDC Locked',
      value: totalUSDCLocked !== undefined ? `$${(Number(totalUSDCLocked) / 1e6).toFixed(2)}` : '—',
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
