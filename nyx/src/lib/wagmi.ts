import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'
import { metaMask } from 'wagmi/connectors'

// Paseo Asset Hub — EVM-compatible Polkadot testnet
// Chain ID: 420420421, native token: DOT (10 decimals)
export const paseoAssetHub = defineChain({
  id: 420420421,
  name: 'Paseo Asset Hub',
  nativeCurrency: { name: 'DOT', symbol: 'DOT', decimals: 10 },
  rpcUrls: {
    default: { http: ['https://eth-rpc-testnet.polkadot.io/'] },
  },
  testnet: true,
})

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [paseoAssetHub],
  connectors: [metaMask()],
  transports: {
    [paseoAssetHub.id]: http('https://eth-rpc-testnet.polkadot.io/'),
  },
})
