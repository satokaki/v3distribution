import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Layout from '@/components/Layout';
import { BranchProvider } from '@/lib/BranchContext';
import Dashboard from '@/pages/Dashboard';
import Branches from '@/pages/master/Branches';
import Warehouses from '@/pages/master/Warehouses';
import Categories from '@/pages/master/Categories';
import Products from '@/pages/master/Products';
import Customers from '@/pages/master/Customers';
import Suppliers from '@/pages/master/Suppliers';
import Salespersons from '@/pages/master/Salespersons';
import Accounts from '@/pages/master/Accounts';
import Stock from '@/pages/Stock';
import StockCard from '@/pages/StockCard';
import StockReconciliation from '@/pages/StockReconciliation';
import Pembelian from '@/pages/Pembelian';
import PurchasePOSNew from '@/pages/PurchasePOSNew';
import Penjualan from '@/pages/Penjualan';
import SalesPOSNew from '@/pages/SalesPOSNew';
import Mutasi from '@/pages/Mutasi';
import JualBeliCabang from '@/pages/JualBeliCabang';
import BukuKas from '@/pages/BukuKas';
import Hutang from '@/pages/Hutang';
import Piutang from '@/pages/Piutang';
import Komisi from '@/pages/Komisi';
import Laporan from '@/pages/Laporan';
import PengaturanUser from '@/pages/PengaturanUser';
import PermissionGuard from '@/components/PermissionGuard';
import BlueprintModule from '@/pages/BlueprintModule';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<BranchProvider><Layout /></BranchProvider>}>
          <Route path="/" element={<PermissionGuard permission="dashboard.view"><Dashboard /></PermissionGuard>} />
          <Route path="/master/cabang" element={<PermissionGuard permission="organization.view"><Branches /></PermissionGuard>} />
          <Route path="/master/gudang" element={<PermissionGuard permission="inventory.view"><Warehouses /></PermissionGuard>} />
          <Route path="/master/kategori" element={<PermissionGuard permission="product.view"><Categories /></PermissionGuard>} />
          <Route path="/master/barang" element={<PermissionGuard permission="product.view"><Products /></PermissionGuard>} />
          <Route path="/master/pelanggan" element={<PermissionGuard permission="customer.view"><Customers /></PermissionGuard>} />
          <Route path="/master/supplier" element={<PermissionGuard permission="purchase.view"><Suppliers /></PermissionGuard>} />
          <Route path="/master/sales" element={<PermissionGuard permission="sales.view"><Salespersons /></PermissionGuard>} />
          <Route path="/master/rekening" element={<PermissionGuard permission="bank.view"><Accounts /></PermissionGuard>} />
          <Route path="/stok" element={<PermissionGuard permission="inventory.view"><Stock /></PermissionGuard>} />
          <Route path="/kartu-stok" element={<PermissionGuard permission="inventory.view"><StockCard /></PermissionGuard>} />
          <Route path="/audit-stok" element={<PermissionGuard permission="inventory.view"><StockReconciliation /></PermissionGuard>} />
          <Route path="/pembelian" element={<PermissionGuard permission="purchase.create"><PurchasePOSNew /></PermissionGuard>} />
          <Route path="/laporan/pembelian" element={<PermissionGuard permission="purchase.view"><Pembelian /></PermissionGuard>} />
          <Route path="/penjualan" element={<PermissionGuard permission="sales.create"><SalesPOSNew /></PermissionGuard>} />
          <Route path="/laporan/penjualan" element={<PermissionGuard permission="sales.view"><Penjualan reportOnly /></PermissionGuard>} />
          <Route path="/mutasi" element={<PermissionGuard permission="transfer.view"><Mutasi /></PermissionGuard>} />
          <Route path="/jual-beli-cabang" element={<PermissionGuard permission="transfer.view"><JualBeliCabang /></PermissionGuard>} />
          <Route path="/buku-kas" element={<PermissionGuard permission="cash.view"><BukuKas /></PermissionGuard>} />
          <Route path="/hutang" element={<PermissionGuard permission="payable.view"><Hutang /></PermissionGuard>} />
          <Route path="/piutang" element={<PermissionGuard permission="receivable.view"><Piutang /></PermissionGuard>} />
          <Route path="/komisi" element={<PermissionGuard permission="sales.view"><Komisi /></PermissionGuard>} />
          <Route path="/laporan" element={<PermissionGuard permission="report.view"><Laporan /></PermissionGuard>} />
          <Route path="/pengaturan/user" element={<PermissionGuard permission="system.manage"><PengaturanUser /></PermissionGuard>} />
          <Route path="/pricing" element={<PermissionGuard permission="pricing.view"><BlueprintModule title="Pricing Engine" description="Aturan harga retail, grosir, customer, dan cabang." capabilities={["Harga per tier", "Harga khusus customer", "Riwayat perubahan harga", "Approval harga"]} /></PermissionGuard>} />
          <Route path="/bank" element={<PermissionGuard permission="bank.view"><BlueprintModule title="Bank" description="Pengelolaan rekening dan transaksi bank per cabang." capabilities={["Rekening cabang", "Penerimaan dan pengeluaran", "Transfer antar rekening", "Saldo bank"]} /></PermissionGuard>} />
          <Route path="/rekonsiliasi" element={<PermissionGuard permission="reconciliation.view"><BlueprintModule title="Rekonsiliasi" description="Pencocokan kas, bank, dan transaksi operasional." capabilities={["Rekonsiliasi harian", "Selisih transaksi", "Approval penyesuaian", "Jejak audit"]} /></PermissionGuard>} />
          <Route path="/integrasi-crm" element={<PermissionGuard permission="crm.view"><BlueprintModule title="Integrasi CRM V3 Pro" description="Sinkronisasi customer, aktivitas, dan transaksi dengan CRM." capabilities={["Mapping customer", "Sinkronisasi transaksi", "Status integrasi", "Log kegagalan"]} /></PermissionGuard>} />
          <Route path="/system" element={<PermissionGuard permission="system.manage"><BlueprintModule title="System" description="Konfigurasi, audit, permission, dan kesehatan sistem." capabilities={["Role dan permission", "Audit log", "Konfigurasi aplikasi", "Monitoring integrasi"]} /></PermissionGuard>} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
