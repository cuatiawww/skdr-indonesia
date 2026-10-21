// PR 018: one card surface for the whole app. Use ONLY where a card carries meaning (KPI tile, disease card,
// carousel item, modal). Sections, charts, maps and tables use <Section>/<Panel> (editorial, no frame).
import React from 'react'

type Props = React.HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'article' | 'section'; pad?: 'none' | 'sm' | 'md'; interactive?: boolean }

export const cardClass = (pad: Props['pad'] = 'md', interactive = false) =>
  `skdr-card ${pad === 'none' ? '' : pad === 'sm' ? 'p-3' : 'p-4'} ${interactive ? 'transition-colors hover:border-brand-300' : ''}`

export default function Card({ as = 'div', pad = 'md', interactive = false, className = '', ...rest }: Props) {
  const C = as
  return <C {...rest} className={`${cardClass(pad, interactive)} ${className}`} />
}
