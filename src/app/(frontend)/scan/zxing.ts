/**
 * zxing, imported on first use so only Scan loads it. A module of its own so
 * the unit spec replaces it whole and the real reader never runs in jsdom.
 */
export async function loadZxing() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  return { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType }
}
