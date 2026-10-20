'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { createReadGate, type ReadGate } from './readGate'

export type CameraState = 'idle' | 'starting' | 'on' | 'off'

type Camera = {
  state: CameraState
  /** The live stream while `state` is `on`. */
  stream: MediaStream | null
  /** Requests the camera once; later calls do nothing. */
  start: () => void
  /** Which camera reads to act on; one per scan task, so it outlives each Answer. */
  gate: ReadGate
}

const CameraContext = createContext<Camera | null>(null)

/**
 * The camera session for the `/scan` segment (EXPERIENCE.md, Scan: the
 * camera "stays on across Scan, Answer and back, until the task is closed").
 * Mounted by `scan/layout.tsx`, so it outlives the page's search-param
 * changes and stops the tracks only when the segment unmounts. Nothing
 * touches the camera until `start()`; a refusal, a missing camera, an
 * insecure context or a track ending all land in `off`.
 *
 * It also holds the read gate: `ScanScreen` unmounts for every Answer, and
 * the ISBN it last handled has to be remembered across Answer and Back, then
 * forgotten when the task closes.
 */
export function CameraSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CameraState>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const started = useRef(false)
  // True between mount and unmount; a stream arriving after the unmount is
  // stopped instead of kept. A ref rather than a cleanup flag so that Strict
  // Mode's extra mount/unmount pass does not strand the first request.
  const alive = useRef(false)
  const current = useRef<MediaStream | null>(null)
  const [gate] = useState(() => createReadGate())

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      current.current?.getTracks().forEach((track) => track.stop())
      current.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (started.current) return
    started.current = true
    const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (!devices?.getUserMedia) {
      setState('off')
      return
    }
    setState('starting')
    devices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((media) => {
        if (!alive.current) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        current.current = media
        for (const track of media.getVideoTracks()) {
          track.addEventListener('ended', () => setState('off'))
        }
        setStream(media)
        setState('on')
      })
      .catch(() => setState('off'))
  }, [])

  const value = useMemo(() => ({ state, stream, start, gate }), [state, stream, start, gate])

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>
}

export function useCamera(): Camera {
  const camera = useContext(CameraContext)
  if (!camera) throw new Error('useCamera() needs a <CameraSession> above it')
  return camera
}
