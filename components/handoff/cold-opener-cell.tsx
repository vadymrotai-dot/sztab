'use client'

import { useState } from 'react'

export function ColdOpenerCell({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return <span className="text-muted-foreground text-xs">—</span>
  const short = text.length > 60 ? text.slice(0, 60) + '…' : text

  return (
    <div className="text-xs italic">
      {expanded ? text : short}
      {text.length > 60 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="ml-1 not-italic font-medium text-blue-600 hover:underline"
        >
          {expanded ? 'mniej' : 'więcej'}
        </button>
      )}
    </div>
  )
}
