// Culoarea pusa de mana pe rezervarile private (cerut direct: „la cele private: roșu - rezervarea e mutată de la o
// locație la alta și să fim atenți; galben - clientul are de plătit, ori avans, ori toată suma”).
// Coloana rezervari.culoare (null = culoarea canalului). Pe Airbnb / Booking nu se aplica (culoarea ramane a platformei).
export type CuloareRez = 'rosu' | 'galben'

export const CULORI_REZ: Record<CuloareRez, { bg: string; text: string; sub: string; icon: string; scurt: string; sens: string }> = {
  rosu:   { bg: '#B91C1C', text: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', icon: '⇄', scurt: 'Mutată', sens: 'Mutată de la altă locație - atenție' },
  galben: { bg: '#FACC15', text: '#1C1917', sub: 'rgba(28,25,23,0.7)', icon: '€', scurt: 'De plată', sens: 'Clientul are de plătit (avans sau toată suma)' },
}

export const CULOARE_OPTIUNI: Record<string, string> = { '': 'Normală', rosu: '🔴 Mutată', galben: '🟡 De plată' }

export function ePrivata(canal?: string | null) { return !['airbnb', 'booking'].includes(String(canal || '').toLowerCase()) }

// culoarea efectiva a rezervarii (null = cea a canalului)
export function culoareRez(r: { canal?: string | null; culoare?: string | null } | null | undefined): CuloareRez | null {
  if (!r || !ePrivata(r.canal)) return null
  return r.culoare === 'rosu' || r.culoare === 'galben' ? r.culoare : null
}
