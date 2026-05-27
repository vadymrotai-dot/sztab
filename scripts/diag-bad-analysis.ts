#!/usr/bin/env tsx
// scripts/diag-bad-analysis.ts
// One-shot діагностика 7 фірм UC_PROD_GOTOWE_MAZ — чому профілі порожні
// але /admin/health показує мізерний spend (≈$0.11) при Apify dashboard $47.
//
// READ-ONLY. Не комітити, не змінювати state. Записує markdown to tmp/diag-output.md.
//
// Schema verified live via REST (audit 2026-05-27):
//   - enrichment_log: run_started_at, cost_usd (NOT started_at/cost)
//   - clients.krs_management_board (jsonb array) — anon = brak imie/nazwisko
//   - clients.business_profile.analyzed_at + clients.ai_suggested_at
//   - persons table — pominięta (brak junction до clients)
//
// CLI:
//   pnpm exec tsx scripts/diag-bad-analysis.ts > tmp/diag-output.md
//
// Sandbox tsx blocked (Protocol 31) — Cowork wykonał mirror via Python+REST.

import '@/lib/env'
import { createClient } from '@supabase/supabase-js'

const NIPS = [
  '7010750077', // FHFC w likwidacji
  '9482618417', // FOOD EXPERTS
  '9512471196', // FRESH MEALS FACTORY
  '8381885760', // FRESH SEZAM
  '8111777351', // FUNDACJA PRO-ZDROWOTNA
  '5223262981', // GSERWIS
  '7251938227', // GUSTO VERO
]

const AGG_FROM = '2026-05-26' // aggregate spend з cohort analysis day

function trunc(s: string | null | undefined, n: number): string {
  if (s == null) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function fmtUSD(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${Number(n).toFixed(4)}`
}

function bpKeys(bp: any): string[] {
  if (!bp || typeof bp !== 'object') return []
  return Object.keys(bp)
}

function persons(mb: any): string {
  if (!Array.isArray(mb) || mb.length === 0) return '— (empty)'
  return mb
    .map((m: any) => {
      const hasImie = m && typeof m.imie === 'string' && m.imie.trim()
      const hasNazwisko = m && typeof m.nazwisko === 'string' && m.nazwisko.trim()
      if (!hasImie && !hasNazwisko) {
        return `anon (${m.function ?? '?'})`
      }
      return `${m.imie ?? ''} ${m.nazwisko ?? ''} (${m.function ?? '?'})`.trim()
    })
    .join('; ')
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const out: string[] = []
  out.push('# Діагностика 7 фірм UC_PROD_GOTOWE_MAZ')
  out.push('')
  out.push(`_generated ${new Date().toISOString()}_`)
  out.push('')

  for (const nip of NIPS) {
    const { data: c, error: cErr } = await supabase
      .from('clients')
      .select(
        'id, title, nip, city, address, website, website_krs, email_krs, vat_status, business_profile, krs_management_board, ai_suggested_at, last_filing_date',
      )
      .eq('nip', nip)
      .maybeSingle()

    if (cErr || !c) {
      out.push(`## NIP ${nip} — NOT FOUND in clients`)
      out.push('')
      continue
    }

    const bp = c.business_profile || {}
    const bpAnalyzedAt = bp.analyzed_at ?? null

    out.push(`## ${c.title} (NIP ${c.nip})`)
    out.push('')
    out.push(
      `Адреса: \`${c.address ?? '—'}\` | Місто: \`${c.city ?? '—'}\` | WWW: \`${c.website ?? '—'}\` (krs: \`${c.website_krs ?? '—'}\`) | Email KRS: \`${c.email_krs ?? '—'}\` | VAT: \`${c.vat_status ?? '—'}\` | last filing: \`${c.last_filing_date ?? '—'}\``,
    )
    out.push('')
    out.push(
      `business_profile.analyzed_at: \`${bpAnalyzedAt ?? '—'}\` | top-level ai_suggested_at: \`${c.ai_suggested_at ?? '—'}\``,
    )
    out.push('')
    out.push(`business_profile populated keys: \`${JSON.stringify(bpKeys(bp))}\``)
    out.push('')
    out.push(`Керівництво: ${persons(c.krs_management_board)}`)
    out.push('')

    // enrichment_log last 15
    const { data: logs } = await supabase
      .from('enrichment_log')
      .select('source, status, cost_usd, error_message, run_started_at')
      .eq('target_id', c.id)
      .order('run_started_at', { ascending: false })
      .limit(15)

    out.push('### enrichment_log (last 15)')
    out.push('')
    if (!logs || logs.length === 0) {
      out.push('_(empty — нічого нема в логу для цього клієнта)_')
    } else {
      out.push('| source | status | cost | error_message | run_started_at |')
      out.push('|---|---|---:|---|---|')
      for (const l of logs) {
        out.push(
          `| ${l.source ?? '—'} | ${l.status ?? '—'} | ${fmtUSD(l.cost_usd)} | ${trunc(l.error_message, 200).replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${l.run_started_at ?? '—'} |`,
        )
      }
    }
    out.push('')
    out.push('---')
    out.push('')
  }

  // Aggregate spend з AGG_FROM
  out.push(`## Агрегат витрат з ${AGG_FROM} (GROUP BY source, status)`)
  out.push('')
  const { data: agg } = await supabase
    .from('enrichment_log')
    .select('source, status, cost_usd')
    .gte('run_started_at', AGG_FROM)

  if (!agg || agg.length === 0) {
    out.push(`_(brak rows з ${AGG_FROM})_`)
  } else {
    const groups = new Map<string, { calls: number; total: number }>()
    for (const r of agg) {
      const key = `${r.source ?? '—'}|${r.status ?? '—'}`
      const g = groups.get(key) ?? { calls: 0, total: 0 }
      g.calls += 1
      g.total += Number(r.cost_usd ?? 0)
      groups.set(key, g)
    }
    const sorted = [...groups.entries()].sort((a, b) => b[1].total - a[1].total)
    out.push('| source | status | calls | total $ |')
    out.push('|---|---|---:|---:|')
    for (const [k, g] of sorted) {
      const [src, st] = k.split('|')
      out.push(`| ${src} | ${st} | ${g.calls} | ${fmtUSD(g.total)} |`)
    }
    const grand = [...groups.values()].reduce((s, g) => s + g.total, 0)
    out.push(`| **TOTAL** | | ${agg.length} | ${fmtUSD(grand)} |`)
  }

  console.log(out.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
