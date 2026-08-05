import React from "react";

const inputCls =
  "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Filter bar reusable: rentang tanggal + status.
 */
export default function TransactionFilters({
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  status,
  onStatus,
  statusOptions = [],
  onClear,
}) {
  const active = dateFrom || dateTo || status;
  return (
    <div className="flex flex-wrap items-end gap-3 mb-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Dari Tanggal</label>
        <input type="date" value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Sampai Tanggal</label>
        <input type="date" value={dateTo} onChange={(e) => onDateTo(e.target.value)} className={inputCls} />
      </div>
      {statusOptions.length > 0 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select value={status} onChange={(e) => onStatus(e.target.value)} className={inputCls}>
            <option value="">Semua Status</option>
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      )}
      {active && (
        <button
          onClick={onClear}
          className="px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent"
        >
          Reset Filter
        </button>
      )}
    </div>
  );
}