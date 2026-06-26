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
      const {
        data: profiles,
        error: profilesError,
      } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (profilesError) throw profilesError;

      const {
        data: posts,
        error: postsError,
      } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          status,
          flag_color,
          action_reason,
          created_at,
          updated_at,
          tagged_member_id,
          author:profiles!posts_author_id_fkey(full_name),
          tagged:profiles!posts_tagged_member_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;

      const {
        data: logs,
        error: logsError,
      } = await supabase
        .from('audit_logs')
        .select('*');

      if (logsError) throw logsError;

      const safeProfiles = profiles || [];
      const safePosts = posts || [];
      const safeLogs = logs || [];

      setAllProfiles(safeProfiles);
      setAllPosts(safePosts);

      let rollingPoolSum = 0;

      const chronologicallySortedLogs = [...safeLogs].sort((a, b) => {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });

      const processedLogs = chronologicallySortedLogs.map((log) => {
        const matchingProfile = safeProfiles.find((p) => p.id === log.performed_by);
        const performer_name = matchingProfile ? matchingProfile.full_name : 'System/Admin';

        if (log.action_taken === 'ADMIN_TREASURY_ADJUST') {
          const parts = (log.notes || '').split('||');

          if (parts.length >= 4) {
            const delta = Number(parts[1] || 0);
            const stateToken = parts[4] || 'LIVE';
            const isDeactivated = stateToken === 'DEACTIVATED';

            const previousTotalBeforeThisRow = rollingPoolSum;

            if (!isDeactivated) {
              rollingPoolSum += Number.isNaN(delta) ? 0 : delta;
            }

            const safePrev = Number(previousTotalBeforeThisRow || 0);
            const safeDelta = Number(Number.isNaN(delta) ? 0 : delta);
            const safeTotal = Number(rollingPoolSum || 0);
            const safeNote = parts[3] || 'General Adjustment';

            const recompiledNotes = `${safePrev}||${safeDelta}||${safeTotal}||${safeNote}||${stateToken}`;

            return {
              ...log,
              performer_name,
              notes: recompiledNotes,
            };
          }
        }

        return {
          ...log,
          performer_name,
        };
      });

      setCurrentTreasuryPool(rollingPoolSum);
      setAuditLogs(processedLogs.reverse());
    } catch (err) {
      console.error('Admin Sync Error:', err);
      setAdminError(err.message || 'Unable to sync admin data.');
    } finally {
      setLoading(false);
    }
  };

  const treasuryHistoryLogs = auditLogs.filter((log) => log.action_taken === 'ADMIN_TREASURY_ADJUST');

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium">
        Syncing Command Center Systems...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {adminError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
          Admin data sync failed: {adminError}
        </div>
      )}

      <div className="bg-slate-900 rounded-xl p-4 shadow-lg flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-blue-400 tracking-wider mr-2">
            👑 CONTROL PANEL:
          </span>

          <button
            type="button"
            onClick={() => setAdminSubView('dashboard')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              adminSubView === 'dashboard'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            📊 Treasury Dashboard
          </button>

          <button
            type="button"
            onClick={() => setAdminSubView('history')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              adminSubView === 'history'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            📋 Master History Table
          </button>

          <button
            type="button"
            onClick={() => setAdminSubView('directory')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              adminSubView === 'directory'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            👥 Staff Directory
          </button>

          <button
            type="button"
            onClick={() => setAdminSubView('security')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              adminSubView === 'security'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            🛡️ Security Logs
          </button>
        </div>

        <button
          type="button"
          onClick={fetchAdminData}
          className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1 rounded font-mono shadow-inner hover:bg-slate-700"
        >
          SYSTEM_ONLINE / REFRESH
        </button>
      </div>

      <div className="w-full">
        {adminSubView === 'dashboard' && (
          <div className="max-w-3xl mx-auto animate-fadeIn">
            <TreasuryManager
              currentTreasuryPool={currentTreasuryPool}
              treasuryHistoryLogs={treasuryHistoryLogs}
              currentUser={currentUser}
              fetchAdminData={fetchAdminData}
            />
          </div>
        )}

        {adminSubView === 'history' && (
          <div className="w-full animate-fadeIn">
            <TransactionHistory
              allPosts={allPosts}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              currentUser={currentUser}
              fetchAdminData={fetchAdminData}
              allProfiles={allProfiles}
            />
          </div>
        )}

        {adminSubView === 'directory' && (
          <div className="max-w-3xl mx-auto animate-fadeIn">
            <StaffDirectory
              allProfiles={allProfiles}
              fetchAdminData={fetchAdminData}
              currentUser={currentUser}
            />
          </div>
        )}

        {adminSubView === 'security' && (
          <div className="bg-slate-900 text-slate-100 rounded-xl p-6 shadow-xl border border-slate-800 max-h-[600px] overflow-y-auto font-mono text-xs divide-y divide-slate-800/50">
            {auditLogs.length === 0 ? (
              <div className="text-slate-500 text-center py-8">
                No security logs found.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="pt-2.5 pb-2.5 flex justify-between items-start">
                  <div>
                    <p className="text-slate-300">
                      [{log.action_taken || 'ACTIVITY'}] by {log.performer_name}
                    </p>
                    <p className="text-slate-500 text-[11px] mt-0.5">&gt; {log.notes}</p>
                  </div>

                  <span className="text-slate-500 text-[11px] whitespace-nowrap">
                    {log.created_at ? new Date(log.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
