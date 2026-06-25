import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import WalletProfile from './pages/WalletProfile'; // Import the new wallet page

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Track which view state the user is on: 'main' or 'wallet'
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

  if (loading) return <div style={{ textAlign: 'center', marginTop: '100px' }}>Loading Application...</div>;
  if (!session) return <Login />;

  return (
    <div>
      {/* UNIVERSAL NAVBAR WITH INTEGRATED ROUTING ACTION CONTROLS */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 30px', background: '#333', color: '#fff', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, display: 'inline-block', marginRight: '20px' }}>🏢 Staff Portal ({profile?.full_name})</h3>
          
          {/* Menu Buttons to switch views manually */}
          <button onClick={() => setCurrentView('main')} style={{ background: currentView === 'main' ? '#0070f3' : 'transparent', color: '#fff', border: '1px solid #fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}>
            🗂️ Workflow Dashboard
          </button>
          <button onClick={() => setCurrentView('wallet')} style={{ background: currentView === 'wallet' ? '#0070f3' : 'transparent', color: '#fff', border: '1px solid #fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
            💳 Wallet & Profile Ledger
          </button>
        </div>
        <div>
          <span style={{ marginRight: '15px', textTransform: 'uppercase', fontSize: '12px', background: '#555', padding: '4px 8px', borderRadius: '4px' }}>
            Role: {profile?.role}
          </span>
          <button onClick={handleLogout} style={{ background: '#ff4d4d', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Logout
          </button>
        </div>
      </nav>

      {/* CORE RENDER CONDITIONAL PANEL ROUTING */}
      {profile?.role === 'admin' ? (
        <AdminPanel currentUser={profile} />
      ) : (
        currentView === 'main' ? (
          <Dashboard currentUser={profile} />
        ) : (
          <WalletProfile currentUser={profile} />
        )
      )}
    </div>
  );
}
//hhh