import type { Metadata } from 'next'
import SugestiiClient from './SugestiiClient'

export const metadata: Metadata = { title: 'Sugestii — AB Homes Iași', robots: { index: false, follow: false } }
export default function Page() { return <SugestiiClient /> }
