import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function WalletProfile({ currentUser }) {
  const [personalLedger, setPersonalLedger] = useState([]);
  const [totalAddedFunds, setTotalAddedFunds] = useState(0);
  const [lastFundsLog, setLastFundsLog] = useState({ prev: 0, delta: 0, total: 0, timestamp: null });
  const [companyTotalApproved, setCompanyTotalApproved] = useState(0);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState(null);
  const [lastGlobalUser, setLastGlobalUser] = useState(null);
  const [lastGlobalUserAvatar, setLastGlobalUserAvatar] = useState(null);
  const [loading, setLoading] = useState(true);

 useEffect(() => {
    fetchFinancialData();

    // ⚡ REAL-TIME FINANCIAL LEDGER LISTENER
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
  }, [currentUser]);

  const fetchFinancialData = async () => {
    if (!currentUser?.id) return;
    setLoading(true);

    try {
      const [treasuryLogsResult, profilesResult, allWalletLogsResult] = await Promise.all([
        supabase.from('audit_logs').select('*').eq('action_taken', 'ADMIN_TREASURY_ADJUST'),
        supabase.from('profiles').select('id, full_name, avatar_url, total_amount_claimed'),
        // Read directly from the new mathematical ledger
        supabase.from('member_wallet_logs').select('*').order('action_timestamp', { ascending: false }) 
      ]);

      const safeLogs = treasuryLogsResult.data || [];
      const safeProfiles = profilesResult.data || [];
      const allWalletLogs = allWalletLogsResult.data || [];

      // CARD 1: TOTAL ADDED COMPANY FUNDS
      const chronologicalLogs = [...safeLogs].sort((a, b) => new Date(a.action_timestamp || 0) - new Date(b.action_timestamp || 0));
      let runningAddedFunds = 0;
      let lastLogMeta = { prev: 0, delta: 0, total: 0, timestamp: null };

      chronologicalLogs.forEach((log) => {
        if (log.is_active !== false) {
          const delta = Number(log.delta_amount || 0);
          if (!Number.isNaN(delta)) {
            const previousTotal = runningAddedFunds;
            runningAddedFunds += delta;
            lastLogMeta = {
              prev: previousTotal,
              delta: delta,
              total: runningAddedFunds,
              timestamp: log.action_timestamp ? new Date(log.action_timestamp).toLocaleString() : new Date().toLocaleString()
            };
          }
        }
      });
      setTotalAddedFunds(runningAddedFunds);
      setLastFundsLog(lastLogMeta);

      // CARD 2: TOTAL ACCUMULATED CLAIMS (Global)
      const globalClaimsSum = safeProfiles.reduce((sum, p) => sum + Number(p.total_amount_claimed || 0), 0);
      setCompanyTotalApproved(globalClaimsSum);

      if (allWalletLogs.length > 0) {
        const latestGlobalLog = allWalletLogs[0];
        const globallyTaggedProf = safeProfiles.find(prof => prof.id === latestGlobalLog.member_id);
        setLastGlobalUpdate(new Date(latestGlobalLog.action_timestamp).toLocaleString());
        setLastGlobalUser(globallyTaggedProf?.full_name || 'System Member');
        setLastGlobalUserAvatar(globallyTaggedProf?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg');
      }

      // PERSONAL WALLET LOGS MAP
      const myLogs = allWalletLogs.filter(log => log.member_id === currentUser.id);
      setPersonalLedger(myLogs);

    } catch (err) {
      console.error('Wallet fetch infrastructure failure:', err);
    } finally {
      setLoading(false);
    }
  };

  const remainingCompanyBudget = totalAddedFunds - companyTotalApproved;
  const userTotalApproved = personalLedger.length > 0 ? Number(personalLedger[0].new_amount) : 0;
  const latestUserTx = personalLedger[0];

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Syncing Isolated Wallet Ledgers...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h2 className="text-xl font-extrabold text-slate-900 tracking-tight border-b pb-3 border-slate-200">🏦 Organization Financial Treasury</h2>
      
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
    </div>
  );
}