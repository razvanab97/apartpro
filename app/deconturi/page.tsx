'use client'
import { PageHeader } from '@/components/Layout'
import DeconturiContent from '@/components/DeconturiContent'

// aceeasi componenta ca tabul Deconturi din Proprietari (inainte era o copie separata, fara selectie multipla)
export default function DeconturiPage() {
  return (<><PageHeader title="Deconturi proprietari" subtitle="Calcul și gestionare deconturi lunare" /><DeconturiContent /></>)
}
