import { api } from '@/services/api'
import type {
  AuthOut,
  ChangePasswordRequest,
  LoginRequest,
  MeOut,
  MessageOut,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateMeRequest,
  UserOut,
} from '@/types/api'

export const authService = {
  async register(data: RegisterRequest): Promise<AuthOut> {
    return (await api.post<AuthOut>('/auth/register', data)).data
  },

  async login(data: LoginRequest): Promise<AuthOut> {
    return (await api.post<AuthOut>('/auth/login', data)).data
  },

  async refresh(refreshToken: string): Promise<AuthOut> {
    return (await api.post<AuthOut>('/auth/refresh', { refresh_token: refreshToken })).data
  },

  async logout(refreshToken: string): Promise<void> {
    await api.post('/auth/logout', { refresh_token: refreshToken })
  },

  async me(): Promise<MeOut> {
    return (await api.get<MeOut>('/auth/me')).data
  },

  async updateMe(data: UpdateMeRequest): Promise<UserOut> {
    return (await api.patch<UserOut>('/auth/me', data)).data
  },

  async changePassword(data: ChangePasswordRequest): Promise<void> {
    await api.post('/auth/change-password', data)
  },

  async forgotPassword(email: string): Promise<MessageOut> {
    return (await api.post<MessageOut>('/auth/forgot-password', { email })).data
  },

  async resetPassword(data: ResetPasswordRequest): Promise<void> {
    await api.post('/auth/reset-password', data)
  },
}
