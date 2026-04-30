// components/clients/profile-section-v2.tsx
// Sprint S2B Phase 2E — Profil section: forma + adres + KRS/REGON/NIP +
// kapital_zakladowy + founded_at + main PKD + bank account.

interface Props {
  forma_prawna: string | null
  address: string | null
  city: string | null
  region: string | null
  nip: string | null
  regon: string | null
  krs_number: string | null
  kapital_zakladowy: number | string | null
  founded_at: string | null
  vat_status: string | null
  vat_registered_date: string | null
  pkd_main: string | null
  pkd_main_name?: string | null
  pkd_total_count: number
  bank_account: string | null
}

function formatPln(v: number | string | null): string {
  if (v === null) return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function ProfileSectionV2({
  forma_prawna,
  address,
  city,
  region,
  nip,
  regon,
  krs_number,
  kapital_zakladowy,
  founded_at,
  vat_status,
  vat_registered_date,
  pkd_main,
  pkd_main_name,
  pkd_total_count,
  bank_account,
}: Props) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1 text-sm">
      <div className="text-[12px] text-[#888]">{label}</div>
      <div>{value ?? <span className="text-[#888]">—</span>}</div>
    </div>
  )
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Row label="Forma prawna" value={forma_prawna} />
        <Row
          label="Adres"
          value={[address, city, region].filter(Boolean).join(', ') || null}
        />
        <Row label="NIP" value={nip ? <span className="font-mono">{nip}</span> : null} />
        <Row label="REGON" value={regon ? <span className="font-mono">{regon}</span> : null} />
        <Row label="KRS" value={krs_number ? <span className="font-mono">{krs_number}</span> : null} />
      </div>
      <div>
        <Row
          label="Kapitał zakładowy"
          value={
            kapital_zakladowy !== null ? (
              <span>
                <span className="font-medium">{formatPln(kapital_zakladowy)}</span>
                <span className="ml-1 text-[12px] text-[#888]">PLN</span>
              </span>
            ) : null
          }
        />
        <Row label="Założona" value={founded_at} />
        <Row
          label="VAT"
          value={
            vat_status ? (
              <span>
                <span className="text-[#15803D]">{vat_status}</span>
                {vat_registered_date && (
                  <span className="text-[12px] text-[#888]"> od {vat_registered_date}</span>
                )}
              </span>
            ) : null
          }
        />
        <Row
          label="PKD główne"
          value={
            pkd_main ? (
              <span>
                <span className="font-mono">{pkd_main}</span>
                {pkd_main_name && (
                  <span className="ml-2 text-[12px] text-[#555]">
                    {pkd_main_name.toLowerCase().slice(0, 60)}
                    {pkd_main_name.length > 60 ? '…' : ''}
                  </span>
                )}
                {pkd_total_count > 1 && (
                  <span className="ml-2 text-[12px] text-[#4F46E5]">
                    +{pkd_total_count - 1} więcej
                  </span>
                )}
              </span>
            ) : null
          }
        />
        <Row
          label="Konto bankowe"
          value={bank_account ? <span className="font-mono text-[12px]">{bank_account}</span> : null}
        />
      </div>
    </div>
  )
}
