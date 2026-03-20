'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import WalletButton from './WalletButton'
import { useTelegram } from '@/hooks/useTelegram'

export default function Sidebar({
  mode,
  onModeChange,
}: {
  mode: 'trade' | 'portfolio'
  onModeChange: (mode: 'trade' | 'portfolio') => void
}) {
  const { address } = useAccount()
  const { linked, checking, openLink } = useTelegram(address)
  const [showTgCard, setShowTgCard] = useState(false)

  return (
    <>
    {showTgCard && !linked && (
      <div
        onClick={() => setShowTgCard(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 360,
            padding: '28px 24px',
            borderRadius: 16,
            background: 'var(--db-bg-elevated)',
            border: '1px solid var(--db-neon-cyan-muted)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 40px rgba(0,255,224,0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--db-text-primary)' }}>
              Telegram Bot
            </span>
            <button
              onClick={() => setShowTgCard(false)}
              style={{
                background: 'none', border: 'none', color: 'var(--db-text-muted)',
                cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px',
              }}
            >
              x
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--db-text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
            Link your wallet to{' '}
            <span style={{ color: 'var(--db-neon-cyan)' }}>@nyx_polkabot</span>{' '}
            to get real-time notifications for orders, fills, and staking events.
          </p>
          <ol style={{ fontSize: 12, color: 'var(--db-text-muted)', lineHeight: 2, margin: '0 0 20px 18px', padding: 0 }}>
            <li>Click the button below</li>
            <li>Press <b>Start</b> in Telegram</li>
            <li>Come back — it will auto-detect</li>
          </ol>
          <button
            onClick={() => { openLink() }}
            disabled={checking}
            style={{
              width: '100%',
              padding: '11px 8px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-mono), monospace',
              border: '1px solid var(--db-neon-cyan-muted)',
              background: checking ? 'transparent' : 'var(--db-neon-cyan-ghost)',
              color: 'var(--db-neon-cyan)',
              cursor: checking ? 'wait' : 'pointer',
              letterSpacing: '0.02em',
              transition: 'all 0.15s',
              animation: checking ? 'db-pulse 1.5s infinite' : 'none',
            }}
          >
            {checking ? 'Waiting for link...' : 'Open @nyx_polkabot'}
          </button>
        </div>
      </div>
    )}
    <aside className="db-sidebar">
      {/* Logo */}
      <div className="db-sidebar-header">
        <div className="flex items-center gap-3">
          <div className="db-sidebar-logo">
            <span style={{ color: 'var(--db-accent)', fontSize: 16 }}>⚔</span>
          </div>
          <div>
            <h1 className="db-sidebar-title">Nyx</h1>
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

      {/* Telegram */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--db-border)', position: 'relative' }}>
        <p style={{ fontSize: 9, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Notifications
        </p>
        {linked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--db-success)' }} />
            <span style={{ fontSize: 11, color: 'var(--db-text-secondary)', fontFamily: 'var(--font-mono), monospace' }}>
              Telegram connected
            </span>
          </div>
        ) : (
          <button
            onClick={() => setShowTgCard(true)}
            disabled={!address}
            style={{
              width: '100%',
              padding: '7px 8px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-mono), monospace',
              border: '1px solid var(--db-neon-cyan-muted)',
              background: 'var(--db-neon-cyan-ghost)',
              color: 'var(--db-neon-cyan)',
              cursor: !address ? 'not-allowed' : 'pointer',
              opacity: !address ? 0.4 : 1,
              letterSpacing: '0.02em',
              transition: 'all 0.15s',
            }}
          >
            Connect Telegram
          </button>
        )}

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
    </>
  )
}
