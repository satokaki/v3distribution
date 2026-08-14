import React, { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { useBranchContext } from "@/lib/BranchContext";
import BranchSelector from "@/components/BranchSelector";
import { base44 } from "@/api/base44Client";

const ROLE_LABEL = {
  super_admin: "Super Admin", kepala_cabang: "Kepala Cabang", admin_cabang: "Admin Cabang",
  kasir: "Kasir", gudang: "Gudang", finance: "Finance", admin: "Admin", user: "User",
};
import {
  LayoutDashboard,
  ShoppingCart,
  PackagePlus,
  ArrowLeftRight,
  Repeat2,
  Boxes,
  ClipboardList,
  CreditCard,
  Wallet,
  Percent,
  FileBarChart,
  Database,
  Settings,
  Menu,
  X,
  Store,
  LogOut,
} from "lucide-react";

const menuGroups = [
  {
    label: null,
    items: [
      { label: "Dashboard Cabang", path: "/", icon: LayoutDashboard, permission: "dashboard.view" },
    ],
  },
  {
    label: "Transaksi",
    items: [
      { label: "Penjualan", path: "/penjualan", icon: ShoppingCart, permission: "sales.view", children: [
        { label: "Penjualan Baru", path: "/penjualan", permission: "sales.create" },
        { label: "Laporan Penjualan", path: "/laporan/penjualan", permission: "sales.view" },
      ] },
      { label: "Pricing Engine", path: "/pricing", icon: Percent, permission: "pricing.view" },
      { label: "Pembelian", path: "/pembelian", icon: PackagePlus, permission: "purchase.view" },
      { label: "Mutasi Antar Cabang", path: "/mutasi", icon: ArrowLeftRight, permission: "transfer.view" },
      { label: "Jual Beli Cabang", path: "/jual-beli-cabang", icon: Repeat2, permission: "transfer.view" },
    ],
  },
  {
    label: "Inventori & Keuangan",
    items: [
      { label: "Inventory", path: "/stok", icon: Boxes, permission: "inventory.view" },
      { label: "Kartu Stok", path: "/kartu-stok", icon: ClipboardList, permission: "inventory.view" },
      { label: "Hutang Supplier", path: "/hutang", icon: CreditCard, permission: "payable.view" },
      { label: "Piutang", path: "/piutang", icon: Wallet, permission: "receivable.view" },
      { label: "Kas", path: "/buku-kas", icon: Wallet, permission: "cash.view" },
      { label: "Bank", path: "/bank", icon: CreditCard, permission: "bank.view" },
      { label: "Rekonsiliasi", path: "/rekonsiliasi", icon: Repeat2, permission: "reconciliation.view" },
      { label: "Komisi", path: "/komisi", icon: Percent, permission: "sales.view" },
    ],
  },
  {
    label: "Data & Sistem",
    items: [
      { label: "Laporan", path: "/laporan", icon: FileBarChart, permission: "report.view" },
      { label: "Integrasi CRM V3 Pro", path: "/integrasi-crm", icon: Repeat2, permission: "crm.view", adminOnly: true },
      {
        label: "Master Data",
        path: "/master/cabang",
        icon: Database,
        children: [
          { label: "Cabang & Organisasi", path: "/master/cabang", permission: "organization.view" },
          { label: "Gudang", path: "/master/gudang", permission: "inventory.view" },
          { label: "Kategori Produk", path: "/master/kategori", permission: "product.view" },
          { label: "Master Produk", path: "/master/barang", permission: "product.view" },
          { label: "Customer", path: "/master/pelanggan", permission: "customer.view" },
          { label: "Supplier", path: "/master/supplier", permission: "purchase.view" },
          { label: "Sales", path: "/master/sales", permission: "sales.view" },
          { label: "Rekening", path: "/master/rekening", permission: "bank.view" },
        ],
      },
      {
        label: "Pengaturan",
        path: "/pengaturan",
        icon: Settings,
        adminOnly: true,
        children: [
          { label: "User & Hak Akses", path: "/pengaturan/user", permission: "system.manage" },
          { label: "System", path: "/system", permission: "system.manage" },
        ],
      },
    ],
  },
];

function NavItem({ item, onNavigate }) {
  const location = useLocation();
  const hasChildren = !!item.children;
  const [open, setOpen] = useState(
    hasChildren && item.children.some((c) => location.pathname.startsWith(c.path))
  );
  const isActive = location.pathname === item.path || (hasChildren && item.children.some((c) => location.pathname === c.path));

  const baseCls = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
    isActive
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  }`;

  const inner = (
    <>
      {item.icon && <item.icon className="w-4 h-4 shrink-0" />}
      <span className="flex-1 text-left">{item.label}</span>
      {item.soon && (
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          soon
        </span>
      )}
    </>
  );

  return (
    <div>
      {hasChildren ? (
        <button onClick={() => setOpen(!open)} className={baseCls}>
          {inner}
        </button>
      ) : (
        <Link to={item.path} onClick={onNavigate} className={baseCls}>
          {inner}
        </Link>
      )}
      {hasChildren && open && (
        <div className="mt-1 ml-4 pl-3 border-l border-border space-y-0.5">
          {item.children.map((child) => (
            <Link
              key={child.path}
              to={child.path}
              onClick={onNavigate}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                location.pathname === child.path
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isSuperAdmin, hasPermission } = useBranchContext();

  const canSee = (item) => {
    if (isSuperAdmin) return true;
    if (item.adminOnly) return false;
    return !item.permission || hasPermission(item.permission);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Store className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-sidebar-foreground">VapeDistro</div>
            <div className="text-[11px] text-muted-foreground">Multi Cabang</div>
          </div>
        </div>

        <nav className="px-3 py-4 space-y-5 overflow-y-auto h-[calc(100%-4rem)]">
          {menuGroups.map((group, gi) => {
            const visible = group.items
              .filter(canSee)
              .map((item) => item.children ? { ...item, children: item.children.filter(canSee) } : item)
              .filter((item) => !item.children || item.children.length > 0);
            if (visible.length === 0) return null;
            return (
            <div key={gi} className="space-y-1">
              {group.label && (
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
              )}
              {visible.map((item) => (
                <NavItem key={item.label} item={item} onNavigate={() => setSidebarOpen(false)} />
              ))}
            </div>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8">
          <button
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-accent"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <Store className="w-4 h-4" />
            <span>Sistem Manajemen Gudang & Distribusi</span>
          </div>
          <div className="flex items-center gap-3">
            <BranchSelector />
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-border">
              <div className="text-right">
                <div className="text-sm font-medium leading-tight">
                  {user?.display_name || user?.full_name || user?.email || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">{ROLE_LABEL[user?.app_role] || (user?.role === "admin" ? "Admin" : "User")}</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                {(user?.display_name || user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
              </div>
            </div>
            <button onClick={() => base44.auth.logout("/login")} className="p-2 rounded-lg hover:bg-accent" title="Keluar">
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
