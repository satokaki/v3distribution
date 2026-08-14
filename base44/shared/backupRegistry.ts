export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_PAGE_SIZE = 500;
export const RESTORE_BATCH_SIZE = 25;

export const BACKUP_ENTITY_REGISTRY = {
  Branch: { group: "master", operational: false, full: true, restoreOrder: 10 },
  ProductCategory: { group: "master", operational: false, full: true, restoreOrder: 20 },
  Product: { group: "master", operational: false, full: true, restoreOrder: 30 },
  Customer: { group: "master", operational: false, full: true, restoreOrder: 40 },
  Supplier: { group: "master", operational: false, full: true, restoreOrder: 50 },
  Salesperson: { group: "master", operational: false, full: true, restoreOrder: 60 },
  Account: { group: "master", operational: false, full: true, restoreOrder: 70 },
  Warehouse: { group: "legacy", operational: false, full: true, restoreOrder: 80 },
  Role: { group: "configuration", operational: false, full: true, restoreOrder: 100 },
  UserBranch: { group: "configuration", operational: false, full: true, restoreOrder: 110 },
  Sale: { group: "operational", operational: true, full: true, restoreOrder: 200 },
  Purchase: { group: "operational", operational: true, full: true, restoreOrder: 210 },
  InterbranchTransaction: { group: "operational", operational: true, full: true, restoreOrder: 220 },
  StockTransfer: { group: "operational", operational: true, full: true, restoreOrder: 230 },
  Receivable: { group: "operational", operational: true, full: true, restoreOrder: 240 },
  Payable: { group: "operational", operational: true, full: true, restoreOrder: 250 },
  ReceivablePayment: { group: "operational", operational: true, full: true, restoreOrder: 260 },
  PayablePayment: { group: "operational", operational: true, full: true, restoreOrder: 270 },
  CashTransaction: { group: "operational", operational: true, full: true, restoreOrder: 280 },
  Commission: { group: "operational", operational: true, full: true, restoreOrder: 290 },
  StockBalance: { group: "operational", operational: true, full: true, restoreOrder: 400 },
  StockLedger: { group: "operational", operational: true, full: true, restoreOrder: 410 },
  AuditLog: { group: "audit", operational: true, full: true, restoreOrder: 500 },
} as const;

export type BackupMode = "operational" | "full";

export function entitiesForMode(mode: BackupMode) {
  return Object.entries(BACKUP_ENTITY_REGISTRY)
    .filter(([, config]) => mode === "full" ? config.full : config.operational)
    .sort((a, b) => a[1].restoreOrder - b[1].restoreOrder)
    .map(([entity, config]) => ({ entity, ...config }));
}

export const EXCLUDED_ENTITIES = {
  User: "Base44 authentication-managed entity; password, session, dan identity tidak boleh diekspor atau direstore.",
} as const;
