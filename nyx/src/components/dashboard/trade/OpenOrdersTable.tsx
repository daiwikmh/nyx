'use client'

import { useAccount, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { WARDEN_CLOB_ADDRESS, CLOB_ABI } from '@/lib/clob'

type Order = {
  orderId: bigint
  user: string
  side: number
  price: bigint
  quantity: bigint
  filled: bigint
  active: boolean
}

import { useState } from 'react'

export default function OpenOrdersTable() {
  const [collapsed, setCollapsed] = useState(false)
  const { address } = useAccount()

  const { data: nextOrderIdData } = useReadContract({
    address: WARDEN_CLOB_ADDRESS,
    abi: CLOB_ABI,
    functionName: 'nextOrderId',
  })

  const count = nextOrderIdData !== undefined ? Number(nextOrderIdData as bigint) : 0

  const { data: ordersData } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: WARDEN_CLOB_ADDRESS as `0x${string}`,
      abi: CLOB_ABI,
      functionName: 'orders' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: count > 0 },
  })

  const { writeContract, isPending } = useWriteContract()

  const myOrders: Order[] = (ordersData ?? [])
    .map((d, i) => {
      if (!d.result) return null
      const [user, side, price, quantity, filled, active] = d.result as [string, number, bigint, bigint, bigint, boolean]
      return { orderId: BigInt(i), user, side, price, quantity, filled, active }
    })
    .filter((o): o is Order =>
      o !== null &&
      o.active &&
      address !== undefined &&
      o.user.toLowerCase() === address.toLowerCase()
    )

  const handleCancel = (orderId: bigint) => {
    writeContract({ address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'cancelOrder', args: [orderId] })
  }

  return (
    <div className="db-card">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--db-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)' }}>
            My Open Orders
          </h3>
          <span style={{ fontSize: 10, color: 'var(--db-text-muted)', fontFamily: 'var(--font-mono), monospace' }}>
            {myOrders.length} active
          </span>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--db-text-muted)', fontSize: 14, padding: '2px 6px',
            lineHeight: 1,
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '+' : '\u2013'}
        </button>
      </div>

      {collapsed ? null : myOrders.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          {address ? 'No open orders' : 'Connect wallet to view your orders'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="db-table">
            <thead>
              <tr>
                {['ID', 'Side', 'Price', 'Quantity', 'Filled', 'Remaining', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myOrders.map((o) => {
                const remaining = o.quantity - o.filled
                return (
                  <tr key={String(o.orderId)} className="db-table-row">
                    <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>#{String(o.orderId)}</td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px',
                        borderRadius: 4,
                        background: o.side === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        color: o.side === 0 ? 'var(--db-success)' : 'var(--db-danger)',
                        border: `1px solid ${o.side === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                        fontFamily: 'var(--font-mono), monospace',
                      }}>
                        {o.side === 0 ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>${(Number(o.price) / 1e6).toFixed(4)}</td>
                    <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>{(Number(o.quantity) / 1e8).toFixed(4)}</td>
                    <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: 'var(--db-success)' }}>
                      {(Number(o.filled) / 1e8).toFixed(4)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>{(Number(remaining) / 1e8).toFixed(4)}</td>
                    <td>
                      <button
                        onClick={() => handleCancel(o.orderId)}
                        disabled={isPending}
                        style={{
                          fontFamily: 'var(--font-mono), monospace',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 600,
                          background: 'rgba(239,68,68,0.06)',
                          border: '1px solid rgba(239,68,68,0.15)',
                          color: 'var(--db-danger)',
                          cursor: isPending ? 'wait' : 'pointer',
                          opacity: isPending ? 0.5 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
