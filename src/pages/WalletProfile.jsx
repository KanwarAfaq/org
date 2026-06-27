import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function WalletProfile({ currentUser }) {
  const [approvedTransactions, setApprovedTransactions] = useState([]);
  const [totalAddedFunds, setTotalAddedFunds] = useState(0);
  const [lastFundsLog, setLastFundsLog] = useState({ prev: 0, delta: 0, total: 0, timestamp: null });
  const [companyTotalApproved, setCompanyTotalApproved] = useState(0);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState(null);
  const [lastGlobalUser, setLastGlobalUser] = useState(null);
  const [lastGlobalUserAvatar, setLastGlobalUserAvatar] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinancialData();
  }, [currentUser]);

  const fetchFinancialData = async () => {
    if (!currentUser?.id) return;
    setLoading(true);

    try {
      // Fetch data streams flatly to avoid relation embedding errors
      const [treasuryLogsResult, allApprovedResult, profilesResult, myLedgerResult] = await Promise.all([
        supabase.from('audit_logs').select('*').eq('action_taken', 'ADMIN_TREASURY_ADJUST'),
        supabase.from('posts').select('*').eq('status', 'approved'),
        supabase.from('profiles').select('id, full_name, avatar_url'),
        supabase.from('posts').select('*').eq('tagged_member_id', currentUser.id).eq('status', 'approved')
      ]);

      const safeLogs = treasuryLogsResult.data || [];
      const allApproved = allApprovedResult.data || [];
      const safeProfiles = profilesResult.data || [];

      // ====================================================================
      // CARD 1 METRICS: TOTAL ADDED COMPANY FUNDS (Chronological Rolling Sum)
      // ====================================================================
      const chronologicalLogs = [...safeLogs].sort(
        (a, b) => new Date(a.action_timestamp || 0) - new Date(b.action_timestamp || 0)
      );

      let runningAddedFunds = 0;
      let lastLogMeta = { prev: 0, delta: 0, total: 0, timestamp: null };

      chronologicalLogs.forEach((log) => {
        const parts = (log.notes || '').split('||');
        if (parts.length >= 5) {
          const delta = Number(parts[1] || 0);
          const stateToken = parts[4] || 'LIVE';

          if (stateToken !== 'DEACTIVATED' && !Number.isNaN(delta)) {
            const previousTotal = runningAddedFunds;
            runningAddedFunds += delta;

            lastLogMeta = {
              prev: previousTotal,
              delta: delta,
              total: runningAddedFunds,
              timestamp: log.action_timestamp 
                ? new Date(log.action_timestamp).toLocaleString() 
                : new Date().toLocaleString()
            };
          }
        }
      });

      setTotalAddedFunds(runningAddedFunds);
      setLastFundsLog(lastLogMeta);

      // ====================================================================
      // CARD 2 METRICS: TOTAL ACCUMULATED CLAIMS WITH USER METADATA & DP
      // ====================================================================
      let globalClaimsSum = 0;
      const processedApproved = allApproved.map(p => {
        const match = p.content.match(/\$([0-9.]+)/);
        if (match) globalClaimsSum += parseFloat(match[1]);

        const tagProf = safeProfiles.find(prof => prof.id === p.tagged_member_id);
        return {
          ...p,
          tagged: tagProf ? { full_name: tagProf.full_name, avatar_url: tagProf.avatar_url } : null
        };
      }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setCompanyTotalApproved(globalClaimsSum);

      if (processedApproved.length > 0) {
        const latestClaim = processedApproved[0];
        setLastGlobalUpdate(new Date(latestClaim.created_at).toLocaleString());
        setLastGlobalUser(latestClaim.tagged?.full_name || 'System Member');
        setLastGlobalUserAvatar(latestClaim.tagged?.avatar_url || 'https://via.placeholder.com/150');
      } else {
        setLastGlobalUpdate(null);
        setLastGlobalUser(null);
        setLastGlobalUserAvatar(null);
      }

      // ====================================================================
      // WORKFLOW HISTORY LEDGER MAPPING
      // ====================================================================
      const myLedger = myLedgerResult.data || [];
      const processedMyLedger = myLedger.map(p => {
        const autProf = safeProfiles.find(prof => prof.id === p.author_id);
        return {
          ...p,
          author: autProf ? { full_name: autProf.full_name } : { full_name: 'Unknown Creator' }
        };
      }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setApprovedTransactions(processedMyLedger);

    } catch (err) {
      console.error('Wallet fetch infrastructure failure:', err);
    } finally {
      setLoading(false);
    }
  };

  // CARD 3 METRICS: REMAINING RUNWAY (Added Funds - Accumulated Claims)
  const remainingCompanyBudget = totalAddedFunds - companyTotalApproved;
  const userTotalApproved = approvedTransactions.reduce((acc, p) => {
    const match = p.content.match(/\$([0-9.]+)/);
    return acc + (match ? parseFloat(match[1]) : 0);
  }, 0);

  const latestUserTx = approvedTransactions[0];
  const latestUserTxAmount = latestUserTx ? (latestUserTx.content.match(/\$([0-9.]+)/)?.[1] || 0) : 0;

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Syncing Wallet Ledgers...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight border-b pb-3 border-slate-200">🏦 Organization Financial Treasury</h2>
      
      {/* HUD DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CARD 1: TOTAL COMPANY ADDED FUNDS */}
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

        {/* CARD 2: TOTAL ACCUMULATED CLAIMS */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Total Accumulated Claims</span>
            <h2 className="text-2xl font-black text-red-600 mt-1">-${companyTotalApproved.toLocaleString()}</h2>
            
            {lastGlobalUser ? (
              <div className="flex items-center space-x-2.5 bg-slate-50 border border-slate-100 rounded-lg p-2 mt-3">
                <img src={lastGlobalUserAvatar || 'https://via.placeholder.com/150'} className="w-8 h-8 rounded-full object-cover border bg-white" alt="" />
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

        {/* CARD 3: REMAINING COMPANY AMOUNT */}
        <div className={`rounded-xl p-5 shadow-md flex flex-col justify-between transition-colors border ${
          remainingCompanyBudget >= 0 
            ? 'bg-emerald-900 text-emerald-100 border-emerald-950' 
            : 'bg-rose-950 text-rose-100 border-rose-950'
        }`}>
          <div>
            <span className={`text-xs font-bold uppercase tracking-widest ${
              remainingCompanyBudget >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}>
              Remaining Company Amount
            </span>
            <h2 className="text-2xl font-black text-white mt-1">
              {remainingCompanyBudget < 0 ? '-' : ''}${Math.abs(remainingCompanyBudget).toLocaleString()}
            </h2>
            <div className={`text-[10px] font-bold px-2.5 py-1 rounded-md inline-block mt-3 border font-mono ${
              remainingCompanyBudget >= 0 
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/20' 
                : 'bg-rose-950/40 text-rose-300 border-rose-500/20'
            }`}>
              {remainingCompanyBudget >= 0 ? '🟢 VAULT STATUS: SURPLUS' : '🔴 VAULT STATUS: DEFICIT'}
            </div>
          </div>
          <div className={`text-[10px] border-t border-dashed pt-2.5 mt-3 font-medium ${
            remainingCompanyBudget >= 0 ? 'text-emerald-300 border-emerald-800' : 'text-rose-300 border-rose-900'
          }`}>
            ⏱️ Sync Time: {new Date().toLocaleTimeString()}
          </div>
        </div>

      </div>

      {/* USER WALLET OVERVIEWS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        <div className="bg-blue-600 text-white rounded-xl p-5 shadow-md flex justify-between items-center">
          <div>
            <h4 className="font-bold text-blue-100 text-sm">👤 Your Personal Wallet Balance</h4>
            <span className="text-xs text-blue-200">Combined workflow allocations</span>
          </div>
          <h2 className="text-3xl font-black">${userTotalApproved.toLocaleString()}</h2>
        </div>
        <div className="bg-purple-900 text-purple-100 rounded-xl p-5 shadow-md flex justify-between items-center">
          <div>
            <h4 className="font-bold text-purple-200 text-sm">⏱️ Your Last Transaction</h4>
            <span className="text-xs text-purple-300">{latestUserTx ? `Executed Ledger Active` : 'No operations recorded'}</span>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-black text-white">{latestUserTx ? `+$${parseFloat(latestUserTxAmount).toLocaleString()}` : '$0'}</h2>
            <span className="text-[10px] text-purple-300">Remaining Pool: ${remainingCompanyBudget.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* HISTORY TABLE */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-6">
        <div className="px-5 py-4 border-b bg-slate-50 font-bold text-slate-800 text-sm tracking-wide">📋 Personal Itemized Transaction Log</div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-500 font-semibold text-xs border-b">
              <th className="p-3">Request Creator</th>
              <th className="p-3">Operational Allocation Description</th>
              <th className="p-3">Claim Value</th>
              <th className="p-3">Execution Date & Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {approvedTransactions.length === 0 ? (
              <tr><td colSpan="4" className="p-8 text-center text-slate-400 italic">No transaction records active.</td></tr>
            ) : approvedTransactions.map(post => {
              const match = post.content.match(/\$([0-9.]+)/);
              return (
                <tr key={post.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold text-slate-800">{post.author?.full_name || 'System User'}</td>
                  <td className="p-3 text-slate-600">{post.content.split(' - Amount:')[0]}</td>
                  <td className="p-3 text-green-600 font-bold">${parseFloat(match ? match[1] : 0).toLocaleString()}</td>
                  <td className="p-3 text-slate-400 text-xs">{new Date(post.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}