'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: string }

// Batch updates a set of key→value pairs. Each key must already exist
// in the settings table (seeded by 007). settings are global, not
// per-user — RLS policy "settings_write_authenticated" allows any
// authenticated user to update.
export async function updateSettings(
  updates: Record<string, string>,
): Promise<SettingsActionResult> {
  const entries = Object.entries(updates).filter(([, v]) => v != null)
  if (entries.length === 0) return { ok: true }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesja wygasła' }

  for (const [key, value] of entries) {
    const { error } = await supabase
      .from('settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
    if (error) return { ok: false, error: `${key}: ${error.message}` }
  }

  revalidatePath('/settings')
  // pricing and product views render kurs/overhead — bust their cache too
  revalidatePath('/products')
  revalidatePath('/dashboard')
  return { ok: true }
}
