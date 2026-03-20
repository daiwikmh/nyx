import { NextRequest, NextResponse } from 'next/server'
import { processUpdates, isLinked } from '@/lib/telegram'

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')
  if (!wallet) return NextResponse.json({ linked: false })
  await processUpdates()
  return NextResponse.json({ linked: isLinked(wallet) })
}
