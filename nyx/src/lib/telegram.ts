// server-only telegram bot utilities
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const API = `https://api.telegram.org/bot${TOKEN}`

const walletToChat = new Map<string, string>()
let updateOffset = 0
let polling = false

export async function processUpdates() {
  if (!TOKEN || polling) return
  polling = true
  try {
    const res = await fetch(`${API}/getUpdates?offset=${updateOffset}&timeout=0`)
    if (!res.ok) return
    const { result } = (await res.json()) as {
      result: Array<{
        update_id: number
        message?: { chat: { id: number }; text?: string }
      }>
    }
    for (const u of result) {
      updateOffset = u.update_id + 1
      const text = u.message?.text?.trim()
      if (!text?.startsWith('/start 0x')) continue
      const wallet = text.slice(7).toLowerCase()
      const chatId = String(u.message!.chat.id)
      walletToChat.set(wallet, chatId)
      const short = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
      await sendNotification(chatId, `Nyx linked to <code>${short}</code>\nYou will receive trade notifications here.`)
    }
  } finally {
    polling = false
  }
}

export function isLinked(wallet: string): boolean {
  return walletToChat.has(wallet.toLowerCase())
}

export function getChatId(wallet: string): string | undefined {
  return walletToChat.get(wallet.toLowerCase())
}

export async function sendNotification(chatId: string, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export function formatOrderPlaced(data: {
  orderId: string; side: number; price: string; quantity: string
}) {
  const sideLabel = data.side === 0 ? 'BUY' : 'SELL'
  const p = (Number(data.price) / 1e6).toFixed(4)
  const q = (Number(data.quantity) / 1e8).toFixed(4)
  return `<b>Order Placed</b>\n#${data.orderId} ${sideLabel} ${q} PAS @ $${p}`
}

export function formatOrderFilled(data: {
  orderId: string; filledAmount: string; remainingAmount: string
}) {
  const f = (Number(data.filledAmount) / 1e8).toFixed(4)
  const r = (Number(data.remainingAmount) / 1e8).toFixed(4)
  return `<b>Order Filled</b>\n#${data.orderId} filled ${f}, remaining ${r}`
}

export function formatOrderSettled(data: { orderId: string }) {
  return `<b>Order Settled</b>\n#${data.orderId} fully settled`
}

export function formatIdleDOTStaked(data: { amount: string; poolId: string }) {
  const a = (Number(data.amount) / 1e8).toFixed(4)
  return `<b>Idle DOT Staked</b>\n${a} PAS staked to pool #${data.poolId}`
}
