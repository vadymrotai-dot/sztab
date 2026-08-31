// components/clients/sent-messages-section.tsx
// Fix (31.08.2026) — historia wysłanych wiadomości (notification_log).
// Wcześniej wysyłki oferty/linku nigdzie nie były widoczne w UI. Pokazujemy
// KAŻDĄ wysyłkę osobno: data, typ, odbiorca, status (sent/failed).

import { MailIcon, CheckCircle2Icon, AlertTriangleIcon } from 'lucide-react'

export interface SentMessage {
  id: string
  channel: string
  template: string
  recipient: string | null
  status: string
  error_message: string | null
  created_at: string
  sent_at: string | null
}

const TEMPLATE_LABEL: Record<string, string> = {
  offer_cennik: 'Oferta / link do zamówienia',
  proforma: 'Proforma',
  vat_invoice: 'Faktura VAT',
}

function fmt(dt: string): string {
  try {
    return new Date(dt).toLocaleString('pl-PL', {
      timeZone: 'Europe/Warsaw',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dt
  }
}

export function SentMessagesSection({ messages }: { messages: SentMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-[#888]">
        Brak wysłanych wiadomości. Użyj „Wyślij ofertę" lub „Wyślij link do
        zamówienia" u góry.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-[#EEE] text-sm">
      {messages.map((m) => {
        const ok = m.status === 'sent' || m.status === 'delivered'
        return (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <MailIcon className="size-4 shrink-0 text-[#888]" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-800">
                {TEMPLATE_LABEL[m.template] ?? m.template}
                <span className="ml-2 font-normal text-[#888]">
                  {m.recipient ?? '—'}
                </span>
              </div>
              <div className="text-[12px] text-[#999]">
                {fmt(m.created_at)}
                {m.error_message ? ` · ${m.error_message}` : ''}
              </div>
            </div>
            {ok ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-medium text-[#15803D]">
                <CheckCircle2Icon className="size-3" />
                {m.status === 'delivered' ? 'dostarczono' : 'wysłano'}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-medium text-[#B91C1C]">
                <AlertTriangleIcon className="size-3" />
                {m.status}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
