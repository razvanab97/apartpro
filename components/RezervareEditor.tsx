'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase, type Apartament } from '@/lib/supabase'
import RezervareModal from '@/components/RezervareModal'
import { SELECT_REZERVARE, cuApartament, cuComision, decont, salveazaRezervare } from '@/lib/rezervareEdit'

// Formularul complet de rezervare, deschis din alte locuri decat pagina Rezervari (ex. calendarul).
// Incarca rezervarea proaspat din baza de date (nu obiectul din calendar, care are campuri partiale)
// si salveaza exact ca pagina Rezervari.
export default function RezervareEditor({ rezervareId, onClose, onSaved, extra }: {
  rezervareId: string
  onClose: () => void
  onSaved?: () => void
  extra?: (editing: any) => ReactNode
}) {
  const [editing, setEditing] = useState<any>(null)
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  useEffect(() => {
    let activ = true
    Promise.all([
      supabase.from('rezervari').select(SELECT_REZERVARE).eq('id', rezervareId).single(),
      supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').eq('status', 'activ').order('nume'),
    ]).then(([rez, apt]) => {
      if (!activ) return
      if (rez.error || !rez.data) { setEroare(rez.error?.message || 'Rezervarea nu a fost găsită'); return }
      setEditing(rez.data)
      setApartamente((apt.data as Apartament[]) || [])
    })
    return () => { activ = false }
  }, [rezervareId])

  async function save() {
    setSaving(true)
    const err = await salveazaRezervare(editing, apartamente)
    setSaving(false)
    if (err) { alert('Eroare: ' + err); return }
    onSaved?.()
    onClose()
  }

  if (eroare) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,10,20,0.74)' }}>
        <div style={{ padding: '16px 20px', borderRadius: 12, background: '#0D1A2B', border: '1px solid rgba(248,113,113,0.35)', color: '#F87171', fontSize: 13 }}>⚠ {eroare}</div>
      </div>
    )
  }
  if (!editing) return null

  return (
    <RezervareModal open editing={editing} setEditing={setEditing} apartamente={apartamente}
      onAptChange={id => setEditing((p: any) => cuApartament(p, id, apartamente))}
      recalcComisionPlatforma={(b, pct) => setEditing((p: any) => cuComision(p, b, pct))}
      calcul={decont(editing, apartamente)} saving={saving} onSave={save} onClose={onClose}
      onReload={onSaved} extra={extra} />
  )
}
