import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { CalculatorContent } from '@/components/calculator/calculator-content'

export default async function CalculatorPage() {
  const supabase = await createClient()

  const { data: params } = await supabase
    .from('params')
    .select('*')
    .single()

  return (
    <div className="flex flex-col">
      <PageHeader title="Kalkulator" />
      <CalculatorContent params={params} />
    </div>
  )
}
