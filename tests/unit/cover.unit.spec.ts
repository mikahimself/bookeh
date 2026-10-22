// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Cover } from '@/app/(frontend)/components/Cover'

describe('Cover', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the placeholder without a cover or once it fails, and retries a new one', () => {
    const title = 'Tuntematon sotilas'
    const { container, rerender } = render(createElement(Cover, { src: null, title }))
    const img = () => container.querySelector('img')
    expect(img()).toBeNull()
    expect(screen.getByText(title)).toBeTruthy()

    rerender(createElement(Cover, { src: '/data/cover/9789510000000', title }))
    expect(img()?.getAttribute('src')).toBe('/data/cover/9789510000000')
    expect(screen.queryByText(title)).toBeNull()

    fireEvent.error(img()!)
    expect(img()).toBeNull()
    expect(screen.getByText(title)).toBeTruthy()

    rerender(createElement(Cover, { src: '/api/media/file/a.jpg', title }))
    expect(img()?.getAttribute('src')).toBe('/api/media/file/a.jpg')
  })

  it('shows the placeholder for an image that failed before hydration', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    vi.spyOn(HTMLImageElement.prototype, 'currentSrc', 'get').mockReturnValue(
      'http://localhost/data/cover/9789510000000',
    )
    const title = 'Seitsemän veljestä'
    const { container } = render(createElement(Cover, { src: '/data/cover/9789510000000', title }))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(title)).toBeTruthy()
  })
})
