import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase.from('rezervari').insert({
    apartament_id: null,
    nume_client: 'TEST_DELETE',
    data_checkin: '2026-01-01',
    data_checkout: '2026-01-03',
    nr_persoane: 1,
    valoare_bruta: 100,
    suma_incasata: 100,
    moneda: 'RON',
    canal: 'intern',
    status_rezervare: 'confirmata',
    status_plata: 'neachitat',
    status_decont: 'nedecontat',
  }).select().single()
  if(data?.id) await supabase.from('rezervari').delete().eq('id', data.id)
  return NextResponse.json({ ok: !!data, error: error?.message, code: error?.code })
}
