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
import EditProfile from './pages/EditProfile';
import OneSignal from 'react-onesignal';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOneSignalReady, setIsOneSignalReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchAndEnsureProfile(session.user);
      else setLoading(false);
    });

    const initOneSignal = async () => {
      try {
        if (OneSignal.initialized) {
          setIsOneSignalReady(true);
          return;
        }
        await OneSignal.init({
          appId: "b572881a-d9f6-4c75-a6c1-84a815108921", 
          allowLocalhostAsSecureOrigin: true, 
        });
        setIsOneSignalReady(true);
        OneSignal.Slidedown.promptPush();
      } catch (err) {
        if (err.message && err.message.includes('SDK already initialized')) {
          setIsOneSignalReady(true);
        } else {
          console.error("OneSignal Init Error:", err);
        }
      }
    };
    initOneSignal();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      
      // 🚀 THE FIX: We removed the 'PASSWORD_RECOVERY' trap from here!
      if (session) {
        fetchAndEnsureProfile(session.user);
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
// 🚀 NEW: A dedicated function to trigger a background state refresh
  const refreshProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await fetchAndEnsureProfile(user);
  };
  useEffect(() => {
    if (!isOneSignalReady) return; 
    if (!OneSignal || !OneSignal.initialized) return;

    try {
      if (currentUser?.id) {
        OneSignal.login(currentUser.id).catch(err => console.warn("OneSignal Login Issue:", err));
      } else {
        OneSignal.logout().catch(err => console.warn("OneSignal Logout Issue:", err));
      }
    } catch (err) {
      console.warn("OneSignal runtime error suppressed:", err);
    }
  }, [currentUser?.id, isOneSignalReady]);

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  function HomeRouteSelector() {
    if (currentUser?.role === 'admin') return <AdminPanel currentUser={currentUser} />;
    if (currentUser?.role === 'viewer' || currentUser?.role === 'su') return <WalletProfile currentUser={currentUser} />;
    return <Dashboard currentUser={currentUser} />;
  }

  const renderAppContent = () => {
    if (loading) return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 space-y-4"><div className="w-12 h-12 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin shadow-md"></div><div className="text-xs font-bold text-slate-500 font-mono tracking-widest uppercase animate-pulse">Initializing Secure Gateways...</div></div>;
    
    // 🚀 THE FIX: We entirely removed the old isResettingPassword fallback screen from here!

    if (!session) return <Login />;

    if (currentUser && currentUser.is_active === false) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
          <div className="bg-red-950/40 border border-red-900/50 p-8 rounded-3xl shadow-2xl max-w-md text-center backdrop-blur-md">
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-inner">🚫</div>
            <h2 className="text-2xl font-black text-white tracking-tight mb-2">Account Suspended</h2>
            <p className="text-sm text-slate-400 font-medium mb-4">Your access to the corporate system has been deactivated.</p>
            <div className="bg-red-900/30 border border-red-500/20 p-4 rounded-xl mb-8">
              <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Reason for Suspension:</p>
              <p className="text-sm text-red-200 font-mono">"{currentUser.action_reason || 'Administrative Discretion'}"</p>
            </div>
            <button onClick={handleSignOut} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors shadow-md border border-slate-700">Sign Out Securely</button>
          </div>
        </div>
      );
    }

    return (
      <Router>
        <div className="min-h-screen bg-slate-50 relative">
          <Routes>
            <Route path="/" element={<HomeRouteSelector />} />
            <Route path="/receipt-form" element={<ReceiptForm currentUser={currentUser} />} />
            <Route path="/receipt-vault" element={<ReceiptViewer currentUser={currentUser} />} />
            <Route path="/edit-profile" element={<EditProfile currentUser={currentUser} refreshProfile={refreshProfile} />} />
            <Route path="/super-admin" element={currentUser?.is_super_admin ? <SuperAdminLayout currentUser={currentUser} /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          <SuperAdminToggle currentUser={currentUser} />
        </div>
      </Router>
    );
  };

  return (
    <>
      <Toaster position="top-right" toastOptions={{ className: 'text-sm font-bold shadow-xl rounded-xl' }} />
      {renderAppContent()}
    </>
  );
}

function SuperAdminToggle({ currentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  if (!currentUser?.is_super_admin) return null;
  const isSuperAdminPage = location.pathname === '/super-admin';
  return (
    <div className="fixed bottom-6 right-6 z-[9999] print:hidden">
      <button onClick={() => navigate(isSuperAdminPage ? '/' : '/super-admin')} className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-full shadow-2xl font-black text-sm tracking-wider border-2 border-slate-700 flex items-center gap-2 transition-transform hover:scale-105">
        {isSuperAdminPage ? '👤 View as Standard User' : '⚡ Switch to Master Console'}
      </button>
    </div>
  );
}