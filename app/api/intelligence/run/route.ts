// app/api/intelligence/run/route.ts
// Sprint S-CORE.1.C — UI wiring entry point.
//
// POST { mode: 'A' | 'B' | 'C', filters?: ... } → запускає Orchestrator.run().
// Реальний run відбувається синхронно (поки немає background queue).
// У S-CORE.2 буде відокремлено: 200 OK одразу, run у Vercel after()/queue
// з runId-tracked status у DB.
//
// NON-GOAL для S-CORE.1.C: реальний enrichment pipeline. Mode B/C повертає
// errors з 'TODO S-CORE.2' маркерами — це expected. Mode A робить real
// Supabase clients query (per S-CORE.1.B existing-mode).

import { NextRequest, NextResponse } from 'next/server'
import { Orchestrator } from '@/lib/intelligence-engine/core/orchestrator'
import type { Mode } from '@/lib/intelligence-engine/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RunRequestBody {
  mode?: Mode
  filters?: unknown
}

export async function POST(req: NextRequest) {
  let body: RunRequestBody
  try {
    body = (await req.json()) as RunRequestBody
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const mode = body.mode
  if (!mode || !['A', 'B', 'C'].includes(mode)) {
    return NextResponse.json(
      { error: 'Invalid mode. Must be A, B, or C.' },
      { status: 400 },
    )
  }

  // Generate runId for tracking — S-CORE.2 буде wire DB persistence
  // (intelligence_runs table вже існує per migration 011).
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const orchestrator = new Orchestrator()

  try {
    // Cast filters до OrchestratorFilters union — type-narrowing per mode
    // зроблено всередині orchestrator.run().
    const result = await orchestrator.run(
      mode,
      body.filters as Parameters<Orchestrator['run']>[1],
    )
    return NextResponse.json({
      runId,
      status: 'completed',
      result,
    })
  } catch (engineError) {
    // TODO S-CORE.2: real error handling. Зараз modes throw з 'TODO S-CORE.2'
    // маркерами для unwired sources — caller (UI) показує як warning notice.
    const message =
      engineError instanceof Error ? engineError.message : String(engineError)
    return NextResponse.json(
      {
        runId,
        status: 'partial',
        error: message,
        note: 'S-CORE.2 wires real source fetchers. Throw markers expected у S-CORE.1.C scope.',
      },
      // 200 бо це expected behavior у поточному sub-sprint — не справжній 5xx.
      { status: 200 },
    )
  }
}
