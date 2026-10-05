import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './session.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Products from './pages/Products.jsx';
import NewEntry from './pages/NewEntry.jsx';
import Mpesa from './pages/Mpesa.jsx';
import SmsOutbox from './pages/SmsOutbox.jsx';

export default function App() {
  const { isLoggedIn } = useSession();

  if (!isLoggedIn) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="new" element={<NewEntry />} />
        <Route path="mpesa" element={<Mpesa />} />
        <Route path="sms" element={<SmsOutbox />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
