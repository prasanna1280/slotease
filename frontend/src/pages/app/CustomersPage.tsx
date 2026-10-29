import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { CustomerTable } from '@/components/customers/CustomerTable'
import { QueryErrorAlert } from '@/components/dashboard/QueryErrorAlert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentBusiness } from '@/hooks/useAuth'
import { useCustomers, useDebouncedValue } from '@/hooks/useCustomers'

const PAGE_SIZE = 20

export default function CustomersPage() {
  const business = useCurrentBusiness()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search.trim(), 300)
  // Page resets to 1 whenever the (debounced) search term changes.
  const [pageState, setPageState] = useState({ term: '', page: 1 })
  const page = pageState.term === debounced ? pageState.page : 1
  const setPage = (p: number) => setPageState({ term: debounced, page: p })

  const customers = useCustomers({ search: debounced, page, page_size: PAGE_SIZE })
  const data = customers.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const from = data && data.total > 0 ? (data.page - 1) * data.page_size + 1 : 0
  const to = data ? Math.min(data.page * data.page_size, data.total) : 0

  return (
    <>
      <PageHeader title="Customers" description="Everyone who has booked with you, with visit history." />

      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor="customer-search" className="sr-only">
          Search customers by name or phone
        </label>
        <Input
          id="customer-search"
          type="search"
          placeholder="Search by name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {customers.isError ? (
        <QueryErrorAlert
          title="Could not load customers"
          error={customers.error}
          onRetry={() => void customers.refetch()}
          retrying={customers.isFetching}
        />
      ) : customers.isPending || !data ? (
        <Card className="divide-y divide-border" aria-busy="true" aria-label="Loading customers">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : data.items.length === 0 ? (
        debounced ? (
          <EmptyState
            icon={Search}
            title="No matching customers"
            description={`Nobody matches “${debounced}”. Try part of a name or phone number.`}
            action={
              <Button variant="outline" onClick={() => setSearch('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Customers are added automatically when they book online or you create a booking."
          />
        )
      ) : (
        <div className={customers.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <CustomerTable customers={data.items} timezone={business.timezone} />
          <nav
            aria-label="Pagination"
            className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row"
          >
            <p aria-live="polite" className="tabular-nums">
              Showing {from}–{to} of {data.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1 || customers.isFetching}
              >
                <ChevronLeft aria-hidden="true" />
                Previous
              </Button>
              <span className="px-2 tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages || customers.isFetching}
              >
                Next
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
