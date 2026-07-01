import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import SuperAdminLayout from './pages/SuperAdminLayout';
import WalletProfile from './pages/WalletProfile'; 
import Login from './pages/Login';
import ReceiptForm from './pages/ReceiptForm';
import ReceiptViewer from './pages/ReceiptViewer';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchAndEnsureProfile(session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') setIsResettingPassword(true);
      if (session) {
        fetchAndEnsureProfile(session.user);
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchAndEnsureProfile = async (authUser) => {
    try {
      const { data: profilesList, error } = await supabase.from('profiles').select('*').eq('id', authUser.id);
      if (error) throw error;
      
      const profile = profilesList && profilesList.length > 0 ? profilesList[0] : null;

      if (!profile) {
        const defaultProfile = {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
          email: authUser.email,
          role: 'member', 
          total_amount_claimed: 0,
          is_active: true
        };
        const { data: insertedRows, error: insertError } = await supabase.from('profiles').insert(defaultProfile).select('*');
        if (insertError) throw insertError;
        
        if (insertedRows && insertedRows.length > 0) {
          setCurrentUser(insertedRows[0]);
        }
      } else {
        setCurrentUser(profile);
      }
    } catch (err) {
      console.error("Profile sync error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return alert("Password must be at least 6 characters long.");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      alert(`Update failed: ${error.message}`);
    } else {
      alert("Password updated successfully! Logging you into your workspace...");
      setIsResettingPassword(false);
      setNewPassword('');
    }
  };

  if (loading) return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 space-y-4"><div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin shadow-md"></div><div className="text-xs font-bold text-slate-500 font-mono tracking-widest uppercase animate-pulse">Initializing Secure Gateways...</div></div>;
  if (isResettingPassword) return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4"><form onSubmit={handleUpdatePassword} className="bg-white p-6 rounded-xl border border-slate-200 shadow-md max-w-sm w-full space-y-4"><div><h3 className="text-base font-black text-slate-900 uppercase tracking-wider">🔒 Update Account Password</h3><p className="text-xs text-slate-400 mt-1">Provide your fresh configuration entry below.</p></div><input type="password" placeholder="Type new secure password..." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full text-xs p-3 bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required /><button type="submit" className="w-full bg-slate-900 text-white font-bold text-xs py-2.5 rounded-lg shadow-md">Save New Password</button></form></div>;
  if (!session) return <Login />;

  // 🏛️ Dynamic Home Route Switchboard based on role
  function HomeRouteSelector() {
    if (currentUser?.role === 'admin') return <AdminPanel currentUser={currentUser} />;
    if (currentUser?.role === 'viewer' || currentUser?.role === 'su') return <WalletProfile currentUser={currentUser} />;
    return <Dashboard currentUser={currentUser} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-slate-50 relative">
        <Toaster position="top-right" toastOptions={{ className: 'text-sm font-bold shadow-xl rounded-xl' }} />
        
        <Routes>
          <Route path="/" element={<HomeRouteSelector />} />
          <Route path="/receipt-form" element={<ReceiptForm currentUser={currentUser} />} />
          <Route path="/receipt-vault" element={<ReceiptViewer currentUser={currentUser} />} />
          <Route path="/super-admin" element={currentUser?.is_super_admin ? <SuperAdminLayout currentUser={currentUser} /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>

        {/* Floating Toggle Button separated into a subcomponent to safely tap into routing hooks */}
        <SuperAdminToggle currentUser={currentUser} />
      </div>
    </Router>
  );
}

function SuperAdminToggle({ currentUser }) {
  const location = useLocation();
  const navigate = useNavigate();

  if (!currentUser?.is_super_admin) return null;
  const isSuperAdminPage = location.pathname === '/super-admin';

  return (
    <div className="fixed bottom-6 right-6 z-[9999]">
      <button 
        onClick={() => navigate(isSuperAdminPage ? '/' : '/super-admin')}
        className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-full shadow-2xl font-black text-sm tracking-wider border-2 border-slate-700 flex items-center gap-2 transition-transform hover:scale-105"
      >
        {isSuperAdminPage ? '👤 View as Standard User' : '⚡ Switch to Master Console'}
      </button>
    </div>
  );
}