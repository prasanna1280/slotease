import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router-dom'
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

function page(Component: LazyExoticComponent<ComponentType>) {
  return <Component />
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
      { path: '/privacy', element: page(PrivacyPage) },
      { path: '/book/:slug', element: page(BookingPage) },
      { path: '/:slug', element: page(BookingPage) },
      { path: '*', element: page(NotFoundPage) },
    ],
  },
]

export const router = createBrowserRouter(routes)
