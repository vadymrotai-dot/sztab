// components/clients/contact-section-v2.tsx
// Sprint S2B Phase 2E — multi-source contact rendering з source badges.

import { MailIcon, PhoneIcon, GlobeIcon, FacebookIcon, InstagramIcon } from 'lucide-react'

interface Props {
  email: string | null
  emailSource?: string | null // 'KRS' | 'WWW' | 'Apify' itd.
  phone: string | null
  phoneSource?: string | null
  website: string | null
  websiteSource?: string | null
  facebookUrl?: string | null
  instagramUrl?: string | null
  /** Hint когда NULL */
  hints?: { email?: string; phone?: string; website?: string }
}

function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null
  const cls =
    source === 'KRS'
      ? 'bg-[#DCFCE7] text-[#15803D]'
      : source === 'WWW'
        ? 'bg-[#DBEAFE] text-[#1E40AF]'
        : source === 'Apify'
          ? 'bg-[#FEF3C7] text-[#92400E]'
          : 'bg-[#F5F5F5] text-[#555]'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{source}</span>
  )
}

export function ContactSectionV2({
  email,
  emailSource,
  phone,
  phoneSource,
  website,
  websiteSource,
  facebookUrl,
  instagramUrl,
  hints,
}: Props) {
  return (
    <div className="space-y-2 text-sm">
      <ContactRow icon={<MailIcon className="size-4 text-[#888]" />} value={email} source={emailSource} hint={hints?.email} type="email" />
      <ContactRow icon={<PhoneIcon className="size-4 text-[#888]" />} value={phone} source={phoneSource} hint={hints?.phone} type="phone" />
      <ContactRow
        icon={<GlobeIcon className="size-4 text-[#888]" />}
        value={website}
        source={websiteSource}
        hint={hints?.website}
        type="url"
      />
      {facebookUrl && (
        <ContactRow icon={<FacebookIcon className="size-4 text-[#888]" />} value={facebookUrl} source="WWW" type="url" />
      )}
      {instagramUrl && (
        <ContactRow icon={<InstagramIcon className="size-4 text-[#888]" />} value={instagramUrl} source="WWW" type="url" />
      )}
    </div>
  )
}

function ContactRow({
  icon,
  value,
  source,
  hint,
  type,
}: {
  icon: React.ReactNode
  value: string | null
  source: string | null | undefined
  hint?: string
  type: 'email' | 'phone' | 'url'
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0">{icon}</span>
      {value ? (
        <>
          {type === 'email' ? (
            <a className="hover:underline" href={`mailto:${value}`}>{value}</a>
          ) : type === 'phone' ? (
            <a className="hover:underline font-mono" href={`tel:${value}`}>{value}</a>
          ) : (
            <a
              className="hover:underline truncate"
              href={value.startsWith('http') ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {value}
            </a>
          )}
          <SourceBadge source={source} />
        </>
      ) : (
        <span className="text-[#888]">
          —{hint && <span className="ml-2 text-[12px] italic">({hint})</span>}
        </span>
      )}
    </div>
  )
}
