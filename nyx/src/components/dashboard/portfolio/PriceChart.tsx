'use client'

import { useState, useEffect, useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { WARDEN_CLOB_ADDRESS, MIN_VALID_PRICE, MAX_VALID_PRICE, BASELINE_PRICE } from '@/lib/clob'

type PricePoint = {
  block: number
  avgPrice: number
}

const ORDER_PLACED_EVENT = {
  type: 'event' as const,
  name: 'OrderPlaced',
  inputs: [
    { name: 'orderId',  type: 'uint256' as const, indexed: true  },
    { name: 'user',     type: 'address' as const, indexed: true  },
    { name: 'side',     type: 'uint8' as const,   indexed: false },
    { name: 'price',    type: 'uint256' as const, indexed: false },
    { name: 'quantity', type: 'uint256' as const, indexed: false },
  ],
}

export default function PriceChart({ compact = false }: { compact?: boolean }) {
  const publicClient = usePublicClient()
  const [points, setPoints] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!publicClient) return
    setLoading(true)
    publicClient
      .getLogs({
        address: WARDEN_CLOB_ADDRESS,
        event: ORDER_PLACED_EVENT,
        fromBlock: 0n,
      })
      .then((logs) => {
        // Group by block, compute average price
        const blockMap = new Map<number, { sum: number; count: number }>()
        for (const l of logs) {
          const block = Number(l.blockNumber ?? 0n)
          const price = Number((l.args as { price: bigint }).price) / 1e6
          const entry = blockMap.get(block) ?? { sum: 0, count: 0 }
          entry.sum += price
          entry.count += 1
          blockMap.set(block, entry)
        }
        const pts: PricePoint[] = []
        for (const [block, { sum, count }] of blockMap) {
          pts.push({ block, avgPrice: sum / count })
        }
        pts.sort((a, b) => a.block - b.block)
        setPoints(pts)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [publicClient])

  const W = 600
  const H = compact ? 180 : 220
  const PAD = { top: 20, right: 16, bottom: 28, left: 50 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const minBand = Number(MIN_VALID_PRICE) / 1e6
  const maxBand = Number(MAX_VALID_PRICE) / 1e6
  const baseline = Number(BASELINE_PRICE) / 1e6

  const { linePath, areaPath, xScale, yScale } = useMemo(() => {
    if (points.length === 0) return { linePath: '', areaPath: '', xScale: () => 0, yScale: () => 0 }

    const blocks = points.map((p) => p.block)
    const bMin = Math.min(...blocks)
    const bMax = Math.max(...blocks)
    const bRange = bMax - bMin || 1

    const prices = points.map((p) => p.avgPrice)
    const pMin = Math.min(...prices, minBand) - 0.1
    const pMax = Math.max(...prices, maxBand) + 0.1
    const pRange = pMax - pMin || 1

    const xS = (block: number) => PAD.left + ((block - bMin) / bRange) * plotW
    const yS = (price: number) => PAD.top + plotH - ((price - pMin) / pRange) * plotH

    const lineD = points.map((p, i) => {
      const x = xS(p.block)
      const y = yS(p.avgPrice)
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
    }).join(' ')

    const areaD = lineD +
      ` L ${xS(points[points.length - 1].block)} ${yS(pMin)}` +
      ` L ${xS(points[0].block)} ${yS(pMin)} Z`

    return { linePath: lineD, areaPath: areaD, xScale: xS, yScale: yS }
  }, [points, plotW, plotH, minBand, maxBand])

  const yBottom = PAD.top + plotH

  return (
    <div className="db-card" style={{ padding: '1.25rem' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)', marginBottom: 12 }}>
        Price History
      </p>

      {loading ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          Loading price data...
        </div>
      ) : points.length === 0 ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          No order history yet
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          {/* Volatility band shading */}
          <rect
            x={PAD.left}
            y={yScale(maxBand)}
            width={plotW}
            height={yScale(minBand) - yScale(maxBand)}
            fill="rgba(255,255,255,0.02)"
          />

          {/* Band boundary lines */}
          <line x1={PAD.left} y1={yScale(minBand)} x2={PAD.left + plotW} y2={yScale(minBand)}
            stroke="var(--db-text-muted)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
          <line x1={PAD.left} y1={yScale(maxBand)} x2={PAD.left + plotW} y2={yScale(maxBand)}
            stroke="var(--db-text-muted)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />

          {/* Baseline */}
          <line x1={PAD.left} y1={yScale(baseline)} x2={PAD.left + plotW} y2={yScale(baseline)}
            stroke="var(--db-neon-cyan)" strokeWidth={0.5} strokeDasharray="2,4" opacity={0.4} />

          {/* Price area */}
          <path d={areaPath} fill="rgba(0,255,224,0.06)" />

          {/* Price line */}
          <path d={linePath} fill="none" stroke="var(--db-neon-cyan)" strokeWidth={1.5} />

          {/* Dots on data points (only if few enough) */}
          {points.length <= 30 && points.map((p, i) => (
            <circle
              key={i}
              cx={xScale(p.block)}
              cy={yScale(p.avgPrice)}
              r={2.5}
              fill="var(--db-neon-cyan)"
              opacity={0.8}
            />
          ))}

          {/* Y-axis labels */}
          <text x={PAD.left - 4} y={yScale(maxBand) + 3} fill="var(--db-text-muted)" fontSize={8} textAnchor="end"
            fontFamily="var(--font-mono), monospace">${maxBand.toFixed(2)}</text>
          <text x={PAD.left - 4} y={yScale(baseline) + 3} fill="var(--db-neon-cyan)" fontSize={8} textAnchor="end"
            fontFamily="var(--font-mono), monospace" opacity={0.6}>${baseline.toFixed(2)}</text>
          <text x={PAD.left - 4} y={yScale(minBand) + 3} fill="var(--db-text-muted)" fontSize={8} textAnchor="end"
            fontFamily="var(--font-mono), monospace">${minBand.toFixed(2)}</text>

          {/* X-axis: first and last block */}
          <text x={PAD.left} y={H - 4} fill="var(--db-text-muted)" fontSize={8} textAnchor="start"
            fontFamily="var(--font-mono), monospace">#{points[0].block}</text>
          <text x={PAD.left + plotW} y={H - 4} fill="var(--db-text-muted)" fontSize={8} textAnchor="end"
            fontFamily="var(--font-mono), monospace">#{points[points.length - 1].block}</text>

          {/* Legend */}
          <line x1={W - 100} y1={8} x2={W - 86} y2={8} stroke="var(--db-neon-cyan)" strokeWidth={1.5} />
          <text x={W - 82} y={11} fill="var(--db-text-muted)" fontSize={8}
            fontFamily="var(--font-mono), monospace">Avg Price</text>
        </svg>
      )}
    </div>
  )
}
