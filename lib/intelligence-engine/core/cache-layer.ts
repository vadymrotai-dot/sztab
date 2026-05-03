// lib/intelligence-engine/core/cache-layer.ts
// Sprint S-CORE.1.A — stub. Real cache — S-CORE.1.B або пізніше.
//
// Cache layer для дорогих source calls (KRS rejestr.io payloads, AI
// re-scores). Backend TBD у S-CORE.1.B (Supabase table vs Redis vs
// in-memory) — interface stable.

export interface ICacheLayer {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  invalidate(keyPrefix: string): Promise<void>
}

export class CacheLayer implements ICacheLayer {
  async get<T>(_key: string): Promise<T | null> {
    throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
  }

  async set<T>(
    _key: string,
    _value: T,
    _ttlSeconds?: number,
  ): Promise<void> {
    throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
  }

  async invalidate(_keyPrefix: string): Promise<void> {
    throw new Error('Not implemented — S-CORE.1.B Sub-Sprint')
  }
}
