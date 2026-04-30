// scripts/sprint-s1-discovery-rejestrio.ts
// Sprint S1 Phase 0 — curl-discover rejestr.io v2 endpoints
// dla KOZAK OLEK (KRS=0000977768, NIP=7561993172).
//
// Saves raw responses do tmp/api-discovery/rejestrio-{n}-{name}.json
// for inspection. Doesn't write SUMMARY.md — that's manual after review.

import '@/lib/env'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { executeManagementSQL } from '@/lib/supabase/management'

const KRS = '0000977768'
const REJESTR_BASE = 'https://rejestr.io/api/v2'

async function getApiKey(): Promise<string> {
  const r = await executeManagementSQL(
    `SELECT krs_rejestr_api_token FROM params LIMIT 1;`,
  )
  const row = r.rows?.[0] as { krs_rejestr_api_token?: string } | undefined
  if (!row?.krs_rejestr_api_token) throw new Error('krs_rejestr_api_token missing у params')
  return row.krs_rejestr_api_token
}

interface ProbeResult {
  n: number
  name: string
  url: string
  status: number
  ok: boolean
  filename: string
  error?: string
  preview?: string
}

async function probe(
  n: number,
  name: string,
  url: string,
  apiKey: string,
): Promise<ProbeResult> {
  const filename = `rejestrio-${String(n).padStart(2, '0')}-${name}.json`
  try {
    const res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    await fs.writeFile(
      path.join('tmp/api-discovery', filename),
      JSON.stringify({ url, status: res.status, body }, null, 2),
    )
    return {
      n,
      name,
      url,
      status: res.status,
      ok: res.ok,
      filename,
      preview: text.slice(0, 200),
    }
  } catch (err) {
    return {
      n,
      name,
      url,
      status: 0,
      ok: false,
      filename,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  await fs.mkdir('tmp/api-discovery', { recursive: true })
  const apiKey = await getApiKey()
  console.log(`Using API key (last 4): ...${apiKey.slice(-4)}`)
  console.log(`Probing rejestr.io v2 dla KRS=${KRS}\n`)

  const results: ProbeResult[] = []

  // Static endpoints (1-8)
  const staticProbes: Array<{ n: number; name: string; path: string }> = [
    { n: 1, name: 'org-basic', path: `/org/${KRS}` },
    { n: 2, name: 'rozdzial-ogolny', path: `/org/${KRS}/krs-rozdzialy/ogolny` },
    { n: 3, name: 'rozdzial-przeksztalcenia', path: `/org/${KRS}/krs-rozdzialy/przeksztalcenia` },
    { n: 4, name: 'rozdzial-wzmianki', path: `/org/${KRS}/krs-rozdzialy/wzmianki` },
    { n: 5, name: 'rozdzial-oddzialy', path: `/org/${KRS}/krs-rozdzialy/oddzialy` },
    { n: 6, name: 'krs-dokumenty-list', path: `/org/${KRS}/krs-dokumenty` },
    { n: 8, name: 'crbr', path: `/org/${KRS}/crbr` },
  ]

  for (const p of staticProbes) {
    const r = await probe(p.n, p.name, `${REJESTR_BASE}${p.path}`, apiKey)
    results.push(r)
    console.log(
      `${r.ok ? '✅' : '❌'} #${r.n.toString().padStart(2)} ${r.name.padEnd(30)} HTTP ${r.status} → ${r.filename}`,
    )
    await new Promise((r) => setTimeout(r, 300)) // gentle 300ms
  }

  // #7: krs-dokumenty/{newest_doc_id}?format=json — needs doc_id from #6
  const docsResult = results.find((r) => r.n === 6)
  if (docsResult?.ok) {
    try {
      const docsRaw = await fs.readFile(
        path.join('tmp/api-discovery', docsResult.filename),
        'utf-8',
      )
      const docsBody = JSON.parse(docsRaw).body as {
        wyniki?: Array<{ id?: number | string; identyfikator?: number | string }>
        items?: Array<{ id?: number | string; identyfikator?: number | string }>
      }
      const list = docsBody?.wyniki ?? docsBody?.items ?? []
      const firstDocId = list[0]?.id ?? list[0]?.identyfikator
      if (firstDocId) {
        const r = await probe(
          7,
          'krs-dokument-detail',
          `${REJESTR_BASE}/org/${KRS}/krs-dokumenty/${firstDocId}?format=json`,
          apiKey,
        )
        results.push(r)
        console.log(
          `${r.ok ? '✅' : '❌'} #${r.n.toString().padStart(2)} ${r.name.padEnd(30)} HTTP ${r.status} → ${r.filename}`,
        )
      } else {
        console.log(`⚠️  #7 krs-dokument-detail SKIPPED (no doc id у #6 list)`)
      }
    } catch (err) {
      console.log(`⚠️  #7 krs-dokument-detail SKIPPED (parse fail: ${err})`)
    }
  }

  // #9-10: /osoby/{id} — extract person_id з rozdzial-ogolny
  const ogResult = results.find((r) => r.n === 2)
  if (ogResult?.ok) {
    try {
      const ogRaw = await fs.readFile(
        path.join('tmp/api-discovery', ogResult.filename),
        'utf-8',
      )
      const ogBody = JSON.parse(ogRaw).body as Record<string, unknown>
      // Search recursively dla first person id (osoba.id або person_id у dane_osob)
      const personId = findFirstPersonId(ogBody)
      if (personId) {
        const r9 = await probe(
          9,
          'osoba-detail',
          `${REJESTR_BASE}/osoby/${personId}`,
          apiKey,
        )
        results.push(r9)
        console.log(
          `${r9.ok ? '✅' : '❌'} #${r9.n.toString().padStart(2)} ${r9.name.padEnd(30)} HTTP ${r9.status} → ${r9.filename}`,
        )
        const r10 = await probe(
          10,
          'osoba-powiazania',
          `${REJESTR_BASE}/osoby/${personId}/krs-powiazania?aktualnosc=aktualne`,
          apiKey,
        )
        results.push(r10)
        console.log(
          `${r10.ok ? '✅' : '❌'} #${r10.n.toString().padStart(2)} ${r10.name.padEnd(30)} HTTP ${r10.status} → ${r10.filename}`,
        )
      } else {
        console.log(`⚠️  #9-10 osoba endpoints SKIPPED (no person id у rozdzial-ogolny)`)
      }
    } catch (err) {
      console.log(`⚠️  #9-10 osoba endpoints SKIPPED (parse fail: ${err})`)
    }
  }

  // Summary table
  console.log('\n━━━ Summary ━━━')
  for (const r of results.sort((a, b) => a.n - b.n)) {
    console.log(
      `#${r.n.toString().padStart(2)} ${r.ok ? 'OK' : 'FAIL'} HTTP ${r.status} ${r.name}`,
    )
  }
}

function findFirstPersonId(obj: unknown): number | string | null {
  if (!obj || typeof obj !== 'object') return null
  // Common shapes: {id: 12345, tozsamosc: {...}}, person_id, osoba_id
  const o = obj as Record<string, unknown>
  for (const key of ['id', 'person_id', 'osoba_id', 'identyfikator']) {
    const v = o[key]
    if (typeof v === 'number' && key !== 'identyfikator') {
      // Heuristic: top-level id at this nesting often is person id
      if (o.tozsamosc || o.imie || o.imiona) return v
    }
  }
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (Array.isArray(v)) {
      for (const item of v) {
        const found = findFirstPersonId(item)
        if (found !== null) return found
      }
    } else if (v && typeof v === 'object') {
      const found = findFirstPersonId(v)
      if (found !== null) return found
    }
  }
  return null
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
