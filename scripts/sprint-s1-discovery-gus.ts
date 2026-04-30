// Sprint S1 Phase 0 — GUS BIR multi-report discovery dla KOZAK OLEK
// (NIP=7561993172). Saves raw SOAP responses + parsed inner XML.

import '@/lib/env'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { executeManagementSQL } from '@/lib/supabase/management'
import { gusLogin } from '@/lib/enrichment/gus'

const NIP = '7561993172'
const ENDPOINT = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc'
const NS_ACTION = 'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl'

async function getApiKey(): Promise<string> {
  const r = await executeManagementSQL(`SELECT gus_api_key FROM params LIMIT 1;`)
  return ((r.rows?.[0] as { gus_api_key: string }).gus_api_key)
}

async function rawSoapCall(action: string, body: string, sessionId?: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract" xmlns:wsa="http://www.w3.org/2005/08/addressing">
  <soap:Header>
    <wsa:To>${ENDPOINT}</wsa:To>
    <wsa:Action>${NS_ACTION}/${action}</wsa:Action>
  </soap:Header>
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`
  const headers: Record<string, string> = {
    'Content-Type': 'application/soap+xml; charset=utf-8',
    'User-Agent': 'Mozilla/5.0',
  }
  if (sessionId) headers.sid = sessionId
  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: envelope })
  return res.text()
}

const xmlParser = new XMLParser({ removeNSPrefix: true, parseTagValue: false })

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, '\r')
    .replace(/&amp;/g, '&')
}

async function probe(name: string, action: string, body: string, sid: string) {
  const text = await rawSoapCall(action, body, sid)
  const envMatch = text.match(/<s?:?Envelope[\s\S]*?<\/s?:?Envelope>/)
  const env = envMatch ? envMatch[0] : text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: any = xmlParser.parse(env)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body_ = parsed?.Envelope?.Body as any
  let inner: unknown = null
  if (body_) {
    const responseKey = Object.keys(body_).find((k) => k.endsWith('Response'))
    if (responseKey) {
      const resultKey = Object.keys(body_[responseKey]).find((k) => k.endsWith('Result'))
      if (resultKey) {
        const escaped = body_[responseKey][resultKey] as string
        if (typeof escaped === 'string' && escaped.length > 0) {
          inner = xmlParser.parse(decodeEntities(escaped))
        }
      }
    }
  }
  await fs.writeFile(
    path.join('tmp/api-discovery', `gus-${name}.json`),
    JSON.stringify({ action, body: body_, inner }, null, 2),
  )
  console.log(`✅ ${name.padEnd(40)} (saved)`)
  return inner
}

async function main() {
  await fs.mkdir('tmp/api-discovery', { recursive: true })
  const apiKey = await getApiKey()
  const sid = await gusLogin(apiKey)
  console.log(`Session: ${sid.slice(0, 12)}...\n`)

  // Step 1: search by NIP → get REGON
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchInner: any = await probe(
    '01-search',
    'DaneSzukajPodmioty',
    `<ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <dat:Nip>${NIP}</dat:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>`,
    sid,
  )
  const dane = searchInner?.root?.dane
  const regon = dane?.Regon ?? dane?.[0]?.Regon
  const silosId = dane?.SilosID ?? dane?.[0]?.SilosID
  const typ = dane?.Typ ?? dane?.[0]?.Typ
  console.log(`REGON=${regon} SilosID=${silosId} Typ=${typ}`)
  if (!regon) {
    console.error('No REGON found')
    return
  }

  const reports: Array<{ name: string; reportName: string }> = [
    { name: '02-typPodmiotu', reportName: 'BIR11TypPodmiotu' },
    { name: '03-osPrawna', reportName: 'BIR11OsPrawna' },
    { name: '04-osPrawnaPkd', reportName: 'BIR11OsPrawnaPkd' },
    { name: '05-osPrawnaListaJednLokalnych', reportName: 'BIR11OsPrawnaListaJednLokalnych' },
  ]

  for (const r of reports) {
    try {
      await probe(
        r.name,
        'DanePobierzPelnyRaport',
        `<ns:DanePobierzPelnyRaport>
          <ns:pRegon>${regon}</ns:pRegon>
          <ns:pNazwaRaportu>${r.reportName}</ns:pNazwaRaportu>
        </ns:DanePobierzPelnyRaport>`,
        sid,
      )
      await new Promise((r) => setTimeout(r, 300))
    } catch (err) {
      console.error(`❌ ${r.name}: ${err instanceof Error ? err.message : err}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
