import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function MasterFinancialLedger() {
  const [globalWalletLogs, setGlobalWalletLogs] = useState([]);
  const [companyTreasuryLogs, setCompanyTreasuryLogs] = useState([]);
  const [liveVaultBalance, setLiveVaultBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLedgers();
  }, []);

  const fetchLedgers = async () => {
    setLoading(true);
    try {
      const [vaultRes, auditRes, walletRes, profilesRes] = await Promise.all([
        supabase.from('company_treasury').select('*').eq('id', 1).single(),
        supabase.from('audit_logs').select('*').eq('action_taken', 'ADMIN_TREASURY_ADJUST').order('action_timestamp', { ascending: false }),
        supabase.from('member_wallet_logs').select('*').order('action_timestamp', { ascending: false }),
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
    } catch (err) {
      console.error("Ledger fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="animate-pulse text-slate-500">Syncing Master Financial Ledgers...</div>;

  return (
    <div className="space-y-6">
      {/* SECTION 1: MASTER TREASURY */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl shadow-sm p-6">
        <div className="flex justify-between items-end border-b border-slate-700 pb-4 mb-4">
          <div>
            <h2 className="text-xl font-black text-blue-400">🏦 Corporate Treasury Vault</h2>
            <p className="text-sm text-slate-400">Total company funds added by Admins.</p>
          </div>
          <div className="text-right">
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
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h2 className="text-xl font-black text-slate-900 mb-1">💸 Global Member Wallet Logs</h2>
        <p className="text-sm text-slate-500 mb-4 border-b pb-4">A complete, real-time feed of every claim processed into personal employee ledgers.</p>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                <th className="p-3">Date</th>
                <th className="p-3">Member Name</th>
                <th className="p-3">Ledger Note</th>
                <th className="p-3 text-right">Adjustment</th>
                <th className="p-3 text-right">New Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {globalWalletLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 text-slate-400 font-mono text-[10px] whitespace-nowrap">{new Date(log.action_timestamp).toLocaleString()}</td>
                  <td className="p-3 font-bold text-slate-800">{log.memberName}</td>
                  <td className="p-3 text-xs text-slate-600 font-medium">{log.notes}</td>
                  <td className={`p-3 font-bold font-mono text-right ${log.delta_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {log.delta_amount >= 0 ? '+' : ''}${Number(log.delta_amount).toLocaleString()}
                  </td>
                  <td className="p-3 font-black text-slate-900 font-mono text-right bg-slate-50/30">
                    ${Number(log.new_amount).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}