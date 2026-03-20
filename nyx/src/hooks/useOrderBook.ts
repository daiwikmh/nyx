'use client'

import { useMemo } from 'react'
import { useReadContracts, useReadContract } from 'wagmi'
import { WARDEN_CLOB_ADDRESS, CLOB_ABI } from '@/lib/clob'

export function useOrderBook() {
  const { data: nextIdData } = useReadContract({
    address: WARDEN_CLOB_ADDRESS,
    abi: CLOB_ABI,
    functionName: 'nextOrderId',
    query: { refetchInterval: 6000 },
  })

  const { data: lockedData } = useReadContracts({
    contracts: [
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'totalDOTLocked' },
      { address: WARDEN_CLOB_ADDRESS, abi: CLOB_ABI, functionName: 'totalUSDCLocked' },
    ],
    query: { refetchInterval: 6000 },
  })

  const count = nextIdData ? Number(nextIdData as bigint) : 0

  const contracts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        address: WARDEN_CLOB_ADDRESS,
        abi: CLOB_ABI,
        functionName: 'orders' as const,
        args: [BigInt(i)],
      })),
    [count],
  )

  const { data: ordersData, isLoading } = useReadContracts({
    contracts,
    query: { refetchInterval: 6000 },
  })

  const { bestBid, bestAsk, totalOrders } = useMemo(() => {
    if (!ordersData) return { bestBid: 0n, bestAsk: 0n, totalOrders: count }

    let bid = 0n
    let ask = 0n

    for (const d of ordersData) {
      if (!d || d.status !== 'success' || !d.result) continue
      const r = d.result as [string, number, bigint, bigint, bigint, boolean]
      const [, side, price, , , active] = r
      if (!active || price === 0n) continue

      if (side === 0) {
        // buy — want the highest price
        if (price > bid) bid = price
      } else {
        // sell — want the lowest price
        if (ask === 0n || price < ask) ask = price
      }
    }

    return { bestBid: bid, bestAsk: ask, totalOrders: count }
  }, [ordersData, count])

  const totalDOTLocked  = lockedData?.[0]?.result as bigint | undefined
  const totalUSDCLocked = lockedData?.[1]?.result as bigint | undefined

  // raw active orders for consumers that need depth data
  type RawOrder = { side: number; price: bigint; quantity: bigint }
  const activeOrders: RawOrder[] = useMemo(() => {
    if (!ordersData) return []
    const out: RawOrder[] = []
    for (const d of ordersData) {
      if (!d || d.status !== 'success' || !d.result) continue
      const r = d.result as [string, number, bigint, bigint, bigint, boolean]
      const [, side, price, quantity, , active] = r
      if (!active || price === 0n) continue
      out.push({ side: Number(side), price, quantity })
    }
    return out
  }, [ordersData])

  return { bestBid, bestAsk, totalDOTLocked, totalUSDCLocked, totalOrders, isLoading, activeOrders }
}
