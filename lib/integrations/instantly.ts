// lib/integrations/instantly.ts
// Instantly.ai API client для email кампаній.
// Fallback патерн: params.instantly_api_key || process.env.INSTANTLY_API_KEY
// Документація: https://developer.instantly.ai/

export interface InstantlyCampaign {
  id: string
  name: string
  status: string
  leads_count?: number
}

export interface InstantlyLead {
  email: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
  website?: string | null
  personalization?: string | null
  custom_variables?: Record<string, string>
}

export class InstantlyClient {
  private apiKey: string
  private baseUrl = 'https://api.instantly.ai/api/v2'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }

  // Список кампаній
  async listCampaigns(): Promise<InstantlyCampaign[]> {
    try {
      const res = await fetch(`${this.baseUrl}/campaigns?limit=100`, {
        headers: this.headers(),
      })
      if (!res.ok) return []
      const data = await res.json() as { items?: InstantlyCampaign[] }
      return data.items ?? []
    } catch {
      return []
    }
  }

  // Створити кампанію
  async createCampaign(name: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/campaigns`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return null
      const data = await res.json() as { id?: string }
      return data.id ?? null
    } catch {
      return null
    }
  }

  // Додати ліди до кампанії
  async addLeads(campaignId: string, leads: InstantlyLead[]): Promise<{ ok: boolean; error: string | null }> {
    try {
      const res = await fetch(`${this.baseUrl}/leads`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          campaign_id: campaignId,
          leads,
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        return { ok: false, error: `Instantly ${res.status}: ${err.slice(0, 200)}` }
      }
      return { ok: true, error: null }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  // Запустити кампанію
  async launchCampaign(campaignId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/campaigns/${campaignId}/activate`, {
        method: 'POST',
        headers: this.headers(),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // Пауза кампанії
  async pauseCampaign(campaignId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/campaigns/${campaignId}/pause`, {
        method: 'POST',
        headers: this.headers(),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // Статистика кампанії
  async getCampaignStats(campaignId: string): Promise<{
    sent: number
    opened: number
    replied: number
    bounced: number
  } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/campaigns/${campaignId}/analytics/overview`, {
        headers: this.headers(),
      })
      if (!res.ok) return null
      const data = await res.json() as {
        emails_sent_count?: number
        open_count?: number
        reply_count?: number
        bounce_count?: number
      }
      return {
        sent: data.emails_sent_count ?? 0,
        opened: data.open_count ?? 0,
        replied: data.reply_count ?? 0,
        bounced: data.bounce_count ?? 0,
      }
    } catch {
      return null
    }
  }
}

// Factory — читає ключ з params або env
export async function createInstantlyClient(
  paramsApiKey?: string | null
): Promise<InstantlyClient | null> {
  const key = paramsApiKey ?? process.env.INSTANTLY_API_KEY ?? null
  if (!key) return null
  return new InstantlyClient(key)
}
