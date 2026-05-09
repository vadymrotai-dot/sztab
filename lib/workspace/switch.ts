'use server'

// lib/workspace/switch.ts
// Phase 1 Krok 3/5 — server action для cookie persist workspace selection.
//
// Cookie shape:
//   name:     sztab_workspace
//   value:    'sztab' | 'operacje' | 'intelligence'
//   path:     /
//   maxAge:   1 рік (60*60*24*365 = 31_536_000s)
//   sameSite: 'lax' (form submissions OK, cross-origin блок)
//   httpOnly: false (client read-back available якщо треба у майбутньому)
//
// Не виконує redirect — caller (WorkspaceSwitcher client component)
// робить router.push() самостійно після успішного set.
//
// 09.05.2026 — додано 'sztab' як 3-й workspace для bridge між dual
// (operacje/intelligence) і legacy CRM core (/pulpit/dzisiaj, /clients,
// /sprzedaz, /produkty etc.). Без 'sztab' користувач з dashboard tree
// не міг swap workspace (dashboard sidebar header був static без DropdownMenu).

import { cookies } from 'next/headers'

export type WorkspaceId = 'sztab' | 'operacje' | 'intelligence'

const COOKIE_NAME = 'sztab_workspace'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

const VALID_WORKSPACES: WorkspaceId[] = ['sztab', 'operacje', 'intelligence']

export async function setWorkspace(
  workspace: WorkspaceId,
): Promise<{ ok: true }> {
  if (!VALID_WORKSPACES.includes(workspace)) {
    throw new Error(`Invalid workspace: ${workspace}`)
  }

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, workspace, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  })

  return { ok: true }
}
