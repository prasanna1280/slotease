import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router-dom'
import { AdminAuthProvider, RequireAdmin } from '@/admin/AdminAuthProvider'
import { AdminShell } from '@/admin/components/AdminShell'
import { GuestRoute } from '@/components/auth/GuestRoute'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { RouteError } from '@/components/layout/RouteError'
import { PageSpinner } from '@/components/ui/spinner'

/* Public pages (FRONTEND-A) */
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'))
const BookingPage = lazy(() => import('@/pages/BookingPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const ViewAsPage = lazy(() => import('@/pages/ViewAsPage'))

/* Owner app pages (FRONTEND-B) */
const DashboardPage = lazy(() => import('@/pages/app/DashboardPage'))
const CalendarPage = lazy(() => import('@/pages/app/CalendarPage'))
const CustomersPage = lazy(() => import('@/pages/app/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@/pages/app/CustomerDetailPage'))
const ServicesPage = lazy(() => import('@/pages/app/ServicesPage'))
const WorkingHoursPage = lazy(() => import('@/pages/app/WorkingHoursPage'))
const ReportsPage = lazy(() => import('@/pages/app/ReportsPage'))
const BillingPage = lazy(() => import('@/pages/app/BillingPage'))
const SettingsPage = lazy(() => import('@/pages/app/SettingsPage'))

/* Platform admin (SlotEase staff) */
const AdminLoginPage = lazy(() => import('@/admin/pages/AdminLoginPage'))
const AdminDashboardPage = lazy(() => import('@/admin/pages/AdminDashboardPage'))
const AdminRevenuePage = lazy(() => import('@/admin/pages/AdminRevenuePage'))
const AdminCustomersPage = lazy(() => import('@/admin/pages/AdminCustomersPage'))
const AdminCustomerDetailPage = lazy(() => import('@/admin/pages/AdminCustomerDetailPage'))
const AdminSubscriptionsPage = lazy(() => import('@/admin/pages/AdminSubscriptionsPage'))
const AdminPaymentsPage = lazy(() => import('@/admin/pages/AdminPaymentsPage'))
const AdminBookingsPage = lazy(() => import('@/admin/pages/AdminBookingsPage'))
const AdminAuditPage = lazy(() => import('@/admin/pages/AdminAuditPage'))

function page(Component: LazyExoticComponent<ComponentType>) {
  return <Component />
}

/** Admin area: its own session (separate from the owner's), provided only under /admin. */
function AdminRoot() {
  return (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  )
}

/** Top-level Suspense for public pages (the AppShell has its own around its outlet). */
function RootLayout() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Outlet />
    </Suspense>
  )
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: page(LandingPage) },
      {
        element: <GuestRoute />,
        children: [
          { path: '/login', element: page(LoginPage) },
          { path: '/register', element: page(RegisterPage) },
        ],
      },
      { path: '/forgot-password', element: page(ForgotPasswordPage) },
      { path: '/reset-password', element: page(ResetPasswordPage) },
      {
        path: '/app',
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: page(DashboardPage) },
              { path: 'calendar', element: page(CalendarPage) },
              { path: 'customers', element: page(CustomersPage) },
              { path: 'customers/:id', element: page(CustomerDetailPage) },
              { path: 'services', element: page(ServicesPage) },
              { path: 'hours', element: page(WorkingHoursPage) },
              { path: 'reports', element: page(ReportsPage) },
              { path: 'billing', element: page(BillingPage) },
              { path: 'settings', element: page(SettingsPage) },
              { path: '*', element: page(NotFoundPage) },
            ],
          },
        ],
      },
      {
        path: '/admin',
        element: <AdminRoot />,
        children: [
          { path: 'login', element: page(AdminLoginPage) },
          {
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminShell />,
                children: [
                  { index: true, element: page(AdminDashboardPage) },
                  { path: 'revenue', element: page(AdminRevenuePage) },
                  { path: 'customers', element: page(AdminCustomersPage) },
                  { path: 'customers/:id', element: page(AdminCustomerDetailPage) },
                  { path: 'subscriptions', element: page(AdminSubscriptionsPage) },
                  { path: 'payments', element: page(AdminPaymentsPage) },
                  { path: 'bookings', element: page(AdminBookingsPage) },
                  { path: 'audit', element: page(AdminAuditPage) },
                  { path: '*', element: page(NotFoundPage) },
                ],
              },
            ],
          },
        ],
      },
      { path: '/privacy', element: page(PrivacyPage) },
      { path: '/view-as', element: page(ViewAsPage) },
      { path: '/book/:slug', element: page(BookingPage) },
      { path: '/:slug', element: page(BookingPage) },
      { path: '*', element: page(NotFoundPage) },
    ],
  },
]

export const router = createBrowserRouter(routes)
