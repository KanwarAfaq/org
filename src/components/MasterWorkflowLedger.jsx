import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
export default function MasterWorkflowLedger({ currentUser }) {
  const [allWorkflows, setAllWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { fetchGlobalWorkflows(); }, []);

  const fetchGlobalWorkflows = async () => {
    setLoading(true);
    try {
      const [profilesRes, postsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name'),
        supabase.from('posts').select('*').order('created_at', { ascending: false })
      ]);
      const profiles = profilesRes.data || [];
      const mappedPosts = (postsRes.data || []).map(post => {
        const author = profiles.find(p => p.id === post.author_id);
        const tagged = profiles.find(p => p.id === post.tagged_member_id);
        return { ...post, authorName: author ? author.full_name : 'Unknown User', taggedName: tagged ? tagged.full_name : 'Unknown Verifier' };
      });
      setAllWorkflows(mappedPosts);
    } catch (err) { toast.error('Failed to sync workflows.'); } finally { setLoading(false); }
  };

  const handleAdminOverride = async (postId, actionType, currentStatus) => {
    // Elegant custom toast to grab the override reason without blocking the thread
    toast((t) => (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 w-80">
        <h3 className="font-black text-slate-900 mb-2 text-sm uppercase tracking-wider">Super Admin Override</h3>
        <p className="text-xs text-slate-500 mb-3">Force status to <span className="font-bold text-slate-800">{actionType.toUpperCase()}</span>.</p>
        <input type="text" id={`reason-${postId}`} placeholder="Reason for override..." className="w-full text-xs px-3 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 mb-3" />
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg text-xs">Cancel</button>
          <button onClick={async () => {
            const customReason = document.getElementById(`reason-${postId}`).value || 'Super Admin Override';
            toast.dismiss(t.id);
            
            try {
              const { data: targetPost } = await supabase.from('posts').select('*').eq('id', postId).single();
              const groupId = targetPost?.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/)?.[1] || null;
              const wasPreviouslyApproved = targetPost.status === 'approved';

              // 🔄 SUPER ADMIN CLAWBACK PROTOCOL (Double-Entry Sync)
              if (wasPreviouslyApproved && actionType !== 'approved') {
                const amountMatch = targetPost?.content.match(/\$([0-9.,]+)/);
                if (amountMatch && amountMatch[1]) {
                  const extractedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                  
                  // 1. Repair Profile
                  const { data: profile } = await supabase.from('profiles').select('total_amount_claimed').eq('id', targetPost.tagged_member_id).maybeSingle();
                  const newRepairedAmount = Number(profile?.total_amount_claimed || 0) - extractedAmount; 
                  await supabase.from('profiles').update({ total_amount_claimed: newRepairedAmount }).eq('id', targetPost.tagged_member_id);

                  // 2. Refund Treasury
                  const { data: treasury } = await supabase.from('company_treasury').select('total_initial_budget').eq('id', 1).maybeSingle();
                  const newTreasury = Number(treasury?.total_initial_budget || 0) + extractedAmount;
                  await supabase.from('company_treasury').update({ total_initial_budget: newTreasury }).eq('id', 1);

                  // 3. Write Ledger Log
                  await supabase.from('member_wallet_logs').insert({
                    id: uuidv4(), member_id: targetPost.tagged_member_id, post_id: postId,
                    prev_amount: profile?.total_amount_claimed || 0, delta_amount: -Math.abs(extractedAmount), new_amount: newRepairedAmount,
                    notes: `⚠️ Super Admin Reversal: ${customReason}`, action_timestamp: new Date().toISOString()
                  });
                }
              }

              const dbStatus = actionType === 'void' ? 'disapproved' : actionType;
              const flagColor = actionType === 'approved' ? 'green' : actionType === 'disapproved' ? 'red' : 'slate';

              if (groupId) {
                const { data: groupPosts } = await supabase.from('posts').select('id, action_reason').neq('id', postId);
                const siblingRows = (groupPosts || []).filter(p => p.action_reason?.includes(groupId));
                if (siblingRows.length > 0) {
                  await supabase.from('posts').update({ status: 'disapproved', flag_color: 'slate', action_reason: `🔒 Closed by Admin Override || GROUP_ID:${groupId}` }).in('id', siblingRows.map(s => s.id));
                }
              }

              await supabase.from('posts').update({ status: dbStatus, flag_color: flagColor, action_reason: groupId ? `Admin Override: ${customReason} || GROUP_ID:${groupId}` : `Admin Override: ${customReason}` }).eq('id', postId);

              await supabase.from('audit_logs').insert({
                id: uuidv4(), post_id: postId, action_taken: `ADMIN_FORCE_${actionType.toUpperCase()}`,
                performed_by: currentUser.id, notes: customReason, action_timestamp: new Date().toISOString()
              });

              toast.success('Admin override executed. All financials synced.');
              fetchGlobalWorkflows();
            } catch (err) { toast.error(`Override Failed: ${err.message}`); }
          }} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg text-xs">Execute Force</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const filteredWorkflows = allWorkflows.filter(p => statusFilter === 'all' || p.status === statusFilter);

  if (loading) return <div className="animate-pulse text-slate-500">Syncing Master Workflow Logs...</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">📋 Global Workflow Registry</h2>
          <p className="text-sm text-slate-500">Unrestricted view of all organization workflows.</p>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 border rounded-lg px-4 py-2 text-sm font-bold text-slate-700">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="disapproved">Denied / Voided</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
              <th className="p-3 rounded-tl-lg">Date</th>
              <th className="p-3">Author</th>
              <th className="p-3">Verifier</th>
              <th className="p-3">Request Content</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right rounded-tr-lg">Admin Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredWorkflows.map(post => (
              <tr key={post.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-3 text-slate-400 font-mono text-[10px] whitespace-nowrap">{new Date(post.created_at).toLocaleDateString()}</td>
                <td className="p-3 font-bold text-slate-700">{post.authorName}</td>
                <td className="p-3 font-medium text-slate-600">{post.taggedName}</td>
                <td className="p-3 text-xs">
                  <div className="font-semibold text-slate-800">{post.content.split(' || ')[0]}</div>
                  <div className="text-[10px] text-slate-500 truncate max-w-xs">{post.action_reason?.split(' || GROUP_ID')[0] || ''}</div>
                </td>
                <td className="p-3">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${post.flag_color === 'green' ? 'bg-green-100 text-green-800' : post.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : post.flag_color === 'slate' ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-800'}`}>
                    {post.flag_color === 'slate' ? 'VOIDED' : post.status}
                  </span>
                </td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  {post.status !== 'approved' && <button onClick={() => handleAdminOverride(post.id, 'approved', post.status)} className="text-[10px] font-black text-green-600 hover:underline uppercase">Force Approve</button>}
                  {post.status !== 'disapproved' && post.flag_color !== 'slate' && <button onClick={() => handleAdminOverride(post.id, 'disapproved', post.status)} className="text-[10px] font-black text-red-600 hover:underline uppercase">Force Deny</button>}
                  {post.flag_color !== 'slate' && <button onClick={() => handleAdminOverride(post.id, 'void', post.status)} className="text-[10px] font-black text-slate-400 hover:text-slate-600 hover:underline uppercase">Void</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}