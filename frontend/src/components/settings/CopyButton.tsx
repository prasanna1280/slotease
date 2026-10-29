import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, type ButtonProps } from '@/components/ui/button'

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  value: string
  label?: string
  /** Toast text on success. */
  successMessage?: string
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  // Fallback for non-secure contexts (plain-HTTP previews).
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.className = 'fixed -left-[9999px] opacity-0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('Copy failed')
}

/** Copies `value` to the clipboard with a short confirmation state and toast. */
export function CopyButton({ value, label = 'Copy', successMessage = 'Copied to clipboard', variant = 'outline', ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <Button
      variant={variant}
      {...props}
      onClick={() => {
        copyText(value)
          .then(() => {
            setCopied(true)
            toast.success(successMessage)
          })
          .catch(() => toast.error('Could not copy. Select the text and copy it manually.'))
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </Button>
  )
}
