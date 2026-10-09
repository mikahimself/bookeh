import { useTranslations } from 'next-intl'

import { ProgressLine } from '../components/ProgressLine'

/** While a section streams: the row stays, the progress line runs, no skeletons. */
export default function SectionLoading() {
  const t = useTranslations('progress')
  return <ProgressLine label={t('loading')} />
}
