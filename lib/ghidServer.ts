import { supabase } from '@/lib/supabase'
import { ghidNou, type Ghid } from '@/lib/ghid'

// Citirea unui ghid public pe server (pagina /ghid/<COD> si ruta /api/ghid/<COD>) - doar ghidul acela.
export async function incarcaGhidPublic(codBrut: string): Promise<{ apt: { id: string; nota: string | null; nume: string }; ghid: Ghid } | null> {
  const cod = decodeURIComponent(codBrut || '').trim()
  if (!cod || cod.length > 60) return null
  const { data: apts } = await supabase.from('apartamente').select('id,nota,nume')
  const apt = (apts || []).find((a: any) => a.id === cod) || (apts || []).find((a: any) => (a.nota || '').toUpperCase() === cod.toUpperCase())
  if (!apt) return null
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', 'ghid_apt_' + apt.id).maybeSingle()
  if (!data?.valoare) return null
  try { return { apt: { id: apt.id, nota: apt.nota, nume: apt.nume }, ghid: { ...ghidNou(), ...JSON.parse(data.valoare) } } } catch { return null }
}
