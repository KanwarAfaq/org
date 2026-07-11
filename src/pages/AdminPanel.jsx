import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import TreasuryManager from '../components/TreasuryManager';
import TransactionHistory from '../components/TransactionHistory';
import StaffDirectory from '../components/StaffDirectory';
import { useNavigate } from 'react-router-dom'; // 🆕 ROUTER
import toast from 'react-hot-toast';

export default function AdminPanel({ currentUser }) { // 🆕 Removed setActivePage
  const navigate = useNavigate(); // 🆕 Init Router
  const [allPosts, setAllPosts] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [adminSubView, setAdminSubView] = useState('dashboard');
  const [currentTreasuryPool, setCurrentTreasuryPool] = useState(0);
  const [adminError, setAdminError] = useState('');

 useEffect(() => {
    fetchAdminData();
    const adminChannel = supabase.channel('admin-global-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => { fetchAdminData(); }).subscribe();
    return () => { supabase.removeChannel(adminChannel); };
  }, []);

  const fetchAdminData = async () => {
    setLoading(true); setAdminError('');
    try {
      const { data: treasuryData, error: treasuryError } = await supabase.from('company_treasury').select('total_initial_budget').eq('id', 1).maybeSingle();
      if (treasuryError) throw treasuryError;
      setCurrentTreasuryPool(Number(treasuryData?.total_initial_budget || 0));

   

      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
      if (profilesError) throw profilesError;

      const { data: posts, error: postsError } = await supabase.from('posts').select('id, content, status, flag_color, action_reason, created_at, updated_at, author_id, tagged_member_id');
      if (postsError) throw postsError;

      const { data: logs, error: logsError } = await supabase.from('audit_logs').select('*').order('action_timestamp', { ascending: false }); 
      if (logsError) throw logsError;

      setAllProfiles(profiles || []);
      
      let processedPosts = (posts || []).map(p => {
        const authorProf = (profiles || []).find(prof => prof.id === p.author_id);
        const taggedProf = (profiles || []).find(prof => prof.id === p.tagged_member_id);
        return { ...p, author: authorProf ? { full_name: authorProf.full_name } : { full_name: 'System User' }, tagged: taggedProf ? { full_name: taggedProf.full_name } : { full_name: 'System User' } };
      });

      processedPosts = processedPosts.map(post => {
        const groupId = post.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/)?.[1] || null;
        if (groupId && post.status === 'pending') {
          const peerApproved = processedPosts.find(other => other.action_reason?.includes(groupId) && other.status === 'approved');
          if (peerApproved) return { ...post, status: 'deactivated', flag_color: 'slate', action_reason: `Resolved by peer: ${peerApproved.tagged?.full_name || 'Another Verifier'} || GROUP_ID:${groupId}` };
        }
        return post;
      });

      setAllPosts(processedPosts);

      const processedLogs = (logs || []).map((log) => {
        const matchingProfile = (profiles || []).find((p) => p.id === log.performed_by);
        return { ...log, performer_name: matchingProfile ? matchingProfile.full_name : 'System/Admin' };
      });

      setAuditLogs(processedLogs);
    } catch (err) {
      setAdminError(err.message || 'Unable to sync admin data.');
    } finally { setLoading(false); }
  };
    const handleSignOut = () => {
    toast((t) => (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 max-w-sm">
        <h3 className="font-black text-slate-900 mb-2">Sign Out?</h3>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg text-xs">Cancel</button>
          <button onClick={async () => { toast.dismiss(t.id); await supabase.auth.signOut(); }} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg text-xs">Confirm</button>
        </div>
      </div>
    ), { duration: Infinity });
  };
  const treasuryHistoryLogs = auditLogs.filter((log) => log.action_taken === 'ADMIN_TREASURY_ADJUST');

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Syncing Command Center Systems...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {adminError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">Admin data sync failed: {adminError}</div>}

      <div className="bg-slate-900 rounded-xl p-4 shadow-lg flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-blue-400 tracking-wider mr-2">👑 CONTROL PANEL:</span>
          <button type="button" onClick={() => setAdminSubView('dashboard')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${adminSubView === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>💰 Treasury Dashboard</button>
          <button type="button" onClick={() => setAdminSubView('history')} className={`px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white shadow  ${adminSubView === 'history' ? 'bg-blue-600 text-white' : 'text-slate-400 '}`}> Master History Table</button>
          <button type="button" onClick={() => setAdminSubView('directory')} className={`px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white shadow ${adminSubView === 'directory' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>👥 Staff Directory</button>
          
          {/* 🆕 FIXED ROUTER LINKS */}
          <div className="flex border-l border-slate-700 pl-2 ml-2 gap-2">
            <button onClick={() => navigate('/receipt-vault')} className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white shadow">🗄️ View Vault</button>
          </div>
        </div>
       <button onClick={handleSignOut} className="text-[10px] bg-red-950/40 border border-red-900/50 text-red-400 px-3 py-2 rounded font-mono hover:bg-red-900">❌ SIGN OUT</button>
        <button type="button" onClick={fetchAdminData} className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1 rounded font-mono shadow-inner hover:bg-slate-700">REFRESH DATA</button>
      </div>

      <div className="w-full">
        {adminSubView === 'dashboard' && <div className="max-w-3xl mx-auto animate-fadeIn"><TreasuryManager currentTreasuryPool={currentTreasuryPool} treasuryHistoryLogs={treasuryHistoryLogs} currentUser={currentUser} fetchAdminData={fetchAdminData} /></div>}
        {adminSubView === 'history' && <div className="w-full animate-fadeIn"><TransactionHistory allPosts={allPosts} filterStatus={filterStatus} setFilterStatus={setFilterStatus} currentUser={currentUser} fetchAdminData={fetchAdminData} allProfiles={allProfiles} /></div>}
        {adminSubView === 'directory' && <div className="max-w-3xl mx-auto animate-fadeIn"><StaffDirectory allProfiles={allProfiles} fetchAdminData={fetchAdminData} currentUser={currentUser} /></div>}
      </div>
    </div>
  );
}