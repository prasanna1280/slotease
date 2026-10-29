import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthCard } from '@/components/auth/AuthCard'
import { LoginForm } from '@/components/auth/LoginForm'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { safeNextPath } from '@/lib/navigation'

export default function LoginPage() {
  useDocumentTitle('Sign in')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))

  return (
    <AuthCard
      title="Sign in to SlotEase"
      description="Welcome back. Your schedule is waiting."
      footer={
        <>
          New to SlotEase?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Start a 14-day free trial
          </Link>
        </>
      }
    >
      <LoginForm onSuccess={() => navigate(next, { replace: true })} />
    </AuthCard>
  )
}
