'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { WARDEN_CLOB_ADDRESS } from '@/lib/clob'

const PLACED_ABI = [{
  type: 'event' as const, name: 'OrderPlaced',
  inputs: [
    { name: 'orderId',  type: 'uint256' as const, indexed: true  },
    { name: 'user',     type: 'address' as const, indexed: true  },
    { name: 'side',     type: 'uint8'   as const, indexed: false },
    { name: 'price',    type: 'uint256' as const, indexed: false },
    { name: 'quantity', type: 'uint256' as const, indexed: false },
  ],
}] as const

export function useLastPrice() {
  const publicClient = usePublicClient()
  const [lastPrice, setLastPrice] = useState<bigint | null>(null)
  const [prevPrice, setPrevPrice] = useState<bigint | null>(null)

  useEffect(() => {
    if (!publicClient) return

    // fetch historical last price
    publicClient
      .getLogs({
        address: WARDEN_CLOB_ADDRESS,
        event: PLACED_ABI[0],
        fromBlock: 0n,
      })
      .then((logs) => {
        if (logs.length > 0) {
          const last = logs[logs.length - 1]
          const price = (last.args as { price: bigint }).price
          setLastPrice(price)
        }
      })
      .catch(() => {})

    // watch live
    const unwatch = publicClient.watchContractEvent({
      address: WARDEN_CLOB_ADDRESS,
      abi: PLACED_ABI,
      eventName: 'OrderPlaced',
      onLogs: (evts) => {
        for (const e of evts) {
          const price = (e.args as { price: bigint }).price
          setLastPrice((prev) => {
            setPrevPrice(prev)
            return price
          })
        }
      },
    })

    return unwatch
  }, [publicClient])

  const direction = lastPrice && prevPrice
    ? lastPrice > prevPrice ? 'up' : lastPrice < prevPrice ? 'down' : 'flat'
    : 'flat'

  return { lastPrice, prevPrice, direction }
}
