import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

async function getStats() {
  const supabase = await createClient()
  const [
    { count: totalLeads },
    { count: enriched },
    { count: sent },
    { count: replied },
    { count: sentToFba },
    { count: signed },
    { count: commissionPaid },
    { data: campaigns },
  ] = await Promise.all([
    supabase.from('ceidg_prospects').select('*', { count: 'exact', head: true }),
    supabase.from('ceidg_prospects').select('*', { count: 'exact', head: true }).not('apollo_enriched_at', 'is', null),
    supabase.from('ceidg_prospects').select('*', { count: 'exact', head: true }).eq('outreach_status', 'SENT'),
    supabase.from('ceidg_prospects').select('*', { count: 'exact', head: true }).eq('outreach_status', 'REPLIED'),
    supabase.from('ceidg_prospects').select('*', { count: 'exact', head: true }).not('sent_to_fba_at', 'is', null),
    supabase.from('ceidg_prospects').select('*', { count: 'exact', head: true }).eq('fba_result', 'SIGNED'),
    supabase.from('ceidg_prospects').select('*', { count: 'exact', head: true }).eq('commission_paid', true),
    supabase.from('fba_campaigns').select('id, name, status, leads_count, enriched_count, sent_count, replied_count, converted_count').order('created_at', { ascending: false }).limit(5),
  ])
  const commissionTotal = (commissionPaid ?? 0) * 350
  return {
    totalLeads: totalLeads ?? 0,
    enriched: enriched ?? 0,
    sent: sent ?? 0,
    replied: replied ?? 0,
    sentToFba: sentToFba ?? 0,
    signed: signed ?? 0,
    commissionTotal,
    campaigns: campaigns ?? [],
  }
}

export default async function FbaPulpitPage() {
  const stats = await getStats()
  const kpiCards = [
    { label: 'Wszystkich leidów', value: stats.totalLeads.toLocaleString('pl-PL'), color: 'text-foreground', bg: 'bg-card' },
    { label: 'Zbogacone (Apollo)', value: stats.enriched.toLocaleString('pl-PL'), color: 'text-violet-600', bg: 'bg-card' },
    { label: 'Wysłane maile', value: stats.sent.toLocaleString('pl-PL'), color: 'text-blue-600', bg: 'bg-card' },
    { label: 'Odpowiedzi', value: stats.replied.toLocaleString('pl-PL'), color: 'text-amber-600', bg: 'bg-card' },
    { label: 'Przekazane do FBA', value: stats.sentToFba.toLocaleString('pl-PL'), color: 'text-orange-600', bg: 'bg-card' },
    { label: 'Podpisane umowy', value: stats.signed.toLocaleString('pl-PL'), color: 'text-emerald-600', bg: 'bg-card' },
    { label: 'Prowizja (zł)', value: stats.commissionTotal.toLocaleString('pl-PL') + ' zł', color: 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-950' },
    { label: 'Aktywne kampanie', value: stats.campaigns.filter(c => c.status === 'ACTIVE').length.toString(), color: 'text-foreground', bg: 'bg-card' },
  ]
  const funnelSteps = [
    { label: 'Leidy', value: stats.totalLeads, color: 'bg-slate-200 dark:bg-slate-700' },
    { label: 'Apollo', value: stats.enriched, color: 'bg-violet-200 dark:bg-violet-800' },
    { label: 'Wysłane', value: stats.sent, color: 'bg-blue-200 dark:bg-blue-800' },
    { label: 'Odpowiedź', value: stats.replied, color: 'bg-amber-200 dark:bg-amber-800' },
    { label: 'Do FBA', value: stats.sentToFba, color: 'bg-orange-200 dark:bg-orange-800' },
    { label: 'Podpisane', value: stats.signed, color: 'bg-emerald-200 dark:bg-emerald-800' },
  ]
  const maxVal = Math.max(...funnelSteps.map(s => s.value), 1)
  return (
    <div className="flex flex-col">
      <PageHeader
        title="FBA — Pulpit"
        breadcrumbs={[{ label: 'FBA' }, { label: 'Pulpit' }]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* KPI карток */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpiCards.map((k) => (
            <div key={k.label} className={`rounded-xl border p-4 ${k.bg}`}>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>
        {/* Воронка */}
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-sm font-semibold mb-4">Lejek sprzedażowy</h2>
          <div className="space-y-2">
            {funnelSteps.map((step) => {
              const pct = maxVal > 0 ? Math.round((step.value / maxVal) * 100) : 0
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-muted-foreground text-right shrink-0">{step.label}</div>
                  <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${step.color} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-16 text-xs font-medium text-right shrink-0">
                    {step.value.toLocaleString('pl-PL')}
                    <span className="text-muted-foreground ml-1">({pct}%)</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {/* Ostatnie kampanie */}
        {stats.campaigns.length > 0 && (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-sm font-semibold mb-4">Ostatnie kampanie</h2>
            <div className="space-y-2">
              {stats.campaigns.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                      c.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {c.status === 'ACTIVE' ? 'Aktywna' : c.status === 'COMPLETED' ? 'Zakończona' : 'Szkic'}
                    </span>
                    <span className="font-medium truncate max-w-[200px]">{c.name}</span>
                  </div>
                  <div className="flex gap-4 text-muted-foreground text-xs shrink-0">
                    <span>{c.leads_count} leidów</span>
                    <span>{c.sent_count} wysłanych</span>
                    <span className="text-emerald-600 font-medium">{c.converted_count} FBA</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
