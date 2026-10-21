'use client'
// PR 012: minimal markdown renderer for /dokumentasi content (headings, paragraphs, lists, tables, bold/italic/code,
// ```mermaid blocks). Content files are our own static files in public/docs/dokumentasi (no user input).
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

function inline(s: string, key = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0; let m: RegExpExecArray | null; let k = key
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={k++} className="font-semibold text-slate-900">{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k++} className="rounded bg-slate-100 px-1 font-mono text-[0.85em] text-slate-700">{tok.slice(1, -1)}</code>)
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

let mermaidInit: Promise<any> | null = null
function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    mermaidInit ||= import('mermaid').then((m) => { m.default.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'base', flowchart: { curve: 'basis', htmlLabels: true }, themeVariables: { fontSize: '13px', fontFamily: 'inherit' } }); return m.default })
    mermaidInit.then(async (mm) => {
      const id = `mmd-${Math.random().toString(36).slice(2)}`
      const { svg, bindFunctions } = await mm.render(id, code.replaceAll('{BASE}', PUBLIC_BASE_PATH))
      if (!alive || !ref.current) return
      ref.current.innerHTML = svg
      bindFunctions?.(ref.current)
    }).catch((e: any) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [code])
  return (
    <div className="my-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4" data-testid="mermaid">
      {err ? <pre className="whitespace-pre-wrap text-xs text-red-600">{err}</pre> : null}
      <div ref={ref} className="mx-auto [&_svg]:mx-auto [&_svg]:max-w-full" />
    </div>
  )
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0; let k = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim(); const buf: string[] = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      blocks.push(lang === 'mermaid' ? <Mermaid key={k++} code={buf.join('\n')} /> : <pre key={k++} className="my-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{buf.join('\n')}</pre>)
      continue
    }
    if (/^#{1,4} /.test(l)) {
      const lvl = l.match(/^#+/)![0].length; const s = l.slice(lvl + 1)
      blocks.push(lvl <= 2 ? <h2 key={k++} className="mb-2 mt-6 text-base font-black uppercase tracking-wide text-slate-900 first:mt-0">{inline(s)}</h2>
        : <h3 key={k++} className="mb-2 mt-5 text-sm font-bold text-slate-800">{inline(s)}</h3>)
      i++; continue
    }
    if (l.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); i++ }
      const [head, , ...body] = rows
      blocks.push(
        <div key={k++} className="my-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr>{head.map((h, j) => <th key={j} className="px-3 py-2 font-bold">{inline(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{body.map((r, a) => <tr key={a} className="align-top">{r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-700">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>)
      continue
    }
    if (/^(\d+\.|-) /.test(l)) {
      const ordered = /^\d+\./.test(l); const items: string[] = []
      while (i < lines.length && /^(\d+\.|-) /.test(lines[i])) { items.push(lines[i].replace(/^(\d+\.|-) /, '')); i++ }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(<Tag key={k++} className={`my-2 space-y-1 pl-5 text-sm text-slate-700 ${ordered ? 'list-decimal' : 'list-disc'}`}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</Tag>)
      continue
    }
    if (!l.trim()) { i++; continue }
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#|\||```|\d+\. |- )/.test(lines[i])) buf.push(lines[i++])
    blocks.push(<p key={k++} className="my-2 text-sm leading-relaxed text-slate-700">{inline(buf.join(' '))}</p>)
  }
  return <div className="max-w-none">{blocks.map((b, j) => <Fragment key={j}>{b}</Fragment>)}</div>
}
