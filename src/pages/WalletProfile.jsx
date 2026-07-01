import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function WalletProfile({ currentUser }) {
  const [personalLedger, setPersonalLedger] = useState([]);
  const [totalAddedFunds, setTotalAddedFunds] = useState(0);
  const [lastFundsLog, setLastFundsLog] = useState({ prev: 0, delta: 0, total: 0, timestamp: null });
  const [companyTotalApproved, setCompanyTotalApproved] = useState(0);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState(null);
  const [lastGlobalUser, setLastGlobalUser] = useState(null);
  const [lastGlobalUserAvatar, setLastGlobalUserAvatar] = useState(null);
  
  // 🛡️ HUD specific states (Prevents HUD from breaking on page 2+)
  const [latestUserTx, setLatestUserTx] = useState(null); 
  const [loading, setLoading] = useState(true);

  // 📄 Pagination States
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 10;

  // 1. Fetch data when page changes or user loads
  useEffect(() => {
    fetchFinancialData();
  }, [page, currentUser?.id]);

  // 2. Setup Real-Time Listener (Runs exactly once)
  useEffect(() => {
    const walletChannel = supabase
      .channel('wallet-global-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' }, 
        () => {
          console.log('Live Financial Update Detected! Syncing HUD...');
          fetchFinancialData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
    };
  }, [currentUser?.id]);

  const fetchFinancialData = async () => {
    if (!currentUser?.id) return;
    setLoading(true);

    try {
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // 🧠 ENTERPRISE SPLIT-FETCH: HUD stats vs. Paginated Table
      const [
        treasuryLogsResult, 
        profilesResult, 
        latestGlobalRes, 
        latestPersonalRes, 
        paginatedPersonalRes
      ] = await Promise.all([
        supabase.from('audit_logs').select('*').eq('action_taken', 'ADMIN_TREASURY_ADJUST'),
        supabase.from('profiles').select('id, full_name, avatar_url, total_amount_claimed'),
        supabase.from('member_wallet_logs').select('*').order('action_timestamp', { ascending: false }).limit(1), // Latest Global
        supabase.from('member_wallet_logs').select('*').eq('member_id', currentUser.id).order('action_timestamp', { ascending: false }).limit(1), // Latest Personal
        supabase.from('member_wallet_logs').select('*', { count: 'exact' }).eq('member_id', currentUser.id).order('action_timestamp', { ascending: false }).range(from, to) // Paginated History
      ]);

      const safeLogs = treasuryLogsResult.data || [];
      const safeProfiles = profilesResult.data || [];

      // ============================================
      // CARD 1: TOTAL ADDED COMPANY FUNDS
      // ============================================
      const chronologicalLogs = [...safeLogs].sort((a, b) => new Date(a.action_timestamp || 0) - new Date(b.action_timestamp || 0));
      let runningAddedFunds = 0;
      let lastLogMeta = { prev: 0, delta: 0, total: 0, timestamp: null };

      chronologicalLogs.forEach((log) => {
        if (log.is_active !== false) {
          const delta = Number(log.delta_amount || 0);
          if (!Number.isNaN(delta)) {
            const previousTotal = runningAddedFunds;
            runningAddedFunds += delta;
            lastLogMeta = { prev: previousTotal, delta: delta, total: runningAddedFunds, timestamp: log.action_timestamp ? new Date(log.action_timestamp).toLocaleString() : new Date().toLocaleString() };
          }
        }
      });
      setTotalAddedFunds(runningAddedFunds);
      setLastFundsLog(lastLogMeta);

      // ============================================
      // CARD 2: TOTAL ACCUMULATED CLAIMS (Global)
      // ============================================
      const globalClaimsSum = safeProfiles.reduce((sum, p) => sum + Number(p.total_amount_claimed || 0), 0);
      setCompanyTotalApproved(globalClaimsSum);

      if (latestGlobalRes.data && latestGlobalRes.data.length > 0) {
        const latestGlobalLog = latestGlobalRes.data[0];
        const globallyTaggedProf = safeProfiles.find(prof => prof.id === latestGlobalLog.member_id);
        setLastGlobalUpdate(new Date(latestGlobalLog.action_timestamp).toLocaleString());
        setLastGlobalUser(globallyTaggedProf?.full_name || 'System Member');
        setLastGlobalUserAvatar(globallyTaggedProf?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg');
      }

      // ============================================
      // USER HUD & PAGINATED TABLE DATA
      // ============================================
      setLatestUserTx(latestPersonalRes.data?.[0] || null);
      setPersonalLedger(paginatedPersonalRes.data || []);
      if (paginatedPersonalRes.count !== null) setTotalCount(paginatedPersonalRes.count);

    } catch (err) {
      console.error('Wallet fetch infrastructure failure:', err);
    } finally {
      setLoading(false);
    }
  };

  const remainingCompanyBudget = totalAddedFunds - companyTotalApproved;
  const userTotalApproved = latestUserTx ? Number(latestUserTx.new_amount) : 0;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      <div className="flex justify-between items-end border-b pb-3 border-slate-200">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">🏦 Organization Financial Treasury</h2>
        {loading && <span className="text-xs font-bold text-blue-500 animate-pulse bg-blue-50 px-3 py-1 rounded-full">Syncing...</span>}
      </div>
      
      {/* HUD DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Company Funds</span>
            <h2 className="text-2xl font-black text-slate-900 mt-1">${totalAddedFunds.toLocaleString()}</h2>
            
            {lastFundsLog.timestamp ? (
              <div className="mt-3 space-y-0.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-[10px] text-slate-600 leading-normal">
                <p>⏮️ LAST TOTAL: ${lastFundsLog.prev.toLocaleString()}</p>
                <p>➕ ADDED VALUE: +${lastFundsLog.delta.toLocaleString()}</p>
                <p className="font-bold text-slate-900">🟰 COMPILED: ${lastFundsLog.total.toLocaleString()}</p>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 mt-3 italic">No capital logs compiled.</p>
            )}
          </div>
          <div className="text-[10px] text-slate-400 border-t border-dashed border-slate-100 pt-2.5 mt-3 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            ⏱️ Last Log: {lastFundsLog.timestamp || 'N/A'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Total Accumulated Claims</span>
            <h2 className="text-2xl font-black text-red-600 mt-1">-${companyTotalApproved.toLocaleString()}</h2>
            
            {lastGlobalUser ? (
              <div className="flex items-center space-x-2.5 bg-slate-50 border border-slate-100 rounded-lg p-2 mt-3">
                <img src={lastGlobalUserAvatar || 'https://api.dicebear.com/7.x/bottts/svg'} className="w-8 h-8 rounded-full object-cover border bg-white" alt="" />
                <div className="text-[10px] leading-tight text-slate-500 min-w-0">
                  <p className="font-bold text-slate-700 truncate">Last Claim By: {lastGlobalUser}</p>
                  <p className="text-[9px] text-slate-400 truncate mt-0.5">ID Match Active</p>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 mt-3 italic">No worker claims logged.</p>
            )}
          </div>
          <div className="text-[10px] text-slate-400 border-t border-dashed border-slate-100 pt-2.5 mt-3 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            ⏱️ Handled On: {lastGlobalUpdate || 'N/A'}
          </div>
        </div>

        <div className={`rounded-xl p-5 shadow-md flex flex-col justify-between transition-colors border ${remainingCompanyBudget >= 0 ? 'bg-emerald-900 text-emerald-100 border-emerald-950' : 'bg-rose-950 text-rose-100 border-rose-950'}`}>
          <div>
            <span className={`text-xs font-bold uppercase tracking-widest ${remainingCompanyBudget >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              Remaining Company Amount
            </span>
            <h2 className="text-2xl font-black text-white mt-1">
              {remainingCompanyBudget < 0 ? '-' : ''}${Math.abs(remainingCompanyBudget).toLocaleString()}
            </h2>
            <div className={`text-[10px] font-bold px-2.5 py-1 rounded-md inline-block mt-3 border font-mono ${remainingCompanyBudget >= 0 ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/20' : 'bg-rose-950/40 text-rose-300 border-rose-500/20'}`}>
              {remainingCompanyBudget >= 0 ? '🟢 VAULT STATUS: SURPLUS' : '🔴 VAULT STATUS: DEFICIT'}
            </div>
          </div>
          <div className={`text-[10px] border-t border-dashed pt-2.5 mt-3 font-medium ${remainingCompanyBudget >= 0 ? 'text-emerald-300 border-emerald-800' : 'text-rose-300 border-rose-900'}`}>
            ⏱️ Sync Time: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        <div className="bg-blue-600 text-white rounded-xl p-5 shadow-md flex justify-between items-center">
          <div>
            <h4 className="font-bold text-blue-100 text-sm">👤 Your Personal Ledger Balance</h4>
            <span className="text-xs text-blue-200">Total lifetime verifier payouts</span>
          </div>
          <h2 className="text-3xl font-black">${userTotalApproved.toLocaleString()}</h2>
        </div>
        <div className="bg-purple-900 text-purple-100 rounded-xl p-5 shadow-md flex justify-between items-center">
          <div>
            <h4 className="font-bold text-purple-200 text-sm">⏱️ Your Last Transaction</h4>
            <span className="text-xs text-purple-300">{latestUserTx ? `Executed mathematically via database` : 'No operations recorded'}</span>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-black text-white">{latestUserTx ? `+$${Number(latestUserTx.delta_amount).toLocaleString()}` : '$0'}</h2>
            <span className="text-[10px] text-purple-300">Remaining Admin Pool: ${remainingCompanyBudget.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-6">
        <div className="px-5 py-4 border-b bg-slate-50 font-bold text-slate-800 text-sm tracking-wide">📋 Personal Mathematical Ledger Log</div>
        
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b">
                <th className="p-3">Execution Date</th>
                <th className="p-3">Reference Note</th>
                <th className="p-3 text-right">Previous Bal.</th>
                <th className="p-3 text-right">Claim Added</th>
                <th className="p-3 text-right font-black text-slate-800">New Ledger Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {personalLedger.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-slate-400 italic font-sans">No isolated ledger records active.</td></tr>
              ) : personalLedger.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 text-slate-400">{new Date(log.action_timestamp).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short'})}</td>
                  <td className="p-3 text-slate-600 font-sans font-medium">{log.notes}</td>
                  <td className="p-3 text-slate-500 text-right">${Number(log.prev_amount).toLocaleString()}</td>
                  <td className="p-3 text-green-600 font-bold text-right">+${(Number(log.delta_amount)).toLocaleString()}</td>
                  <td className="p-3 text-slate-900 font-black text-right bg-slate-50/30">${Number(log.new_amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 📄 PAGINATION CONTROLS */}
        {totalCount > 0 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{(page - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-900">{Math.min(page * ITEMS_PER_PAGE, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> entries
            </p>
            
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all">← Prev</button>
              <div className="flex items-center px-3 font-mono text-xs font-bold text-slate-400 bg-slate-100 rounded-lg">{page} / {totalPages}</div>
              <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all">Next →</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}