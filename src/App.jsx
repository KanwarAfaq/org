import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
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
  
  // 🚨 THE NEW MASTER ROUTER STATE
  // Options: 'home', 'super_admin', 'receipt_form', 'receipt_vault'
  const [activePage, setActivePage] = useState('home'); 

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
          if (insertedRows[0]?.is_super_admin) setActivePage('super_admin');
        }
      } else {
        setCurrentUser(profile);
        if (profile?.is_super_admin) setActivePage('super_admin');
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

  // 🚨 THE NEW STATE ROUTER (No URLs needed!)
  if (activePage === 'receipt_form') {
    return <ReceiptForm currentUser={currentUser} setActivePage={setActivePage} />;
  }
  if (activePage === 'receipt_vault') {
    return <ReceiptViewer currentUser={currentUser} setActivePage={setActivePage} />;
  }
  if (activePage === 'super_admin' && currentUser?.is_super_admin) {
    return <SuperAdminLayout currentUser={currentUser} setActivePage={setActivePage} />;
  }

  // STANDARD HOME VIEWS
  let NormalRoleView;
  if (currentUser?.role === 'admin') {
    NormalRoleView = <AdminPanel currentUser={currentUser} setActivePage={setActivePage} />;
  } else if (currentUser?.role === 'viewer' || currentUser?.role === 'su') {
    NormalRoleView = <WalletProfile currentUser={currentUser} setActivePage={setActivePage} />;
  } else {
    NormalRoleView = <Dashboard currentUser={currentUser} setActivePage={setActivePage} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {currentUser?.is_super_admin && (
        <div className="fixed bottom-6 right-6 z-50">
          <button 
            onClick={() => setActivePage(activePage === 'super_admin' ? 'home' : 'super_admin')}
            className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-full shadow-2xl font-black text-sm tracking-wider border-2 border-slate-700 flex items-center gap-2 transition-transform hover:scale-105"
          >
            {activePage === 'super_admin' ? '👤 View as Standard User' : '⚡ Switch to Master Console'}
          </button>
        </div>
      )}
      {NormalRoleView}
    </div>
  );
}