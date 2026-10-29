import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  EMPTY_DETAILS,
  forgetRememberedCustomer,
  loadRememberedCustomer,
  saveRememberedCustomer,
  useIsDesktop,
  type BookingStep,
} from '@/components/booking/booking-utils'
import { BookingConfirmation } from '@/components/booking/BookingConfirmation'
import { BookingLoadError, BookingUnavailable, BusinessNotFound } from '@/components/booking/BookingStatusPages'
import { BookingStepper } from '@/components/booking/BookingStepper'
import { BookingSummary, MobileBookingBar, type BookingCta } from '@/components/booking/BookingSummary'
import { BusinessHeader, BusinessHeaderSkeleton } from '@/components/booking/BusinessHeader'
import { DateTimeStep } from '@/components/booking/DateTimeStep'
import { DETAILS_FORM_ID, DetailsStep } from '@/components/booking/DetailsStep'
import { ServiceStep } from '@/components/booking/ServiceStep'
import { Logo } from '@/components/layout/Logo'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCreateBooking, usePublicBusiness, usePublicServices, usePublicSlots } from '@/hooks/usePublicBooking'
import { addDays, todayInTz } from '@/lib/datetime'
import { getErrorCode, getErrorMessage, getErrorStatus } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { BookingDetailsValues } from '@/lib/validation'
import type { BookingConfirmationOut, PublicBusinessOut, PublicServiceOut, Slot } from '@/types/api'

export default function BookingPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const businessQuery = usePublicBusiness(slug)

  useDocumentTitle(businessQuery.data ? `Book with ${businessQuery.data.name}` : 'Book an appointment')

  if (businessQuery.isPending) return <BookingPageSkeleton />

  if (businessQuery.isError) {
    const err = businessQuery.error
    if (getErrorStatus(err) === 404) return <BusinessNotFound slug={slug} />
    if (getErrorCode(err) === 'BUSINESS_INACTIVE') return <BookingUnavailable name={null} phone={null} />
    return (
      <BookingLoadError
        message={getErrorMessage(err, 'Please check your connection and try again.')}
        onRetry={() => void businessQuery.refetch()}
      />
    )
  }

  const business = businessQuery.data
  if (!business.is_bookable) return <BookingUnavailable name={business.name} phone={business.phone} />

  // Remount the flow when the slug changes so no state leaks between businesses.
  return <BookingFlow key={business.slug} slug={slug} business={business} />
}

function BookingFlow({ slug, business }: { slug: string; business: PublicBusinessOut }) {
  const tz = business.timezone
  const today = todayInTz(tz)
  const maxDate = addDays(today, Math.max(0, business.booking_window_days))
  const isDesktop = useIsDesktop()

  const [step, setStep] = useState<BookingStep>('service')
  const [service, setService] = useState<PublicServiceOut | null>(null)
  const [date, setDate] = useState<string>(today)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [slotNotice, setSlotNotice] = useState<string | null>(null)
  const [inactive, setInactive] = useState(false)
  const [confirmation, setConfirmation] = useState<BookingConfirmationOut | null>(null)
  const [remembered, setRemembered] = useState(() => loadRememberedCustomer())
  const [details, setDetails] = useState<BookingDetailsValues>(() => ({ ...EMPTY_DETAILS, ...remembered }))
  // Focus moves to the step heading only after the customer has navigated, never on first load.
  const [navigated, setNavigated] = useState(false)

  const servicesQuery = usePublicServices(slug)
  const slotsQuery = usePublicSlots(slug, step === 'datetime' ? (service?.id ?? null) : null, date)
  const createBooking = useCreateBooking(slug)

  const goTo = (next: BookingStep) => {
    setNavigated(true)
    setStep(next)
  }

  const selectService = (s: PublicServiceOut) => {
    if (s.id !== service?.id) setSlot(null)
    setService(s)
    setSlotNotice(null)
    goTo('datetime')
  }

  const changeDate = (ymd: string) => {
    setDate(ymd)
    setSlot(null)
  }

  const selectSlot = (s: Slot) => {
    setSlot(s)
    setSlotNotice(null)
  }

  const handleSubmitDetails = async (values: BookingDetailsValues) => {
    setDetails(values)
    if (!service || !slot) return
    try {
      const result = await createBooking.mutateAsync({
        service_id: service.id,
        start_time: slot.start_time,
        customer_name: values.customer_name.trim(),
        customer_phone: values.customer_phone.trim(),
        customer_email: values.customer_email.trim() || null,
        notes: values.notes.trim() || null,
      })
      saveRememberedCustomer(values)
      setRemembered(loadRememberedCustomer())
      setConfirmation(result)
      goTo('confirmed')
    } catch (err) {
      const code = getErrorCode(err)
      if (code === 'SLOT_TAKEN' || code === 'INVALID_SLOT') {
        const message = getErrorMessage(err, 'This slot was just booked. Please pick another time.')
        toast.error(message)
        setSlotNotice(message)
        setSlot(null)
        goTo('datetime')
        return
      }
      if (code === 'BUSINESS_INACTIVE') {
        setInactive(true)
        return
      }
      if (code === 'SERVICE_NOT_FOUND') {
        toast.error('This service is no longer available. Please choose another.')
        setService(null)
        setSlot(null)
        void servicesQuery.refetch()
        goTo('service')
        return
      }
      throw err
    }
  }

  const bookAnother = () => {
    setConfirmation(null)
    setService(null)
    setSlot(null)
    setDate(todayInTz(tz))
    setDetails({ ...EMPTY_DETAILS, ...loadRememberedCustomer() })
    goTo('service')
  }

  let cta: BookingCta | null = null
  if (step === 'service' && service) cta = { label: 'Continue', onClick: () => goTo('datetime') }
  else if (step === 'datetime') cta = { label: 'Continue', onClick: () => goTo('details'), disabled: !slot }
  else if (step === 'details') cta = { label: 'Confirm booking', form: DETAILS_FORM_ID, loading: createBooking.isPending }

  const slotsInactive = getErrorCode(slotsQuery.error) === 'BUSINESS_INACTIVE'
  if (inactive || slotsInactive) return <BookingUnavailable name={business.name} phone={business.phone} />

  const canGoTo = (target: BookingStep) => {
    if (step === 'confirmed') return false
    if (target === 'service') return true
    if (target === 'datetime') return service !== null
    if (target === 'details') return service !== null && slot !== null
    return false
  }

  const focus = navigated
  const showMobileBar = !isDesktop && step !== 'confirmed' && cta !== null

  let content
  if (step === 'confirmed' && confirmation) {
    content = <BookingConfirmation booking={confirmation} business={business} onBookAnother={bookAnother} />
  } else if (step === 'details' && service && slot) {
    content = (
      <DetailsStep
        defaultValues={details}
        remembered={remembered !== null}
        onForget={() => {
          forgetRememberedCustomer()
          setRemembered(null)
          setDetails(EMPTY_DETAILS)
        }}
        slotStart={slot.start_time}
        timezone={tz}
        onChangeTime={() => goTo('datetime')}
        onSubmit={handleSubmitDetails}
        focusOnMount={focus}
      />
    )
  } else if (step === 'datetime' && service) {
    content = (
      <DateTimeStep
        service={service}
        timezone={tz}
        today={today}
        maxDate={maxDate}
        date={date}
        onDateChange={changeDate}
        slots={slotsQuery.data}
        isLoading={slotsQuery.isPending}
        error={slotsQuery.error}
        onRetry={() => void slotsQuery.refetch()}
        selectedSlot={slot}
        onSelectSlot={selectSlot}
        notice={slotNotice}
        onChangeService={() => goTo('service')}
        focusOnMount={focus}
      />
    )
  } else {
    content = (
      <ServiceStep
        business={business}
        services={servicesQuery.data}
        isLoading={servicesQuery.isPending}
        error={servicesQuery.error}
        onRetry={() => void servicesQuery.refetch()}
        selectedId={service?.id ?? null}
        onSelect={selectService}
        focusOnMount={focus}
      />
    )
  }

  const confirmed = step === 'confirmed'

  return (
    <PublicLayout hideAuthActions hideFooter>
      <div
        className={cn(
          'mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8',
          showMobileBar ? 'pb-36' : 'pb-12 sm:pb-16',
        )}
      >
        <BusinessHeader business={business} />

        <div
          className={cn(
            'mt-6 sm:mt-8',
            !confirmed && 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-12',
          )}
        >
          <div className="min-w-0">
            <BookingStepper current={step} canGoTo={canGoTo} onGoTo={goTo} />
            <div className="mt-4">
              {confirmed ? content : <Card className="p-4 sm:p-6">{content}</Card>}
            </div>
          </div>

          {isDesktop && !confirmed && (
            <aside className="sticky top-24" aria-label="Your booking">
              <BookingSummary
                service={service}
                slot={slot}
                date={step === 'service' ? null : date}
                timezone={tz}
                currency={business.currency}
                cta={cta}
              />
            </aside>
          )}
        </div>

        <p className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          Powered by <Logo size="sm" to="/" />
        </p>
      </div>

      {showMobileBar && (
        <MobileBookingBar
          service={service}
          slot={slot}
          date={date}
          timezone={tz}
          currency={business.currency}
          cta={cta}
        />
      )}

    </PublicLayout>
  )
}

function BookingPageSkeleton() {
  return (
    <PublicLayout hideAuthActions hideFooter>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-12 sm:px-6 sm:pt-10 lg:px-8" aria-busy="true">
        <span className="sr-only" role="status">
          Loading booking page
        </span>
        <BusinessHeaderSkeleton />
        <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-full max-w-md" />
            <Card className="space-y-3 p-4 sm:p-6">
              <Skeleton className="h-6 w-48" />
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </Card>
          </div>
          <Skeleton className="hidden h-72 lg:block" />
        </div>
      </div>
    </PublicLayout>
  )
}
