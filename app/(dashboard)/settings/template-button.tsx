'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { DownloadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import {
  CENNIK_TEMPLATE_FILENAME,
  buildCennikTemplate,
} from '@/lib/templates/cennik-template'

export function TemplateButton() {
  const [generating, setGenerating] = useState(false)

  const handleDownload = async () => {
    setGenerating(true)
    try {
      const blob = buildCennikTemplate()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = CENNIK_TEMPLATE_FILENAME
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Szablon pobrany')
    } catch (err) {
      toast.error(`Nie udało się wygenerować: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Button onClick={handleDownload} disabled={generating}>
      {generating ? <Spinner className="mr-2" /> : <DownloadIcon className="mr-2 size-4" />}
      Pobierz wzór cennika dla dostawców (XLSX)
    </Button>
  )
}
