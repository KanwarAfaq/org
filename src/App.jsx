import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import WalletProfile from './pages/WalletProfile'; // Imported to route limited members directly
import Login from './pages/Login';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchAndEnsureProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
        console.log("Profile row missing inside public table. Executing fallback sync...");

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
        } else {
          throw new Error("Profile row insertion failed to return data.");
        }
      } else {
        setCurrentUser(profile);
      }
    } catch (err) {
      console.error("Profile synchronization engine error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center bg-slate-50 font-mono text-xs text-slate-500">
        <div className="space-y-2 text-center">
          <div className="h-6 w-6 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="uppercase tracking-widest font-bold">Initializing Application Gateways...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // ====================================================================
  // ⚙️ WORKSPACE ROUTER MATRIX
  // ====================================================================
  
  // 1. Admin Routing Gate
  if (currentUser?.role === 'admin') {
    return <AdminPanel currentUser={currentUser} />;
  }

  // 2. Limited Wallet-Only Routing Gate
  // If you change a profile's role to 'wallet_viewer' in your DB, they bypass the workflow dashboard completely!
  if (currentUser?.role === 'viewer') {
    return <WalletProfile currentUser={currentUser} />;
  }

  // 3. Default Member Gate (Workflow Dashboard)
  return <Dashboard currentUser={currentUser} />;
}