import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Datele unui singur ghid de check-in (pentru pagina oaspetelui). Pe adresa oaspetilor (ghid.abhomesiasi.ro) asta e
// singura ruta de date permisa - nu exista acces la restul bazei (vezi middleware.ts).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ cod: string }> }) {
  const cod = decodeURIComponent((await ctx.params).cod || '').trim()
  if (!cod || cod.length > 60) return NextResponse.json({ ok: false }, { status: 404 })
  const { data: apts } = await supabase.from('apartamente').select('id,nota,nume')
  const apt = (apts || []).find((a: any) => a.id === cod) || (apts || []).find((a: any) => (a.nota || '').toUpperCase() === cod.toUpperCase())
  if (!apt) return NextResponse.json({ ok: false }, { status: 404 })
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', 'ghid_apt_' + apt.id).maybeSingle()
  if (!data?.valoare) return NextResponse.json({ ok: false }, { status: 404 })
  let ghid: any = null
  try { ghid = JSON.parse(data.valoare) } catch { return NextResponse.json({ ok: false }, { status: 404 }) }
  return NextResponse.json({ ok: true, apt: { id: apt.id, nota: apt.nota, nume: apt.nume }, ghid }, { headers: { 'Cache-Control': 'no-store' } })
}
