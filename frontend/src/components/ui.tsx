import { useState, type ReactNode } from 'react'

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="border-b border-line bg-paper px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="h-serif mt-1 text-2xl font-semibold text-ink md:text-[28px]">{title}</h1>
        {children && <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate">{children}</div>}
      </div>
    </header>
  )
}

export function Section({ title, kicker, children, right }: { title?: string; kicker?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            {kicker && <div className="eyebrow">{kicker}</div>}
            {title && <h2 className="h-serif text-lg font-semibold text-ink">{title}</h2>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Panel({ children, className = '', title, note }: { children: ReactNode; className?: string; title?: string; note?: ReactNode }) {
  return (
    <div className={`border border-line bg-white ${className}`}>
      {title && (
        <div className="flex items-baseline justify-between gap-2 border-b border-paper-2 px-4 py-2.5">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {note && <div className="text-[11px] text-mute">{note}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <div className="border-l-2 border-line pl-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-mute">{label}</div>
      <div className={`num mt-0.5 text-xl font-medium ${tone === 'warn' ? 'text-orange' : 'text-ink'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] leading-snug text-mute">{sub}</div>}
    </div>
  )
}

const KIND: Record<string, [string, string]> = {
  observed: ['Observed', 'bg-blue-soft text-blue'],
  derived: ['Derived', 'bg-paper-2 text-slate'],
  model: ['Model estimate', 'bg-[#f6e6cf] text-[#8a5a17]'],
  modelled: ['Modelled dataset', 'bg-[#efe6f2] text-[#6d4c7d]'],
  simulated: ['Simulated scenario', 'bg-[#f6dcd8] text-red'],
  imputed: ['Imputed', 'bg-[#fbe7d4] text-orange'],
  reported: ['Reported', 'bg-[#e3efe6] text-green'],
  forecast: ['Rainfall forecast', 'bg-blue-soft text-blue'],
}

export function Kind({ k }: { k: keyof typeof KIND | string }) {
  const [label, cls] = KIND[k] ?? [k, 'bg-paper-2 text-slate']
  return <span className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>
}

export function Loading({ what = 'data' }: { what?: string }) {
  return <div className="flex min-h-[120px] items-center justify-center text-sm text-mute">Loading {what}…</div>
}

export function ErrorBox({ error, hint }: { error: string; hint?: string }) {
  return (
    <div className="border border-[#e8c3bd] bg-[#fbf1ef] p-4 text-sm text-red">
      <div className="font-semibold">Could not load data</div>
      <div className="num mt-1 text-[12px] break-all">{error}</div>
      {hint && <div className="mt-2 text-slate">{hint}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-line p-6 text-center text-sm text-mute">{children}</div>
}

export function Callout({ children, tone = 'note' }: { children: ReactNode; tone?: 'note' | 'warn' }) {
  return (
    <div className={`border-l-2 px-4 py-3 text-[13.5px] leading-relaxed ${tone === 'warn' ? 'border-orange bg-[#fbf3ea] text-[#6b3f17]' : 'border-blue bg-blue-soft/50 text-slate'}`}>
      {children}
    </div>
  )
}

export function Timestamp({ iso, label = 'Generated' }: { iso?: string; label?: string }) {
  if (!iso) return null
  return (
    <span className="text-[11px] text-mute">
      {label} <span className="num">{new Date(iso).toISOString().replace('T', ' ').slice(0, 16)} UTC</span>
    </span>
  )
}

/** Collapsible block that holds the technical detail behind a plain-language summary. */
export function Details({ title = 'How did we get this?', children, defaultOpen = false, className = '' }: { title?: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`border-t border-line ${className}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-paper-2 px-4 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-ink hover:bg-[#e8e4d9]">
        <span>{title}</span>
        <span className="text-[12px] font-normal normal-case tracking-normal text-mute">{open ? 'Hide details ▲' : 'Show technical details ▼'}</span>
      </button>
      {open && <div className="bg-paper">{children}</div>}
    </div>
  )
}

/** Large, friendly summary panel used at the top of each page. */
export function Plain({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="border border-line bg-white p-5 text-[15.5px] leading-relaxed text-ink">
      {title && <h2 className="h-serif mb-2 text-xl font-semibold">{title}</h2>}
      {children}
    </div>
  )
}

/** Full-width expandable container for a page's technical content. */
export function TechDetails({ children, title = 'How did we get this?' }: { children: ReactNode; title?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <div className="border border-line bg-white">
        <Details title={title}>
          <div>{children}</div>
        </Details>
      </div>
    </section>
  )
}

export const LEVELS = [
  { key: 'very low', label: 'Very unlikely to waterlog', color: '#efe9dc', short: 'Very low' },
  { key: 'low', label: 'Unlikely to waterlog', color: '#f0d39a', short: 'Low' },
  { key: 'moderate', label: 'Sometimes waterlogs', color: '#e7a35b', short: 'Medium' },
  { key: 'high', label: 'Often waterlogs', color: '#cf6537', short: 'High' },
  { key: 'very high', label: 'Among the worst spots', color: '#a12f2a', short: 'Very high' },
]

export function CI({ ci, d = 2 }: { ci?: [number, number]; d?: number }) {
  if (!ci) return null
  return <span className="num text-[11px] text-mute"> [{ci[0].toFixed(d)}–{ci[1].toFixed(d)}]</span>
}
