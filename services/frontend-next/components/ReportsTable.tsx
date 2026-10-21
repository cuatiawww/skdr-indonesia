import type { CaseReport } from '@/lib/api'

const fmt = (n: number) => n.toLocaleString('en-US')

export default function ReportsTable({ rows }: { rows: CaseReport[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Disease</th>
            <th className="px-3 py-2 text-left">Province</th><th className="px-3 py-2 text-right">Cases</th>
            <th className="px-3 py-2 text-right">Deaths</th><th className="px-3 py-2 text-left">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-3 py-2">{r.report_date}</td>
              <td className="px-3 py-2 font-semibold text-slate-800">{r.disease}</td>
              <td className="px-3 py-2">{r.location}</td>
              <td className="px-3 py-2 text-right font-bold">{fmt(r.cases)}</td>
              <td className="px-3 py-2 text-right font-bold text-red-600">{fmt(r.deaths)}</td>
              <td className="max-w-[320px] truncate px-3 py-2 text-slate-500" title={r.notes || ''}>{r.notes || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
