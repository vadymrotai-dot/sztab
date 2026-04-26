import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { SettingsForm, type SettingsRow } from './settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('settings')
    .select('key, value, description')
    .order('key')

  return (
    <div className="flex flex-col">
      <PageHeader title="Ustawienia" />
      <div className="p-6 max-w-2xl">
        <SettingsForm settings={(data as SettingsRow[]) ?? []} />
      </div>
    </div>
  )
}
