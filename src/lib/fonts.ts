import localFont from 'next/font/local'

// Shared by both documents; builds must not fetch fonts from Google.
export const openSans = localFont({
  src: '../app/fonts/OpenSans-Variable.ttf',
  weight: '300 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-open-sans',
})
