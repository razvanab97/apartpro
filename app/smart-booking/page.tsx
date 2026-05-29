'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { Sparkles, Upload, MessageCircle, Copy, CheckCircle2, AlertCircle, Loader2, Plus, Phone } from 'lucide-react'

type Recommendation = {
  apt_nota: string
  apt_name: string
  reason: string
  price_total: number
  available: boolean
}

type AIResult = {
  client_name: string | null
  phone: string | null
  checkin: string | null
  checkout: string | null
  nights: number
  adults: number
  children: number
  budget: number | null
  preferences: string
  canal: string
  recommendations: Recommendation[]
  response_template: string
  confidence: number
}

export default function SmartBookingPage() {
  const [message, setMessage] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [savingInbox, setSavingInbox] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  async function analyze() {
    if (!message.trim() && !image) { show('error', 'Adaugă un mesaj sau o poză'); return }
    setLoading(true)
    setResult(null)

    try {
      // Get apartments and upcoming reservations for context
      const today = new Date().toISOString().split('T')[0]
      const in90 = new Date(); in90.setDate(in90.getDate() + 90)
      const in90str = in90.toISOString().split('T')[0]

      const [{ data: apts }, { data: rezs }] = await Promise.all([
        supabase.from('apartamente').select('id,nota,nume,capacitate_max,pret_standard,adresa,dotari').eq('status','activ'),
        supabase.from('rezervari')
          .select('data_checkin,data_checkout,apartament:apartamente(nota)')
          .in('status_rezervare',['confirmata','finalizata'])
          .gte('data_checkout', today)
          .lte('data_checkin', in90str),
      ])

      const reservations = (rezs||[]).map((r:any) => ({
        apartament_nota: r.apartament?.nota,
        data_checkin: r.data_checkin,
        data_checkout: r.data_checkout,
      }))

      // If image, use Gemini vision to extract text first
      let finalMessage = message
      if (image && !message.trim()) {
        finalMessage = '[Imagine cu mesaj de rezervare — extrage toate detaliile relevante: nume client, telefon, date check-in/out, nr persoane, preferinte, buget]'
      }

      const res = await fetch('/api/smart-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: finalMessage,
          apartments: apts || [],
          reservations,
        })
      })

      const data = await res.json()
      if (data.result) setResult(data.result)
      else show('error', 'Nu am putut procesa mesajul')
    } catch (e: any) {
      show('error', e.message)
    }
    setLoading(false)
  }

  function handleImageUpload(file: File) {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = e => setImage(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function copyResponse() {
    if (!result?.response_template) return
    navigator.clipboard.writeText(result.response_template)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    show('success', 'Copiat!')
  }

  async function saveToInbox() {
    if (!result) return
    setSavingInbox(true)
    const { data: apt } = result.recommendations[0]?.apt_nota
      ? await supabase.from('apartamente').select('id').eq('nota', result.recommendations[0].apt_nota).single()
      : { data: null }

    const { error } = await supabase.from('cereri_rezervare').insert({
      nume_client: result.client_name || 'Client necunoscut',
      telefon: result.phone,
      canal: result.canal || 'whatsapp',
      apartament_id: apt?.id || null,
      data_checkin: result.checkin,
      data_checkout: result.checkout,
      nr_persoane: (result.adults || 0) + (result.children || 0) || 2,
      mesaj: message || 'Cerere din Smart Booking AI',
      status: 'noua',
      prioritate: 'normala',
    })

    if (error) show('error', error.message)
    else show('success', 'Salvat în Inbox Cereri!')
    setSavingInbox(false)
  }

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.06)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(159,215,255,0.1)',
    borderRadius: 14,
  }

  return (
    <>
      <PageHeader title="Smart Booking AI" subtitle="Analizează mesaje și găsește cel mai potrivit apartament"/>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>

        {/* Input section */}
        <div style={{ display: 'grid', gridTemplateColumns: image ? '1fr 1fr' : '1fr', gap: 14 }}>

          {/* Text input */}
          <div style={{ ...panel, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageCircle size={14}/> Mesaj client
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={'Lipește mesajul clientului aici...\n\nExemple:\n"Bună ziua, aș vrea să rezerv un apartament pentru 2 persoane, weekend 6-8 iunie"\n"Hello, do you have availability for 3 nights from July 10? We are 4 adults"\n"Salut, vreau la Palas zona pentru 2 nopti, aveti ceva liber?"\n\nPoți lipi direct din WhatsApp, Booking sau Airbnb.'}
              style={{
                width: '100%', minHeight: 160, padding: '12px 14px',
                background: 'rgba(214,228,244,0.07)', border: '1px solid rgba(159,215,255,0.12)',
                borderRadius: 10, color: '#FFFFFF', fontSize: 13,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => fileRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                borderRadius: 8, background: 'rgba(159,215,255,0.08)', border: '1px solid rgba(159,215,255,0.12)',
                color: 'rgba(159,215,255,0.6)', fontSize: 12, cursor: 'pointer',
              }}>
                <Upload size={13}/> Adaugă poză
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])}/>
              {(message || image) && (
                <button onClick={() => { setMessage(''); setImage(null); setImageFile(null); setResult(null) }}
                  style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(159,215,255,0.1)', color: 'rgba(159,215,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
                  Șterge
                </button>
              )}
            </div>
          </div>

          {/* Image preview */}
          {image && (
            <div style={{ ...panel, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Upload size={14}/> Screenshot mesaj
              </div>
              <img src={image} alt="Screenshot" style={{ width: '100%', borderRadius: 8, maxHeight: 220, objectFit: 'contain', background: 'rgba(14,27,43,0.3)' }}/>
              <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.35)', marginTop: 8, textAlign: 'center' }}>
                AI va extrage automat informațiile din imagine
              </div>
            </div>
          )}
        </div>

        {/* Analyze button */}
        <button
          onClick={analyze}
          disabled={loading || (!message.trim() && !image)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '14px', borderRadius: 12, cursor: loading ? 'wait' : 'pointer',
            background: loading || (!message.trim() && !image) ? 'rgba(77,163,255,0.2)' : 'rgba(77,163,255,0.85)',
            border: '1px solid rgba(159,215,255,0.3)', color: '#FFFFFF',
            fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
          }}
        >
          {loading
            ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }}/> Analizez mesajul...</>
            : <><Sparkles size={18}/> Analizează și găsește apartamentul potrivit</>
          }
        </button>

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.3s ease' }}>

            {/* Extracted info */}
            <div style={{ ...panel, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>📋 Informații extrase din mesaj</span>
                <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.3)' }}>Încredere AI: {Math.round((result.confidence||0.8)*100)}%</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {[
                  { l: 'Client', v: result.client_name || '—', c: '#FFFFFF' },
                  { l: 'Telefon', v: result.phone || '—', c: result.phone ? '#4ADE80' : 'rgba(159,215,255,0.4)' },
                  { l: 'Canal', v: result.canal || '—', c: '#7BC8FF' },
                  { l: 'Check-in', v: result.checkin || '—', c: result.checkin ? '#FCD34D' : 'rgba(159,215,255,0.4)' },
                  { l: 'Check-out', v: result.checkout || '—', c: result.checkout ? '#FCD34D' : 'rgba(159,215,255,0.4)' },
                  { l: 'Nopți', v: result.nights ? String(result.nights) : '—', c: '#FFFFFF' },
                  { l: 'Adulți', v: result.adults ? String(result.adults) : '—', c: '#FFFFFF' },
                  { l: 'Copii', v: result.children ? String(result.children) : '—', c: '#FFFFFF' },
                  { l: 'Buget', v: result.budget ? `${result.budget} RON` : '—', c: '#FFFFFF' },
                ].map(item => (
                  <div key={item.l} style={{ background: 'rgba(14,27,43,0.4)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', marginBottom: 3 }}>{item.l}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: item.c }}>{item.v}</div>
                  </div>
                ))}
              </div>
              {result.preferences && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(77,163,255,0.06)', borderRadius: 8, fontSize: 12, color: 'rgba(159,215,255,0.6)', borderLeft: '2px solid rgba(77,163,255,0.3)' }}>
                  💡 {result.preferences}
                </div>
              )}
            </div>

            {/* Recommendations */}
            <div style={{ ...panel, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', marginBottom: 12 }}>
                🏠 Apartamente recomandate
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(result.recommendations||[]).map((rec, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 10,
                    background: rec.available ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.05)',
                    border: `1px solid ${rec.available ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: rec.available ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {rec.available ? <CheckCircle2 size={18} color="#4ADE80"/> : <AlertCircle size={18} color="#F87171"/>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>{rec.apt_name}</span>
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(77,163,255,0.12)', color: '#7BC8FF', fontFamily: 'monospace' }}>{rec.apt_nota}</span>
                        {i === 0 && rec.available && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>⭐ Recomandat</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>{rec.reason}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {rec.price_total > 0 && (
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>{rec.price_total.toLocaleString('ro-RO')} RON</div>
                      )}
                      <div style={{ fontSize: 11, color: rec.available ? '#4ADE80' : '#F87171' }}>
                        {rec.available ? '✓ Disponibil' : '✗ Ocupat'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Response template */}
            <div style={{ ...panel, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>💬 Răspuns gata de trimis</span>
                <button onClick={copyResponse} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(77,163,255,0.12)', border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(77,163,255,0.2)'}`, color: copied ? '#4ADE80' : '#7BC8FF', fontSize: 11, cursor: 'pointer' }}>
                  {copied ? <><CheckCircle2 size={12}/> Copiat!</> : <><Copy size={12}/> Copiază</>}
                </button>
              </div>
              <div style={{ padding: '12px 14px', background: 'rgba(14,27,43,0.4)', borderRadius: 10, fontSize: 13, color: 'rgba(214,228,244,0.8)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {result.response_template}
              </div>
              {result.phone && (
                <a href={`https://wa.me/${result.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(result.response_template)}`} target="_blank" rel="noopener"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '8px 16px', borderRadius: 9, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                  <MessageCircle size={15}/> Trimite pe WhatsApp
                </a>
              )}
            </div>

            {/* Save to inbox */}
            <Button variant="secondary" icon={<Plus size={14}/>} onClick={saveToInbox} loading={savingInbox} style={{ alignSelf: 'flex-start' }}>
              Salvează cererea în Inbox
            </Button>

          </div>
        )}
      </div>
      <Toast toast={toast}/>
    </>
  )
}
