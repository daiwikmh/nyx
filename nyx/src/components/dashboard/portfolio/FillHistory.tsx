'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { WARDEN_CLOB_ADDRESS } from '@/lib/clob'

type Fill = {
  orderId: string
  filledAmount: bigint
  txHash: string
  blockNumber: bigint
}

const SETTLED_EVENT = {
  type: 'event' as const,
  name: 'OrderSettled',
  inputs: [
    { name: 'orderId',      type: 'uint256' as const, indexed: true  },
    { name: 'user',         type: 'address' as const, indexed: true  },
    { name: 'filledAmount', type: 'uint256' as const, indexed: false },
  ],
}

export default function FillHistory() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [fills, setFills] = useState<Fill[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address || !publicClient) return
    setLoading(true)
    publicClient
      .getLogs({
        address: WARDEN_CLOB_ADDRESS,
        event: SETTLED_EVENT,
        args: { user: address },
        fromBlock: 0n,
      })
      .then((logs) => {
        setFills(
          logs.map((l) => ({
            orderId:      String((l.args as { orderId: bigint }).orderId),
            filledAmount: (l.args as { filledAmount: bigint }).filledAmount,
            txHash:       l.transactionHash ?? '',
            blockNumber:  l.blockNumber ?? 0n,
          })).reverse()
        )
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [address, publicClient])

  return (
    <div className="db-card">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--db-border)',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)' }}>
          Fill History
        </h3>
        <span style={{ fontSize: 10, color: 'var(--db-text-muted)', fontFamily: 'var(--font-mono), monospace' }}>
          {fills.length} fills
        </span>
      </div>

      {loading ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          Loading...
        </div>
      ) : fills.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          {address ? 'No fills yet' : 'Connect wallet to view fill history'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="db-table">
            <thead>
              <tr>
                {['Order', 'Filled Amount', 'Tx Hash', 'Block'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fills.map((f, i) => (
                <tr key={i} className="db-table-row">
                  <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>#{f.orderId}</td>
                  <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--db-neon-cyan)' }}>
                    {(Number(f.filledAmount) / 1e8).toFixed(4)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 10, color: 'var(--db-accent-dim)' }}>
                    {f.txHash.slice(0, 10)}...{f.txHash.slice(-6)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>{String(f.blockNumber)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
