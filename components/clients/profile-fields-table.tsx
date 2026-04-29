// components/clients/profile-fields-table.tsx
// Sprint K — canonical profile fields з source attribution badges.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ProfileField {
  field_key: string
  value_text: string | null
  value_number: number | null
  value_json: unknown
  source: string
  source_priority: number
  confidence: number
  last_verified_at: string
}

const FIELD_LABELS: Record<string, string> = {
  legal_name: 'Nazwa prawna',
  regon: 'REGON',
  krs_number: 'KRS',
  legal_form: 'Forma prawna',
  capital: 'Kapitał',
  vat_status: 'VAT',
  vat_registered_date: 'Zarejestrowany VAT',
  registered_date: 'Data rejestracji',
  employee_count_range: 'Pracownicy',
  pkd_codes: 'PKD',
  krs_full_name: 'Pełna nazwa KRS',
  krs_status: 'Status KRS',
  krs_registration_date: 'Wpis do KRS',
  krs_management_board: 'Zarząd',
  krs_pkd_with_descriptions: 'PKD z opisami',
  bank_accounts: 'Konta bankowe',
  gus_status: 'Status GUS',
  website: 'Strona WWW',
}

const SOURCE_COLORS: Record<string, string> = {
  KRS: 'bg-blue-700',
  GUS: 'bg-blue-600',
  CEIDG: 'bg-blue-500',
  VAT_BL: 'bg-purple-600',
  BZP: 'bg-orange-500',
  manual: 'bg-amber-600',
  Apify_GMaps: 'bg-pink-600',
  WWW: 'bg-pink-500',
  AI: 'bg-indigo-600',
  sprawozdania_KRS: 'bg-blue-700',
  MSiG: 'bg-blue-700',
}

function formatValue(field: ProfileField): string {
  if (field.value_text !== null) return field.value_text
  if (field.value_number !== null) return String(field.value_number)
  if (field.value_json !== null && field.value_json !== undefined) {
    if (Array.isArray(field.value_json)) {
      // Smart array rendering
      if (field.value_json.length > 5) return `${field.value_json.slice(0, 5).join(', ')}… +${field.value_json.length - 5}`
      return field.value_json.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ')
    }
    if (typeof field.value_json === 'object') {
      const obj = field.value_json as Record<string, unknown>
      if ('value' in obj && 'currency' in obj)
        return `${obj.value} ${obj.currency}`
      return JSON.stringify(field.value_json).slice(0, 80)
    }
    return String(field.value_json)
  }
  return '—'
}

export function ProfileFieldsTable({ fields }: { fields: ProfileField[] }) {
  if (fields.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil canonical</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brak pól w canonical profile. Uruchom Intelligence Lookup żeby populować.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group by source priority — high priority first
  const sorted = [...fields].sort((a, b) => b.source_priority - a.source_priority)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Profil canonical</span>
          <span className="text-xs font-normal text-muted-foreground">
            {fields.length} pól z {new Set(fields.map((f) => f.source)).size} źródeł
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {sorted.map((f) => (
            <li key={f.field_key} className="grid grid-cols-12 items-start gap-2 py-1.5">
              <div className="col-span-3 text-xs font-medium text-muted-foreground pt-0.5">
                {FIELD_LABELS[f.field_key] ?? f.field_key}
              </div>
              <div className="col-span-7 break-words">{formatValue(f)}</div>
              <div className="col-span-2 flex justify-end gap-1">
                <Badge
                  className={`${SOURCE_COLORS[f.source] ?? 'bg-gray-500'} text-white h-5 text-[10px] font-mono`}
                  title={`Verified: ${new Date(f.last_verified_at).toLocaleDateString('pl-PL')} | confidence: ${f.confidence}`}
                >
                  {f.source}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
