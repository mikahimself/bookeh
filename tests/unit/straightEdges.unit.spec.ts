import { describe, expect, it } from 'vitest'

import { isStraight, offAxis, snapToStraight, type Point } from '@/lib/catalogue/corners'

const o: Point = { x: 0, y: 0 }
const at = (deg: number, length = 100): Point => ({
  x: Math.cos((deg * Math.PI) / 180) * length,
  y: Math.sin((deg * Math.PI) / 180) * length,
})

describe('isStraight', () => {
  it('accepts up to 1 degree off any axis direction and rejects beyond', () => {
    for (const axis of [0, 90, 180, -90]) {
      expect(isStraight(o, at(axis + 0.5))).toBe(true)
      expect(isStraight(o, at(axis - 0.5))).toBe(true)
      expect(isStraight(o, at(axis + 1.5))).toBe(false)
    }
  })
})

describe('snapToStraight', () => {
  it('maps 0.5 to 0, 2 to 1.5 and 4 to 4 degrees, keeping length', () => {
    const inside = snapToStraight(o, at(0.5))
    expect(inside.y).toBeCloseTo(0)
    expect(inside.x).toBeCloseTo(100)
    const zone = snapToStraight(o, at(2))
    expect(offAxis(o, zone)).toBeCloseTo(1.5)
    expect(Math.hypot(zone.x, zone.y)).toBeCloseTo(100)
    const outside = snapToStraight(o, at(4))
    expect(outside.x).toBeCloseTo(at(4).x)
    expect(outside.y).toBeCloseTo(at(4).y)
    const near: Point = { x: 0.5, y: 0.01 }
    expect(snapToStraight(o, near)).toBe(near)
  })
})
