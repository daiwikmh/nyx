// Seed script — places alternating bid/ask limit orders on WardenCLOB
// Usage: PRIVATE_KEY=0x... bun seed-orders.ts
// Requires: PAS for sell orders, USDC approval for buy orders

import { ethers } from "ethers";

// ── Config ────────────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? '';
if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY=0x... before running')
  process.exit(1)
}

const RPC_URL = 'https://eth-rpc-testnet.polkadot.io/'
const WARDEN_CLOB = '0x504B962fC472ab5ea0C9CF58885f6f6ad6268BF3'
const USDC_ADDR   = '0x2369B00a916132cBD3639bB29353d062f5fF325a'

// Quantity per order: 4-5 PAS (8 decimals)
const QTY_MIN_PAS = 4.0
const QTY_MAX_PAS = 5.0

// Price band: $7.50-$8.50 (6 decimals). Volatility guard allows $7.20-$8.80.
const PRICE_MIN = 7_500_000
const PRICE_MAX = 8_500_000

const TOTAL_ORDERS = parseInt(process.env.ORDERS ?? '20')
const DELAY_MS = parseInt(process.env.DELAY ?? '4000')

// ── ABI fragments ─────────────────────────────────────────────────────────────

const CLOB_ABI = [
  'function placeLimitOrder(uint8 side, uint256 price, uint256 quantity) payable',
]

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

  const clob = new ethers.Contract(WARDEN_CLOB, CLOB_ABI, wallet)
  const usdc = new ethers.Contract(USDC_ADDR, ERC20_ABI, wallet)

  // ── Balances ────────────────────────────────────────────────────────────
  const pasBal = await provider.getBalance(wallet.address)
  const usdcBal: bigint = await usdc.balanceOf(wallet.address)

  console.log(`\nWallet: ${wallet.address}`)
  console.log(`PAS balance:  ${(Number(pasBal) / 1e8).toFixed(4)} PAS`)
  console.log(`USDC balance: ${(Number(usdcBal) / 1e6).toFixed(2)} USDC`)
  console.log(`Orders: ${TOTAL_ORDERS}  |  Delay: ${DELAY_MS}ms\n`)

  const hasPAS  = pasBal  > 0n
  const hasUSDC = usdcBal > 0n

  if (!hasPAS && !hasUSDC) {
    console.error('No PAS or USDC balance')
    process.exit(1)
  }

  // ── Approve USDC if needed ──────────────────────────────────────────────
  if (hasUSDC) {
    const allowance: bigint = await usdc.allowance(wallet.address, WARDEN_CLOB)
    if (allowance < usdcBal) {
      console.log('Approving USDC...')
      const tx = await usdc.approve(WARDEN_CLOB, usdcBal)
      await tx.wait()
      console.log(`Approved ${(Number(usdcBal) / 1e6).toFixed(2)} USDC\n`)
    }
  }

  // ── Place orders ────────────────────────────────────────────────────────
  let sells = 0
  let buys  = 0
  let errors = 0

  for (let i = 0; i < TOTAL_ORDERS; i++) {
    const price = randInt(PRICE_MIN, PRICE_MAX)
    const qtyPAS = randInt(QTY_MIN_PAS * 1e8, QTY_MAX_PAS * 1e8)
    const qty = BigInt(qtyPAS)

    // Pattern: sell sell buy sell sell buy ... (2:1 ratio)
    const wantSell = hasPAS && (i % 3 !== 2 || !hasUSDC)
    const side     = wantSell ? 1 : 0
    const sideLabel = side === 0 ? 'BUY ' : 'SELL'

    const priceUSD = (price / 1e6).toFixed(4)

    const usdcCost = side === 0
      ? BigInt(Math.floor(price * qtyPAS / 1e6))
      : 0n

    if (side === 0 && usdcCost > usdcBal) {
      console.log(`[${i + 1}/${TOTAL_ORDERS}] ${sideLabel} skip -- insufficient USDC`)
      continue
    }
    if (side === 1 && qty > pasBal) {
      console.log(`[${i + 1}/${TOTAL_ORDERS}] ${sideLabel} skip -- insufficient PAS`)
      continue
    }

    process.stdout.write(
      `[${i + 1}/${TOTAL_ORDERS}] ${sideLabel} ${(qtyPAS / 1e8).toFixed(4)} PAS @ $${priceUSD}  ... `
    )

    try {
      const tx = await clob.placeLimitOrder(side, BigInt(price), qty, {
        value: side === 1 ? qty : 0n,
      })
      const receipt = await tx.wait()
      const status = receipt.status === 1 ? 'ok' : 'reverted'
      console.log(`${status}  (blk ${receipt.blockNumber})`)
      if (side === 0) buys++ ; else sells++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`FAILED -- ${msg}`)
      errors++
    }

    if (i < TOTAL_ORDERS - 1) await sleep(DELAY_MS)
  }

  console.log(`\nDone. sells=${sells}  buys=${buys}  errors=${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
