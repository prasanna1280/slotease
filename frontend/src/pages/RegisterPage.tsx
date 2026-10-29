import { Link, useNavigate } from 'react-router-dom'
import { AuthCard } from '@/components/auth/AuthCard'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function RegisterPage() {
  useDocumentTitle('Start your free trial')
  const navigate = useNavigate()

  return (
    <AuthCard
      wide
      title="Start your 14-day free trial"
      description="Set up your booking page in under two minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm onSuccess={() => navigate('/app', { replace: true })} />
    </AuthCard>
  )
}
