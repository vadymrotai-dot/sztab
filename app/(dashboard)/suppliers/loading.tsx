import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col">
      <div className="border-b px-4 h-16 flex items-center gap-2">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-44" />
        </div>
        <Skeleton className="h-72 w-full rounded-md" />
      </div>
    </div>
  )
}
