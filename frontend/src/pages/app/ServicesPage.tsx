import { Plus, Scissors } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { ServiceFormDialog } from '@/components/services/ServiceFormDialog'
import { ServiceList } from '@/components/services/ServiceList'
import { currencySymbol } from '@/components/services/service-schema'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useCurrentBusiness } from '@/hooks/useAuth'
import { useServices, useSetServiceActive } from '@/hooks/useServices'
import { getErrorMessage } from '@/lib/errors'
import type { ServiceOut } from '@/types/api'

type FormState = { open: false } | { open: true; service?: ServiceOut }

export default function ServicesPage() {
  const business = useCurrentBusiness()
  const [showInactive, setShowInactive] = useState(false)
  const services = useServices(showInactive)
  const setActive = useSetServiceActive()
  const [form, setForm] = useState<FormState>({ open: false })
  const [toDeactivate, setToDeactivate] = useState<ServiceOut | null>(null)

  const changeActive = (service: ServiceOut, active: boolean) => {
    setActive.mutate(
      { id: service.id, active },
      {
        onSuccess: () => {
          toast.success(active ? 'Service reactivated' : 'Service deactivated', { description: service.name })
          setToDeactivate(null)
        },
        onError: (err) => {
          toast.error(getErrorMessage(err, 'Could not update the service.'))
          setToDeactivate(null)
        },
      },
    )
  }

  const openCreate = () => setForm({ open: true })

  return (
    <>
      <PageHeader
        title="Services"
        description="What customers can book, with duration and price."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" />
            Add service
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
        <label htmlFor="show-inactive" className="text-sm text-foreground">
          Show inactive services
        </label>
      </div>

      {services.isError ? (
        <QueryErrorAlert
          title="Could not load services"
          error={services.error}
          onRetry={() => void services.refetch()}
          retrying={services.isFetching}
        />
      ) : services.isPending ? (
        <Card className="divide-y divide-border" aria-busy="true" aria-label="Loading services">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : services.data.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title={showInactive ? 'No services yet' : 'No active services'}
          description="Add the services customers can book, such as “Haircut · 30 min · ₹300”."
          action={
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" />
              Add your first service
            </Button>
          }
        />
      ) : (
        <ServiceList
          services={services.data}
          currency={business.currency}
          onEdit={(service) => setForm({ open: true, service })}
          onDeactivate={setToDeactivate}
          onReactivate={(service) => changeActive(service, true)}
        />
      )}

      <ServiceFormDialog
        open={form.open}
        onOpenChange={(open) => !open && setForm({ open: false })}
        service={form.open ? form.service : undefined}
        currencySymbol={currencySymbol(business.currency)}
      />

      <ConfirmDialog
        open={toDeactivate !== null}
        onOpenChange={(open) => !open && setToDeactivate(null)}
        title={`Deactivate ${toDeactivate?.name ?? 'service'}?`}
        description="It disappears from your booking page. Existing appointments and history are kept, and you can reactivate it any time."
        confirmLabel="Deactivate"
        variant="destructive"
        loading={setActive.isPending}
        onConfirm={() => toDeactivate && changeActive(toDeactivate, false)}
      />
    </>
  )
}
