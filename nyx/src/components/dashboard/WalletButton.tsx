'use client'

import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { paseoAssetHub } from '@/lib/wagmi'

export default function WalletButton() {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()

  const isWrongChain = isConnected && chainId !== paseoAssetHub.id

  if (!isConnected) {
    return (
      <div style={{ padding: '12px 16px' }}>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            style={{
              fontFamily: 'var(--font-mono), monospace',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              background: 'var(--db-accent-ghost)',
              border: '1px solid var(--db-accent-muted)',
              color: 'var(--db-accent)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? 'Connecting...' : `Connect ${connector.name}`}
          </button>
        ))}
      </div>
    )
  }

  if (isWrongChain) {
    return (
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={() => switchChain({ chainId: paseoAssetHub.id })}
          style={{
            fontFamily: 'var(--font-mono), monospace',
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: 'var(--db-danger)',
            cursor: 'pointer',
          }}
        >
          Switch to Asset Hub
        </button>
        <button
          onClick={() => disconnect()}
          style={{
            fontFamily: 'var(--font-mono), monospace',
            width: '100%',
            padding: '6px 10px',
            borderRadius: 8,
            fontSize: 11,
            background: 'transparent',
            border: '1px solid var(--db-border)',
            color: 'var(--db-text-muted)',
            cursor: 'pointer',
          }}
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Connected wallet card */}
      <div style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--db-bg-surface)',
        border: '1px solid var(--db-border)',
      }}>
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--db-success)', animation: 'db-pulse 2s infinite' }} />
            <span style={{ fontSize: 9, color: 'var(--db-success)', fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Connected
            </span>
          </div>
          <span style={{ fontSize: 9, color: 'var(--db-text-muted)', fontFamily: 'var(--font-mono), monospace' }}>MetaMask</span>
        </div>

        {/* Address */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--db-accent-ghost)',
            border: '1px solid var(--db-accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: 'var(--db-accent)' }}>◈</span>
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, fontWeight: 600, color: 'var(--db-text-primary)', letterSpacing: '0.02em' }}>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
            <p style={{ fontSize: 9, color: 'var(--db-text-muted)', marginTop: 1 }}>Polkadot Asset Hub</p>
          </div>
        </div>

        {/* Disconnect button */}
        <button
          onClick={() => disconnect()}
          style={{
            fontFamily: 'var(--font-mono), monospace',
            width: '100%',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.18)',
            color: 'var(--db-danger)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            letterSpacing: '0.03em',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.14)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.35)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.06)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.18)'
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}
