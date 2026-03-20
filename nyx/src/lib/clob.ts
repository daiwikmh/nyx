export const WARDEN_CLOB_ADDRESS = '0x84e57567758B1143BD285eED2cbD574187a1D710' as const
export const USDC_ADDRESS = '0x0000000000000000000000000000000000000539' as const

export type TradingPair = {
  base: string
  quote: string
  baseAddress: string | null  // null = native asset
  quoteAddress: string
  active: boolean
  baseDecimals: number
  quoteDecimals: number
  priceDecimals: number
}

export const TRADING_PAIRS: TradingPair[] = [
  {
    base: 'PAS',
    quote: 'USDC',
    baseAddress: null,
    quoteAddress: USDC_ADDRESS,
    active: true,
    baseDecimals: 8,
    quoteDecimals: 6,
    priceDecimals: 6,
  },
  {
    base: 'MYTH',
    quote: 'USDC',
    baseAddress: '0x0000000000000000000000000000000000000BBE',
    quoteAddress: USDC_ADDRESS,
    active: false,
    baseDecimals: 18,
    quoteDecimals: 6,
    priceDecimals: 6,
  },
  {
    base: 'WETH',
    quote: 'USDC',
    baseAddress: '0x0000000000000000000000000000000000000BD0',
    quoteAddress: USDC_ADDRESS,
    active: false,
    baseDecimals: 18,
    quoteDecimals: 6,
    priceDecimals: 6,
  },
  {
    base: 'DED',
    quote: 'USDC',
    baseAddress: '0x0000000000000000000000000000000000000BBF',
    quoteAddress: USDC_ADDRESS,
    active: false,
    baseDecimals: 10,
    quoteDecimals: 6,
    priceDecimals: 6,
  },
]

// Volatility guard: DOT baseline $8.00, ±10% band
// Price format: 6-decimal fixed point (8_000_000 = $8.00)
// Quantity format: 6-decimal fixed point (1_000_000 = 1 DOT unit)
export const BASELINE_PRICE = 8_000_000n
export const MIN_VALID_PRICE = 7_200_001n // $7.20
export const MAX_VALID_PRICE = 8_799_999n // $8.80

export const CLOB_ABI = [
  // ── Read ────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'orders',
    stateMutability: 'view',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'user',     type: 'address' },
      { name: 'side',     type: 'uint8'   },
      { name: 'price',    type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'filled',   type: 'uint256' },
      { name: 'active',   type: 'bool'    },
    ],
  },
  {
    type: 'function',
    name: 'nextOrderId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'bestBid',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'bestAsk',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'liquidityAtBid',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'liquidityAtAsk',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalDOTLocked',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalUSDCLocked',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'stakingPoolId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // ── Write ────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'placeLimitOrder',
    stateMutability: 'payable',
    inputs: [
      { name: 'side',     type: 'uint8'   },
      { name: 'price',    type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
  // ── Events ────────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'OrderPlaced',
    inputs: [
      { name: 'orderId',  type: 'uint256', indexed: true  },
      { name: 'user',     type: 'address', indexed: true  },
      { name: 'side',     type: 'uint8',   indexed: false },
      { name: 'price',    type: 'uint256', indexed: false },
      { name: 'quantity', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderFilled',
    inputs: [
      { name: 'orderId',         type: 'uint256', indexed: true  },
      { name: 'filledAmount',    type: 'uint256', indexed: false },
      { name: 'remainingAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderSettled',
    inputs: [
      { name: 'orderId',      type: 'uint256', indexed: true  },
      { name: 'user',         type: 'address', indexed: true  },
      { name: 'filledAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BookUpdated',
    inputs: [
      { name: 'bestBid', type: 'uint256', indexed: false },
      { name: 'bestAsk', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'IdleDOTStaked',
    inputs: [
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'poolId', type: 'uint256', indexed: false },
    ],
  },
] as const

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const
