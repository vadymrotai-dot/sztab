import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MailIcon } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MailIcon className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Sprawdz email</CardTitle>
          <CardDescription>
            Wyslalismy link potwierdzajacy na Twoj adres email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-sm text-muted-foreground">
            Kliknij link w wiadomosci email, aby aktywowac swoje konto i rozpoczac korzystanie z Sztab CRM.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/auth/login">Powrot do logowania</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
