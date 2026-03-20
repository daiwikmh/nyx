'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import {
  WARDEN_CLOB_ADDRESS,
  USDC_ADDRESS,
  CLOB_ABI,
  ERC20_ABI,
  MIN_VALID_PRICE,
  MAX_VALID_PRICE,
  type TradingPair,
} from '@/lib/clob'
import { useTelegram } from '@/hooks/useTelegram'

export default function OrderEntryPanel({ pair }: { pair?: TradingPair }) {
  const baseName = pair?.base ?? 'DOT'
  const quoteName = pair?.quote ?? 'USDC'
  const { address, isConnected } = useAccount()
  const { notify } = useTelegram(address)
  const [side, setSide]                   = useState<0 | 1>(0)
  const [priceInput, setPriceInput]       = useState('')
  const [quantityInput, setQuantityInput] = useState('')

  const [isApproving, setIsApproving] = useState(false)
  const [approvalConfirmed, setApprovalConfirmed] = useState(false)

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const priceBn = useMemo(() => {
    try { return parseUnits(priceInput || '0', 6) } catch { return 0n }
  }, [priceInput])

  // PAS has 8 decimals — 100_000_000 = 1 PAS
  const quantityBn = useMemo(() => {
    try { return parseUnits(quantityInput || '0', 8) } catch { return 0n }
  }, [quantityInput])

  // cost in USDC (6-dec): price(6-dec) * quantity(8-dec) / 1e8 → gives 6-dec USDC units
  // e.g. price=8_000_000 ($8), qty=100_000_000 (1 PAS) → 8_000_000 = $8.00 USDC
  const costBn = useMemo(
    () => (priceBn > 0n && quantityBn > 0n ? (priceBn * quantityBn) / 100_000_000n : 0n),
    [priceBn, quantityBn]
  )

  // Reset approval flag if the user changes price/quantity (new cost may exceed old approval)
  useEffect(() => { setApprovalConfirmed(false) }, [priceInput, quantityInput])

  const isOutsideBand = priceBn > 0n && (priceBn < MIN_VALID_PRICE || priceBn > MAX_VALID_PRICE)

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, WARDEN_CLOB_ADDRESS] : undefined,
    query: { enabled: !!address && side === 0 },
  })

  // allowance === undefined means still loading — don't block the button while fetching
  const needsApproval = side === 0 && costBn > 0n && !approvalConfirmed &&
    allowance !== undefined && (allowance as bigint) < costBn

  useEffect(() => {
    if (isSuccess && isApproving) {
      setApprovalConfirmed(true)
      setIsApproving(false)
      refetchAllowance()
    }
    if (isSuccess && !isApproving) {
      notify('OrderPlaced', {
        orderId: txHash ?? '',
        side,
        price: String(priceBn),
        quantity: String(quantityBn),
      })
    }
  }, [isSuccess, isApproving, refetchAllowance, notify, txHash, side, priceBn, quantityBn])

  const handleApprove = () => {
    setIsApproving(true)
    reset()
    writeContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [WARDEN_CLOB_ADDRESS, costBn] })
  }

  const handleSubmit = () => {
    if (priceBn === 0n || quantityBn === 0n || isOutsideBand) return
    reset()
    if (side === 1) {
      writeContract({
        address: WARDEN_CLOB_ADDRESS,
        abi: CLOB_ABI,
        functionName: 'placeLimitOrder',
        args: [side, priceBn, quantityBn],
        value: quantityBn,
        gas: 500_000n,
      })
    } else {
      writeContract({
        address: WARDEN_CLOB_ADDRESS,
        abi: CLOB_ABI,
        functionName: 'placeLimitOrder',
        args: [side, priceBn, quantityBn],
        gas: 500_000n,
      })
    }
  }

  const busy = isPending || isConfirming
  const canSubmit = isConnected && !busy && priceBn > 0n && quantityBn > 0n && !isOutsideBand && !needsApproval

  return (
    <div className="db-card" style={{ padding: '1.25rem' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)', marginBottom: '1rem' }}>
        Place Order
      </p>

      {/* Side selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {([0, 1] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-mono), monospace',
              border: '1px solid',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              transition: 'all 0.15s',
              background: side === s
                ? s === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'
                : 'rgba(255,255,255,0.02)',
              color: side === s
                ? s === 0 ? 'var(--db-success)' : 'var(--db-danger)'
                : 'var(--db-text-muted)',
              borderColor: side === s
                ? s === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
                : 'var(--db-border)',
            }}
          >
            {s === 0 ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      {/* Price */}
      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Price ({quoteName})
          </span>
          <span style={{ fontSize: 9, color: 'var(--db-text-muted)' }}>6-dec</span>
        </div>
        <input
          type="number"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          placeholder="8.000000"
          step="0.000001"
          min="0"
          className="db-input"
        />
      </label>

      {/* Volatility guard warning */}
      {isOutsideBand && (
        <div style={{
          padding: '6px 10px',
          marginBottom: 12,
          borderRadius: 6,
          border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.06)',
          fontSize: 11,
          color: 'var(--db-danger)',
          fontFamily: 'var(--font-mono), monospace',
        }}>
          Outside band ($7.20–$8.80) — engine will reject
        </div>
      )}

      {/* Quantity */}
      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Quantity ({baseName})
          </span>
        </div>
        <input
          type="number"
          value={quantityInput}
          onChange={(e) => setQuantityInput(e.target.value)}
          placeholder="1"
          step="0.0000000001"
          min="0"
          className="db-input"
        />
      </label>

      {/* Cost row for buy */}
      {side === 0 && costBn > 0n && (
        <div style={{
          marginBottom: 12,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--db-border)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'var(--db-text-muted)' }}>Cost</span>
          <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--db-text-primary)' }}>
            ${(Number(costBn) / 1e6).toFixed(2)} {quoteName}
          </span>
        </div>
      )}

      {/* Approve button */}
      {side === 0 && needsApproval && (
        <button
          onClick={handleApprove}
          disabled={busy || costBn === 0n}
          style={{
            fontFamily: 'var(--font-mono), monospace',
            width: '100%',
            padding: '9px',
            borderRadius: 8,
            marginBottom: 8,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.05em',
            border: '1px solid var(--db-neon-cyan-muted)',
            background: 'var(--db-neon-cyan-ghost)',
            color: 'var(--db-neon-cyan)',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {busy ? 'Approving...' : 'Approve USDC'}
        </button>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          fontFamily: 'var(--font-mono), monospace',
          width: '100%',
          padding: '10px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.05em',
          border: '1px solid',
          cursor: !canSubmit ? 'not-allowed' : 'pointer',
          opacity: !canSubmit ? 0.45 : 1,
          transition: 'all 0.2s',
          background: side === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          color: side === 0 ? 'var(--db-success)' : 'var(--db-danger)',
          borderColor: side === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        }}
      >
        {busy ? 'Submitting...' : `Place ${side === 0 ? 'Buy' : 'Sell'} Order`}
      </button>

      {isSuccess && (
        <p style={{ marginTop: 8, fontSize: 11, color: 'var(--db-success)', fontFamily: 'var(--font-mono), monospace' }}>
          Order submitted ✓
        </p>
      )}
      {error && (
        <p style={{ marginTop: 8, fontSize: 10, color: 'var(--db-danger)', fontFamily: 'var(--font-mono), monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>
          {(error as Error).message.slice(0, 140)}
        </p>
      )}

      {/* Powered by section */}
      <div style={{ marginTop: 16, padding: '0.75rem', borderRadius: 8, background: 'var(--db-bg-base)', border: '1px solid var(--db-border)' }}>
        <p style={{ fontSize: 9, color: 'var(--db-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Powered by
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--db-text-secondary)' }}>PolkaVM</span>
          <div style={{ width: 1, height: 14, background: 'var(--db-border)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--db-text-secondary)' }}>Paseo Hub</span>
        </div>
      </div>
    </div>
  )
}
