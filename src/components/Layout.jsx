import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { BranchProvider } from "@/lib/BranchContext";
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
} from "lucide-react";

const menuGroups = [
  {
    label: null,
    items: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Transaksi",
    items: [
      { label: "Penjualan", path: "/penjualan", icon: ShoppingCart },
      { label: "Pembelian", path: "/pembelian", icon: PackagePlus },
      { label: "Mutasi Cabang", path: "/mutasi", icon: ArrowLeftRight, soon: true },
      { label: "Jual Beli Cabang", path: "/jual-beli-cabang", icon: Repeat2, soon: true },
    ],
  },
  {
    label: "Inventori & Keuangan",
    items: [
      { label: "Stok", path: "/stok", icon: Boxes },
      { label: "Kartu Stok", path: "/kartu-stok", icon: ClipboardList },
      { label: "Hutang", path: "/hutang", icon: CreditCard, soon: true },
      { label: "Piutang", path: "/piutang", icon: Wallet, soon: true },
      { label: "Buku Kas", path: "/buku-kas", icon: Wallet, soon: true },
      { label: "Komisi", path: "/komisi", icon: Percent, soon: true },
    ],
  },
  {
    label: "Data & Sistem",
    items: [
      { label: "Laporan", path: "/laporan", icon: FileBarChart, soon: true },
      {
        label: "Master Data",
        path: "/master/cabang",
        icon: Database,
        children: [
          { label: "Cabang", path: "/master/cabang" },
          { label: "Gudang", path: "/master/gudang" },
          { label: "Kategori", path: "/master/kategori" },
          { label: "Barang", path: "/master/barang" },
          { label: "Pelanggan", path: "/master/pelanggan" },
          { label: "Supplier", path: "/master/supplier" },
          { label: "Sales", path: "/master/sales" },
          { label: "Rekening", path: "/master/rekening" },
        ],
      },
      { label: "Pengaturan", path: "/pengaturan", icon: Settings, soon: true },
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

  return (
    <div>
      <button
        onClick={() => (hasChildren ? setOpen(!open) : null)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        {item.icon && <item.icon className="w-4 h-4 shrink-0" />}
        <span className="flex-1 text-left">{item.label}</span>
        {item.soon && (
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            soon
          </span>
        )}
      </button>
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
          {menuGroups.map((group, gi) => (
            <div key={gi} className="space-y-1">
              {group.label && (
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => (
                <NavItem key={item.label} item={item} onNavigate={() => setSidebarOpen(false)} />
              ))}
            </div>
          ))}
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
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">Super Admin</div>
              <div className="text-[11px] text-muted-foreground">Semua Cabang</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
              SA
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-8 max-w-[1600px] mx-auto">
          <BranchProvider>
            <Outlet />
          </BranchProvider>
        </main>
      </div>
    </div>
  );
}