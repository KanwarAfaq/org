import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import TreasuryManager from '../components/TreasuryManager';
import TransactionHistory from '../components/TransactionHistory';
import StaffDirectory from '../components/StaffDirectory';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function AdminPanel({ currentUser }) {
  const [allPosts, setAllPosts] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [adminSubView, setAdminSubView] = useState('dashboard');
  const [currentTreasuryPool, setCurrentTreasuryPool] = useState(0);
  const [adminError, setAdminError] = useState('');
  const navigate = useNavigate();

  // 📄 NEW: Pagination States for the Master History Table
  const [historyPage, setHistoryPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchAdminData();

    // ⚡ REAL-TIME ADMIN OVERSIGHT LISTENER
    const adminChannel = supabase
      .channel('admin-global-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' }, 
        () => {
          console.log('Live Database Update Detected! Refreshing Admin Panel...');
          fetchAdminData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(adminChannel);
    };
  }, []);

  // 🔄 Reset page to 1 if the user changes the "Status" filter
  useEffect(() => {
    setHistoryPage(1);
  }, [filterStatus]);

  const fetchAdminData = async () => {
    setLoading(true);
    setAdminError('');

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

      const safeProfiles = profiles || [];
      const safePosts = posts || [];
      const safeLogs = logs || [];

      setAllProfiles(safeProfiles);
      
      let processedPosts = safePosts.map(p => {
        const authorProf = safeProfiles.find(prof => prof.id === p.author_id);
        const taggedProf = safeProfiles.find(prof => prof.id === p.tagged_member_id);
        return {
          ...p,
          author: authorProf ? { full_name: authorProf.full_name } : { full_name: 'System User' },
          tagged: taggedProf ? { full_name: taggedProf.full_name } : { full_name: 'System User' }
        };
      });

      // 🛡️ DYNAMIC GROUP RESOLUTION (ADMIN SYNC)
      processedPosts = processedPosts.map(post => {
        const groupMatch = post.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/);
        const groupId = groupMatch ? groupMatch[1] : null;

        if (groupId && post.status === 'pending') {
          const peerApproved = processedPosts.find(other => other.action_reason?.includes(groupId) && other.status === 'approved');
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

  // 🧮 MATH FOR PAGINATION LOGIC
  const filteredPosts = allPosts.filter(post => filterStatus === 'all' || post.status === filterStatus);
  const totalHistoryPages = Math.ceil(filteredPosts.length / ITEMS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice((historyPage - 1) * ITEMS_PER_PAGE, historyPage * ITEMS_PER_PAGE);

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Syncing Command Center Systems...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {adminError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">Admin data sync failed: {adminError}</div>}

      <div className="bg-slate-900 rounded-xl p-4 shadow-lg flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-white overflow-hidden">
        
        {/* Left Side: Navigation Links */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-blue-400 tracking-wider mr-2">👑 CONTROL PANEL:</span>
          <button type="button" onClick={() => setAdminSubView('dashboard')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${adminSubView === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>💰 Dashboard</button>
          <button type="button" onClick={() => setAdminSubView('history')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${adminSubView === 'history' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>📋 History Table</button>
          <button type="button" onClick={() => setAdminSubView('directory')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${adminSubView === 'directory' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>👥 Directory</button>
          
          {/* 🆕 FIXED ROUTING PATHS & STYLING */}
          <div className="flex items-center gap-2 border-l border-slate-700 pl-4 ml-2">
            <button onClick={() => navigate('/receipt-form')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1">📸 Upload</button>
            <button onClick={() => navigate('/receipt-vault')} className="px-3 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1">🗄️ Vault</button>
          </div>
        </div>

        {/* Right Side: Refresh Button */}
        <button type="button" onClick={fetchAdminData} className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1.5 rounded-lg font-mono shadow-inner hover:bg-slate-700 shrink-0">REFRESH DATA</button>
      </div>

      <div className="w-full">
        {adminSubView === 'dashboard' && (
          <div className="max-w-3xl mx-auto animate-fadeIn">
            <TreasuryManager currentTreasuryPool={currentTreasuryPool} treasuryHistoryLogs={treasuryHistoryLogs} currentUser={currentUser} fetchAdminData={fetchAdminData} />
          </div>
        )}
        
        {adminSubView === 'history' && (
          <div className="w-full animate-fadeIn space-y-4">
            {/* We pass ONLY the paginated slice of 10 posts down to your component! */}
            <TransactionHistory 
              allPosts={paginatedPosts} 
              filterStatus={filterStatus} 
              setFilterStatus={setFilterStatus} 
              currentUser={currentUser} 
              fetchAdminData={fetchAdminData} 
              allProfiles={allProfiles} 
            />
            
            {/* 📄 NEW: PAGINATION CONTROLS FOR HISTORY TABLE */}
            {filteredPosts.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-xs text-slate-500 font-medium">
                  Showing <span className="font-bold text-slate-900">{(historyPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-900">{Math.min(historyPage * ITEMS_PER_PAGE, filteredPosts.length)}</span> of <span className="font-bold text-slate-900">{filteredPosts.length}</span> records
                </p>
                <div className="flex gap-2">
                  <button 
                    disabled={historyPage === 1} 
                    onClick={() => setHistoryPage(p => p - 1)} 
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all"
                  >
                    ← Previous
                  </button>
                  <div className="flex items-center px-4 font-mono text-xs font-bold text-slate-400 bg-slate-50 rounded-lg border border-slate-100">
                    {historyPage} / {totalHistoryPages}
                  </div>
                  <button 
                    disabled={historyPage === totalHistoryPages || totalHistoryPages === 0} 
                    onClick={() => setHistoryPage(p => p + 1)} 
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
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