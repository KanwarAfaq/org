import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function MasterFinancialLedger() {
  const [globalWalletLogs, setGlobalWalletLogs] = useState([]);
  const [companyTreasuryLogs, setCompanyTreasuryLogs] = useState([]);
  const [liveVaultBalance, setLiveVaultBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // 📄 Pagination States for Global Wallets
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    fetchLedgers();
  }, [page]); // Fetches whenever page changes

  const fetchLedgers = async () => {
    setLoading(true);
    try {
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Master Fetch: Combines standard query with paginated query
      const [vaultRes, auditRes, walletRes, profilesRes] = await Promise.all([
        supabase.from('company_treasury').select('*').eq('id', 1).single(),
        supabase.from('audit_logs').select('*').eq('action_taken', 'ADMIN_TREASURY_ADJUST').order('action_timestamp', { ascending: false }),
        supabase.from('member_wallet_logs').select('*', { count: 'exact' }).order('action_timestamp', { ascending: false }).range(from, to), // Paginated!
        supabase.from('profiles').select('id, full_name')
      ]);

      setLiveVaultBalance(Number(vaultRes.data?.total_initial_budget || 0));
      setCompanyTreasuryLogs(auditRes.data || []);

      const profiles = profilesRes.data || [];
      const mappedWalletLogs = (walletRes.data || []).map(log => {
        const member = profiles.find(p => p.id === log.member_id);
        return { ...log, memberName: member ? member.full_name : 'Unknown Member' };
      });

      setGlobalWalletLogs(mappedWalletLogs);
      if (walletRes.count !== null) setTotalCount(walletRes.count);

    } catch (err) {
      console.error("Ledger fetch error:", err);
      toast.error('Failed to sync ledgers');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: MASTER TREASURY */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl shadow-sm p-6 relative">
        {loading && <span className="absolute top-6 right-6 text-xs font-bold text-blue-500 animate-pulse bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Syncing...</span>}
        
        <div className="flex justify-between items-end border-b border-slate-700 pb-4 mb-4">
          <div>
            <h2 className="text-xl font-black text-blue-400">🏦 Corporate Treasury Vault</h2>
            <p className="text-sm text-slate-400">Total company funds added by Admins.</p>
          </div>
          <div className="text-right mt-4 sm:mt-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Live Master Balance</span>
            <span className="text-3xl font-black text-white">${liveVaultBalance.toLocaleString()}</span>
          </div>
        </div>
        
        <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {companyTreasuryLogs.map(log => (
            <div key={log.id} className="flex justify-between items-center py-2 border-b border-slate-800/50 text-sm">
              <div>
                <span className={`font-bold font-mono ${log.delta_amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {log.delta_amount >= 0 ? '+' : ''}${Number(log.delta_amount).toLocaleString()}
                </span>
                <span className="ml-3 text-slate-300 text-xs">"{log.notes}"</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">{new Date(log.action_timestamp).toLocaleString()}</span>
                <span className="text-xs font-mono text-slate-400 block">Total: ${Number(log.new_amount).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: GLOBAL MEMBER WALLETS */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-black text-slate-900 mb-1">💸 Global Member Wallet Logs</h2>
          <p className="text-sm text-slate-500">A complete, real-time feed of every claim processed into personal employee ledgers.</p>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Member Name</th>
                <th className="p-4">Ledger Note</th>
                <th className="p-4 text-right">Adjustment</th>
                <th className="p-4 text-right">New Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {globalWalletLogs.length === 0 && !loading ? (
                 <tr><td colSpan="5" className="p-12 text-center text-slate-400 font-medium">Ledger is currently empty.</td></tr>
              ) : globalWalletLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-slate-400 font-mono text-[10px] whitespace-nowrap">{new Date(log.action_timestamp).toLocaleString()}</td>
                  <td className="p-4 font-bold text-slate-800">{log.memberName}</td>
                  <td className="p-4 text-xs text-slate-600 font-medium">{log.notes}</td>
                  <td className={`p-4 font-bold font-mono text-right ${log.delta_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {log.delta_amount >= 0 ? '+' : ''}${Number(log.delta_amount).toLocaleString()}
                  </td>
                  <td className="p-4 font-black text-slate-900 font-mono text-right bg-slate-50/30">
                    ${Number(log.new_amount).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 📄 PAGINATION CONTROLS */}
        {totalCount > 0 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{(page - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-900">{Math.min(page * ITEMS_PER_PAGE, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> global records
            </p>
            
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all">← Previous</button>
              <div className="flex items-center px-4 font-mono text-xs font-bold text-slate-400 bg-white border border-slate-200 rounded-lg">{page} / {totalPages}</div>
              <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all">Next →</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}