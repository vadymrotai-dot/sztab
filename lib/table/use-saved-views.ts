'use client'

// lib/table/use-saved-views.ts
// Sprint S-UX-CORE STEP 4.3 (14.05.2026) — saved views localStorage hook.
//
// Per-table isolated storage: prospects views ≠ cohort views ≠ clients views.
// Storage key: sztab.saved_views.<tableId>. JSON-serialized array.
//
// Pre-seed behavior: on first mount, IF localStorage є empty for tableId AND
// defaultViews provided → seed з examples (Vadym's pre-defined sets). Користувач
// може delete them потім — flag "_defaults_seeded" prevents re-seed after delete-all.
//
// Methods:
//   list()              — returns views[] (also state-readable directly)
//   save(name, params)  — adds new view, returns id
//   load(id)            — navigates router.push з view's params
//   remove(id)          — deletes view
//   rename(id, newName) — updates view's name
//   clearAll()          — navigate до pathname без params (drop filter)
//
// SSR safety: window/localStorage access у useEffect only. Initial state = [].

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export interface SavedView {
  id: string
  name: string
  /** URL params snapshot — {sort, dir, q, score_min, channels, etc.} */
  params: Record<string, string>
  createdAt: string
}

export interface DefaultViewSeed {
  name: string
  params: Record<string, string>
}

interface UseSavedViewsOptions {
  /** Unique per-table id (e.g. 'prospects', 'cohort:<id>', 'clients'). */
  tableId: string
  /** Optional initial views to seed коли localStorage empty (first-ever mount). */
  defaultViews?: DefaultViewSeed[]
}

interface UseSavedViewsReturn {
  views: SavedView[]
  hydrated: boolean
  save: (name: string, params: Record<string, string>) => string | null
  load: (id: string) => void
  remove: (id: string) => void
  rename: (id: string, newName: string) => void
  /** Navigate до pathname без params (default "Wszyscy"). */
  clearAll: () => void
}

const SEED_FLAG_SUFFIX = '__seeded'

function makeId(): string {
  // crypto.randomUUID() supported у browsers ≥ 2022. Fallback timestamp+random.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function useSavedViews({
  tableId,
  defaultViews,
}: UseSavedViewsOptions): UseSavedViewsReturn {
  const router = useRouter()
  const pathname = usePathname()

  const storageKey = `sztab.saved_views.${tableId}`
  const seedFlagKey = `${storageKey}${SEED_FLAG_SUFFIX}`

  const [views, setViews] = useState<SavedView[]>([])
  const [hydrated, setHydrated] = useState(false)

  // ─── Hydrate з localStorage on mount ───
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          setViews(parsed as SavedView[])
          setHydrated(true)
          return
        }
      }
      // Empty localStorage — pre-seed якщо defaults provided AND ne раніше seeded.
      // seedFlag protects від re-seed коли користувач delete-all (intentional).
      const alreadySeeded = localStorage.getItem(seedFlagKey) === 'true'
      if (!alreadySeeded && defaultViews && defaultViews.length > 0) {
        const seeded: SavedView[] = defaultViews.map((d) => ({
          id: makeId(),
          name: d.name,
          params: d.params,
          createdAt: new Date().toISOString(),
        }))
        setViews(seeded)
        localStorage.setItem(storageKey, JSON.stringify(seeded))
        localStorage.setItem(seedFlagKey, 'true')
      }
      setHydrated(true)
    } catch (e) {
      console.error('useSavedViews hydrate error:', e)
      setHydrated(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // ─── Persist helper ───
  const persist = useCallback(
    (next: SavedView[]) => {
      setViews(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
        // Mark seeded коли user explicitly saves first view (avoid re-seed pretensions)
        localStorage.setItem(seedFlagKey, 'true')
      } catch (e) {
        console.error('useSavedViews persist error:', e)
      }
    },
    [storageKey, seedFlagKey],
  )

  // ─── Public methods ───
  const save = useCallback(
    (name: string, params: Record<string, string>): string | null => {
      const trimmed = name.trim()
      if (!trimmed) return null
      // Strip empty values з params (canonical form для equality comparison)
      const cleanParams: Record<string, string> = {}
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === 'string' && v.length > 0) cleanParams[k] = v
      }
      const view: SavedView = {
        id: makeId(),
        name: trimmed,
        params: cleanParams,
        createdAt: new Date().toISOString(),
      }
      persist([...views, view])
      return view.id
    },
    [views, persist],
  )

  const load = useCallback(
    (id: string) => {
      const v = views.find((x) => x.id === id)
      if (!v) return
      const sp = new URLSearchParams()
      for (const [k, val] of Object.entries(v.params)) {
        if (typeof val === 'string' && val.length > 0) sp.set(k, val)
      }
      const qs = sp.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [views, router, pathname],
  )

  const remove = useCallback(
    (id: string) => {
      persist(views.filter((v) => v.id !== id))
    },
    [views, persist],
  )

  const rename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed) return
      persist(views.map((v) => (v.id === id ? { ...v, name: trimmed } : v)))
    },
    [views, persist],
  )

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false })
  }, [router, pathname])

  return { views, hydrated, save, load, remove, rename, clearAll }
}

// ─── Helper: extract current URL params до save snapshot ─────────
// Used by SavedViewsDropdown. Strips keys що не варто saving (e.g. ?page=
// — view recall зазвичай повинна landed на page 1).

export function captureCurrentParams(
  searchParams: URLSearchParams,
  excludeKeys: string[] = ['page'],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of searchParams.entries()) {
    if (excludeKeys.includes(k)) continue
    if (v) out[k] = v
  }
  return out
}

// ─── Helper: compare params для active view detection ──────────────

export function paramsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false
  }
  return true
}
