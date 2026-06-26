import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function WalletProfile({ currentUser }) {
  const [approvedTransactions, setApprovedTransactions] = useState([]);
  const [treasury, setTreasury] = useState({ total_initial_budget: 0 });
  const [companyTotalApproved, setCompanyTotalApproved] = useState(0);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState(null);
  const [lastGlobalUser, setLastGlobalUser] = useState(null);
  const [lastGlobalUserAvatar, setLastGlobalUserAvatar] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinancialData();
  }, [currentUser]);

  const fetchFinancialData = async () => {
    setLoading(true);
    const { data: treasuryData } = await supabase.from('company_treasury').select('total_initial_budget').eq('id', 1).single();
    if (treasuryData) setTreasury(treasuryData);

    const { data: allApproved } = await supabase.from('posts').select(`content, created_at, tagged:profiles!posts_tagged_member_id_fkey(full_name, avatar_url)`).eq('status', 'approved').order('created_at', { ascending: false });

    let globalSum = 0;
    if (allApproved && allApproved.length > 0) {
      allApproved.forEach(p => {
        const match = p.content.match(/\$([0-9.]+)/);
        if (match) globalSum += parseFloat(match[1]);
      });
      const latestClaim = allApproved[0];
      setLastGlobalUpdate(new Date(latestClaim.created_at).toLocaleString());
      setLastGlobalUser(latestClaim.tagged?.full_name || 'System Member');
      setLastGlobalUserAvatar(latestClaim.tagged?.avatar_url || 'https://via.placeholder.com/150');
    }
    setCompanyTotalApproved(globalSum);

    const { data: myLedger } = await supabase.from('posts').select('*, author:profiles!posts_author_id_fkey(full_name)').eq('tagged_member_id', currentUser.id).eq('status', 'approved').order('created_at', { ascending: false });
    if (myLedger) setApprovedTransactions(myLedger);
    setLoading(false);
  };

  const companyInitial = Number(treasury?.total_initial_budget || 0);
  const remainingCompanyBudget = companyInitial - companyTotalApproved;
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
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Company Funds</span>
          <h2 className="text-2xl font-black text-slate-900 mt-1">${companyInitial.toLocaleString()}</h2>
          <p className="text-[10px] text-slate-400 mt-3 font-medium">📅 Allocation Vault Root Baseline</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Total Accumulated Claims</span>
            <h2 className="text-2xl font-black text-red-600 mt-1">-${companyTotalApproved.toLocaleString()}</h2>
          </div>
          {lastGlobalUser && (
            <div className="flex items-center space-x-2.5 pt-3 mt-2 border-t border-dashed border-slate-100">
              <img src={lastGlobalUserAvatar} className="w-7 h-7 rounded-full object-cover border" alt="" />
              <div className="text-[11px] leading-tight text-slate-500">
                <p className="font-bold text-slate-700">Claimed by: {lastGlobalUser}</p>
                <p className="mt-0.5">⏱️ {lastGlobalUpdate}</p>
              </div>
            </div>
          )}
        </div>
        <div className="bg-emerald-900 text-emerald-100 rounded-xl p-5 shadow-md">
          <span className="text-xs font-bold text-emerald-300 uppercase tracking-widest">Remaining Company Amount</span>
          <h2 className="text-2xl font-black text-white mt-1">${remainingCompanyBudget.toLocaleString()}</h2>
          <p className="text-[10px] text-emerald-300 font-medium mt-3">🔄 Real-time Balance: {new Date().toLocaleTimeString()}</p>
        </div>
      </div>

      {/* USER WALLET */}
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
            <span className="text-xs text-purple-300">{latestUserTx ? `Executed Ledger Timestamp` : 'No operations recorded'}</span>
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
                  <td className="p-3 font-bold text-slate-800">{post.author?.full_name}</td>
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