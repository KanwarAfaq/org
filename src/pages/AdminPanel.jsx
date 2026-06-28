import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import TreasuryManager from '../components/TreasuryManager';
import TransactionHistory from '../components/TransactionHistory';
import StaffDirectory from '../components/StaffDirectory';

export default function AdminPanel({ currentUser }) {
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
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    setAdminError('');

    try {
      // 1. Fetch Master Treasury Balance Directly
      const { data: treasuryData, error: treasuryError } = await supabase
        .from('company_treasury')
        .select('total_initial_budget')
        .eq('id', 1)
        .maybeSingle();
        
      if (treasuryError) throw treasuryError;
      setCurrentTreasuryPool(Number(treasuryData?.total_initial_budget || 0));

      // 2. Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (profilesError) throw profilesError;

      // 3. Fetch posts safely
      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select('id, content, status, flag_color, action_reason, created_at, updated_at, author_id, tagged_member_id');

      if (postsError) throw postsError;

      // 4. Fetch all logs
      const { data: logs, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('action_timestamp', { ascending: false }); 

      if (logsError) throw logsError;

      const safeProfiles = profiles || [];
      const safePosts = posts || [];
      const safeLogs = logs || [];

      setAllProfiles(safeProfiles);
      
      // Step A: Map basic user data
      let processedPosts = safePosts.map(p => {
        const authorProf = safeProfiles.find(prof => prof.id === p.author_id);
        const taggedProf = safeProfiles.find(prof => prof.id === p.tagged_member_id);
        return {
          ...p,
          author: authorProf ? { full_name: authorProf.full_name } : { full_name: 'System User' },
          tagged: taggedProf ? { full_name: taggedProf.full_name } : { full_name: 'System User' }
        };
      });

      // ====================================================================
      // 🛡️ DYNAMIC GROUP RESOLUTION (ADMIN SYNC)
      // ====================================================================
      // This ensures the Admin sees C's row as deactivated if B already approved it.
      processedPosts = processedPosts.map(post => {
        const groupMatch = post.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/);
        const groupId = groupMatch ? groupMatch[1] : null;

        if (groupId && post.status === 'pending') {
          const peerApproved = processedPosts.find(other => 
            other.action_reason?.includes(groupId) && 
            other.status === 'approved'
          );

          if (peerApproved) {
            return {
              ...post,
              status: 'deactivated',
              flag_color: 'slate',
              action_reason: `Resolved by peer: ${peerApproved.tagged?.full_name || 'Another Verifier'} || GROUP_ID:${groupId}`
            };
          }
        }
        return post;
      });

      setAllPosts(processedPosts);

      // Map performer names to the logs without doing complex string math
      const processedLogs = safeLogs.map((log) => {
        const matchingProfile = safeProfiles.find((p) => p.id === log.performed_by);
        return { ...log, performer_name: matchingProfile ? matchingProfile.full_name : 'System/Admin' };
      });

      setAuditLogs(processedLogs);
    } catch (err) {
      console.error('Admin Sync Error:', err);
      setAdminError(err.message || 'Unable to sync admin data.');
    } finally {
      setLoading(false);
    }
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
          <button type="button" onClick={() => setAdminSubView('history')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${adminSubView === 'history' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}> Master History Table</button>
          <button type="button" onClick={() => setAdminSubView('directory')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${adminSubView === 'directory' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>👥 Staff Directory</button>
        </div>
        <button type="button" onClick={fetchAdminData} className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1 rounded font-mono shadow-inner hover:bg-slate-700">REFRESH DATA</button>
      </div>

      <div className="w-full">
        {adminSubView === 'dashboard' && (
          <div className="max-w-3xl mx-auto animate-fadeIn">
            <TreasuryManager currentTreasuryPool={currentTreasuryPool} treasuryHistoryLogs={treasuryHistoryLogs} currentUser={currentUser} fetchAdminData={fetchAdminData} />
          </div>
        )}
        {adminSubView === 'history' && (
          <div className="w-full animate-fadeIn">
            <TransactionHistory allPosts={allPosts} filterStatus={filterStatus} setFilterStatus={setFilterStatus} currentUser={currentUser} fetchAdminData={fetchAdminData} allProfiles={allProfiles} />
          </div>
        )}
        {adminSubView === 'directory' && (
          <div className="max-w-3xl mx-auto animate-fadeIn">
            <StaffDirectory allProfiles={allProfiles} fetchAdminData={fetchAdminData} currentUser={currentUser} />
          </div>
        )}
      </div>
    </div>
  );
}