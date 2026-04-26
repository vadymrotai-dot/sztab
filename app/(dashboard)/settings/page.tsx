import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { getMaskedParamsKeys } from '@/app/actions/params'
import { SettingsForm, type SettingsRow } from './settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [{ data }, masked] = await Promise.all([
    supabase
      .from('settings')
      .select('key, value, description')
      .order('key'),
    getMaskedParamsKeys(),
  ])

  return (
    <div className="flex flex-col">
      <PageHeader title="Ustawienia" />
      <div className="p-6 max-w-2xl">
        <SettingsForm
          settings={(data as SettingsRow[]) ?? []}
          maskedKeys={{
            geminiMasked: masked.gemini_key,
            apifyMasked: masked.apify_api_token,
            krsMasked: masked.krs_rejestr_api_token,
          }}
        />
      </div>
    </div>
  )
}
