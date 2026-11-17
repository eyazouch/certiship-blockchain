import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { Layout } from './components/Layout.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { ArrivalPage } from './pages/ArrivalPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { ProductPage } from './pages/ProductPage.jsx';
import { ProductsPage } from './pages/ProductsPage.jsx';
import { ShipmentPage } from './pages/ShipmentPage.jsx';
import { TransactionsPage } from './pages/TransactionsPage.jsx';
import { SessionProvider, useSession } from './session.jsx';
import { wagmiConfig } from './wagmi.js';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Protected({ roles, children }) {
  const { user, loading } = useSession();
  if (loading) return <p className="muted center">Chargement…</p>;
  if (!user) return <Navigate to="/connexion" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="expedition"
          element={
            <Protected roles={['SUPPLIER']}>
              <ShipmentPage />
            </Protected>
          }
        />
        <Route
          path="arrivee"
          element={
            <Protected roles={['OPERATOR']}>
              <ArrivalPage />
            </Protected>
          }
        />
        <Route path="produits" element={<ProductsPage />} />
        <Route path="produits/:number" element={<ProductPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route
          path="admin"
          element={
            <Protected roles={['ADMIN']}>
              <AdminPage />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
