import React, { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

export default function DataTable({
  columns,
  data,
  loading = false,
  searchKeys = [],
  searchPlaceholder = "Cari...",
  pageSize = 10,
  emptyMessage = "Tidak ada data",
  rowActions,
  onRowClick,
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim() || searchKeys.length === 0) return data || [];
    const q = query.toLowerCase();
    return (data || []).filter((row) =>
      searchKeys.some((key) => {
        const val = row[key];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, query, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);

  return (
    <div className="space-y-3">
      {searchKeys.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left font-semibold text-muted-foreground px-4 py-3 whitespace-nowrap ${
                      col.className || ""
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
                {rowActions && <th className="px-4 py-3 w-0 sticky right-0 bg-muted/40" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length + (rowActions ? 1 : 0)}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (rowActions ? 1 : 0)}
                    className="px-4 py-16 text-center text-muted-foreground"
                  >
                    <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pageData.map((row, i) => (
                  <tr
                    key={row.id || i}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`border-b border-border last:border-0 transition-colors ${
                      onRowClick ? "cursor-pointer hover:bg-accent/50" : "hover:bg-accent/30"
                    }`}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 align-top ${col.className || ""}`}>
                        {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-4 py-3 whitespace-nowrap sticky right-0 bg-card shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <div className="text-muted-foreground">
              Menampilkan {start + 1}–{Math.min(start + pageSize, filtered.length)} dari {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-accent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-muted-foreground px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-accent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}