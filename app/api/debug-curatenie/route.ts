import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const maine = '2026-05-31'
  const luni  = '2026-06-01'

  const [{ data: coMaine }, { data: coLuni }, { data: ciMaine }, { data: ciLuni }] = await Promise.all([
    supabase.from('rezervari').select('nume_client,nr_persoane,data_checkin,data_checkout,apartament:apartamente(nota,nume)').eq('data_checkout', maine).order('data_checkin'),
    supabase.from('rezervari').select('nume_client,nr_persoane,data_checkin,data_checkout,apartament:apartamente(nota,nume)').eq('data_checkout', luni).order('data_checkin'),
    supabase.from('rezervari').select('nume_client,nr_persoane,data_checkin,data_checkout,apartament:apartamente(nota,nume)').eq('data_checkin', maine).order('data_checkin'),
    supabase.from('rezervari').select('nume_client,nr_persoane,data_checkin,data_checkout,apartament:apartamente(nota,nume)').eq('data_checkin', luni).order('data_checkin'),
  ])

  return NextResponse.json({
    maine_plecari: coMaine,
    maine_sosiri: ciMaine,
    luni_plecari: coLuni,
    luni_sosiri: ciLuni,
  })
}
