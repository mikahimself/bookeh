/**
 * The one rule that decides what counts as a read (EXPERIENCE.md, Scan):
 * an EAN-13 whose text starts 978 or 979 is an ISBN; anything else is
 * ignored. Takes the format's name (`BarcodeFormat[result.getBarcodeFormat()]`)
 * so the rule needs no zxing import.
 */
export function isbnFromBarcode(format: string, text: string): string | null {
  return format === 'EAN_13' && /^97[89]\d{10}$/.test(text) ? text : null
}
