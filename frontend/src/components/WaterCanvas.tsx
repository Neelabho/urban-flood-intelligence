import { useEffect, useRef } from 'react'

type Props = {
  /** 'light' for the cream pages, 'dark' for the navy hero. */
  variant: 'light' | 'dark'
  /** Rain intensity to draw, in mm per hour (0 = dry: only waves and ripples). */
  intensity: number
  /** false = draw one still frame (reduced motion or user turned animation off). */
  animate: boolean
  /** Waves sit in the bottom part of the canvas; 'tall' raises them (hero). */
  waveHeight?: number
  className?: string
}

type Drop = { x: number; y: number; len: number; speed: number; target: number; alpha: number }
type Ripple = { x: number; y: number; r: number; max: number; alpha: number; speed: number; delay: number }

const PALETTE = {
  light: { wave: ['rgba(61,106,142,0.10)', 'rgba(61,106,142,0.075)', 'rgba(217,164,65,0.06)'], drop: '61,75,92', ripple: '61,106,142' },
  dark: { wave: ['rgba(159,176,196,0.08)', 'rgba(159,176,196,0.06)', 'rgba(224,162,74,0.06)'], drop: '214,226,238', ripple: '214,226,238' },
}

/**
 * Animated water background: slow layered waves, rain streaks whose density follows `intensity`,
 * and ripples from raindrops, the pointer (move) and clicks (splash). Pointer-transparent; draws
 * on a canvas that fills its positioned parent.
 */
export default function WaterCanvas({ variant, intensity, animate, waveHeight = 0.16, className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const intensityRef = useRef(intensity)
  intensityRef.current = intensity

  useEffect(() => {
    const canvas = ref.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pal = PALETTE[variant]
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let W = 0
    let H = 0
    const drops: Drop[] = []
    const ripples: Ripple[] = []
    let raf = 0
    let last = performance.now()
    let nextAmbient = 0
    let lastPointer = { t: 0, x: -999, y: -999 }

    const resize = () => {
      const r = parent.getBoundingClientRect()
      W = Math.max(1, r.width)
      H = Math.max(1, r.height)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!animate) draw(0)
    }

    const surfaceY = () => H * (1 - waveHeight)
    const newDrop = (initial: boolean): Drop => {
      const top = surfaceY()
      return {
        x: Math.random() * (W + 120) - 60,
        y: initial ? Math.random() * H : -30 - Math.random() * 60,
        len: 10 + Math.random() * 14,
        speed: 620 + Math.random() * 380,
        // most drops land on the "water" band at the bottom, some on the page
        target: Math.random() < 0.7 ? top + Math.random() * (H - top) : H * (0.25 + Math.random() * 0.6),
        alpha: 0.16 + Math.random() * 0.18,
      }
    }
    const addRipple = (x: number, y: number, max: number, alpha: number, delay = 0) => {
      if (ripples.length > 140) ripples.shift()
      ripples.push({ x, y, r: 1, max, alpha, speed: 26 + max * 0.55, delay })
    }

    function drawWaves(t: number) {
      const base = surfaceY()
      pal.wave.forEach((fill, i) => {
        const amp = 6 + i * 3
        const k = (0.0065 - i * 0.0012)
        const s = 0.35 + i * 0.18
        const y0 = base + i * (H * waveHeight * 0.22)
        ctx!.beginPath()
        ctx!.moveTo(0, H)
        for (let x = 0; x <= W + 16; x += 16) {
          const y = y0 + amp * Math.sin(x * k + t * s + i * 1.7) + amp * 0.45 * Math.sin(x * k * 2.3 - t * s * 0.8 + i)
          ctx!.lineTo(x, y)
        }
        ctx!.lineTo(W, H)
        ctx!.closePath()
        ctx!.fillStyle = fill
        ctx!.fill()
      })
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H)
      drawWaves(t)
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      draw(t)

      // rain: target count follows intensity (about 14 streaks per mm/h, capped)
      const mmh = intensityRef.current
      const want = mmh < 0.05 ? 0 : Math.min(220, Math.round(10 + mmh * 14) * (W / 1400 + 0.3))
      while (drops.length < want) drops.push(newDrop(drops.length < want / 2))
      if (drops.length > want) drops.length = Math.max(0, Math.floor(want))
      ctx!.lineCap = 'round'
      ctx!.lineWidth = variant === 'dark' ? 1.1 : 1
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i]
        d.y += d.speed * dt
        d.x += d.speed * dt * 0.16
        if (d.y >= d.target) {
          addRipple(d.x, d.target, 10 + Math.random() * 14, 0.32)
          drops[i] = newDrop(false)
          continue
        }
        ctx!.strokeStyle = `rgba(${pal.drop},${d.alpha})`
        ctx!.beginPath()
        ctx!.moveTo(d.x, d.y)
        ctx!.lineTo(d.x - d.len * 0.16, d.y - d.len)
        ctx!.stroke()
      }

      // ambient ripples on the water surface, even on dry days
      if (now > nextAmbient) {
        const top = surfaceY()
        addRipple(Math.random() * W, top + Math.random() * (H - top), 14 + Math.random() * 22, 0.22)
        nextAmbient = now + 700 + Math.random() * 1400
      }

      ctx!.lineWidth = 1
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        if (r.delay > 0) {
          r.delay -= dt
          continue
        }
        r.r += r.speed * dt
        const life = 1 - r.r / r.max
        if (life <= 0) {
          ripples.splice(i, 1)
          continue
        }
        ctx!.strokeStyle = `rgba(${pal.ripple},${(r.alpha * life).toFixed(3)})`
        ctx!.beginPath()
        ctx!.ellipse(r.x, r.y, r.r, r.r * 0.38, 0, 0, Math.PI * 2)
        ctx!.stroke()
      }
      raf = requestAnimationFrame(frame)
    }

    const local = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect()
      const x = e.clientX - b.left
      const y = e.clientY - b.top
      return x >= 0 && y >= 0 && x <= b.width && y <= b.height ? { x, y } : null
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const p = local(e)
      if (!p) return
      const now = performance.now()
      if (now - lastPointer.t < 110 || Math.hypot(p.x - lastPointer.x, p.y - lastPointer.y) < 24) return
      lastPointer = { t: now, x: p.x, y: p.y }
      addRipple(p.x, p.y, 22, 0.22)
    }
    const onDown = (e: PointerEvent) => {
      const p = local(e)
      if (!p) return
      addRipple(p.x, p.y, 34, 0.38)
      addRipple(p.x, p.y, 62, 0.28, 0.12)
      addRipple(p.x, p.y, 96, 0.18, 0.26)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    resize()
    if (animate) {
      for (let i = 0; i < 4; i++) addRipple(Math.random() * W, surfaceY() + Math.random() * H * waveHeight, 20, 0.2, i * 0.4)
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerdown', onDown, { passive: true })
      raf = requestAnimationFrame(frame)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [variant, animate, waveHeight])

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`} />
}
