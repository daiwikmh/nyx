import { NextRequest, NextResponse } from 'next/server'
import {
  getChatId,
  sendNotification,
  formatOrderPlaced,
  formatOrderFilled,
  formatOrderSettled,
  formatIdleDOTStaked,
} from '@/lib/telegram'

const formatters: Record<string, (data: any) => string> = {
  OrderPlaced: formatOrderPlaced,
  OrderFilled: formatOrderFilled,
  OrderSettled: formatOrderSettled,
  IdleDOTStaked: formatIdleDOTStaked,
}

export async function POST(req: NextRequest) {
  const { wallet, event, data } = await req.json()
  const chatId = getChatId(wallet)
  if (!chatId) return NextResponse.json({ sent: false })

  const formatter = formatters[event]
  if (!formatter) return NextResponse.json({ sent: false })

  await sendNotification(chatId, formatter(data))
  return NextResponse.json({ sent: true })
}
