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
      <div style={{ padding: '12px 16px' }}>
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
          Switch to Paseo
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderRadius: 8,
        background: 'var(--db-bg-surface)',
        border: '1px solid var(--db-border)',
        marginBottom: 8,
        transition: 'all 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'var(--db-accent-ghost)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 10, color: 'var(--db-accent)' }}>◈</span>
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, color: 'var(--db-text-secondary)' }}>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
            <p style={{ fontSize: 9, color: 'var(--db-text-muted)' }}>Paseo Asset Hub</p>
          </div>
        </div>
      </div>
      <button
        onClick={() => disconnect()}
        style={{
          fontFamily: 'var(--font-mono), monospace',
          width: '100%',
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--db-border)',
          color: 'var(--db-text-muted)',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        Disconnect
      </button>
    </div>
  )
}
