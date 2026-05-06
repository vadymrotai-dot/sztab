'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { sections, totalQuestions, type Question } from './questions'
import { Check } from 'lucide-react'
import { toast } from 'sonner'

const VALID_TOKENS = ['pikniko-maxim-2026-discovery-v1']

type AnswerValue = string | number | string[]

interface ResponsesMap {
  [questionId: string]: AnswerValue
}

export default function DiscoveryPage({
  searchParams,
}: {
  searchParams: { t?: string }
}) {
  const token = searchParams.t || ''
  const isValidToken = VALID_TOKENS.includes(token)

  const [responses, setResponses] = useState<ResponsesMap>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Map<string, Date>>(new Map())
  const [hasStarted, setHasStarted] = useState(false)
  const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Load existing responses on mount
  useEffect(() => {
    if (!isValidToken) return
    fetch(`/api/discovery/load?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.responses) setResponses(data.responses)
      })
      .catch(() => {})
  }, [token, isValidToken])

  // Auto-save on change with debounce
  const saveAnswer = useCallback(
    async (questionId: string, sectionId: string, answer: AnswerValue) => {
      setSavingIds((prev) => new Set(prev).add(questionId))
      try {
        const res = await fetch('/api/discovery/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, question_id: questionId, section_id: sectionId, answer }),
        })
        if (!res.ok) throw new Error('save failed')
        setSavedIds((prev) => new Map(prev).set(questionId, new Date()))
      } catch {
        toast.error('Не вдалося зберегти. Перевір з\'єднання.')
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev)
          next.delete(questionId)
          return next
        })
      }
    },
    [token],
  )

  const onAnswerChange = (
    questionId: string,
    sectionId: string,
    answer: AnswerValue,
  ) => {
    setResponses((prev) => ({ ...prev, [questionId]: answer }))
    // Debounce save: 800ms after last edit
    const existingTimer = saveTimers.current.get(questionId)
    if (existingTimer) clearTimeout(existingTimer)
    const timer = setTimeout(() => {
      saveAnswer(questionId, sectionId, answer)
      saveTimers.current.delete(questionId)
    }, 800)
    saveTimers.current.set(questionId, timer)
  }

  // Calculate progress
  const answeredCount = Object.keys(responses).filter((id) => {
    const val = responses[id]
    if (Array.isArray(val)) return val.length > 0
    if (typeof val === 'string') return val.trim().length > 0
    return val !== undefined && val !== null
  }).length
  const progressPct = Math.round((answeredCount / totalQuestions) * 100)

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Доступ заборонено</h1>
          <p className="text-slate-600">
            Це посилання потребує валідний токен. Якщо ти отримав це посилання від Vadym — перевір
            що скопіював URL повністю.
          </p>
        </div>
      </div>
    )
  }

  if (!hasStarted) {
    return <LandingScreen onStart={() => setHasStarted(true)} />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header answeredCount={answeredCount} progressPct={progressPct} />

      <main className="max-w-[720px] mx-auto px-6 py-8 pb-20">
        <Hero />
        <WhoAsks />

        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            responses={responses}
            savingIds={savingIds}
            savedIds={savedIds}
            onAnswerChange={(qid, val) => onAnswerChange(qid, section.id, val)}
          />
        ))}

        <FinishCard answeredCount={answeredCount} totalCount={totalQuestions} />
      </main>
    </div>
  )
}

// ============ HEADER ============

function Header({
  answeredCount,
  progressPct,
}: {
  answeredCount: number
  progressPct: number
}) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-[720px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoSymbol />
          <div className="font-[family-name:var(--font-archivo-black)] text-2xl text-[#0c2d6b] tracking-tight">
            sztab
          </div>
        </div>
        <div className="text-right text-sm text-slate-500">
          <div>
            <strong className="text-[#0c2d6b]">{answeredCount}</strong> / {totalQuestions} запитань
          </div>
        </div>
      </div>
      <div className="h-1 bg-slate-200">
        <div
          className="h-full bg-gradient-to-r from-[#1d4ed8] to-[#14b8a6] transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </header>
  )
}

function LogoSymbol() {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-9 h-9">
      {Array.from({ length: 9 }).map((_, i) => {
        const isMiddle = i >= 3 && i <= 5
        return (
          <div
            key={i}
            className="rounded-[2px]"
            style={{ background: isMiddle ? '#14b8a6' : '#1d4ed8' }}
          />
        )
      })}
    </div>
  )
}

// ============ HERO ============

function Hero() {
  return (
    <div className="mb-8">
      <div className="text-xs uppercase tracking-[0.15em] text-[#14b8a6] font-semibold mb-2">
        Pikniko × Sztab
      </div>
      <h1 className="font-[family-name:var(--font-archivo-black)] text-4xl text-[#0c2d6b] leading-[1.1] tracking-tight mb-3">
        Discovery — операції Pikniko
      </h1>
      <p className="text-slate-500 text-base">
        Розмова Vadym ↔ Maxim · 06.05.2026 · приблизний час ~30–40 хв
      </p>
    </div>
  )
}

// ============ WHO ASKS ============

function WhoAsks() {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 mb-6 text-sm text-amber-900">
      <strong>Як це працює:</strong> Vadym заповнює форму разом з Maxim&apos;ом під час розмови.
      Кожна відповідь зберігається автоматично — можна зупинитись і повернутись у будь-який момент.
    </div>
  )
}

// ============ LANDING ============

function LandingScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[720px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LogoSymbol />
            <div className="font-[family-name:var(--font-archivo-black)] text-2xl text-[#0c2d6b] tracking-tight">
              sztab
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-6 py-12 pb-20">
        <Hero />
        <WhoAsks />

        <div
          className="rounded-2xl border border-sky-200 p-7 mb-8"
          style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%)' }}
        >
          <span className="inline-block bg-[#0c2d6b] text-white px-2.5 py-1 rounded text-[11px] tracking-[0.1em] font-semibold mb-4">
            OPEN BOOK
          </span>
          <h2 className="text-lg font-semibold text-[#0c2d6b] mb-3">
            Що це і навіщо ці питання
          </h2>
          <p className="text-slate-700 text-sm mb-3">
            Sztab — платформа intelligence для операцій B2B HoReCa hurtowni. Для Pikniko це:
            AI-парсинг замовлень (email/WhatsApp/фото папірців), розумне співставлення
            клієнт↔товар, автоматичні oferty, відстеження lifecycle замовлень.
          </p>
          <p className="text-slate-700 text-sm mb-3">
            <strong>Ці питання допоможуть зрозуміти стан операцій Pikniko</strong> — скільки
            замовлень, які канали, як виглядають cenniki, де болить найбільше. Без цієї розмови ми
            будували б наосліп.
          </p>
          <p className="text-slate-700 text-sm">
            Наступні 3 місяці Vadym працює як operations director Pikniko — Sztab буде
            використовуватись як інструмент підтримки. Через 3 місяці — варіант продовження як SaaS
            subscription, якщо ROI підтвердиться.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="text-sm text-slate-500 mb-4">
            9 секцій · {totalQuestions} запитань · автозбереження
          </div>
          <button
            onClick={onStart}
            className="bg-[#0c2d6b] hover:bg-[#1d4ed8] text-white font-semibold px-8 py-3.5 rounded-lg transition-colors"
          >
            Розпочати →
          </button>
        </div>
      </main>
    </div>
  )
}

// ============ SECTION ============

function SectionBlock({
  section,
  responses,
  savingIds,
  savedIds,
  onAnswerChange,
}: {
  section: (typeof sections)[number]
  responses: ResponsesMap
  savingIds: Set<string>
  savedIds: Map<string, Date>
  onAnswerChange: (questionId: string, value: AnswerValue) => void
}) {
  return (
    <section
      id={section.id}
      className="bg-white border border-slate-200 rounded-2xl p-8 mb-6"
    >
      <div className="flex items-center gap-4 mb-2">
        <div
          className="w-10 h-10 bg-[#0c2d6b] text-white rounded-[10px] flex items-center justify-center text-lg"
          style={{ fontFamily: 'var(--font-archivo-black)' }}
        >
          {section.number}
        </div>
        <h2
          className="text-xl text-[#0c2d6b] tracking-tight"
          style={{ fontFamily: 'var(--font-archivo-black)' }}
        >
          {section.title}
        </h2>
      </div>
      <div className="text-slate-500 text-sm mb-7 ml-14">{section.intro}</div>

      {section.questions.map((q, idx) => (
        <QuestionBlock
          key={q.id}
          question={q}
          value={responses[q.id]}
          isSaving={savingIds.has(q.id)}
          isSaved={savedIds.has(q.id)}
          isLast={idx === section.questions.length - 1}
          onChange={(val) => onAnswerChange(q.id, val)}
        />
      ))}
    </section>
  )
}

// ============ QUESTION ============

function QuestionBlock({
  question,
  value,
  isSaving,
  isSaved,
  isLast,
  onChange,
}: {
  question: Question
  value?: AnswerValue
  isSaving: boolean
  isSaved: boolean
  isLast: boolean
  onChange: (value: AnswerValue) => void
}) {
  return (
    <div
      className={
        isLast ? 'mb-0 pb-0' : 'mb-7 pb-7 border-b border-dashed border-slate-200'
      }
    >
      <label className="block font-semibold text-slate-900 mb-2 text-[15px]">
        <span className="text-xs text-slate-400 mr-2 font-mono">{question.id}</span>
        {question.question}
      </label>

      {question.hint && (
        <div className="text-xs text-slate-500 italic mb-3">{question.hint}</div>
      )}

      <QuestionInput question={question} value={value} onChange={onChange} />

      {(isSaving || isSaved) && (
        <div className="flex items-center gap-1.5 text-[#14b8a6] text-xs mt-2 opacity-80">
          {isSaving ? (
            <>
              <div className="w-1.5 h-1.5 bg-[#14b8a6] rounded-full animate-pulse" />
              Зберігаю...
            </>
          ) : (
            <>
              <Check className="w-3 h-3" />
              Збережено
            </>
          )}
        </div>
      )}
    </div>
  )
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question
  value?: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  if (question.type === 'single_choice') {
    return (
      <div className="flex flex-col gap-2">
        {(question.options || []).map((opt) => {
          const selected = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`flex items-center px-4 py-3 border rounded-[10px] text-left text-sm transition-all ${
                selected
                  ? 'border-[#1d4ed8] bg-blue-50 border-2'
                  : 'border-slate-200 bg-white hover:border-[#14b8a6] hover:bg-teal-50/50 border-[1.5px]'
              }`}
            >
              <span
                className={`w-[18px] h-[18px] rounded-full mr-3 flex-shrink-0 relative ${
                  selected ? 'border-2 border-[#1d4ed8]' : 'border-2 border-slate-300'
                }`}
              >
                {selected && (
                  <span className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 bg-[#1d4ed8] rounded-full" />
                )}
              </span>
              <span>{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'multi_choice') {
    const selected = (value as string[]) || []
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
        {(question.options || []).map((opt) => {
          const isSelected = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                const next = isSelected
                  ? selected.filter((s) => s !== opt)
                  : [...selected, opt]
                onChange(next)
              }}
              className={`flex items-center px-3.5 py-2.5 border rounded-lg text-left text-[13px] transition-all ${
                isSelected
                  ? 'border-[#14b8a6] bg-teal-50 border-[1.5px]'
                  : 'border-slate-200 bg-white hover:border-[#14b8a6] border-[1.5px]'
              }`}
            >
              <span
                className={`w-4 h-4 rounded mr-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected
                    ? 'bg-[#14b8a6] border-2 border-[#14b8a6]'
                    : 'border-2 border-slate-300'
                }`}
              >
                {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />}
              </span>
              <span>{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'textarea') {
    return (
      <textarea
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        className="w-full px-4 py-3 border-[1.5px] border-slate-200 rounded-[10px] text-sm font-[inherit] focus:outline-none focus:border-[#1d4ed8] min-h-[80px] resize-y"
      />
    )
  }

  if (question.type === 'number') {
    return (
      <input
        type="number"
        value={(value as number) || ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={question.placeholder}
        className="w-full px-4 py-3 border-[1.5px] border-slate-200 rounded-[10px] text-sm font-[inherit] focus:outline-none focus:border-[#1d4ed8]"
      />
    )
  }

  // text fallback
  return (
    <input
      type="text"
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder}
      className="w-full px-4 py-3 border-[1.5px] border-slate-200 rounded-[10px] text-sm font-[inherit] focus:outline-none focus:border-[#1d4ed8]"
    />
  )
}

// ============ FINISH ============

function FinishCard({
  answeredCount,
  totalCount,
}: {
  answeredCount: number
  totalCount: number
}) {
  const isComplete = answeredCount >= totalCount * 0.7

  if (!isComplete) return null

  return (
    <div
      className="rounded-2xl p-8 text-center border-2 border-[#14b8a6]"
      style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%)' }}
    >
      <div className="text-5xl mb-4">🎉</div>
      <h2
        className="text-2xl text-[#0c2d6b] mb-3 tracking-tight"
        style={{ fontFamily: 'var(--font-archivo-black)' }}
      >
        Дякую, Maxim!
      </h2>
      <p className="text-slate-600 mb-2">
        Заповнено {answeredCount}/{totalCount} запитань. Vadym має все що треба для наступного кроку.
      </p>
      <p className="text-xs text-slate-500">
        Можеш закрити сторінку — все збережено автоматично.
      </p>
    </div>
  )
}
