// Seed script — places alternating bid/ask limit orders on WardenCLOB
// Usage: PRIVATE_KEY=0x... bun seed-orders.ts
// Requires: PAS for sell orders, USDC approval for buy orders

import { createWalletClient, createPublicClient, http, defineChain } from './nyx/node_modules/viem/_cjs/index.js'
import { privateKeyToAccount } from './nyx/node_modules/viem/_cjs/accounts/index.js'

// ── Config ────────────────────────────────────────────────────────────────────

const PRIVATE_KEY = (process.env.PRIVATE_KEY ?? '').replace(/^0x/, '')
if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY=0x... before running')
  process.exit(1)
}

const WARDEN_CLOB = '0x84e57567758B1143BD285eED2cbD574187a1D710' as const

// Quantity per order: 4–5 PAS (8 decimals)
const QTY_MIN_PAS = 4.0
const QTY_MAX_PAS = 5.0

// Price band: $7.50–$8.50 (6 decimals). Volatility guard allows $7.20–$8.80.
const PRICE_MIN = 7_500_000   // $7.50
const PRICE_MAX = 8_500_000   // $8.50

// Number of orders to place total (mix of bids and asks)
const TOTAL_ORDERS = parseInt(process.env.ORDERS ?? '20')

// Delay between orders (ms)
const DELAY_MS = parseInt(process.env.DELAY ?? '4000')

// ── Chain + client ─────────────────────────────────────────────────────────────

const paseoAssetHub = defineChain({
  id: 420420421,
  name: 'Paseo Asset Hub',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 8 },
  rpcUrls: { default: { http: ['https://eth-rpc-testnet.polkadot.io/'] } },
  testnet: true,
})

const ABI = [
  {
    name: 'placeLimitOrder',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'side',     type: 'uint8'   },
      { name: 'price',    type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const USDC = '0x0000000000000000000000000000000000000539' as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function fmtPAS(planck: bigint): string {
  return (Number(planck) / 1e8).toFixed(4)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const account = privateKeyToAccount(`0x${PRIVATE_KEY}`)

  const pub = createPublicClient({
    chain: paseoAssetHub,
    transport: http('https://eth-rpc-testnet.polkadot.io/'),
  })
  const wallet = createWalletClient({
    account,
    chain: paseoAssetHub,
    transport: http('https://eth-rpc-testnet.polkadot.io/'),
  })

  // ── Balances ──────────────────────────────────────────────────────────────

  const pasBal = await pub.getBalance({ address: account.address })
  const usdcBal = await pub.readContract({
    address: USDC, abi: ABI, functionName: 'balanceOf', args: [account.address],
  }) as bigint

  console.log(`\nWallet: ${account.address}`)
  console.log(`PAS balance:  ${fmtPAS(pasBal)} PAS`)
  console.log(`USDC balance: ${(Number(usdcBal) / 1e6).toFixed(2)} USDC`)
  console.log(`Orders: ${TOTAL_ORDERS}  |  Delay: ${DELAY_MS}ms\n`)

  const hasPAS  = pasBal  > 0n
  const hasUSDC = usdcBal > 0n

  if (!hasPAS && !hasUSDC) {
    console.error('No PAS or USDC balance — cannot place orders')
    process.exit(1)
  }

  // ── Approve USDC if needed ────────────────────────────────────────────────

  if (hasUSDC) {
    const allowance = await pub.readContract({
      address: USDC, abi: ABI, functionName: 'allowance',
      args: [account.address, WARDEN_CLOB],
    }) as bigint

    if (allowance < usdcBal) {
      console.log('Approving USDC...')
      const hash = await wallet.writeContract({
        address: USDC, abi: ABI, functionName: 'approve',
        args: [WARDEN_CLOB, usdcBal],
      })
      await pub.waitForTransactionReceipt({ hash })
      console.log(`Approved ${(Number(usdcBal) / 1e6).toFixed(2)} USDC\n`)
    }
  }

  // ── Place orders ──────────────────────────────────────────────────────────

  let sells = 0
  let buys  = 0
  let errors = 0

  for (let i = 0; i < TOTAL_ORDERS; i++) {
    const price = randInt(PRICE_MIN, PRICE_MAX)
    const qtyPAS = randInt(QTY_MIN_PAS * 1e8, QTY_MAX_PAS * 1e8)
    const qty = BigInt(qtyPAS)

    // Alternate sides: prefer sell when we have PAS, buy when we have USDC
    // Pattern: sell sell buy sell sell buy ... (2:1 ratio skewed to sells)
    const wantSell = hasPAS && (i % 3 !== 2 || !hasUSDC)
    const side     = wantSell ? 1 : 0
    const sideLabel = side === 0 ? 'BUY ' : 'SELL'

    const priceUSD = (price / 1e6).toFixed(4)

    // For buys: USDC cost = price * quantity / 1e6 (price 6-dec, qty 8-dec)
    // Result in USDC base units (6 decimals)
    const usdcCost = side === 0
      ? BigInt(Math.floor(price * qtyPAS / 1e6))
      : 0n

    if (side === 0 && usdcCost > usdcBal) {
      console.log(`[${i + 1}/${TOTAL_ORDERS}] ${sideLabel} skip — insufficient USDC`)
      continue
    }
    if (side === 1 && qty > pasBal) {
      console.log(`[${i + 1}/${TOTAL_ORDERS}] ${sideLabel} skip — insufficient PAS`)
      continue
    }

    process.stdout.write(
      `[${i + 1}/${TOTAL_ORDERS}] ${sideLabel} ${(qtyPAS / 1e8).toFixed(4)} PAS @ $${priceUSD}  ... `
    )

    try {
      const hash = await wallet.writeContract({
        address: WARDEN_CLOB,
        abi: ABI,
        functionName: 'placeLimitOrder',
        args: [side, BigInt(price), qty],
        value: side === 1 ? qty : 0n,
      })
      const receipt = await pub.waitForTransactionReceipt({ hash })
      const status  = receipt.status === 'success' ? 'ok' : 'reverted'
      console.log(`${status}  (blk ${receipt.blockNumber})`)
      if (side === 0) buys++ ; else sells++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`FAILED — ${msg}`)
      errors++
    }

    if (i < TOTAL_ORDERS - 1) await sleep(DELAY_MS)
  }

  console.log(`\nDone. sells=${sells}  buys=${buys}  errors=${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
