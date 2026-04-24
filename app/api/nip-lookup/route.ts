// app/api/nip-lookup/route.ts
// Server-side NIP lookup through Polish Ministry of Finance API.
// Works on Vercel because server has no CORS.

import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface MFResult {
  subject?: {
    name?: string
    nip?: string
    statusVat?: string
    regon?: string
    krs?: string
    residenceAddress?: string
    workingAddress?: string
    registrationLegalDate?: string
    accountNumbers?: string[]
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const rawNip = String(body?.nip || "").replace(/\D/g, "")

    if (rawNip.length !== 10) {
      return NextResponse.json(
        { ok: false, error: "NIP musi składać się z 10 cyfr" },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${rawNip}?date=${today}`

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `MF API zwróciło kod ${res.status}`,
        },
        { status: res.status === 404 ? 404 : 502 }
      )
    }

    const data = (await res.json()) as { result?: MFResult }
    const subject = data?.result?.subject

    if (!subject) {
      return NextResponse.json(
        { ok: false, error: "Nie znaleziono firmy o takim NIP" },
        { status: 404 }
      )
    }

    // Try to split address into city + street-ish parts (best-effort)
    const addr =
      subject.workingAddress || subject.residenceAddress || ""
    // typical format: "UL. WOLSKA 50A/5C, 01-187 WARSZAWA"
    const cityMatch = addr.match(/\d{2}-\d{3}\s+([A-ZŁŚĆŹŻ][\wŁŚĆŹŻĄĘÓŃłśćźżąęóń-]+)/i)
    const city = cityMatch?.[1] || ""

    return NextResponse.json({
      ok: true,
      data: {
        name: subject.name || "",
        nip: subject.nip || rawNip,
        statusVat: subject.statusVat || "",
        regon: subject.regon || "",
        krs: subject.krs || "",
        address: addr,
        city,
        registrationDate: subject.registrationLegalDate || "",
        accountNumbers: subject.accountNumbers || [],
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Nieznany błąd" },
      { status: 500 }
    )
  }
}
