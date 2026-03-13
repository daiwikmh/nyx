'use client'

import { useAccount, useBalance, useReadContract } from 'wagmi'
import { USDC_ADDRESS, ERC20_ABI } from '@/lib/clob'

export default function BalanceCards() {
  const { address, isConnected } = useAccount()

  const { data: dotBalance } = useBalance({
    address,
    query: { enabled: !!address },
  })

  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  if (!isConnected) {
    return (
      <div className="db-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
        Connect wallet to view balances
      </div>
    )
  }

  const dotDisplay = dotBalance
    ? `${(Number(dotBalance.value) / 10 ** dotBalance.decimals).toFixed(6)} ${dotBalance.symbol}`
    : '—'

  const usdcDisplay = usdcRaw !== undefined
    ? `$${(Number(usdcRaw as bigint) / 1e6).toFixed(6)}`
    : '—'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      <BalanceCard
        label="DOT Balance"
        value={dotDisplay}
        sub="Native · Paseo Asset Hub"
        color="var(--db-neon-cyan)"
        glow="rgba(0,255,224,0.08)"
      />
      <BalanceCard
        label="USDC Balance"
        value={usdcDisplay}
        sub="Asset 1337 · Paseo Asset Hub"
        color="var(--db-accent)"
        glow={null}
      />
    </div>
  )
}

function BalanceCard({ label, value, sub, color, glow }: {
  label: string; value: string; sub: string; color: string; glow: string | null
}) {
  return (
    <div
      className="db-card"
      style={{ padding: '1.75rem', boxShadow: glow ? `0 0 24px ${glow}` : undefined }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
      </div>
      <p style={{
        fontFamily: 'var(--font-mono), monospace',
        fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1,
      }}>
        {value}
      </p>
      <p style={{ fontSize: 10, color: 'var(--db-text-muted)', marginTop: 8 }}>{sub}</p>
    </div>
  )
}
