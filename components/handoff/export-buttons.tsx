'use client'

import { Button } from '@/components/ui/button'
import { DownloadIcon, FileTextIcon } from 'lucide-react'

interface CohortRow {
  rank: number
  entity_id: string
  entity_type: 'client' | 'prospect'
  name: string
  nip: string
  legal_form: string | null
  region: string | null
  city: string | null
  top_product: string | null
  family_name: string | null
  combined_score: number | null
  buyer_strength: number | null
  phone: string | null
  email: string | null
  website: string | null
  decision_maker: string | null
  decision_maker_role: string | null
  cold_opener: string | null
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function buildCsv(rows: CohortRow[]): string {
  const header = [
    'Pozycja',
    'Typ',
    'Firma',
    'NIP',
    'Forma prawna',
    'Województwo',
    'Miasto',
    'Top match produkt',
    'Rodzina',
    'Score',
    'Buyer strength',
    'Telefon',
    'Email',
    'WWW',
    'Decyzyjny',
    'Rola',
    'Cold opener',
  ]
  const lines: string[] = ['﻿' + header.join(',')] // BOM для Excel
  for (const r of rows) {
    lines.push(
      [
        r.rank,
        r.entity_type,
        r.name,
        r.nip,
        r.legal_form,
        r.region,
        r.city,
        r.top_product,
        r.family_name,
        r.combined_score,
        r.buyer_strength,
        r.phone,
        r.email,
        r.website,
        r.decision_maker,
        r.decision_maker_role,
        r.cold_opener,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return lines.join('\n')
}

function buildMarkdown(rows: CohortRow[], cohortName: string): string {
  const out: string[] = []
  out.push(`# ${cohortName}`)
  out.push('')
  out.push(`**Liczność:** ${rows.length}`)
  out.push(`**Wygenerowano:** ${new Date().toLocaleString('pl-PL')}`)
  out.push('')
  out.push('---')
  out.push('')
  for (const r of rows) {
    out.push(`## ${r.rank}. ${r.name}`)
    out.push('')
    out.push(`- **NIP:** ${r.nip}`)
    if (r.legal_form) out.push(`- **Forma prawna:** ${r.legal_form}`)
    if (r.city || r.region) {
      out.push(`- **Lokalizacja:** ${[r.city, r.region].filter(Boolean).join(', ')}`)
    }
    if (r.top_product) {
      out.push(
        `- **Top match Sztab:** ${r.top_product} (rodzina: ${r.family_name ?? '?'}) — score ${r.combined_score ?? '?'}/100`,
      )
    }
    if (r.buyer_strength !== null) out.push(`- **Buyer strength dla ChM:** ${r.buyer_strength}/100`)
    out.push('')
    out.push('### Kontakty')
    if (r.phone) out.push(`- 📞 ${r.phone}`)
    if (r.email) out.push(`- ✉️ ${r.email}`)
    if (r.website) out.push(`- 🌐 ${r.website}`)
    if (!r.phone && !r.email && !r.website) out.push('_brak danych_')
    out.push('')
    if (r.decision_maker) {
      out.push('### Osoba decyzyjna')
      out.push(`**${r.decision_maker}** — ${r.decision_maker_role ?? 'rola nieznana'}`)
      out.push('')
    }
    if (r.cold_opener) {
      out.push('### Cold opener (AI)')
      out.push(`> ${r.cold_opener}`)
      out.push('')
    }
    out.push('---')
    out.push('')
  }
  return out.join('\n')
}

export function ExportButtons({ rows, cohortName }: { rows: CohortRow[]; cohortName: string }) {
  function exportCsv() {
    const csv = buildCsv(rows)
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(csv, `pikniko-cohort-${date}.csv`, 'text/csv')
  }
  function exportMd() {
    const md = buildMarkdown(rows, cohortName)
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(md, `pikniko-cohort-${date}.md`, 'text/markdown')
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={exportCsv}>
        <DownloadIcon className="mr-2 size-4" />
        CSV
      </Button>
      <Button size="sm" variant="outline" onClick={exportMd}>
        <FileTextIcon className="mr-2 size-4" />
        Markdown
      </Button>
    </div>
  )
}
