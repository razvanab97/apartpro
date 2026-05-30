import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('rezervari')
    .select('nume_client,nr_persoane,valoare_bruta,suma_incasata,nr_nopti,data_checkin,data_checkout,apartament:apartamente(nota)')
    .or(`data_checkin.eq.${today},data_checkout.eq.${today}`)
  return NextResponse.json(data?.map((r:any)=>({
    apt: r.apartament?.nota,
    client: r.nume_client,
    ci: r.data_checkin,
    co: r.data_checkout,
    nr_persoane: r.nr_persoane,
    valoare_bruta: r.valoare_bruta,
    suma_incasata: r.suma_incasata,
    nr_nopti: r.nr_nopti,
  })))
}
