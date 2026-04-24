import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { KPGeneratorContent } from '@/components/kp-generator/kp-generator-content'

export default async function KPGeneratorPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, title, nip, city, address')
    .order('title', { ascending: true })

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true })

  return (
    <div className="flex flex-col">
      <PageHeader title="Generator KP" />
      <KPGeneratorContent clients={clients || []} products={products || []} />
    </div>
  )
}
