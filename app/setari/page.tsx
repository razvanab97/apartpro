'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/Layout'
import { Button, Card, CardHeader, CardTitle, FormGroup, FormRow, Toast, useToast, Alert } from '@/components/ui'
import { Settings, Database, Link2, Info } from 'lucide-react'

export default function SetariPage() {
  const [tab, setTab] = useState<'general'|'conexiuni'|'despre'>('general')
  const [saved, setSaved] = useState(false)
  const { toast, show } = useToast()

  const tabs = [
    { key: 'general', label: 'General', icon: Settings },
    { key: 'conexiuni', label: 'Conexiuni', icon: Link2 },
    { key: 'despre', label: 'Despre', icon: Info },
  ]

  return (
    <>
      <PageHeader title="Setări" subtitle="Configurare platformă ApartPro" />
      <div className="p-6">
        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background:'var(--bg3)' }}>
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={()=>setTab(key as any)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: tab===key?'var(--bg2)':'transparent', color: tab===key?'var(--text)':'var(--text3)', boxShadow: tab===key?'0 1px 4px rgba(0,0,0,0.3)':'' }}>
              <Icon size={14}/>{label}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div className="max-w-xl space-y-5">
            <Card>
              <CardHeader><CardTitle>Date firmă</CardTitle></CardHeader>
              <FormGroup><label>Nume firmă</label><input defaultValue="ApartPro SRL" placeholder="Numele firmei"/></FormGroup>
              <FormRow cols={2}>
                <FormGroup><label>Email contact</label><input defaultValue="office@apartpro.ro" type="email"/></FormGroup>
                <FormGroup><label>Telefon / WhatsApp</label><input defaultValue="+40 740 123 456"/></FormGroup>
              </FormRow>
              <FormGroup><label>CUI firmă</label><input placeholder="RO12345678"/></FormGroup>
              <FormGroup><label>Adresă sediu</label><input placeholder="Str. Exemplu, nr. 1, Iași"/></FormGroup>
              <Button variant="primary" onClick={()=>show('success','Setări salvate!')} className="mt-2">Salvează</Button>
            </Card>
            <Card>
              <CardHeader><CardTitle>Setări implicite rezervări</CardTitle></CardHeader>
              <FormRow cols={2}>
                <FormGroup><label>Oră default check-in</label><input type="time" defaultValue="15:00"/></FormGroup>
                <FormGroup><label>Oră default check-out</label><input type="time" defaultValue="11:00"/></FormGroup>
              </FormRow>
              <FormRow cols={2}>
                <FormGroup>
                  <label>Comision implicit (%)</label>
                  <input type="number" defaultValue={20} min={0} max={100}/>
                </FormGroup>
                <FormGroup>
                  <label>Formulă implicită</label>
                  <select defaultValue="procent_net_dupa_costuri">
                    <option value="procent_brut">% din brut</option>
                    <option value="procent_net_platforme">% net după platforme</option>
                    <option value="procent_net_dupa_costuri">% net după costuri</option>
                    <option value="fix_lunar">Fix lunar</option>
                  </select>
                </FormGroup>
              </FormRow>
              <Button variant="primary" onClick={()=>show('success','Setări salvate!')} className="mt-2">Salvează</Button>
            </Card>
          </div>
        )}

        {tab === 'conexiuni' && (
          <div className="max-w-xl space-y-5">
            <Alert type="info" message="Integrările iCal permit importul automat al rezervărilor din Airbnb și Booking."/>
            <Card>
              <CardHeader><CardTitle>🔴 Airbnb iCal</CardTitle></CardHeader>
              <FormGroup>
                <label>Link iCal Airbnb (global sau per apartament)</label>
                <input placeholder="webcal://www.airbnb.com/calendar/ical/..."/>
              </FormGroup>
              <Button variant="secondary" onClick={()=>show('info','Sincronizare iCal — disponibil în versiunea next')}>Sincronizează</Button>
            </Card>
            <Card>
              <CardHeader><CardTitle>🔵 Booking.com iCal</CardTitle></CardHeader>
              <FormGroup>
                <label>Link iCal Booking</label>
                <input placeholder="https://ical.booking.com/v1/..."/>
              </FormGroup>
              <Button variant="secondary" onClick={()=>show('info','Sincronizare iCal — disponibil în versiunea next')}>Sincronizează</Button>
            </Card>
            <Card>
              <CardHeader><CardTitle>📱 WhatsApp Business</CardTitle></CardHeader>
              <Alert type="info" message="Integrarea WhatsApp pentru trimitere automată mesaje — disponibil în versiunea next."/>
            </Card>
          </div>
        )}

        {tab === 'despre' && (
          <div className="max-w-xl">
            <Card>
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🏢</div>
                <h2 className="text-xl font-bold mb-1" style={{ color:'var(--text)' }}>ApartPro</h2>
                <p className="text-sm mb-4" style={{ color:'var(--text3)' }}>Platformă de administrare apartamente în regim hotelier</p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono" style={{ background:'var(--bg3)', color:'var(--accent)' }}>
                  v1.0.0 · MVP
                </div>
              </div>
              <div className="space-y-2 text-sm border-t pt-4" style={{ borderColor:'var(--border)' }}>
                <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>Stack</span><span style={{ color:'var(--text)' }}>Next.js 14 · Supabase · Vercel</span></div>
                <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>Bază de date</span><span style={{ color:'var(--text)' }}>PostgreSQL (Supabase)</span></div>
                <div className="flex justify-between"><span style={{ color:'var(--text3)' }}>Hosting</span><span style={{ color:'var(--text)' }}>Vercel</span></div>
              </div>
            </Card>
          </div>
        )}
      </div>
      <Toast toast={toast}/>
    </>
  )
}
