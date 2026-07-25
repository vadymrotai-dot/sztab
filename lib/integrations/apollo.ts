// lib/integrations/apollo.ts
// Apollo.io API client для збагачення лідів (email + LinkedIn).
// Fallback патерн: params.apollo_api_key || process.env.APOLLO_API_KEY
// Документація: https://apolloio.github.io/apollo-api-docs/

export interface ApolloPersonMatch {
  id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  linkedin_url: string | null
  title: string | null
  organization_name: string | null
  phone_numbers: { raw_number: string }[]
}

export interface ApolloEnrichResult {
  person: ApolloPersonMatch | null
  email: string | null
  linkedin_url: string | null
  phone: string | null
  error: string | null
}

export class ApolloClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  // Збагатити одну особу по імені + назві компанії
  async enrichPerson(params: {
    first_name: string
    last_name: string
    organization_name: string
    domain?: string | null
  }): Promise<ApolloEnrichResult> {
    try {
      const response = await fetch('https://api.apollo.io/api/v1/people/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          first_name: params.first_name,
          last_name: params.last_name,
          organization_name: params.organization_name,
          domain: params.domain ?? undefined,
          reveal_personal_emails: true,
        }),
      })
      if (!response.ok) {
        const err = await response.text()
        return { person: null, email: null, linkedin_url: null, phone: null, error: `Apollo ${response.status}: ${err.slice(0, 200)}` }
      }
      const data = await response.json() as { person?: ApolloPersonMatch }
      const person = data.person ?? null
      return {
        person,
        email: person?.email ?? null,
        linkedin_url: person?.linkedin_url ?? null,
        phone: person?.phone_numbers?.[0]?.raw_number ?? null,
        error: null,
      }
    } catch (e) {
      return { person: null, email: null, linkedin_url: null, phone: null, error: String(e) }
    }
  }

  // Збагатити масово через bulk endpoint (платний план)
  async enrichBulk(people: {
    first_name: string
    last_name: string
    organization_name: string
    domain?: string | null
    external_id?: string
  }[]): Promise<{ external_id: string; result: ApolloEnrichResult }[]> {
    try {
      const response = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ details: people, reveal_personal_emails: true }),
      })
      if (!response.ok) {
        const err = await response.text()
        return people.map(p => ({
          external_id: p.external_id ?? '',
          result: { person: null, email: null, linkedin_url: null, phone: null, error: `Apollo bulk ${response.status}: ${err.slice(0, 100)}` },
        }))
      }
      const data = await response.json() as { matches?: { id: string; person?: ApolloPersonMatch }[] }
      return (data.matches ?? []).map((m, i) => ({
        external_id: people[i]?.external_id ?? m.id,
        result: {
          person: m.person ?? null,
          email: m.person?.email ?? null,
          linkedin_url: m.person?.linkedin_url ?? null,
          phone: m.person?.phone_numbers?.[0]?.raw_number ?? null,
          error: null,
        },
      }))
    } catch (e) {
      return people.map(p => ({
        external_id: p.external_id ?? '',
        result: { person: null, email: null, linkedin_url: null, phone: null, error: String(e) },
      }))
    }
  }
}

// Factory — читає ключ з params або env
export async function createApolloClient(
  paramsApiKey?: string | null
): Promise<ApolloClient | null> {
  const key = paramsApiKey ?? process.env.APOLLO_API_KEY ?? null
  if (!key) return null
  return new ApolloClient(key)
}
