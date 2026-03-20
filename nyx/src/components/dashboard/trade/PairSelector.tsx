'use client'

import { TRADING_PAIRS, type TradingPair } from '@/lib/clob'

type Props = {
  selectedPair: TradingPair
  onSelect: (pair: TradingPair) => void
}

export default function PairSelector({ selectedPair, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {TRADING_PAIRS.map((pair) => {
        const label = `${pair.base}/${pair.quote}`
        const isSelected = pair.base === selectedPair.base && pair.quote === selectedPair.quote
        return (
          <button
            key={label}
            onClick={() => pair.active && onSelect(pair)}
            disabled={!pair.active}
            title={pair.active ? label : `${label} — coming soon`}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-mono), monospace',
              letterSpacing: '0.04em',
              border: '1px solid',
              cursor: pair.active ? 'pointer' : 'default',
              transition: 'all 0.15s',
              background: isSelected
                ? 'var(--db-neon-cyan-ghost, rgba(0,255,224,0.08))'
                : 'rgba(255,255,255,0.02)',
              color: isSelected
                ? 'var(--db-neon-cyan)'
                : pair.active
                  ? 'var(--db-text-secondary)'
                  : 'var(--db-text-muted)',
              borderColor: isSelected
                ? 'var(--db-neon-cyan-muted, rgba(0,255,224,0.2))'
                : 'var(--db-border)',
              opacity: pair.active ? 1 : 0.45,
            }}
          >
            {label}
            {!pair.active && (
              <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>soon</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
