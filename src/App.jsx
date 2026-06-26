import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import WalletProfile from './pages/WalletProfile';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('main');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
    setLoading(false);
  };

  const handleLogout = () => supabase.auth.signOut();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-medium">Loading Application...</div>;
  if (!session) return <Login />;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 bg-slate-900 text-white px-6 py-4 shadow-md flex justify-between items-center">
        <div className="flex items-center space-x-6">
          <h3 className="text-lg font-black tracking-wider text-blue-400 uppercase">🏢 CorePortal</h3>
          <div className="hidden md:flex space-x-2">
            <button onClick={() => setCurrentView('main')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${currentView === 'main' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
              🗂️ Workflow Dashboard
            </button>
            <button onClick={() => setCurrentView('wallet')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${currentView === 'wallet' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
              💳 Wallet Ledger
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-bold leading-tight">{profile?.full_name}</p>
            <span className="inline-block text-[10px] font-black tracking-widest uppercase bg-slate-800 text-blue-400 px-2 py-0.5 rounded border border-slate-700 mt-0.5">
              {profile?.role}
            </span>
          </div>
          <button onClick={handleLogout} className="px-3 py-1.5 bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold rounded-md shadow transition-colors">
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6">
        {profile?.role === 'admin' ? (
          <AdminPanel currentUser={profile} />
        ) : (
          currentView === 'main' ? <Dashboard currentUser={profile} /> : <WalletProfile currentUser={profile} />
        )}
      </main>
    </div>
  );
}