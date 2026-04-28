// lib/env.ts
// Load .env.local explicitly (dotenv/config default reads .env only,
// not .env.local). Next.js auto-loads .env.local in routes; in
// standalone Node scripts (tsx) we must do it ourselves.
//
// Import this at top of any script that needs secrets:
//   import '@/lib/env'
//
// Precedence: .env.local first (highest), .env second. dotenv default
// behavior never overrides existing process.env vars — already-set
// env (e.g. shell vars) wins.

import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })
config({ path: path.resolve(process.cwd(), '.env') })
