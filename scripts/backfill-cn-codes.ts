// scripts/backfill-cn-codes.ts
// Sprint S-INTEL.1.1.5 — bulk AI suggest CN codes для existing products
// без cn_code. Idempotent (skip rows що вже мають cn_code).
//
// Pattern mirror: scripts/run-ai-bulk-attributes.ts (service-role client,
// import '@/lib/env' для .env.local).
//
// Usage:
//   pnpm exec tsx scripts/backfill-cn-codes.ts
//
// Cost estimate: ~$0.0008 × N products (Haiku 4.5).
// 35 SKU × $0.0008 = ~$0.028 per full backfill.
//
// Side effects:
//   - UPDATE products.cn_code = AI suggestion
//   - UPDATE products.cn_code_review_pending = TRUE (quality gate, see Q5 lock)
//   - WRITE persistent log: scripts/cowork/backfill-cn-codes-{ISO}.log
//   - Console output з progress + summary
//
// NOTE: enrichment_log table CHECK constraint (target_type IN ('company','person'))
// blocks 'product' value, тому per-call DB log skipped. Persistent log file у
// scripts/cowork/ заміщає persistence (Vadym може review без re-run script).

import '@/lib/env'

import { createClient } from '@supabase/supabase-js'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  suggestCnCode,
  CnCodeSuggesterError,
  type ProductInfo,
} from '@/lib/ai/cn-code-suggester'

const SUPABASE_URL = 'https://pxovjyxsktxdbovmybxz.supabase.co'

interface ProductRow {
  id: string
  owner_id: string
  name: string
  category: string | null
  gramatura: string | null
  ean: string | null
  vertical: string | null
  brand: string | null
}

interface SummaryRow {
  name: string
  cn_code: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  alternatives?: string[]
}

const RATE_LIMIT_MS = 1500 // Anthropic 50 RPM на FAST — sequential з buffer
const APPROX_COST_PER_CALL = 0.0008

function nowIso(): string {
  // ISO timestamp без двокрапок (Windows-safe filename)
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function ensureCoworkDir(): string {
  const dir = path.resolve(process.cwd(), 'scripts', 'cowork')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

async function main() {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const aiKey = process.env.ANTHROPIC_API_KEY
  if (!svcKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing — додай у .env.local')
    process.exit(1)
  }
  if (!aiKey) {
    console.error('❌ ANTHROPIC_API_KEY missing — додай у .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Persistent log file
  const coworkDir = ensureCoworkDir()
  const logPath = path.join(coworkDir, `backfill-cn-codes-${nowIso()}.log`)
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })
  const log = (line: string) => {
    logStream.write(line + '\n')
  }

  console.log('\n══════ S-INTEL.1.1.5 Backfill CN codes ══════\n')
  console.log(`Persistent log: ${logPath}\n`)
  log(`# Backfill CN codes — ${new Date().toISOString()}`)
  log(`# Source: scripts/backfill-cn-codes.ts`)
  log(`# Model: claude-haiku-4-5-20251001`)
  log('')

  const startedAt = Date.now()

  // 1. Fetch products WHERE cn_code IS NULL (idempotent — skip already populated)
  const { data: productRows, error: fetchErr } = await supabase
    .from('products')
    .select('id, owner_id, name, category, gramatura, ean, vertical, brand')
    .is('cn_code', null)
    .order('category', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (fetchErr) {
    console.error(`❌ Failed to fetch products: ${fetchErr.message}`)
    log(`ERROR fetch: ${fetchErr.message}`)
    logStream.end()
    process.exit(1)
  }

  const products = (productRows ?? []) as ProductRow[]

  if (products.length === 0) {
    console.log('✅ Жодного products без cn_code. Nothing to backfill.')
    log('No products без cn_code. Idempotent skip — nothing done.')
    logStream.end()
    return
  }

  console.log(`[1] Found ${products.length} products потребують cn_code\n`)
  log(`Found ${products.length} products without cn_code`)
  log('')
  log('## Per-SKU log')
  log('')

  // 2. Per-SKU AI suggest + DB update
  let success = 0
  let errors = 0
  let totalCost = 0
  const summary: SummaryRow[] = []

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const idx = `${i + 1}/${products.length}`
    const header = `[${idx}] "${product.name}" (${product.category ?? '?'})`
    console.log(header)

    try {
      const input: ProductInfo = {
        name: product.name,
        category: product.category,
        gramatura: product.gramatura,
        ean: product.ean,
        vertical: product.vertical,
        brand: product.brand,
      }

      const suggestion = await suggestCnCode(aiKey, input)
      // Cost incremented одразу after AI succeeds — real Anthropic charge
      // happens independent of DB write outcome (S-INTEL.1.1.5 fix).
      totalCost += APPROX_COST_PER_CALL

      const altPart =
        suggestion.alternatives && suggestion.alternatives.length > 0
          ? ` | alternatives: ${suggestion.alternatives.join(', ')}`
          : ''
      const conf = suggestion.confidence
      const consoleLine = `  → CN ${suggestion.cn_code} (${conf})\n    ${suggestion.reasoning}${altPart}`
      console.log(consoleLine)
      log(
        `${product.name} → CN ${suggestion.cn_code} (${conf}) | reasoning: ${suggestion.reasoning}${altPart}`,
      )

      // DB write — service role bypasses RLS, no auth.uid() match needed
      const { error: updateErr } = await supabase
        .from('products')
        .update({
          cn_code: suggestion.cn_code,
          cn_code_review_pending: true,
        })
        .eq('id', product.id)

      if (updateErr) {
        console.error(`  ✗ DB update failed: ${updateErr.message}`)
        log(`  DB UPDATE ERROR: ${updateErr.message}`)
        errors++
        continue
      }

      success++
      summary.push({
        name: product.name,
        cn_code: suggestion.cn_code,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        alternatives: suggestion.alternatives,
      })

      // Polite rate limit
      if (i < products.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      }
    } catch (err) {
      const msg =
        err instanceof CnCodeSuggesterError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err)
      console.error(`  ✗ AI failed: ${msg}`)
      log(`${product.name} → ERROR: ${msg}`)
      errors++
    }
  }

  // 3. Summary
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
  const byConfidence = summary.reduce(
    (acc, s) => {
      acc[s.confidence] = (acc[s.confidence] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  console.log('\n══════ Summary ══════')
  console.log(`Total processed:     ${products.length}`)
  console.log(`Success:             ${success}`)
  console.log(`Errors:              ${errors}`)
  console.log(`Total cost:          ~$${totalCost.toFixed(4)}`)
  console.log(`Elapsed:             ${elapsedSec}s`)
  console.log(`Confidence:          high=${byConfidence.high ?? 0}, medium=${byConfidence.medium ?? 0}, low=${byConfidence.low ?? 0}`)
  console.log(`\nLog written to:      ${logPath}`)
  console.log('\nNext steps for Vadym:')
  console.log(`  1. Open /produkty → ${success} amber "🔍 Review CN" badges`)
  console.log('  2. Click each SKU → /products/[id]/edit → review CN code → save (clears badge)')
  console.log('  3. After all reviewed: SELECT COUNT(*) FROM products WHERE cn_code_review_pending=TRUE → 0')
  console.log('  4. Apply scripts/050_cn_code_required.sql у Supabase Studio SQL Editor')

  log('')
  log('## Summary')
  log(`Total processed: ${products.length}`)
  log(`Success: ${success}`)
  log(`Errors: ${errors}`)
  log(`Total cost: ~$${totalCost.toFixed(4)}`)
  log(`Elapsed: ${elapsedSec}s`)
  log(
    `Confidence: high=${byConfidence.high ?? 0}, medium=${byConfidence.medium ?? 0}, low=${byConfidence.low ?? 0}`,
  )
  log('')
  log('## Vadym next steps')
  log('1. Review всі suggestions через /produkty UI (amber badges)')
  log('2. Save edit per SKU clears review_pending flag')
  log('3. Apply scripts/050_cn_code_required.sql коли всі cleared')

  logStream.end()
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
