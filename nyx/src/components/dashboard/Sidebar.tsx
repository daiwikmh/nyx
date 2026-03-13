'use client'

import WalletButton from './WalletButton'

export default function Sidebar({
  mode,
  onModeChange,
}: {
  mode: 'trade' | 'portfolio'
  onModeChange: (mode: 'trade' | 'portfolio') => void
}) {
  return (
    <aside className="db-sidebar">
      {/* Logo */}
      <div className="db-sidebar-header">
        <div className="flex items-center gap-3">
          <div className="db-sidebar-logo">
            <span style={{ color: 'var(--db-accent)', fontSize: 16 }}>⚔</span>
          </div>
          <div>
            <h1 className="db-sidebar-title">Shadow Warden</h1>
            <p className="db-sidebar-subtitle">CLOB · Paseo</p>
          </div>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ padding: '0 12px 12px' }}>
        <div style={{
          display: 'flex',
          background: 'var(--db-bg-base)',
          borderRadius: 10,
          padding: 3,
          gap: 2,
        }}>
          <button
            onClick={() => onModeChange('trade')}
            style={{
              flex: 1,
              padding: '7px 8px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-mono), monospace',
              border: '1px solid',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'all 0.15s',
              background: mode === 'trade' ? 'var(--db-neon-cyan-ghost)' : 'transparent',
              color: mode === 'trade' ? 'var(--db-neon-cyan)' : 'var(--db-text-muted)',
              borderColor: mode === 'trade' ? 'var(--db-neon-cyan-muted)' : 'transparent',
              boxShadow: mode === 'trade' ? '0 0 12px rgba(0,255,224,0.08)' : 'none',
            }}
          >
            Trade
          </button>
          <button
            onClick={() => onModeChange('portfolio')}
            style={{
              flex: 1,
              padding: '7px 8px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-mono), monospace',
              border: '1px solid',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'all 0.15s',
              background: mode === 'portfolio' ? 'var(--db-accent-ghost)' : 'transparent',
              color: mode === 'portfolio' ? 'var(--db-accent)' : 'var(--db-text-muted)',
              borderColor: mode === 'portfolio' ? 'var(--db-accent-muted)' : 'transparent',
            }}
          >
            Portfolio
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Network badge */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--db-border)' }}>
        <p style={{ fontSize: 9, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Network
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--db-success)', animation: 'db-pulse 2s infinite' }} />
          <span style={{ fontSize: 11, color: 'var(--db-text-secondary)', fontFamily: 'var(--font-mono), monospace' }}>
            Paseo Asset Hub
          </span>
        </div>
        <p style={{ fontSize: 9, color: 'var(--db-text-muted)', marginTop: 2 }}>chain 420420421</p>
      </div>

      {/* Wallet */}
      <div style={{ borderTop: '1px solid var(--db-border)' }}>
        <WalletButton />
      </div>

      {/* Volatility guard */}
      <div style={{
        padding: '1rem',
        margin: '0.75rem',
        borderRadius: 12,
        background: 'var(--db-accent-ghost)',
        border: '1px solid rgba(225,196,233,0.08)',
      }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--db-accent-dim)' }}>
          Volatility Guard
        </p>
        <p style={{ fontSize: 10, color: 'var(--db-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          DOT band $7.20–$8.80. ±10% of $8.00 baseline. Orders outside are rejected by the engine.
        </p>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--db-success)', animation: 'db-pulse 2s infinite' }} />
          <span style={{ fontSize: 10, color: 'var(--db-success)' }}>Active</span>
        </div>
      </div>
    </aside>
  )
}
