const OUTGOING_TYPES = new Set(["out", "sale", "sale_return_out", "purchase_return", "purchase_return_out", "transfer_out", "opname_out"]);

const text = (value) => String(value ?? "").trim();
const number = (value) => Number(value || 0);
const movementType = (row) => text(row.transaction_type || row.movement_type).toLowerCase();
const businessDate = (row) => text(row.transaction_date || row.date || row.created_date);

export function normalizeBranchStockLedger(row) {
  const type = movementType(row);
  const rawQuantity = number(row.quantity);
  const outgoing = rawQuantity < 0 || (rawQuantity > 0 && OUTGOING_TYPES.has(type));
  return {
    id: text(row.id),
    transaction_date: businessDate(row),
    created_date: text(row.created_date),
    branch_id: text(row.branch_id),
    branch_code: text(row.branch_code),
    product_id: text(row.product_id),
    product_name: text(row.product_name),
    sku: text(row.sku),
    transaction_type: type,
    transaction_id: text(row.transaction_id || row.ref_id),
    reference_number: text(row.reference_number || row.ref_code),
    quantity: rawQuantity,
    qty_in: outgoing ? 0 : Math.abs(rawQuantity),
    qty_out: outgoing ? Math.abs(rawQuantity) : 0,
    user: text(row.user || row.created_by || row.updated_by),
    note: text(row.note),
    source_scope: row.balance_scope === "branch" || !row.warehouse_id ? "BRANCH" : "LEGACY_WAREHOUSE",
  };
}

export function chronologicalLedgerSort(left, right) {
  return left.transaction_date.localeCompare(right.transaction_date)
    || left.created_date.localeCompare(right.created_date)
    || left.id.localeCompare(right.id);
}

const strongFingerprint = (row) => [row.transaction_id, row.product_id, row.branch_id, row.transaction_type, row.quantity, row.transaction_date].join("|");
const candidateFingerprint = (row) => [row.product_id, row.branch_id, row.transaction_type, row.quantity, row.transaction_date].join("|");

export function normalizeAndDeduplicateLedger(rows) {
  const normalized = rows.map(normalizeBranchStockLedger).sort(chronologicalLedgerSort);
  const seenIds = new Set();
  const seenStrong = new Map();
  const candidateGroups = new Map();
  const movements = [];
  const duplicates = [];

  for (const row of normalized) {
    if (row.id && seenIds.has(row.id)) {
      duplicates.push({ reason: "LEDGER_ID", kept_id: row.id, duplicate_id: row.id });
      continue;
    }
    if (row.id) seenIds.add(row.id);
    const strong = row.transaction_id ? strongFingerprint(row) : "";
    if (strong && seenStrong.has(strong)) {
      duplicates.push({ reason: "STRONG_FINGERPRINT", kept_id: seenStrong.get(strong).id, duplicate_id: row.id });
      continue;
    }
    if (strong) seenStrong.set(strong, row);
    const candidate = candidateFingerprint(row);
    candidateGroups.set(candidate, [...(candidateGroups.get(candidate) || []), row]);
    movements.push(row);
  }

  const duplicateCandidates = [...candidateGroups.values()]
    .filter((group) => group.length > 1 && group.some((row) => !row.transaction_id))
    .map((group) => ({ reason: "UNCONFIRMED_SIMILAR_MOVEMENT", ids: group.map((row) => row.id) }));
  return { movements, duplicates, duplicateCandidates };
}

const day = (value) => {
  const raw = text(value);
  if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
};

export function buildBranchStockReadModel({ ledgerRows, startDate = "", endDate = "", resolvedBalances = new Map() }) {
  const { movements, duplicates, duplicateCandidates } = normalizeAndDeduplicateLedger(ledgerRows);
  const branchGroups = new Map();
  for (const row of movements) branchGroups.set(row.branch_id, [...(branchGroups.get(row.branch_id) || []), row]);

  const timelines = [];
  const summaries = [];
  const diagnostics = [];
  for (const [branchId, branchRows] of branchGroups) {
    let running = 0;
    let opening = 0;
    let totalIn = 0;
    let totalOut = 0;
    const rows = [];
    for (const row of branchRows) {
      const rowDay = day(row.transaction_date);
      if (startDate && rowDay < startDate) {
        running += row.qty_in - row.qty_out;
        opening = running;
        continue;
      }
      if (endDate && rowDay > endDate) continue;
      running += row.qty_in - row.qty_out;
      totalIn += row.qty_in;
      totalOut += row.qty_out;
      rows.push({ ...row, running_balance: running });
    }
    const closing = opening + totalIn - totalOut;
    timelines.push(...rows);
    summaries.push({ branch_id: branchId, opening_balance: opening, total_in: totalIn, total_out: totalOut, closing_balance: closing });
    if (resolvedBalances.has(branchId)) {
      const resolved = number(resolvedBalances.get(branchId));
      diagnostics.push({ branch_id: branchId, historical_closing: closing, resolved_balance: resolved, difference: resolved - closing, status: resolved === closing ? "MATCH" : "MISMATCH" });
    }
  }
  return { timelines: timelines.sort(chronologicalLedgerSort), summaries, diagnostics, duplicates, duplicateCandidates };
}

export function aggregateStockSummary(summaries) {
  return summaries.reduce((result, row) => ({
    opening_balance: result.opening_balance + row.opening_balance,
    total_in: result.total_in + row.total_in,
    total_out: result.total_out + row.total_out,
    closing_balance: result.closing_balance + row.closing_balance,
  }), { opening_balance: 0, total_in: 0, total_out: 0, closing_balance: 0 });
}

export function buildStockCardExport({ rows, summary, product, branchLabel, periodLabel, includeBranch, branchNames = new Map(), typeLabels = {} }) {
  const metadata = [
    ["KARTU STOK DETAIL"], ["Produk", product?.name || "-"], ["SKU", product?.sku || "-"],
    ["Cabang", branchLabel], ["Periode", periodLabel], [], ["Saldo Awal", summary.opening_balance],
    ["Total Masuk", summary.total_in], ["Total Keluar", summary.total_out], ["Saldo Akhir", summary.closing_balance], [],
  ];
  const header = ["Tanggal", "No Referensi", "Jenis Transaksi", ...(includeBranch ? ["Cabang"] : []), "Masuk", "Keluar", "Saldo", "User", "Catatan"];
  const body = rows.map((row) => [row.transaction_date, row.reference_number, typeLabels[row.transaction_type] || row.transaction_type, ...(includeBranch ? [branchNames.get(row.branch_id) || row.branch_code || row.branch_id] : []), row.qty_in || "", row.qty_out || "", row.running_balance, row.user, row.note]);
  return [...metadata, header, ...body];
}
