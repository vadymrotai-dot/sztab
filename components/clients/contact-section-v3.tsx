// components/clients/contact-section-v3.tsx
// Sprint TYDZIEN2.T2.4.B (28.05.2026) — multi-row firm contact methods.
// Replaces ContactSectionV2 (single email/phone/website cascade).
//
// Reads з client_contact_methods (T2.4.A seeded 664 rows). Group by kind:
//   📧 Email | 📞 Telefon | 🌐 WWW | 🔗 Social (facebook/instagram/linkedin)
//   + ⭐ primary marker, source badges, optional label badges.
//
// Read-only. Add/edit/delete + primary toggle → T2.4.C okremo.

import { MailIcon, PhoneIcon, GlobeIcon, FacebookIcon, InstagramIcon, LinkIcon } from 'lucide-react'

export interface ContactMethod {
  id: string
  kind: string
  value: string
  label: string | null
  is_primary: boolean
  source: string
  created_at: string
}

interface Props {
  methods: ContactMethod[]
}

// Display order — emails first, phones next, web, then socials, other last
const KIND_ORDER: string[] = [
  'email',
  'phone',
  'website',
  'facebook',
  'instagram',
  'linkedin',
  'other',
]

const KIND_LABEL: Record<string, string> = {
  email: 'Email',
  phone: 'Telefon',
  website: 'WWW',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  other: 'Inne',
}

function kindIcon(kind: string): React.ReactNode {
  const cls = 'size-4 text-[#888]'
  switch (kind) {
    case 'email':
      return <MailIcon className={cls} />
    case 'phone':
      return <PhoneIcon className={cls} />
    case 'website':
      return <GlobeIcon className={cls} />
    case 'facebook':
      return <FacebookIcon className={cls} />
    case 'instagram':
      return <InstagramIcon className={cls} />
    default:
      return <LinkIcon className={cls} />
  }
}

function SourceBadge({ source }: { source: string }) {
  const cls =
    source === 'KRS'
      ? 'bg-[#DCFCE7] text-[#15803D]'
      : source === 'WWW' || source === 'website_scrape'
        ? 'bg-[#DBEAFE] text-[#1E40AF]'
        : source === 'apify_gmaps'
          ? 'bg-[#FEF3C7] text-[#92400E]'
          : source === 'tavily_brand'
            ? 'bg-[#F3E8FF] text-[#6B21A8]'
            : source === 'manual'
              ? 'bg-[#FFE4E6] text-[#9F1239]'
              : 'bg-[#F5F5F5] text-[#555]' // migration_seed + fallback
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {source}
    </span>
  )
}

function LabelBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-[#E0E7FF] px-1.5 py-0.5 text-[10px] font-medium text-[#3730A3]">
      {label}
    </span>
  )
}

function isUrlKind(kind: string): boolean {
  return kind === 'website' || kind === 'facebook' || kind === 'instagram' || kind === 'linkedin'
}

function renderValue(kind: string, value: string): React.ReactNode {
  if (kind === 'email') {
    return (
      <a href={`mailto:${value}`} className="hover:underline">
        {value}
      </a>
    )
  }
  if (kind === 'phone') {
    return (
      <a href={`tel:${value}`} className="font-mono hover:underline">
        {value}
      </a>
    )
  }
  if (isUrlKind(kind)) {
    const href = value.startsWith('http') ? value : `https://${value}`
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate hover:underline"
      >
        {value}
      </a>
    )
  }
  return <span>{value}</span>
}

function MethodRow({ m }: { m: ContactMethod }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="shrink-0">{kindIcon(m.kind)}</span>
      {m.is_primary && (
        <span title="Główny" className="text-amber-500" aria-label="primary">
          ★
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{renderValue(m.kind, m.value)}</span>
      {m.label && <LabelBadge label={m.label} />}
      <SourceBadge source={m.source} />
    </div>
  )
}

export function ContactSectionV3({ methods }: Props) {
  if (methods.length === 0) {
    return (
      <div className="rounded border border-dashed border-[#E5E1D8] bg-[#FAFAF7] p-4 text-center text-sm text-[#888]">
        Brak danych kontaktowych. Uruchom „Analizę klienta" або dodaj sposób kontaktu w T2.4.C.
      </div>
    )
  }

  // Group methods by kind
  const byKind = new Map<string, ContactMethod[]>()
  for (const m of methods) {
    const list = byKind.get(m.kind) ?? []
    list.push(m)
    byKind.set(m.kind, list)
  }

  // Section render order (emails first, socials last; "other" goes last regardless)
  const sectionKinds = KIND_ORDER.filter((k) => byKind.has(k))
  // Append any unknown kinds (defensive — should not happen z CHECK constraint)
  for (const k of byKind.keys()) {
    if (!KIND_ORDER.includes(k)) sectionKinds.push(k)
  }

  return (
    <div className="space-y-3 text-sm">
      {sectionKinds.map((kind) => {
        const rows = byKind.get(kind)!
        return (
          <div key={kind} className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[#888]">
              {kindIcon(kind)}
              <span>
                {KIND_LABEL[kind] ?? kind} ({rows.length})
              </span>
            </div>
            <div className="space-y-1 pl-1">
              {rows.map((m) => (
                <MethodRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
