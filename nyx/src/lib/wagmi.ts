import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'
import { metaMask } from 'wagmi/connectors'

// Paseo Asset Hub — EVM-compatible Polkadot testnet
// Chain ID: 420420421, native token: PAS (8 decimals — 100_000_000 = 1 PAS)
export const paseoAssetHub = defineChain({
  id: 420420421,
  name: 'Paseo Asset Hub',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 8 },
  rpcUrls: {
    default: { http: ['https://eth-rpc-testnet.polkadot.io/'] },
  },
  testnet: true,
})

export const wagmiConfig = createConfig({
  ssr: true,
  multiInjectedProviderDiscovery: false,
  chains: [paseoAssetHub],
  connectors: [metaMask()],
  transports: {
    [paseoAssetHub.id]: http('https://eth-rpc-testnet.polkadot.io/'),
  },
})
