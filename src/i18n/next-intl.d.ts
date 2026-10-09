import type en from '../../messages/en.json'
import type { Locale } from './locale'

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof en
  }
}
