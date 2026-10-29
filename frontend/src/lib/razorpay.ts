/**
 * Minimal typed wrapper around Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js).
 * The script is loaded on demand the first time an owner subscribes.
 */

export const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

export interface RazorpayCheckoutOptions {
  key: string
  subscription_id: string
  name: string
  description?: string
  prefill?: { name?: string; email?: string; contact?: string }
  notes?: Record<string, string>
  theme?: { color?: string }
}

interface RazorpayFailure {
  error?: { description?: string; reason?: string }
}

interface RazorpayInstance {
  open: () => void
  on: (event: 'payment.failed', handler: (response: RazorpayFailure) => void) => void
}

interface RazorpayConstructorOptions extends RazorpayCheckoutOptions {
  handler: (response: RazorpaySuccessResponse) => void
  modal?: { ondismiss?: () => void; confirm_close?: boolean }
}

type RazorpayConstructor = new (options: RazorpayConstructorOptions) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

/** Thrown when the owner closes the checkout without paying. */
export class CheckoutDismissedError extends Error {
  constructor() {
    super('Checkout was closed before payment completed.')
    this.name = 'CheckoutDismissedError'
  }
}

let loadPromise: Promise<RazorpayConstructor> | null = null

/** Load checkout.js once (shared promise); rejects if the script cannot be fetched. */
export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (loadPromise) return loadPromise

  loadPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = RAZORPAY_CHECKOUT_URL
    script.async = true
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay)
      else reject(new Error('Razorpay Checkout failed to initialise.'))
    }
    script.onerror = () => {
      script.remove()
      reject(new Error('Could not load Razorpay Checkout. Check your connection and try again.'))
    }
    document.body.appendChild(script)
  }).catch((err: unknown) => {
    loadPromise = null
    throw err
  })
  return loadPromise
}

/** Open Razorpay Checkout for a subscription; resolves with the signed payment response. */
export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResponse> {
  const Razorpay = await loadRazorpay()
  return new Promise<RazorpaySuccessResponse>((resolve, reject) => {
    let settled = false
    const instance = new Razorpay({
      ...options,
      handler: (response) => {
        settled = true
        resolve(response)
      },
      modal: {
        ondismiss: () => {
          if (!settled) reject(new CheckoutDismissedError())
        },
      },
    })
    instance.on('payment.failed', (response) => {
      settled = true
      reject(new Error(response.error?.description ?? 'Payment failed. Please try again.'))
    })
    instance.open()
  })
}
