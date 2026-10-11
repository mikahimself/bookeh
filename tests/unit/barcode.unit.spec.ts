import { describe, expect, it } from 'vitest'

import { isbnFromBarcode } from '@/app/(frontend)/scan/barcode'

describe('isbnFromBarcode', () => {
  it.each([
    ['an EAN-13 starting 978', 'EAN_13', '9789510123456', '9789510123456'],
    ['an EAN-13 starting 979', 'EAN_13', '9791234567896', '9791234567896'],
    ['an EAN-13 that is not an ISBN', 'EAN_13', '5901234123457', null],
    ['an EAN-8', 'EAN_8', '97812345', null],
    ['a UPC-A', 'UPC_A', '978951012345', null],
    ['a QR code holding an ISBN', 'QR_CODE', '9789510123456', null],
    ['an EAN-13 text with a hyphen', 'EAN_13', '978-951012345', null],
  ])('%s', (_, format, text, expected) => {
    expect(isbnFromBarcode(format, text)).toBe(expected)
  })
})
