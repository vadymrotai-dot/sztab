import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

const FBA_RESULT_COLORS: Record<string, string> = {
  SIGNED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-700',
}

const FBA_RESULT_LABELS: Record<string, string> = {
  SIGNED: '✅ Podpisano',
  REJECTED: '❌ Odrzucono',
  PENDING: '⏳ Oczekuje',
}

export default async function FbaProwizjePage() {
  const supabase = await createClient()
  const { data: leads, error } = await supabase
    .from('ceidg_prospects')
    .select('id, name, owner_name, miejscowosc, source_pkd, sent_to_fba_at, fba_result, commission_paid, outreach_status, email')
    .not('sent_to_fba_at', 'is', null)
    .order('sent_to_fba_at', { ascending: false })

  const total = leads?.length ?? 0
  const signed = leads?.filter(l => l.fba_result === 'SIGNED').length ?? 0
  const pending = leads?.filter(l => l.fba_result === 'PENDING' || !l.fba_result).length ?? 0
  const commissionEarned = (leads?.filter(l => l.commission_paid).length ?? 0) * 350
  const commissionPending = (leads?.filter(l => l.fba_result === 'SIGNED' && !l.commission_paid).length ?? 0) * 350

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Prowizje"
        breadcrumbs={[{ label: 'FBA' }, { label: 'Prowizje' }]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Przekazane do FBA', value: total.toString(), color: 'text-foreground' },
            { label: 'Podpisane', value: signed.toString(), color: 'text-emerald-600' },
            { label: 'Oczekujące', value: pending.toString(), color: 'text-amber-600' },
            { label: 'Prowizja wypłacona', value: `${commissionEarned.toLocaleString('pl-PL')} zł`, color: 'text-emerald-700' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border bg-card p-4">
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>

        {commissionPending > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            💰 Prowizja do odbioru: <span className="font-bold">{commissionPending.toLocaleString('pl-PL')} zł</span> — klienci podpisali, ale prowizja jeszcze nie wypłacona.
          </div>
        )}

        {/* Tabela */}
        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Błąd ładowania prowizji</p>
            <p className="mt-1 text-xs opacity-80">{error.message}</p>
          </div>
        ) : total === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">Brak przekazanych leidów do FBA.</p>
            <p className="text-xs text-muted-foreground mt-1">Użyj przycisku "Przekaż do FBA" w sekcji Leidy.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Firma</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Miasto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">PKD</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Przekazano</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Wynik FBA</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Prowizja</th>
                </tr>
              </thead>
              <tbody>
                {leads?.map((l, i) => (
                  <tr key={l.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.name}</div>
                      {l.owner_name && <div className="text-xs text-muted-foreground">{l.owner_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.miejscowosc ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.source_pkd ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {l.sent_to_fba_at ? new Date(l.sent_to_fba_at).toLocaleDateString('pl-PL') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {l.fba_result ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FBA_RESULT_COLORS[l.fba_result] ?? 'bg-gray-100 text-gray-600'}`}>
                          {FBA_RESULT_LABELS[l.fba_result] ?? l.fba_result}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                          ⏳ Oczekuje
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {l.commission_paid ? (
                        <span className="text-emerald-600 font-medium text-xs">✅ 350 zł</span>
                      ) : l.fba_result === 'SIGNED' ? (
                        <span className="text-amber-600 text-xs">⏳ 350 zł</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
