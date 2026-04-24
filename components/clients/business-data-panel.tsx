'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import {
  Globe,
  Sparkles,
  RefreshCw,
  MapPin,
  Users,
  Mail,
  Phone,
  ExternalLink,
  Facebook,
  Instagram,
  Linkedin,
  BookOpen,
  X,
} from 'lucide-react'

interface Person {
  name: string
  role: string
}

interface BusinessData {
  verified_name?: string
  website?: string
  social?: {
    facebook?: string
    instagram?: string
    linkedin?: string
    other?: string
  }
  locations?: string[]
  people?: Person[]
  additional_contacts?: {
    emails?: string[]
    phones?: string[]
  }
  description?: string
  generated_at?: string
  model?: string
  sources?: Array<{ uri?: string; title?: string }>
}

interface Props {
  clientId: string
  initial?: BusinessData | null
}

function isEmpty(v: any): boolean {
  if (!v) return true
  if (v === 'brak danych') return true
  if (typeof v === 'string' && !v.trim()) return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

export function BusinessDataPanel({ clientId, initial }: Props) {
  const [data, setData] = useState<BusinessData | null>(initial || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleFetch = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/business-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!json?.ok) {
        setError(json?.error || 'Blad zbierania danych')
        setLoading(false)
        return
      }
      setData(json.businessData)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Blad sieci')
    } finally {
      setLoading(false)
    }
  }

  // Empty state - no data yet
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" />
            Dane biznesowe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Zbierz automatycznie dane biznesowe o tej firmie: zweryfikowana nazwa,
            strona WWW, social media, lokalizacje, kluczowe osoby. AI wykorzystuje
            Google Search.
          </p>
          <Button
            type="button"
            onClick={handleFetch}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Spinner className="size-4" />
                Zbieranie danych...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Zbierz dane biznesowe
              </>
            )}
          </Button>
          {error && (
            <p className="mt-3 text-sm text-destructive">
              <X className="mr-1 inline size-4" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // Has data - show structured view
  const socials = [
    { key: 'facebook', icon: Facebook, value: data.social?.facebook },
    { key: 'instagram', icon: Instagram, value: data.social?.instagram },
    { key: 'linkedin', icon: Linkedin, value: data.social?.linkedin },
    { key: 'other', icon: Globe, value: data.social?.other },
  ].filter((s) => !isEmpty(s.value))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" />
            Dane biznesowe
            {data.generated_at && (
              <span className="text-xs font-normal text-muted-foreground">
                (
                {new Date(data.generated_at).toLocaleString('pl-PL', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                )
              </span>
            )}
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleFetch}
            disabled={loading}
            className="gap-1 text-xs"
          >
            {loading ? (
              <Spinner className="size-3" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Odswiez
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Verified name */}
        {!isEmpty(data.verified_name) && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Zweryfikowana nazwa
            </div>
            <div className="text-sm font-medium">{data.verified_name}</div>
          </div>
        )}

        {/* Description */}
        {!isEmpty(data.description) && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dzialalnosc
            </div>
            <div className="text-sm">{data.description}</div>
          </div>
        )}

        {/* Website */}
        {!isEmpty(data.website) && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Strona WWW
            </div>
            <a
              href={data.website!.startsWith('http') ? data.website : `https://${data.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <Globe className="size-3" />
              {data.website}
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        {/* Social media */}
        {socials.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Social media
            </div>
            <div className="flex flex-wrap gap-2">
              {socials.map(({ key, icon: Icon, value }) => (
                <a
                  key={key}
                  href={value!.startsWith('http') ? value : `https://${value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                >
                  <Icon className="size-3" />
                  {key}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Locations */}
        {data.locations && data.locations.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="size-3" />
              Lokalizacje ({data.locations.length})
            </div>
            <ul className="space-y-1">
              {data.locations.map((loc, i) => (
                <li key={i} className="text-sm">
                  {loc}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* People */}
        {data.people && data.people.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="size-3" />
              Osoby ({data.people.length})
            </div>
            <ul className="space-y-1">
              {data.people.map((p, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{p.name}</span>
                  {p.role && (
                    <span className="text-muted-foreground"> — {p.role}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Additional contacts */}
        {(data.additional_contacts?.emails?.length ||
          data.additional_contacts?.phones?.length) ? (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dodatkowe kontakty
            </div>
            <div className="space-y-1">
              {data.additional_contacts?.emails?.map((email, i) => (
                <div key={`e${i}`} className="flex items-center gap-1 text-sm">
                  <Mail className="size-3 text-muted-foreground" />
                  <a href={`mailto:${email}`} className="hover:underline">
                    {email}
                  </a>
                </div>
              ))}
              {data.additional_contacts?.phones?.map((phone, i) => (
                <div key={`p${i}`} className="flex items-center gap-1 text-sm">
                  <Phone className="size-3 text-muted-foreground" />
                  <a href={`tel:${phone}`} className="hover:underline">
                    {phone}
                  </a>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Sources */}
        {data.sources && data.sources.length > 0 && (
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Zrodla ({data.sources.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {data.sources.map((s, i) => (
                <li key={i} className="text-xs">
                  <a
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {s.title || s.uri}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <p className="text-sm text-destructive">
            <X className="mr-1 inline size-4" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
