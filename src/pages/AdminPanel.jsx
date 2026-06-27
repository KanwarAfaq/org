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
      // 1. Fetch profiles flat
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (profilesError) throw profilesError;

      // 2. FIXED: Fetch posts WITHOUT the nested relation string to avoid PGRST201 embedding errors
      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select(`
          id, 
          content, 
          status, 
          flag_color, 
          action_reason, 
          created_at, 
          updated_at, 
          author_id, 
          tagged_member_id
        `);

      if (postsError) throw postsError;

      const { data: logs, error: logsError } = await supabase
        .from('audit_logs')
        .select('*');

      if (logsError) throw logsError;

      const safeProfiles = profiles || [];
      const safePosts = posts || [];
      const safeLogs = logs || [];

      setAllProfiles(safeProfiles);
      
      // 3. SAFE CLIENT-SIDE MAPPING: Match author and tagged profiles manually in memory
      const processedPosts = safePosts.map(p => {
        const authorProf = safeProfiles.find(prof => prof.id === p.author_id);
        const taggedProf = safeProfiles.find(prof => prof.id === p.tagged_member_id);
        return {
          ...p,
          author: authorProf ? { full_name: authorProf.full_name } : { full_name: 'System User' },
          tagged: taggedProf ? { full_name: taggedProf.full_name } : { full_name: 'System User' }
        };
      });
      setAllPosts(processedPosts);

      // 4. Calculate total active absolute sum from log entries
      let totalSum = 0;
      safeLogs.forEach(log => {
        if (log.action_taken === 'ADMIN_TREASURY_ADJUST') {
          const parts = (log.notes || '').split('||');
          if (parts.length >= 4 && parts[4] !== 'DEACTIVATED') {
            totalSum += parseFloat(parts[1]) || 0;
          }
        }
      });
      setCurrentTreasuryPool(totalSum);

      // 5. Sort logs chronologically by action_timestamp
      const newestFirstLogs = [...safeLogs].sort((a, b) => {
        return new Date(b.action_timestamp || 0).getTime() - new Date(a.action_timestamp || 0).getTime();
      });

      let runningSumTracker = totalSum;

      const processedLogs = newestFirstLogs.map((log) => {
        const matchingProfile = safeProfiles.find((p) => p.id === log.performed_by);
        const performer_name = matchingProfile ? matchingProfile.full_name : 'System/Admin';

        if (log.action_taken === 'ADMIN_TREASURY_ADJUST') {
          const parts = (log.notes || '').split('||');

          if (parts.length >= 4) {
            const delta = Number(parts[1] || 0);
            const stateToken = parts[4] || 'LIVE';
            const isDeactivated = stateToken === 'DEACTIVATED';

            let safeTotal = 0;
            let safePrev = 0;

            if (!isDeactivated) {
              safeTotal = runningSumTracker;
              runningSumTracker -= delta; 
              safePrev = runningSumTracker;
            } else {
              safeTotal = runningSumTracker;
              safePrev = runningSumTracker;
            }

            const safeDelta = Number(Number.isNaN(delta) ? 0 : delta);
            const safeNote = parts[3] || 'General Adjustment';

            const recompiledNotes = `${safePrev}||${safeDelta}||${safeTotal}||${safeNote}||${stateToken}`;

            return {
              ...log,
              performer_name,
              notes: recompiledNotes,
            };
          }
        }
        return { ...log, performer_name };
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
        <button type="button" onClick={fetchAdminData} className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1 rounded font-mono shadow-inner hover:bg-slate-700">REFRESH</button>
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