import { NextRequest, NextResponse } from 'next/server'
import { incarcaGhidPublic } from '@/lib/ghidServer'

// Datele unui singur ghid de check-in. Pe adresa oaspetilor asta e singura ruta de date permisa (vezi middleware.ts).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ cod: string }> }) {
  const r = await incarcaGhidPublic((await ctx.params).cod)
  if (!r) return NextResponse.json({ ok: false }, { status: 404 })
  return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'no-store' } })
}
