'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { Save, LogOut, Key, DollarSign } from 'lucide-react'
import type { Params } from '@/lib/types'

export default function SettingsPage() {
  const [params, setParams] = useState<Params | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadParams()
  }, [])

  async function loadParams() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth/login')
      return
    }

    const { data } = await supabase
      .from('params')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (data) {
      setParams(data)
    } else {
      // Create default params
      const { data: newParams } = await supabase
        .from('params')
        .insert({ owner_id: user.id })
        .select()
        .single()
      setParams(newParams)
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!params) return
    setSaving(true)

    const { error } = await supabase
      .from('params')
      .update({
        kurs_eur_pln: params.kurs_eur_pln,
        overhead: params.overhead,
        anthropic_key: params.anthropic_key,
        gemini_key: params.gemini_key,
        openrouter_key: params.openrouter_key,
      })
      .eq('id', params.id)

    setSaving(false)
    if (!error) {
      alert('Ustawienia zapisane!')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ustawienia" />

      <Tabs defaultValue="pricing" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pricing" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Cennik
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Key className="h-4 w-4" />
            Klucze API
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Parametry cenowe</CardTitle>
              <CardDescription>
                Ustaw kurs EUR/PLN i narzut dla kalkulatora cen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kurs">Kurs EUR/PLN</Label>
                  <Input
                    id="kurs"
                    type="number"
                    step="0.01"
                    value={params?.kurs_eur_pln || 4.28}
                    onChange={(e) => setParams(prev => prev ? { ...prev, kurs_eur_pln: parseFloat(e.target.value) } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overhead">Narzut (mnożnik)</Label>
                  <Input
                    id="overhead"
                    type="number"
                    step="0.01"
                    value={params?.overhead || 1.15}
                    onChange={(e) => setParams(prev => prev ? { ...prev, overhead: parseFloat(e.target.value) } : null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    np. 1.15 = 15% narzutu
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Klucze API</CardTitle>
              <CardDescription>
                Klucze do usług AI używanych w generatorze KP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anthropic">Klucz Anthropic</Label>
                <Input
                  id="anthropic"
                  type="password"
                  placeholder="sk-ant-..."
                  value={params?.anthropic_key || ''}
                  onChange={(e) => setParams(prev => prev ? { ...prev, anthropic_key: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gemini">Klucz Gemini</Label>
                <Input
                  id="gemini"
                  type="password"
                  placeholder="AIza..."
                  value={params?.gemini_key || ''}
                  onChange={(e) => setParams(prev => prev ? { ...prev, gemini_key: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openrouter">Klucz OpenRouter</Label>
                <Input
                  id="openrouter"
                  type="password"
                  placeholder="sk-or-..."
                  value={params?.openrouter_key || ''}
                  onChange={(e) => setParams(prev => prev ? { ...prev, openrouter_key: e.target.value } : null)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          Wyloguj
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Zapisywanie...' : 'Zapisz ustawienia'}
        </Button>
      </div>
    </div>
  )
}
