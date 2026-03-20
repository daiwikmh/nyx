'use client'

import { useReadContracts } from 'wagmi'
import { WARDEN_CLOB_ADDRESS, CLOB_ABI, MIN_VALID_PRICE, MAX_VALID_PRICE } from '@/lib/clob'
import { useLastPrice } from '@/hooks/useLastPrice'

export default function MarketPanel() {
  const { data } = useReadContracts({
    contracts: [
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'bestBid' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'bestAsk' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'liquidityAtBid' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'liquidityAtAsk' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'nextOrderId' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'stakingPoolId' },
    ],
  })

  const { lastPrice, direction } = useLastPrice()

  const bestBid        = data?.[0]?.result as bigint | undefined
  const bestAsk        = data?.[1]?.result as bigint | undefined
  const liquidityAtBid = data?.[2]?.result as bigint | undefined
  const liquidityAtAsk = data?.[3]?.result as bigint | undefined
  const nextOrderId    = data?.[4]?.result as bigint | undefined
  const stakingPoolId  = data?.[5]?.result as bigint | undefined

  const fmt = (v: bigint | undefined) =>
    v !== undefined ? `$${(Number(v) / 1e6).toFixed(4)}` : '—'
  const fmtQty = (v: bigint | undefined) =>
    v !== undefined ? (Number(v) / 1e6).toFixed(4) : '—'
  const spread =
    bestBid !== undefined && bestAsk !== undefined && bestAsk > 0n && bestBid > 0n
      ? Number(bestAsk - bestBid) / 1e6
      : null

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header + Last Price */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--db-text-primary)' }}>Market</p>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono), monospace',
            color: direction === 'up' ? 'var(--db-success)' : direction === 'down' ? 'var(--db-danger)' : 'var(--db-text-muted)',
          }}>
            {direction === 'up' ? '+' : direction === 'down' ? '-' : ''}
          </span>
        </div>
        <p style={{ fontSize: 10, color: 'var(--db-text-muted)', marginTop: 2 }}>PAS / USDC</p>
        {lastPrice && (
          <p style={{
            fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono), monospace', marginTop: 6,
            color: direction === 'up' ? 'var(--db-success)' : direction === 'down' ? 'var(--db-danger)' : 'var(--db-neon-cyan)',
          }}>
            ${(Number(lastPrice) / 1e6).toFixed(4)}
          </p>
        )}
      </div>

      {/* Bid / Ask grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <MetricBox label="Best Bid"  value={fmt(bestBid)}         color="var(--db-success)" />
        <MetricBox label="Best Ask"  value={fmt(bestAsk)}         color="var(--db-danger)"  />
        <MetricBox label="Liq @ Bid" value={fmtQty(liquidityAtBid)} />
        <MetricBox label="Liq @ Ask" value={fmtQty(liquidityAtAsk)} />
      </div>

      {/* Spread */}
      <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--db-border)' }}>
        <p style={{ fontSize: 9, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Spread</p>
        <p style={{ fontSize: 15, fontFamily: 'var(--font-mono), monospace', fontWeight: 700, color: 'var(--db-text-primary)', marginTop: 3 }}>
          {spread !== null ? `$${spread.toFixed(4)}` : '—'}
        </p>
      </div>

      {/* Volatility guard */}
      <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--db-accent-ghost)', border: '1px solid rgba(225,196,233,0.08)' }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--db-accent-dim)' }}>Volatility Guard</p>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ConnRow label="Baseline" value={lastPrice ? `$${(Number(lastPrice) / 1e6).toFixed(2)}` : '$8.00'} color="var(--db-text-secondary)" />
          <ConnRow label="Min"      value={`$${(Number(MIN_VALID_PRICE) / 1e6).toFixed(2)}`} color="var(--db-success)" />
          <ConnRow label="Max"      value={`$${(Number(MAX_VALID_PRICE) / 1e6).toFixed(2)}`} color="var(--db-danger)" />
          <ConnRow label="Band"     value="±10%"   color="var(--db-accent)" />
        </div>
      </div>

      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--db-border), transparent)' }} />

      {/* Chain stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ConnRow label="Total Orders" value={nextOrderId !== undefined ? String(nextOrderId) : '—'} ok />
        <ConnRow label="Staking Pool" value={stakingPoolId !== undefined ? `Pool #${stakingPoolId}` : '—'} ok />
        <ConnRow label="Settlement"   value="Instant" ok />
        <ConnRow label="Engine"       value="PVM Rust" ok />
      </div>

      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--db-border), transparent)' }} />

      {/* Connections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 9, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Connections</p>
        <ConnRow label="RPC"      value="Asset Hub" ok />
        <ConnRow label="Contract" value="0x84e5…1710"   ok />
        <ConnRow label="USDC"     value="0x…0539"       ok />
        <ConnRow label="Staking"  value="0x…0804"       ok />
      </div>
    </div>
  )
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--db-border)' }}>
      <p style={{ fontSize: 9, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, fontWeight: 700, color: color ?? 'var(--db-text-primary)', marginTop: 3 }}>
        {value}
      </p>
    </div>
  )
}

function ConnRow({ label, value, color, ok }: { label: string; value: string; color?: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: 'var(--db-text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 10, color: color ?? (ok ? 'var(--db-success)' : 'var(--db-text-muted)') }}>
        {value}
      </span>
    </div>
  )
}
