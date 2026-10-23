'use client'

import { Button, type ButtonVariant } from '../components/Button'
import { useTaskBack } from '../components/navigation'

/** Back on an Answer: to the Scan entry below it, or Scan in its place when opened directly. */
export function AnswerBack({
  label,
  variant = 'secondary',
}: {
  label: string
  variant?: ButtonVariant
}) {
  const back = useTaskBack('/scan')

  return (
    <Button variant={variant} onClick={() => back()}>
      {label}
    </Button>
  )
}
