import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import WalletProfile from './pages/WalletProfile'; // Ensure WalletProfile is imported for the viewer role
import Login from './pages/Login';

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
      
      // Intercept the recovery event fired by clicking the email link
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }

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
      const { data: profilesList, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id);

      if (error) throw error;
      
      const profile = profilesList && profilesList.length > 0 ? profilesList[0] : null;

      if (!profile) {
        console.log("Profile row missing inside public table. Executing fallback sync configuration...");

        // Direct programmatic fallback creation if the PostgreSQL DB trigger latency causes a query gap
        const defaultProfile = {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
          email: authUser.email,
          role: 'member', 
          total_amount_claimed: 0,
          is_active: true
        };

        const { data: insertedRows, error: insertError } = await supabase
          .from('profiles')
          .insert(defaultProfile)
          .select('*');

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

  if (loading) return <div className="p-8 text-center text-xs font-mono">Initializing gateways...</div>;

  // Render the secure Update Password screen if the user arrived via a reset email link
  if (isResettingPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <form onSubmit={handleUpdatePassword} className="bg-white p-6 rounded-xl border border-slate-200 shadow-md max-w-sm w-full space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">🔒 Update Account Password</h3>
            <p className="text-xs text-slate-400 mt-1">Provide your fresh configuration entry below.</p>
          </div>
          <input 
            type="password" 
            placeholder="Type new secure password..." 
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full text-xs p-3 bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required 
          />
          <button type="submit" className="w-full bg-slate-900 text-white font-bold text-xs py-2.5 rounded-lg shadow-md">
            Save New Password
          </button>
        </form>
      </div>
    );
  }

  if (!session) return <Login />;

  // ====================================================================
  // ⚙️ FIXED: COMPLETE WORKSPACE ROUTER MATRIX FOR ALL 3 ROLES
  // ====================================================================
  
  // 1. Admin Control View Gate
  if (currentUser?.role === 'admin') {
    return <AdminPanel currentUser={currentUser} />;
  }

  // 2. Wallet Viewer Limited View Gate
  if (currentUser?.role === 'viewer') {
    return <WalletProfile currentUser={currentUser} />;
  }

  // 3. Default Member Hybrid View Gate (Shows both Workflow requests & Wallet tabs)
  return <Dashboard currentUser={currentUser} />;
}