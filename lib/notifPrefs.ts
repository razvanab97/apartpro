export const CATEGORII_NOTIF = [
  { key: 'curatenie', label: 'Curățenie gata', icon: '🧹' },
  { key: 'eliberat', label: 'Eliberări apartament', icon: '🚪' },
  { key: 'task', label: 'Task-uri recurente', icon: '🔔' },
] as const

const STORAGE_KEY = 'notif_categorii'
const TOATE = CATEGORII_NOTIF.map(c => c.key)

export function getNotifPrefs(): string[] {
  if (typeof window === 'undefined') return TOATE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return TOATE
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : TOATE
  } catch {
    return TOATE
  }
}

export function setNotifPrefs(categorii: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categorii))
}
