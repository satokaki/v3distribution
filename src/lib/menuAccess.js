export const MENU_ACCESS_GROUPS = [
  {
    label: "Dashboard",
    items: [
      {
        key: "dashboard",
        label: "Dashboard Cabang",
        path: "/",
        permission: "dashboard.view"
      },
    ],
  },
  {
    label: "Transaksi",
    items: [
      {
        key: "sales_create",
        label: "Penjualan Baru",
        path: "/penjualan",
        permission: "sales.create"
      },
      {
        key: "sales_report",
        label: "Laporan Penjualan",
        path: "/laporan/penjualan",
        permission: "sales.view"
      },
      {
        key: "pricing",
        label: "Pricing Engine",
        path: "/pricing",
        permission: "pricing.view"
      },
      {
        key: "purchase_create",
        label: "Pembelian Baru",
        path: "/pembelian",
        permission: "purchase.create"
      },
      {
        key: "purchase_report",
        label: "Laporan Pembelian",
        path: "/laporan/pembelian",
        permission: "purchase.view"
      },
      {
        key: "transfer",
        label: "Mutasi Antar Cabang",
        path: "/mutasi",
        permission: "transfer.view"
      },
    ],
  },
  {
    label: "Inventori & Keuangan",
    items: [
      {
        key: "inventory",
        label: "Inventory",
        path: "/stok",
        permission: "inventory.view"
      },
      {
        key: "stock_card",
        label: "Kartu Stok",
        path: "/kartu-stok",
        permission: "inventory.view"
      },
      {
        key: "stock_audit",
        label: "Audit & Rekonsiliasi Stok",
        path: "/audit-stok",
        permission: "inventory.view"
      },
      {
        key: "payable",
        label: "Hutang Supplier",
        path: "/hutang",
        permission: "payable.view"
      },
      {
        key: "receivable",
        label: "Piutang",
        path: "/piutang",
        permission: "receivable.view"
      },
      {
        key: "cash",
        label: "Kas",
        path: "/buku-kas",
        permission: "cash.view"
      },
      {
        key: "bank",
        label: "Bank",
        path: "/bank",
        permission: "bank.view"
      },
      {
        key: "reconciliation",
        label: "Rekonsiliasi",
        path: "/rekonsiliasi",
        permission: "reconciliation.view"
      },
      {
        key: "commission",
        label: "Komisi",
        path: "/komisi",
        permission: "sales.view"
      },
    ],
  },
  {
    label: "Master Data",
    items: [
      {
        key: "organization",
        label: "Cabang & Organisasi",
        path: "/master/cabang",
        permission: "organization.view"
      },
      {
        key: "category",
        label: "Kategori Produk",
        path: "/master/kategori",
        permission: "product.view"
      },
      {
        key: "product",
        label: "Master Produk",
        path: "/master/barang",
        permission: "product.view"
      },
      {
        key: "customer",
        label: "Customer",
        path: "/master/pelanggan",
        permission: "customer.view"
      },
      {
        key: "supplier",
        label: "Supplier",
        path: "/master/supplier",
        permission: "purchase.view"
      },
      {
        key: "salesperson",
        label: "Sales",
        path: "/master/sales",
        permission: "sales.view"
      },
      {
        key: "account",
        label: "Rekening",
        path: "/master/rekening",
        permission: "bank.view"
      },
    ],
  },
  {
    label: "Laporan",
    items: [
      {
        key: "report",
        label: "Laporan",
        path: "/laporan",
        permission: "report.view"
      },
    ],
  },
];

export const MENU_ACCESS_ITEMS =
  MENU_ACCESS_GROUPS.flatMap((group) => group.items);

export const MENU_ACCESS_KEYS =
  MENU_ACCESS_ITEMS.map((item) => item.key);

const BY_PATH =
  [...MENU_ACCESS_ITEMS].sort(
    (a, b) => b.path.length - a.path.length
  );

const BY_KEY =
  new Map(
    MENU_ACCESS_ITEMS.map((item) => [item.key, item])
  );

export function menuItemByKey(key) {
  return BY_KEY.get(key) || null;
}

export function menuItemForPath(pathname) {
  if (!pathname) return null;

  if (pathname === "/") {
    return BY_PATH.find(
      (item) => item.path === "/"
    ) || null;
  }

  return BY_PATH.find(
    (item) =>
      item.path !== "/" &&
      pathname === item.path
  ) || null;
}

export function normalizeMenuAccess(value) {
  if (!Array.isArray(value)) return [];

  const allowed =
    new Set(MENU_ACCESS_KEYS);

  return [
    ...new Set(
      value.filter((key) => allowed.has(key))
    )
  ];
}

export function branchAllowsMenu(
  userBranch,
  menuKey
) {
  if (!userBranch || !menuKey) return false;

  // Mapping lama:
  // belum memiliki menu_access,
  // jangan menyebabkan accidental lockout.
  if (userBranch.menu_access == null) {
    return true;
  }

  return normalizeMenuAccess(
    userBranch.menu_access
  ).includes(menuKey);
}
