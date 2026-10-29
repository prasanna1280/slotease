import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/routes'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster
            position="top-center"
            closeButton
            duration={4000}
            offset={{ top: 'max(16px, env(safe-area-inset-top))' }}
            mobileOffset={{ top: 'max(12px, env(safe-area-inset-top))' }}
            toastOptions={{
              classNames: {
                toast: 'border border-border bg-card text-foreground shadow-md font-sans',
                description: 'text-muted-foreground',
              },
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
