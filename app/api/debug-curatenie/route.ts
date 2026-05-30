import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  const [{ data: co, error: e1 }, { data: ci, error: e2 }] = await Promise.all([
    supabase.from('rezervari')
      .select('id,nume_client,nr_persoane,status_rezervare,apartament:apartamente(id,nume,nota,adresa)')
      .eq('data_checkout', today),
    supabase.from('rezervari')
      .select('id,nume_client,nr_persoane,status_rezervare,apartament:apartamente(id,nume,nota,adresa)')
      .eq('data_checkin', today),
  ])

  return NextResponse.json({
    today,
    co_count: co?.length ?? 0,
    ci_count: ci?.length ?? 0,
    co_error: e1?.message,
    ci_error: e2?.message,
    co: co?.map(r => ({ id: r.id, nume: r.nume_client, status: r.status_rezervare, apt: (r.apartament as any)?.nota })),
    ci: ci?.map(r => ({ id: r.id, nume: r.nume_client, status: r.status_rezervare, apt: (r.apartament as any)?.nota })),
  })
}
