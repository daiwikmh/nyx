'use client'

import { useMemo } from 'react'
import { MIN_VALID_PRICE, MAX_VALID_PRICE, BASELINE_PRICE } from '@/lib/clob'
import { useOrderBook } from '@/hooks/useOrderBook'

export default function DepthChart() {
  const { activeOrders, bestBid, bestAsk, isLoading } = useOrderBook()

  const { bids, asks, midPrice } = useMemo(() => {
    const bidMap = new Map<number, number>()
    const askMap = new Map<number, number>()

    for (const o of activeOrders) {
      const price = Number(o.price) / 1e6
      const qty   = Number(o.quantity) / 1e8
      const map = o.side === 0 ? bidMap : askMap
      map.set(price, (map.get(price) ?? 0) + qty)
    }

    const bidPrices = [...bidMap.keys()].sort((a, b) => b - a)
    let cumBid = 0
    const bidDepth = bidPrices.map((p) => {
      cumBid += bidMap.get(p)!
      return { price: p, cumulative: cumBid }
    })

    const askPrices = [...askMap.keys()].sort((a, b) => a - b)
    let cumAsk = 0
    const askDepth = askPrices.map((p) => {
      cumAsk += askMap.get(p)!
      return { price: p, cumulative: cumAsk }
    })

    const bb = bestBid > 0n ? Number(bestBid) / 1e6 : (bidPrices[0] ?? 0)
    const ba = bestAsk > 0n ? Number(bestAsk) / 1e6 : (askPrices[0] ?? 0)
    const mid = bb > 0 && ba > 0 ? (bb + ba) / 2 : Number(BASELINE_PRICE) / 1e6

    return { bids: bidDepth, asks: askDepth, midPrice: mid }
  }, [activeOrders, bestBid, bestAsk])

  const W = 520
  const H = 200
  const PAD = { top: 20, right: 16, bottom: 28, left: 50 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const minBand = Number(MIN_VALID_PRICE) / 1e6
  const maxBand = Number(MAX_VALID_PRICE) / 1e6
  const baseline = Number(BASELINE_PRICE) / 1e6

  const { svgBids, svgAsks, xScale, yMax } = useMemo(() => {
    const allPrices = [...bids.map((b) => b.price), ...asks.map((a) => a.price)]
    const pMin = allPrices.length > 0 ? Math.min(...allPrices, minBand) : minBand
    const pMax = allPrices.length > 0 ? Math.max(...allPrices, maxBand) : maxBand
    const pRange = pMax - pMin || 1

    const maxCum = Math.max(
      bids.length > 0 ? bids[bids.length - 1].cumulative : 0,
      asks.length > 0 ? asks[asks.length - 1].cumulative : 0,
      0.01
    )

    const xS = (price: number) => PAD.left + ((price - pMin) / pRange) * plotW
    const yS = (cum: number) => PAD.top + plotH - (cum / maxCum) * plotH

    const buildPath = (points: { price: number; cumulative: number }[], closeSide: 'left' | 'right') => {
      if (points.length === 0) return ''
      const parts: string[] = []
      // Step area
      for (let i = 0; i < points.length; i++) {
        const x = xS(points[i].price)
        const y = yS(points[i].cumulative)
        if (i === 0) {
          parts.push(`M ${xS(points[i].price)} ${yS(0)}`)
          parts.push(`L ${x} ${y}`)
        } else {
          // Horizontal then vertical for step
          parts.push(`L ${xS(points[i].price)} ${yS(points[i - 1].cumulative)}`)
          parts.push(`L ${x} ${y}`)
        }
      }
      // Close back to baseline
      const lastX = xS(points[points.length - 1].price)
      parts.push(`L ${lastX} ${yS(0)}`)
      parts.push('Z')
      return parts.join(' ')
    }

    return {
      svgBids: buildPath(bids, 'left'),
      svgAsks: buildPath(asks, 'right'),
      xScale: xS,
      yMax: maxCum,
    }
  }, [bids, asks, plotW, plotH, minBand, maxBand])

  const yBottom = PAD.top + plotH

  const hasData = bids.length > 0 || asks.length > 0

  return (
    <div className="db-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)' }}>
          Order Book Depth
        </p>
        {midPrice > 0 && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono), monospace', color: 'var(--db-neon-cyan)' }}>
            Mid ${midPrice.toFixed(4)}
          </span>
        )}
      </div>

      {isLoading ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--db-text-muted)', fontSize: 12 }}>
          Loading order book...
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', position: 'relative' }}>
          {/* Band shading */}
          <rect
            x={xScale(minBand)}
            y={PAD.top}
            width={xScale(maxBand) - xScale(minBand)}
            height={plotH}
            fill="rgba(255,255,255,0.02)"
          />
          {/* Band boundaries */}
          <line x1={xScale(minBand)} y1={PAD.top} x2={xScale(minBand)} y2={yBottom}
            stroke="var(--db-text-muted)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
          <line x1={xScale(maxBand)} y1={PAD.top} x2={xScale(maxBand)} y2={yBottom}
            stroke="var(--db-text-muted)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
          {/* Baseline */}
          <line x1={xScale(baseline)} y1={PAD.top} x2={xScale(baseline)} y2={yBottom}
            stroke="var(--db-text-muted)" strokeWidth={0.5} strokeDasharray="2,4" opacity={0.3} />

          {/* Bid fill */}
          {svgBids && (
            <path d={svgBids} fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={1.5} />
          )}
          {/* Ask fill */}
          {svgAsks && (
            <path d={svgAsks} fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth={1.5} />
          )}

          {/* X-axis labels */}
          <text x={xScale(minBand)} y={H - 4} fill="var(--db-text-muted)" fontSize={8} textAnchor="middle"
            fontFamily="var(--font-mono), monospace">${minBand.toFixed(2)}</text>
          <text x={xScale(baseline)} y={H - 4} fill="var(--db-text-muted)" fontSize={8} textAnchor="middle"
            fontFamily="var(--font-mono), monospace">${baseline.toFixed(2)}</text>
          <text x={xScale(maxBand)} y={H - 4} fill="var(--db-text-muted)" fontSize={8} textAnchor="middle"
            fontFamily="var(--font-mono), monospace">${maxBand.toFixed(2)}</text>

          {/* Y-axis labels */}
          <text x={PAD.left - 4} y={PAD.top + 4} fill="var(--db-text-muted)" fontSize={8} textAnchor="end"
            fontFamily="var(--font-mono), monospace">{yMax.toFixed(1)}</text>
          <text x={PAD.left - 4} y={yBottom} fill="var(--db-text-muted)" fontSize={8} textAnchor="end"
            fontFamily="var(--font-mono), monospace">0</text>

          {/* Legend */}
          <rect x={PAD.left} y={4} width={8} height={8} rx={2} fill="rgba(34,197,94,0.4)" />
          <text x={PAD.left + 12} y={11} fill="var(--db-text-muted)" fontSize={8}
            fontFamily="var(--font-mono), monospace">Bids</text>
          <rect x={PAD.left + 44} y={4} width={8} height={8} rx={2} fill="rgba(239,68,68,0.4)" />
          <text x={PAD.left + 56} y={11} fill="var(--db-text-muted)" fontSize={8}
            fontFamily="var(--font-mono), monospace">Asks</text>

          {/* Empty state overlay */}
          {!hasData && (
            <text
              x={W / 2} y={H / 2 + 4}
              fill="var(--db-text-muted)" fontSize={11} textAnchor="middle"
              fontFamily="var(--font-mono), monospace"
            >
              No active resting orders
            </text>
          )}
        </svg>
      )}

      {/* Spread indicator */}
      {bids.length > 0 && asks.length > 0 && (
        <div style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          fontFamily: 'var(--font-mono), monospace',
          color: 'var(--db-text-muted)',
        }}>
          <span>Best Bid: <span style={{ color: 'var(--db-success)' }}>${bids[0].price.toFixed(4)}</span></span>
          <span>Spread: ${(asks[0].price - bids[0].price).toFixed(4)}</span>
          <span>Best Ask: <span style={{ color: 'var(--db-danger)' }}>${asks[0].price.toFixed(4)}</span></span>
        </div>
      )}
    </div>
  )
}
