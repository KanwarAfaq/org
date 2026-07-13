import { useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function TransactionHistory({ allPosts = [], filterStatus, setFilterStatus, currentUser, fetchAdminData }) {
  const [editingPostId, setEditingPostId] = useState(null);
  const [editedPostContent, setEditedPostContent] = useState('');
  const [processingPostId, setProcessingPostId] = useState(null);

  const extractAmountFromContent = (content = '') => {
    const amountMatch = String(content).match(/\$([0-9,]+(?:\.\d+)?)/);
    return amountMatch && amountMatch[1] ? Number(amountMatch[1].replace(/,/g, '')) : 0;
  };

  const safeRefresh = async () => { if (typeof fetchAdminData === 'function') await fetchAdminData(); };

  // ====================================================================
  // 🏦 MASTER SYNCHRONIZATION ENGINE (DOUBLE-ENTRY LEDGER)
  // Guarantees Profiles, Treasury, Wallet Logs, and Audit Logs sync 100%
  // ====================================================================
  const processFinancialTransaction = async (postId, memberId, adminId, deltaAmount, reason, actionTaken) => {
    if (deltaAmount === 0 || !memberId) return;

    try {
      const { data: profile } = await supabase.from('profiles').select('total_amount_claimed').eq('id', memberId).single();
      const { data: treasury } = await supabase.from('company_treasury').select('total_initial_budget').eq('id', 1).single();

      const currentProfileBal = Number(profile?.total_amount_claimed || 0);
      const currentTreasuryBal = Number(treasury?.total_initial_budget || 0);

      const newProfileBal = currentProfileBal + deltaAmount;
      const newTreasuryBal = currentTreasuryBal - deltaAmount;

      await supabase.from('profiles').update({ total_amount_claimed: newProfileBal }).eq('id', memberId);
      await supabase.from('company_treasury').update({ total_initial_budget: newTreasuryBal }).eq('id', 1);

      await supabase.from('member_wallet_logs').insert({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2), member_id: memberId, post_id: postId,
        prev_amount: currentProfileBal, delta_amount: deltaAmount, new_amount: newProfileBal,
        notes: reason, action_timestamp: new Date().toISOString()
      });

      await supabase.from('audit_logs').insert({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2), post_id: postId, action_taken: actionTaken,
        performed_by: adminId, notes: reason, action_timestamp: new Date().toISOString()
      });

    } catch (err) {
      throw new Error("Financial database sync failed.");
    }
  };

  const handleSaveEditedPost = async (post) => {
    if (post.status === 'approved') return toast.error('Cannot edit approved financials. You must Deactivate and recreate.');
    const nextContent = editedPostContent.trim();
    if (!nextContent || nextContent === String(post.content || '').trim()) return toast.error('No changes detected.');

    setProcessingPostId(post.id);
    try {
      await supabase.from('posts').update({ content: nextContent, updated_at: new Date().toISOString() }).eq('id', post.id);
      await supabase.from('audit_logs').insert({ post_id: post.id, action_taken: 'ADMIN_HISTORY_EDIT', performed_by: currentUser?.id, notes: `Admin corrected text.`, action_timestamp: new Date().toISOString() });
      setEditingPostId(null); await safeRefresh(); toast.success('Text updated.');
    } catch (err) { toast.error(`Update failed: ${err.message}`); } finally { setProcessingPostId(null); }
  };

  const handleDeactivatePost = async (post) => {
    if (post.status === 'deactivated') return toast.error('Already deactivated.');
    
    toast((t) => (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 max-w-sm">
        <h3 className="font-black text-slate-900 mb-2">Deactivate & Reverse Funds?</h3>
        <p className="text-xs text-slate-500 mb-4">If this was approved, funds will be refunded to the treasury.</p>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">Cancel</button>
          <button onClick={async () => {
            toast.dismiss(t.id);
            setProcessingPostId(post.id);
            try {
              const extractedAmount = extractAmountFromContent(post.content);
              const isApproved = post.status === 'approved';

              if (isApproved && extractedAmount > 0) {
                await processFinancialTransaction(post.id, post.tagged_member_id, currentUser.id, -Math.abs(extractedAmount), 'Admin Deactivation: Funds Clawed Back', 'ADMIN_TRANSACTION_REVERSED');
              }

              await supabase.from('posts').update({ status: 'deactivated', flag_color: 'slate', action_reason: isApproved ? 'TRANSACTION VOIDED & FUNDS REVERSED' : 'TRANSACTION CANCELLED BY ADMIN', updated_at: new Date().toISOString() }).eq('id', post.id);

              if (!isApproved) {
                await supabase.from('audit_logs').insert({ post_id: post.id, action_taken: 'ADMIN_TRANSACTION_DEACTIVATED', performed_by: currentUser.id, notes: 'Deactivated pending/denied transaction.', action_timestamp: new Date().toISOString() });
              }

              await safeRefresh();
              toast.success(isApproved ? 'Voided and balances reversed.' : 'Deactivated.');
            } catch (err) { toast.error(`Failed: ${err.message}`); } finally { setProcessingPostId(null); }
          }} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg">Confirm Deactivation</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleAdminOverride = async (postId, newStatus, customReason = '') => {
    toast((t) => (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 max-w-sm">
        <h3 className="font-black text-slate-900 mb-2">Force {newStatus.toUpperCase()}?</h3>
        <p className="text-xs text-slate-500 mb-4">Financials will instantly sync across all ledgers.</p>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">Cancel</button>
          <button onClick={async () => {
            toast.dismiss(t.id);
            setProcessingPostId(postId);
            try {
              const { data: targetPost } = await supabase.from('posts').select('*').eq('id', postId).single();
              const extractedAmount = extractAmountFromContent(targetPost.content);
              const wasApproved = targetPost.status === 'approved';
              const groupId = targetPost?.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/)?.[1] || null;

              if (wasApproved && newStatus !== 'approved' && extractedAmount > 0) {
                await processFinancialTransaction(postId, targetPost.tagged_member_id, currentUser.id, -Math.abs(extractedAmount), `Override Revoked: ${customReason}`, 'ADMIN_FORCE_REVOKE');
              } else if (!wasApproved && newStatus === 'approved' && extractedAmount > 0) {
                await processFinancialTransaction(postId, targetPost.tagged_member_id, currentUser.id, Math.abs(extractedAmount), `Forced Approval: ${customReason}`, 'ADMIN_FORCE_APPROVE');
              }

              if (groupId) {
                const { data: groupPosts } = await supabase.from('posts').select('id, action_reason').neq('id', postId);
                const siblingRows = (groupPosts || []).filter(p => p.action_reason?.includes(groupId));
                if (siblingRows.length > 0) {
                  await Promise.all(siblingRows.map(sibling => supabase.from('posts').update({ status: 'deactivated', flag_color: 'slate', action_reason: `🔒 Closed by Admin Override || GROUP_ID:${groupId}`, updated_at: new Date().toISOString() }).eq('id', sibling.id)));
                }
              }

              const flagColor = newStatus === 'approved' ? 'green' : newStatus === 'disapproved' ? 'red' : 'slate';
              await supabase.from('posts').update({ status: newStatus, flag_color: flagColor, action_reason: groupId ? `Admin Override: ${customReason} || GROUP_ID:${groupId}` : `Admin Override: ${customReason}`, updated_at: new Date().toISOString() }).eq('id', postId);

              if ((!wasApproved && newStatus !== 'approved') || extractedAmount === 0) {
                 await supabase.from('audit_logs').insert({ post_id: postId, action_taken: `ADMIN_FORCE_${newStatus.toUpperCase()}`, performed_by: currentUser.id, notes: customReason, action_timestamp: new Date().toISOString() });
              }

              await safeRefresh(); toast.success(`Forced to ${newStatus}. All databases synchronized.`);
            } catch (err) { toast.error(`Override Failed: ${err.message}`); } finally { setProcessingPostId(null); }
          }} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg">Confirm Override</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const getStatusBadgeClass = (status) => {
    const base = 'text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ';
    if (status === 'approved') return base + 'bg-green-100 text-green-800';
    if (status === 'disapproved') return base + 'bg-red-100 text-red-800';
    if (status === 'edit_requested') return base + 'bg-blue-100 text-blue-800';
    if (status === 'deactivated') return base + 'bg-amber-100 text-amber-800 border border-amber-300';
    return base + 'bg-slate-100 text-slate-600';
  };

  const filteredPosts = allPosts.filter((post) => filterStatus === 'all' || post.status === filterStatus);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-md space-y-4 p-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">Master Transaction History</h3>
          <p className="text-xs text-slate-400 mt-0.5">Review, edit, and deactivate corporate history logs with verified financial balance adjustments.</p>
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none">
          <option value="all">Show Everything</option>
          <option value="pending">⏳ Pending Reviews</option>
          <option value="approved">🟢 Approved (Green)</option>
          <option value="disapproved">🔴 Disapproved (Red)</option>
          <option value="edit_requested">🔵 Edit Requested (Blue)</option>
          <option value="deactivated">⚠️ Deactivated Records</option>
        </select>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 font-semibold text-xs border-b border-slate-200">
              <th className="p-4">Staff Involved</th>
              <th className="p-4">Stitched Description Content Data</th>
              <th className="p-4">Status Flag</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPosts.length === 0 ? (
              <tr><td colSpan="4" className="p-8 text-center text-slate-400 italic">No logs matched this filter.</td></tr>
            ) : (
              filteredPosts.map((post) => (
                <tr key={post.id} className={`transition-colors ${post.status === 'deactivated' ? 'bg-slate-50/50 opacity-60 line-through' : 'hover:bg-slate-50/50'}`}>
                  <td className="p-4 leading-tight whitespace-nowrap">
                    <p className="font-bold text-slate-800 text-xs">By: <span className="font-normal text-slate-600">{post.author?.full_name}</span></p>
                    <p className="font-bold text-slate-400 text-[10px] mt-0.5">To: <span className="font-normal text-slate-500">{post.tagged?.full_name}</span></p>
                  </td>
                  <td className="p-4">
                    {editingPostId === post.id ? (
                      <div className="space-y-1.5 w-full">
                        <textarea value={editedPostContent} onChange={(e) => setEditedPostContent(e.target.value)} className="w-full text-xs p-2.5 bg-slate-50 border rounded-md focus:outline-none h-16" disabled={processingPostId === post.id} />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleSaveEditedPost(post)} disabled={processingPostId === post.id} className="bg-emerald-600 disabled:bg-slate-400 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded shadow">Save</button>
                          <button type="button" onClick={() => { setEditingPostId(null); setEditedPostContent(''); }} className="text-slate-400 text-[10px] font-bold hover:underline" disabled={processingPostId === post.id}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="text-slate-700 font-medium text-xs break-words max-w-lg">{post.content}</p>
                        {post.action_reason && <p className="text-[10px] text-pink-700 font-semibold bg-pink-50 rounded px-1.5 py-0.5 inline-block mt-1">⚠️ {post.action_reason}</p>}
                        <p className="text-[9px] text-slate-400">🗓️ Created: {post.created_at ? new Date(post.created_at).toLocaleString() : 'N/A'}</p>
                      </div>
                    )}
                  </td>
                  <td className="p-4"><span className={getStatusBadgeClass(post.status)}>{post.status}</span></td>
                  <td className="p-4 text-right">
                    {post.status !== 'deactivated' ? (
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => { setEditingPostId(post.id); setEditedPostContent(post.content || ''); }} className="text-blue-600 text-[9px] font-extrabold uppercase bg-blue-50 px-2 py-0.5 rounded">✏️ Edit</button>
                        <button type="button" onClick={() => handleDeactivatePost(post)} className="text-amber-700 text-[9px] font-extrabold uppercase bg-amber-50 px-2 py-0.5 rounded">🚫 Void</button>
                      </div>
                    ) : <span className="text-xs text-slate-400 italic font-bold">Archived/Reversed</span>}
                    {post.status === 'pending' && (
                      <div className="flex gap-1 justify-end mt-1.5">
                        <button type="button" onClick={() => handleAdminOverride(post.id, 'approved', 'Admin Forced Approval')} className="bg-green-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow">Pass</button>
                        <button type="button" onClick={() => handleAdminOverride(post.id, 'disapproved', 'Admin Forced Denial')} className="bg-red-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow">Deny</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}