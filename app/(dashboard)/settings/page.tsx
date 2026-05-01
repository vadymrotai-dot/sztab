import { createClient } from '@/lib/supabase/server'
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
    <SettingsForm
      settings={(data as SettingsRow[]) ?? []}
      maskedKeys={{
        geminiMasked: masked.gemini_key,
        apifyMasked: masked.apify_api_token,
        krsMasked: masked.krs_rejestr_api_token,
        allegroIdMasked: masked.allegro_client_id,
        allegroSecretMasked: masked.allegro_client_secret,
        tavilyMasked: masked.tavily_api_key,
      }}
    />
  )
}
