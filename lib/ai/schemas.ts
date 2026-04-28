// lib/ai/schemas.ts
// Zod schemas dla parsowanych odpowiedzi Gemini per route. Zapobiega
// silent DB corruption gdy Gemini hallucinuje fields (np.
// potential_score: "siedem" zamiast number 7, lub recommended_segment
// jako wartość spoza enuma).
//
// Pattern: route → extractJSON() → validateAIResponse(parsed, schema)
// → typed data lub AISchemaInvalidError. Caller loguje pod prefixem
// [AI_SCHEMA_INVALID] i zwraca friendly polski komunikat.

import { z } from 'zod'

// ────────────────────────────────────────────────────────────
// Error class — rzucany przez validateAIResponse() gdy schema fail
// ────────────────────────────────────────────────────────────

export class AISchemaInvalidError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly raw: unknown,
    public readonly context: string,
  ) {
    super(message)
    this.name = 'AISchemaInvalidError'
  }
}

/**
 * Validate parsed AI response against expected schema. Throws
 * AISchemaInvalidError on failure (caller handles with friendly msg).
 *
 * Generic over schema (not output type) — zachowuje pełną zod inferencję
 * defaults / transforms / discriminated unions. Return type to z.infer<S>
 * (output type schemy, po wszystkich .default(), .transform() itd.).
 */
export function validateAIResponse<S extends z.ZodTypeAny>(
  parsed: unknown,
  schema: S,
  context: string,
): z.infer<S> {
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new AISchemaInvalidError(
      `AI response failed schema validation (${context}): ${result.error.issues.length} issues`,
      result.error.issues,
      parsed,
      context,
    )
  }
  return result.data
}

// ────────────────────────────────────────────────────────────
// 1. Potential analysis (route: /api/ai/potential-analysis)
// ────────────────────────────────────────────────────────────

// Special variant — model explicitly refused to score (per strengthened
// prompt). Detected BEFORE main schema validation; not validated by
// PotentialAnalysisSchema (handled separately, returns 422 to client).
export const InsufficientDataSchema = z.object({
  error: z.literal('insufficient_data'),
  reason: z.string().optional(),
})

const SEGMENT_VALUES = [
  'niesklasyfikowany',
  'maly_opt',
  'sredni_opt',
  'duzy_opt',
  'katalog',
  'docel',
] as const

// Defensive: prompt says 0-10 but Gemini sometimes emits floats lub
// out-of-range. Coerce to integer w zakresie 0-10. .catch fallback gdy
// nie da się zinterpretować.
export const PotentialAnalysisSchema = z.object({
  potential_score: z
    .number()
    .min(0)
    .max(10)
    .transform((n) => Math.round(n)),
  recommended_segment: z.enum(SEGMENT_VALUES),
  potential_summary: z.string().min(1),
  strategy: z.string().min(1),
  offer_recommendations: z.string().min(1),
  risks: z.string().min(1),
})

export type PotentialAnalysis = z.infer<typeof PotentialAnalysisSchema>

// ────────────────────────────────────────────────────────────
// 2. Business data (route: /api/ai/business-data)
// ────────────────────────────────────────────────────────────

export const BusinessDataSchema = z.object({
  verified_name: z.string().optional().default(''),
  website: z.string().optional().default(''),
  social: z
    .object({
      facebook: z.string().optional(),
      instagram: z.string().optional(),
      linkedin: z.string().optional(),
      other: z.string().optional(),
    })
    .partial()
    .optional(),
  locations: z.array(z.string()).optional().default([]),
  people: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().optional().default(''),
      }),
    )
    .optional()
    .default([]),
  additional_contacts: z
    .object({
      emails: z.array(z.string()).optional().default([]),
      phones: z.array(z.string()).optional().default([]),
    })
    .partial()
    .optional(),
  description: z.string().optional().default(''),
})

export type BusinessData = z.infer<typeof BusinessDataSchema>

// ────────────────────────────────────────────────────────────
// 3. Parse command (route: /api/ai/parse-command)
//    Discriminated union — 5 wariantów akcji.
// ────────────────────────────────────────────────────────────

export const ParseCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_client'),
    payload: z.object({
      title: z.string(),
      nip: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      segment: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal('create_task'),
    payload: z.object({
      title: z.string(),
      due: z.string().nullable().optional(),
      priority: z.string().optional(),
      sphere: z.string().optional(),
      clientTitle: z.string().nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal('create_deal'),
    payload: z.object({
      title: z.string(),
      clientTitle: z.string().nullable().optional(),
      stage: z.string().optional(),
      amount: z.number().optional(),
    }),
  }),
  z.object({
    action: z.literal('search_client'),
    payload: z.object({ query: z.string() }),
  }),
  z.object({
    action: z.literal('unknown'),
    payload: z
      .object({ reason: z.string() })
      .optional()
      .default({ reason: 'unspecified' }),
  }),
])

export type ParseCommandResult = z.infer<typeof ParseCommandSchema>
