// Mesajele WhatsApp catre oaspete - comune pentru Calendar si fereastra rezervarii (tabul „WhatsApp”).
// Mutate din app/calendar/page.tsx neschimbate (Update 300), ca aceleasi texte sa se trimita de oriunde.
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { normalizeWaPhone } from '@/lib/supabase'

export function firstName(name:string){ return (name||'').split(' ')[0] }
export function waLink(phone:string, msg:string){
  const nr=normalizeWaPhone(phone)
  const encoded = encodeURIComponent(msg)
  return `https://wa.me/${nr}?text=${encoded}`
}

const nightsBetween = (a:string,b:string) => Math.round((new Date(b).getTime()-new Date(a).getTime())/(1000*60*60*24))

/* ── mesaje WhatsApp — aceleasi sabloane ca pe Dashboard/Rezervari, ca sa poti trimite
   confirmarea/datele de acces si direct din Calendar, fara sa mai treci prin alt tab ── */
export function fillVars(tmpl:string, vals:{nume?:string;apartament?:string;data_checkin?:string;data_checkout?:string}){
  return tmpl
    .replace(/\{nume\}/gi, vals.nume||'')
    .replace(/\{apartament\}/gi, vals.apartament||'')
    .replace(/\{data_checkin\}/gi, vals.data_checkin||'')
    .replace(/\{data_checkout\}/gi, vals.data_checkout||'')
}
export function msgCheckin(r:any, tmplGlobal?:string){
  const apt = r.apartament?.nume || 'apartament'
  const ci  = r.data_checkin ? format(new Date(r.data_checkin),'dd MMMM yyyy',{locale:ro}) : ''
  const nume = firstName(r.nume_client)
  // Mesajul personalizat pe apartament (Editează apartament → Mesaje) are prioritate fata de
  // sablonul global din Setari — la fel ca la msgCheckoutGen mai jos.
  const tmpl = r.apartament?.mesaj_checkin || tmplGlobal
  if(tmpl) return fillVars(tmpl,{nume,apartament:apt,data_checkin:ci})
  return `Bună ziua, ${nume}! 👋\n\nVă confirmăm rezervarea la *${apt}* pentru data de *${ci}*.\n\nVă așteptăm cu drag! La sosire, vă rugăm să ne anunțați și vă transmitem detaliile de acces.\n\nEchipa AB Homes Iași`
}
export function msgAcces(r:any, tmpl?:string){
  const apt = r.apartament?.nume || 'apartament'
  const nume = firstName(r.nume_client)
  if(tmpl) return fillVars(tmpl,{nume,apartament:apt})
  return `Bună ziua, ${nume}! 🏠\n\nIată detaliile de acces pentru *${apt}*:\n\n🔑 *Cod intrare bloc:* _completați_\n🚪 *Etaj / Apartament:* _completați_\n📱 *Cutia cu cheia:* _completați_ | Cod: _completați_\n\n📍 _adresa completă_\n\nO ședere plăcută! Ne puteți contacta oricând. 😊\nEchipa AB Homes Iași`
}
export function applyVars(tmpl:string, nume:string, apt:string, co:string){
  return tmpl.replace(/\{nume\}/gi,nume).replace(/\{apartament\}/gi,apt).replace(/\{data_checkout\}/gi,co).replace(/\{data\}/gi,co)
}
export function msgCheckoutGen(r:any, sabloane:Record<string,string>){
  const apt = r.apartament?.nume || 'apartament'
  const aptId = r.apartament?.id || ''
  const co  = r.data_checkout ? format(new Date(r.data_checkout),'dd MMMM yyyy',{locale:ro}) : ''
  const nume = firstName(r.nume_client)
  const sablon = sabloane[aptId]
  if(sablon) return applyVars(sablon,nume,apt,co)
  // Mesajul personalizat pe apartament (Editează apartament → Mesaje) — a doua prioritate,
  // sub sabloanele dedicate din Șabloane Mesaje, deasupra textului generic de mai jos.
  const aptMsg = r.apartament?.mesaj_checkout
  if(aptMsg) return applyVars(aptMsg,nume,apt,co)
  return `Bună ziua, ${nume}! 🌅\n\nVă reamintim că astăzi, *${co}*, este ziua check-out-ului din *${apt}*.\n\n⏰ *Ora de check-out:* 11:00\n🔑 *Cheia:* vă rugăm să o lăsați în cutia de la ușă / recepție\n\nVă mulțumim că ați ales AB Homes Iași și sperăm să vă revedem curând! ⭐\nEchipa AB Homes`
}
// Confirmare completa a rezervarii (apartament + perioada + pret) — distinct de msgCheckin,
// care e un reminder de sosire ("aveti ASTAZI o rezervare"), nu o confirmare de rezervare in sine
export function msgConfirmareRezervare(r:any){
  const apt = r.apartament?.nume || 'apartament'
  const ci  = r.data_checkin ? format(new Date(r.data_checkin),'dd MMMM yyyy',{locale:ro}) : ''
  const co  = r.data_checkout ? format(new Date(r.data_checkout),'dd MMMM yyyy',{locale:ro}) : ''
  const nopti = r.data_checkin && r.data_checkout ? nightsBetween(r.data_checkin, r.data_checkout) : null
  const nume = firstName(r.nume_client)
  return `Bună ziua, ${nume}! 👋\n\nVă confirmăm rezervarea la *${apt}*.\n\n📅 *Check-in:* ${ci}\n📅 *Check-out:* ${co}${nopti?`\n🌙 *Nopți:* ${nopti}`:''}${r.suma_incasata?`\n💰 *Total:* ${r.suma_incasata} ${r.moneda||'RON'}`:''}\n\nImediat ce locația e pregătită, primiți aici datele de acces.\n\nEchipa AB Homes Iași`
}
export function msgGataAcces(r:any, sabloane:Record<string,string>){
  const apt = r.apartament?.nume || 'apartament'
  const aptId = r.apartament?.id || ''
  const nume = firstName(r.nume_client)
  const sablon = sabloane[aptId] || sabloane['__global__']
  if(sablon) return applyVars(sablon,nume,apt,'')
  return `Bună ziua, ${nume}! 🏠\n\nVă las aici datele de acces pentru locația dumneavoastră de astăzi, *${apt}*.\n\nO ședere plăcută! Ne puteți contacta oricând. 😊\nEchipa AB Homes Iași`
}


// Mesajele proprii (cerut direct: „să avem o secțiune separată de WhatsApp unde să avem mai multe mesaje prestabilite pe care
// să le putem trimite direct”) - in setari „wa_mesaje_proprii”, comune pe orice dispozitiv; variabilele se completeaza din rezervare
export const CHEIE_MESAJE_PROPRII = 'wa_mesaje_proprii'
export type MesajPropriu = { id: string; titlu: string; text: string }
export const VARIABILE_MESAJ: [string, string][] = [
  ['{nume}', 'prenumele'], ['{nume_complet}', 'numele complet'], ['{apartament}', 'apartamentul'], ['{checkin}', 'data sosirii'],
  ['{checkout}', 'data plecării'], ['{nopti}', 'nopți'], ['{persoane}', 'persoane'], ['{pret}', 'totalul'], ['{cod}', 'cod rezervare'],
]
export function citesteMesajeProprii(v: string | null | undefined): MesajPropriu[] {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.titlu === 'string' && typeof x.text === 'string').map(x => ({ id: String(x.id || Math.random().toString(36).slice(2)), titlu: x.titlu, text: x.text })) : [] } catch { return [] }
}
export function completeazaMesaj(text: string, r: any, aptNume?: string): string {
  const zi = (d?: string) => d ? format(new Date(d + 'T12:00:00'), 'dd MMMM yyyy', { locale: ro }) : ''
  const n = r?.data_checkin && r?.data_checkout ? nightsBetween(r.data_checkin, r.data_checkout) : ''
  const total = Number(r?.valoare_bruta) > 0 ? `${Number(r.valoare_bruta).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} ${r?.moneda || 'RON'}` : ''
  const v: Record<string, string> = {
    nume: firstName(r?.nume_client || ''), nume_complet: String(r?.nume_client || ''), apartament: aptNume || r?.apartament?.nume || '',
    checkin: zi(r?.data_checkin), checkout: zi(r?.data_checkout), data_checkin: zi(r?.data_checkin), data_checkout: zi(r?.data_checkout),
    nopti: String(n), persoane: String(r?.nr_persoane || ''), pret: total, cod: String(r?.cod_rezervare_platforma || ''),
  }
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m))
}
