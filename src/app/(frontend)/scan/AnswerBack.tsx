'use client'

import { Button } from '../components/Button'
import { useTaskBack } from '../components/navigation'

/** Back on an Answer: to the Scan entry below it, or Scan in its place when opened directly. */
export function AnswerBack({ label }: { label: string }) {
  const back = useTaskBack('/scan')

  return (
    <Button variant="secondary" onClick={back}>
      {label}
    </Button>
  )
}
