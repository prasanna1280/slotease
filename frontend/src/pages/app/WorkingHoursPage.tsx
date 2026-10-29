import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { WorkingHoursEditor } from '@/components/hours/WorkingHoursEditor'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentBusiness } from '@/hooks/useAuth'
import { useWorkingHours } from '@/hooks/useWorkingHours'

export default function WorkingHoursPage() {
  const business = useCurrentBusiness()
  const hours = useWorkingHours()

  return (
    <>
      <PageHeader title="Working hours" description="Set the days and times you take bookings, including breaks." />
      {hours.isError ? (
        <QueryErrorAlert
          title="Could not load working hours"
          error={hours.error}
          onRetry={() => void hours.refetch()}
          retrying={hours.isFetching}
        />
      ) : hours.isPending ? (
        <Card className="divide-y divide-border" aria-busy="true" aria-label="Loading working hours">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-6 w-11 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-10 w-36" />
            </div>
          ))}
        </Card>
      ) : (
        <WorkingHoursEditor initial={hours.data} timezone={business.timezone} />
      )}
    </>
  )
}
