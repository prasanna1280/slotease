import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  DURATION_MAX,
  DURATION_MIN,
  EMPTY_SERVICE_FORM,
  formToServicePayload,
  serviceSchema,
  serviceToForm,
  type ServiceFormValues,
} from '@/components/services/service-schema'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, fieldDescriptionId } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCreateService, useUpdateService } from '@/hooks/useServices'
import { getErrorMessage } from '@/lib/errors'
import { applyServerFieldErrors } from '@/lib/validation'
import type { ServiceOut } from '@/types/api'

const SERVER_FIELDS = ['name', 'description', 'duration_min', 'price'] as const

export interface ServiceFormProps {
  /** Service being edited; omit to create. */
  service?: ServiceOut
  currencySymbol: string
  onDone: () => void
}

/** Create / edit form (exported separately for tests). */
export function ServiceForm({ service, currencySymbol, onDone }: ServiceFormProps) {
  const create = useCreateService()
  const update = useUpdateService()
  const pending = create.isPending || update.isPending

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: service ? serviceToForm(service) : EMPTY_SERVICE_FORM,
  })

  const onError = (err: unknown) => {
    if (!applyServerFieldErrors(err, setError, SERVER_FIELDS)) {
      setError('root', { type: 'server', message: getErrorMessage(err, 'Could not save the service.') })
    }
  }

  const onSubmit = handleSubmit((values) => {
    const payload = formToServicePayload(values)
    if (service) {
      update.mutate(
        { id: service.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Service updated')
            onDone()
          },
          onError,
        },
      )
    } else {
      create.mutate(payload, {
        onSuccess: (created) => {
          toast.success('Service added', { description: created.name })
          onDone()
        },
        onError,
      })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <Field htmlFor="svc-name" label="Name" error={errors.name?.message}>
        <Input
          id="svc-name"
          placeholder="e.g. Haircut + Beard"
          aria-invalid={!!errors.name}
          aria-describedby={fieldDescriptionId('svc-name')}
          {...register('name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor="svc-duration"
          label="Duration (minutes)"
          error={errors.duration_min?.message}
          hint={`${DURATION_MIN}–${DURATION_MAX} minutes`}
        >
          <Input
            id="svc-duration"
            type="number"
            inputMode="numeric"
            min={DURATION_MIN}
            max={DURATION_MAX}
            step={5}
            aria-invalid={!!errors.duration_min}
            aria-describedby={fieldDescriptionId('svc-duration')}
            {...register('duration_min')}
          />
        </Field>
        <Field htmlFor="svc-price" label={`Price (${currencySymbol})`} error={errors.price?.message} hint="0 for free">
          <Input
            id="svc-price"
            type="text"
            inputMode="decimal"
            placeholder="450"
            aria-invalid={!!errors.price}
            aria-describedby={fieldDescriptionId('svc-price')}
            {...register('price')}
          />
        </Field>
      </div>
      <Field htmlFor="svc-description" label="Description" optional error={errors.description?.message}>
        <Textarea
          id="svc-description"
          rows={3}
          placeholder="Shown to customers on your booking page."
          aria-invalid={!!errors.description}
          aria-describedby={fieldDescriptionId('svc-description')}
          {...register('description')}
        />
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {service ? 'Save changes' : 'Add service'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service?: ServiceOut
  currencySymbol: string
}

export function ServiceFormDialog({ open, onOpenChange, service, currencySymbol }: ServiceFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? 'Edit service' : 'Add a service'}</DialogTitle>
          <DialogDescription>
            {service
              ? 'Changes apply to new bookings. Existing bookings keep their original price.'
              : 'Customers pick from your active services when they book.'}
          </DialogDescription>
        </DialogHeader>
        <ServiceForm
          key={service?.id ?? 'new'}
          service={service}
          currencySymbol={currencySymbol}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
