'use client'

import { useEffect, useState } from 'react'
import { Check, CheckCheck, Copy, Loader2, MapPin, RotateCcw, Shuffle, Undo2, X } from 'lucide-react'
import { Toast, useToast } from '@/components/ui'
import { generateBatch, generateOne, getCountyOptions, getRemaining, getTotal, loadExtraLocs, resetUsed, type AdresaCard } from '@/lib/locatii-romania'
import styles from './GeneratorLocatii.module.css'

const STORAGE_KEY = 'loc_used_v1'
const REGIONS = { bucuresti: 'București', moldova: 'Moldova', alte: 'România' }

function readUsed(): Set<number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(value) ? value.filter((idx): idx is number => Number.isInteger(idx) && idx >= 0) : [])
  } catch { return new Set() }
}

function fullAddress(card: AdresaCard): string {
  return `${card.adresa}, ${card.localitate}, ${card.judet}`
}

function takenIndexes(used: Set<number>, cards: AdresaCard[]): Set<number> {
  return new Set([...used, ...cards.map(card => card.idx)])
}

export default function GeneratorLocatii() {
  const [used, setUsed] = useState<Set<number>>(new Set())
  const [batch, setBatch] = useState<AdresaCard[]>([])
  const [county, setCounty] = useState('')
  const [countyCard, setCountyCard] = useState<AdresaCard | null>(null)
  const [count, setCount] = useState(4)
  const [ready, setReady] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [resetScope, setResetScope] = useState<'all' | 'county' | null>(null)
  const [undo, setUndo] = useState<{ used: Set<number>; batch: AdresaCard[]; countyCard: AdresaCard | null } | null>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    let active = true
    loadExtraLocs().then(() => {
      if (!active) return
      const stored = readUsed()
      setUsed(stored)
      setBatch(generateBatch(stored, 4))
      setReady(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      const stored = readUsed()
      const nextBatch = generateBatch(stored, count)
      setUsed(stored)
      setBatch(nextBatch)
      setCountyCard(county ? generateOne(takenIndexes(stored, nextBatch), county) : null)
      setUndo(null)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [ready, county, count])

  useEffect(() => {
    if (!copiedKey) return
    const timer = setTimeout(() => setCopiedKey(null), 1600)
    return () => clearTimeout(timer)
  }, [copiedKey])

  const counties = getCountyOptions(used)
  const total = getTotal()
  const remaining = getRemaining(used)
  const usedCount = total - remaining
  const selectedCounty = counties.find(option => option.judet === county)

  function persist(next: Set<number>) {
    setUsed(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) }
    catch { show('error', 'Istoricul nu poate fi salvat pe acest dispozitiv.') }
  }

  function changeCounty(nextCounty: string) {
    setCounty(nextCounty)
    setCountyCard(nextCounty ? generateOne(takenIndexes(used, batch), nextCounty) : null)
    setResetScope(null)
    setUndo(null)
  }

  function changeCount(nextCount: number) {
    setCount(nextCount)
    setBatch(generateBatch(takenIndexes(used, countyCard ? [countyCard] : []), nextCount))
    setResetScope(null)
    setUndo(null)
  }

  function refresh() {
    const reserved = takenIndexes(used, countyCard ? [countyCard] : [])
    const next = generateBatch(takenIndexes(reserved, batch), count)
    next.push(...generateBatch(takenIndexes(reserved, next), count - next.length))
    setBatch(next)
    if (county && !countyCard) setCountyCard(generateOne(takenIndexes(used, next), county))
    setCopiedKey(null)
  }

  function refreshCounty() {
    if (!county) return
    const reserved = takenIndexes(used, batch)
    const different = generateOne(takenIndexes(reserved, countyCard ? [countyCard] : []), county)
    setCountyCard(different || countyCard || generateOne(reserved, county))
    setCopiedKey(null)
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
    } catch { show('error', 'Adresa nu a putut fi copiată. Încearcă din nou.') }
  }

  function markUsed(card: AdresaCard, manual: boolean) {
    setUndo({ used: new Set(used), batch: [...batch], countyCard })
    const nextUsed = new Set(used).add(card.idx)
    persist(nextUsed)
    if (manual) {
      setCountyCard(generateOne(takenIndexes(nextUsed, batch), county))
    } else {
      const excluded = takenIndexes(nextUsed, [...batch, ...(countyCard ? [countyCard] : [])])
      const replacement = generateOne(excluded)
      const nextBatch = batch.flatMap(item => item.idx === card.idx ? replacement ? [replacement] : [] : [item])
      setBatch(nextBatch)
      if (county && !countyCard) setCountyCard(generateOne(takenIndexes(nextUsed, nextBatch), county))
    }
    setResetScope(null)
  }

  function restore() {
    if (!undo) return
    persist(undo.used)
    setBatch(undo.batch)
    setCountyCard(undo.countyCard)
    setUndo(null)
  }

  function reset() {
    const nextUsed = resetUsed(used, resetScope === 'county' ? county : undefined)
    persist(nextUsed)
    const nextBatch = resetScope === 'county' ? batch : generateBatch(nextUsed, count)
    setBatch(nextBatch)
    setCountyCard(county ? generateOne(takenIndexes(nextUsed, nextBatch), county) : null)
    setResetScope(null)
    setUndo(null)
  }

  function renderCard(card: AdresaCard, index: number, manual = false) {
    return <article className={styles.card} key={card.idx} aria-label={`${manual ? 'Adresă suplimentară' : `Adresa ${index + 1}`}: ${card.localitate}, ${card.judet}`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIndex}>{manual ? 'La alegere' : String(index + 1).padStart(2, '0')}</span>
        <span className={styles.region} data-region={card.region}><span />{REGIONS[card.region]}</span>
      </div>
      <h3 className={styles.locality}>{card.localitate}</h3>
      <dl className={styles.fields}>
        {[
          { key: 'judet', label: 'Județ / Sector', value: card.judet },
          { key: 'localitate', label: 'Localitate', value: card.localitate },
          { key: 'adresa', label: 'Stradă și număr', value: card.adresa },
        ].map(field => {
          const key = `${card.idx}-${field.key}`
          const copied = copiedKey === key
          return <div className={styles.field} key={field.key}>
            <div><dt>{field.label}</dt><dd>{field.value}</dd></div>
            <button type="button" className={styles.iconButton} data-copied={copied} onClick={() => copy(field.value, key)} aria-label={`Copiază ${field.label.toLowerCase()}: ${field.value}`} title={copied ? 'Copiat' : `Copiază ${field.label.toLowerCase()}`}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        })}
      </dl>
      <div className={styles.cardActions}>
        <button type="button" className={styles.copyButton} onClick={() => copy(fullAddress(card), `${card.idx}-full`)} aria-label={`Copiază adresa completă: ${fullAddress(card)}`}>
          {copiedKey === `${card.idx}-full` ? <Check size={15} /> : <Copy size={15} />}{copiedKey === `${card.idx}-full` ? 'Copiat' : 'Copiază tot'}
        </button>
        <button type="button" className={styles.usedButton} onClick={() => markUsed(card, manual)} aria-label={`Marchează ca folosită: ${fullAddress(card)}`} title="Marchează ca folosită și aduce următoarea adresă"><Check size={16} /> Folosită</button>
      </div>
    </article>
  }

  return (
    <section className={styles.workspace} aria-label="Generator de locații" aria-busy={!ready}>
      <div className={styles.toolbar}>
        <fieldset className={styles.batchField} disabled={!ready}>
          <legend>Adrese standard afișate</legend>
          <div className={styles.segments}>
            {[1, 4, 8].map(value => <button key={value} type="button" aria-pressed={count === value} aria-label={`Afișează ${value} ${value === 1 ? 'adresă' : 'adrese'} standard`} onClick={() => changeCount(value)}>{value}</button>)}
          </div>
        </fieldset>
        <button type="button" className={styles.generateButton} disabled={!ready || !remaining} onClick={refresh}>
          <Shuffle size={16} aria-hidden="true" /> Alte adrese standard
        </button>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryText}>
          <span className={styles.scope}>Toată România</span>
          <span><strong>{ready ? remaining : '—'}</strong> disponibile</span>
          <span><strong>{ready ? usedCount : '—'}</strong> folosite <span className={styles.muted}>/ {total}</span></span>
        </div>
        <div className={styles.historyActions}>
          <button type="button" className={styles.iconButton} disabled={!undo} onClick={restore} title="Anulează ultima utilizare" aria-label="Anulează ultima utilizare"><Undo2 size={17} /></button>
          <button type="button" className={styles.resetButton} disabled={!ready || !usedCount} onClick={() => setResetScope(resetScope ? null : 'all')} aria-expanded={!!resetScope}>
            <RotateCcw size={14} aria-hidden="true" /> Resetează istoricul
          </button>
        </div>
        <progress className={styles.progress} max={total || 1} value={usedCount} aria-label="Adrese folosite" />
      </div>

      {resetScope && <div className={styles.confirmation} role="group" aria-label="Confirmă resetarea istoricului">
        <span>Resetezi cele {resetScope === 'county' ? (selectedCounty ? selectedCounty.total - selectedCounty.remaining : 0) : usedCount} adrese folosite{resetScope === 'county' ? ` din ${county}` : ' din toate județele'}?</span>
        <button type="button" className={styles.confirmButton} onClick={reset}>Da, resetează</button>
        <button type="button" className={styles.iconButton} onClick={() => setResetScope(null)} title="Anulează resetarea" aria-label="Anulează resetarea"><X size={17} /></button>
      </div>}

      {!ready ? <div className={styles.empty} role="status"><Loader2 className={styles.spinner} size={24} /><p>Se încarcă adresele…</p></div> : <div className={styles.columns}>
        <section className={styles.standard} aria-label="Adrese standard">
          <div className={styles.sectionHeader}>
            <h2>Adrese standard</h2>
            <span>10% București · 60% Moldova · 30% România</span>
          </div>
          {batch.length ? <div className={styles.grid} aria-label="Adrese generate">{batch.map((card, index) => renderCard(card, index))}</div> : <div className={styles.empty}>
            <CheckCheck size={30} aria-hidden="true" />
            <h2>{remaining ? 'Ultima adresă disponibilă este în județul ales' : 'Toate adresele au fost folosite'}</h2>
            {!remaining && <button type="button" className={styles.generateButton} onClick={() => setResetScope('all')}><RotateCcw size={16} aria-hidden="true" /> Resetează istoricul</button>}
          </div>}
        </section>
        <aside className={styles.manual} aria-label="Adresă suplimentară după județ">
          <div className={styles.sectionHeader}><h2>Județ la alegere</h2><MapPin size={16} aria-hidden="true" /></div>
          <div className={styles.countyToolbar}>
            <div className={styles.countyField}>
              <label htmlFor="location-county">Județ / București</label>
              <div className={styles.selectWrap}>
                <MapPin size={17} aria-hidden="true" />
                <select id="location-county" value={county} onChange={event => changeCounty(event.target.value)}>
                  <option value="">Alege județul</option>
                  {counties.map(option => <option key={option.judet} value={option.judet}>{option.judet} ({option.remaining} disponibile)</option>)}
                </select>
              </div>
            </div>
            <button type="button" className={styles.iconButton} disabled={!county || !selectedCounty?.remaining} onClick={refreshCounty} title="Altă adresă din județul ales" aria-label="Altă adresă din județul ales"><Shuffle size={17} /></button>
          </div>
          {county && <div className={styles.countySummary}><strong>{selectedCounty?.remaining || 0}</strong> disponibile în {county}</div>}
          {countyCard ? renderCard(countyCard, 0, true) : county ? <div className={styles.countyEmpty} role="status">
            <p>{selectedCounty?.remaining ? 'Adresele disponibile sunt deja în selecția standard.' : `Toate adresele din ${county} au fost folosite.`}</p>
            {selectedCounty && selectedCounty.remaining < selectedCounty.total && <button type="button" className={styles.resetButton} onClick={() => setResetScope('county')}><RotateCcw size={14} /> Resetează județul</button>}
          </div> : null}
        </aside>
      </div>}
      <span className={styles.srOnly} role="status">{copiedKey ? 'Copiat în clipboard.' : ''}</span>
      <Toast toast={toast} />
    </section>
  )
}
