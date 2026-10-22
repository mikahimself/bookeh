/**
 * `text` as an `ILIKE … escape '\'` pattern matching it anywhere: `\`, `%`
 * and `_` escaped, so each matches itself.
 */
export const containsPattern = (text: string): string => `%${text.replace(/[\\%_]/g, '\\$&')}%`
