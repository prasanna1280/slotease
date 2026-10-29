import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  ExternalLink,
  Eye,
  IndianRupee,
  KeyRound,
  LogOut,
  Pencil,
  PlayCircle,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AdminStatusBadge } from '@/admin/components/AdminStatusBadge'
import {
  DeleteBusinessDialog,
  EditBusinessDialog,
  ExtendTrialDialog,
  RecordPaymentDialog,
  ResetLinkDialog,
  SuspendDialog,
} from '@/admin/components/BusinessDialogs'
import { ADMIN_TZ } from '@/admin/format'
import { useAdminBusiness, useDeletePayment, useOwnerResetLink, useSignOutOwner, useViewAsOwner } from '@/admin/hooks'
import type { BusinessDetail, Owner } from '@/admin/types'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate, formatDateTime } from '@/lib/datetime'
import { getErrorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { bookingUrl } from '@/lib/utils'

type DialogName = 'edit' | 'extend' | 'payment' | 'suspend' | 'delete' | null

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{children}</dd>
    </div>
  )
}

function date(value: string | null): string {
  return value ? formatDateTime(value, ADMIN_TZ) : '—'
}

function OwnersCard({ business }: { business: BusinessDetail }) {
  const resetLink = useOwnerResetLink(business.id)
  const signOut = useSignOutOwner(business.id)
  const [link, setLink] = useState<{ url: string; minutes: number } | null>(null)
  const [linkEmail, setLinkEmail] = useState('')
  const [signOutOwner, setSignOutOwner] = useState<Owner | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner login</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {business.owners.map((owner) => (
            <li key={owner.id} className="space-y-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{owner.full_name}</p>
                <p className="truncate text-sm text-muted-foreground">{owner.email}</p>
                <p className="text-xs text-muted-foreground">
                  {owner.role} · joined {formatDate(owner.created_at, ADMIN_TZ)} · {owner.active_sessions} signed-in device
                  {owner.active_sessions === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={resetLink.isPending && resetLink.variables === owner.id}
                  onClick={() =>
                    resetLink.mutate(owner.id, {
                      onSuccess: (r) => {
                        setLinkEmail(owner.email)
                        setLink({ url: r.reset_url, minutes: r.expires_minutes })
                      },
                      onError: (err) => toast.error(getErrorMessage(err, 'Could not create a reset link.')),
                    })
                  }
                >
                  <KeyRound aria-hidden="true" />
                  Password reset link
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSignOutOwner(owner)} disabled={owner.active_sessions === 0}>
                  <LogOut aria-hidden="true" />
                  Sign out everywhere
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      <ResetLinkDialog link={link} email={linkEmail} onOpenChange={(open) => !open && setLink(null)} />
      <ConfirmDialog
        open={signOutOwner !== null}
        onOpenChange={(open) => !open && setSignOutOwner(null)}
        title="Sign out of all devices?"
        description={`${signOutOwner?.email ?? ''} will need to sign in again on every device (open sessions end within 30 minutes).`}
        confirmLabel="Sign out"
        loading={signOut.isPending}
        onConfirm={() =>
          signOutOwner &&
          signOut.mutate(signOutOwner.id, {
            onSuccess: () => {
              toast.success('Owner signed out everywhere')
              setSignOutOwner(null)
            },
            onError: (err) => toast.error(getErrorMessage(err, 'Could not sign the owner out.')),
          })
        }
      />
    </Card>
  )
}

function PaymentsCard({ business, onRecord }: { business: BusinessDetail; onRecord: () => void }) {
  const remove = useDeletePayment()
  const [removeId, setRemoveId] = useState<number | null>(null)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Payments · {formatMoney(business.stats.revenue_total)}</CardTitle>
        <Button size="sm" variant="outline" onClick={onRecord}>
          <IndianRupee aria-hidden="true" />
          Record
        </Button>
      </CardHeader>
      <CardContent>
        {business.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {business.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground tabular-nums">{formatMoney(p.amount)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(p.paid_at, ADMIN_TZ)} · {p.source === 'manual' ? 'Manual' : 'Razorpay'}
                    {p.note ? ` · ${p.note}` : ''}
                  </p>
                </div>
                {p.source === 'manual' && (
                  <Button size="sm" variant="ghost" onClick={() => setRemoveId(p.id)} aria-label={`Remove payment of ${formatMoney(p.amount)}`}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => !open && setRemoveId(null)}
        title="Remove this payment?"
        description="It will no longer count towards revenue. The removal is recorded in the audit log."
        confirmLabel="Remove"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={() =>
          removeId !== null &&
          remove.mutate(removeId, {
            onSuccess: () => {
              toast.success('Payment removed')
              setRemoveId(null)
            },
            onError: (err) => toast.error(getErrorMessage(err, 'Could not remove the payment.')),
          })
        }
      />
    </Card>
  )
}

/** Opens the owner app for this business in a new tab, read-only, via a URL-fragment hand-off. */
function ViewAsButton({ business }: { business: BusinessDetail }) {
  const viewAs = useViewAsOwner(business.id)
  const disabled = !business.owners.some((o) => o.is_active)
  const open = () => {
    // Open the tab during the click (pop-up blockers allow that), then point it at the hand-off page.
    const tab = window.open('about:blank', '_blank')
    viewAs.mutate(undefined, {
      onSuccess: (session) => {
        const params = new URLSearchParams({
          token: session.access_token,
          business: session.business_name,
          owner: session.owner_email,
          exp: String(Math.floor(Date.now() / 1000) + session.expires_in),
        })
        const url = `/view-as#${params.toString()}`
        if (tab) {
          tab.opener = null
          tab.location.href = url
        } else {
          toast.error('Your browser blocked the new tab. Allow pop-ups for this site and try again.')
        }
      },
      onError: (err) => {
        tab?.close()
        toast.error(getErrorMessage(err, 'Could not open the owner view.'))
      },
    })
  }
  return (
    <Button variant="outline" onClick={open} loading={viewAs.isPending} disabled={disabled}>
      <Eye aria-hidden="true" />
      View as owner
    </Button>
  )
}

export default function AdminCustomerDetailPage() {
  const { id } = useParams()
  const businessId = Number(id)
  const navigate = useNavigate()
  const query = useAdminBusiness(Number.isInteger(businessId) ? businessId : 0)
  const business = query.data
  const [dialog, setDialog] = useState<DialogName>(null)
  useDocumentTitle(business ? business.name : 'Customer')

  const back = (
    <Link to="/admin/customers" className="inline-flex min-h-11 items-center gap-1 hover:text-foreground sm:min-h-0">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Customers
    </Link>
  )

  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={back} title="Customer" />
        <QueryErrorAlert title="Could not load this customer" error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </div>
    )
  }
  if (!business) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  const s = business.stats
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={back}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {business.name}
            <AdminStatusBadge status={business.status} />
          </span>
        }
        description={
          <a href={bookingUrl(business.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            /{business.slug}
            <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(opens booking page in a new tab)</span>
          </a>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ViewAsButton business={business} />
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDialog('extend')}>
              <CalendarPlus aria-hidden="true" />
              Extend trial
            </Button>
            <Button variant="outline" onClick={() => setDialog('suspend')}>
              {business.is_suspended ? <PlayCircle aria-hidden="true" /> : <Ban aria-hidden="true" />}
              {business.is_suspended ? 'Reactivate' : 'Suspend'}
            </Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDialog('delete')}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        }
      />

      <section aria-label="Activity" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Bookings', s.appointments_total],
          ['Upcoming', s.appointments_upcoming],
          ['Completed', s.completed],
          ['No-shows', s.no_shows],
          ['Customers', s.customers],
          ['Services', s.services],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-xl font-semibold text-foreground tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Plan and account</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Plan">{business.plan === 'pro' ? 'Pro' : 'Trial'}</Detail>
                <Detail label="Subscription status">{business.subscription_status.replace('_', ' ')}</Detail>
                <Detail label="Booking page">{business.is_bookable ? 'Taking bookings' : 'Paused'}</Detail>
                <Detail label="Trial ends">{date(business.trial_ends_at)}</Detail>
                <Detail label="Paid period ends">{date(business.current_period_end)}</Detail>
                <Detail label="Joined">{date(business.created_at)}</Detail>
                <Detail label="Phone">{business.phone}</Detail>
                <Detail label="Email">{business.email ?? '—'}</Detail>
                <Detail label="Timezone">{business.timezone}</Detail>
                <Detail label="Address">{business.address ?? '—'}</Detail>
                <Detail label="Last booking">{date(s.last_booking_at)}</Detail>
                <Detail label="Razorpay subscription">
                  <span className="font-mono text-xs">{business.razorpay_subscription_id ?? '—'}</span>
                </Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>Recent bookings</CardTitle>
              <Link to={`/admin/bookings?business_id=${business.id}`} className="text-sm font-medium text-primary hover:underline">
                Manage bookings
              </Link>
            </CardHeader>
            <CardContent>
              {business.recent_appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {business.recent_appointments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {a.customer_name} · {a.service_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(a.start_time, business.timezone)} · {a.reference ?? `#${a.id}`}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin history</CardTitle>
            </CardHeader>
            <CardContent>
              {business.audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No admin changes yet.</p>
              ) : (
                <ol className="space-y-3">
                  {business.audit.map((e) => (
                    <li key={e.id} className="text-sm">
                      <p className="text-foreground">{e.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(e.created_at, ADMIN_TZ)} · {e.admin_email}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <OwnersCard business={business} />
          <PaymentsCard business={business} onRecord={() => setDialog('payment')} />
        </div>
      </div>

      <EditBusinessDialog business={business} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />
      <ExtendTrialDialog business={business} open={dialog === 'extend'} onOpenChange={(o) => setDialog(o ? 'extend' : null)} />
      <RecordPaymentDialog business={business} open={dialog === 'payment'} onOpenChange={(o) => setDialog(o ? 'payment' : null)} />
      <SuspendDialog business={business} open={dialog === 'suspend'} onOpenChange={(o) => setDialog(o ? 'suspend' : null)} />
      <DeleteBusinessDialog
        business={business}
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        onDeleted={() => navigate('/admin/customers', { replace: true })}
      />
    </div>
  )
}
