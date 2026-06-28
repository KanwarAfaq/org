import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function TransactionHistory({
  allPosts = [],
  filterStatus,
  setFilterStatus,
  currentUser,
  fetchAdminData,
  allProfiles = [],
}) {
  const [editingPostId, setEditingPostId] = useState(null);
  const [editedPostContent, setEditedPostContent] = useState('');
  const [processingPostId, setProcessingPostId] = useState(null);

  const extractAmountFromContent = (content = '') => {
    const amountMatch = String(content).match(/\$([0-9,]+(?:\.\d+)?)/);
    return amountMatch && amountMatch[1] ? Number(amountMatch[1].replace(/,/g, '')) : 0;
  };

  const safeRefresh = async () => {
    if (typeof fetchAdminData === 'function') {
      await fetchAdminData();
    }
  };

  const writeAuditLog = async (payload) => {
    const { error } = await supabase.from('audit_logs').insert(payload);
    if (error) {
      console.warn('Audit log insert failed:', error.message);
    }
  };

  const updateProfileBalance = async (profileId, nextBalance) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ total_amount_claimed: Math.max(0, Number(nextBalance || 0)) })
      .eq('id', profileId)
      .select('id, total_amount_claimed')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error('Profile balance was not updated. Check profile id and Supabase RLS policy.');
    }

    return data;
  };

  const updateCompanyTreasury = async (nextBudget) => {
    const { data, error } = await supabase
      .from('company_treasury')
      .update({ total_initial_budget: Number(nextBudget || 0) })
      .eq('id', 1)
      .select('id, total_initial_budget')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error('Company treasury row was not updated. Check id=1 and Supabase RLS policy.');
    }

    return data;
  };

  const handleSaveEditedPost = async (post) => {
    const nextContent = editedPostContent.trim();
    const originalContent = String(post.content || '').trim();

    if (!nextContent) {
      alert('Content cannot be left blank.');
      return;
    }

    if (nextContent === originalContent) {
      alert('No changes detected. Please edit the content before saving.');
      return;
    }

    if (processingPostId) return;
    setProcessingPostId(post.id);

    try {
      const { data, error } = await supabase
        .from('posts')
        .update({
          content: nextContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)
        .select('id, content, updated_at')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error('No post row was updated. Check post id and Supabase RLS policy.');
      }

      await writeAuditLog({
        post_id: post.id,
        action_taken: 'ADMIN_HISTORY_EDIT',
        performed_by: currentUser?.id || null,
        notes: `Admin manually modified workflow post data. Old content: "${originalContent}" || New content: "${nextContent}"`,
      });

      setEditingPostId(null);
      setEditedPostContent('');
      await safeRefresh();

      alert('Transaction entry content updated successfully.');
    } catch (err) {
      console.error('Save edited post error:', err);
      alert(`Update failed: ${err.message}`);
    } finally {
      setProcessingPostId(null);
    }
  };

  const reverseApprovedAmount = async (post, extractedAmount) => {
    if (!post.tagged_member_id || extractedAmount <= 0) return;

    const targetProfile = allProfiles.find((p) => p.id === post.tagged_member_id);
    if (!targetProfile) {
      throw new Error('Cannot reverse funds because the tagged staff profile was not found.');
    }

    const currentUserClaimed = Number(targetProfile.total_amount_claimed || 0);
    await updateProfileBalance(post.tagged_member_id, currentUserClaimed - extractedAmount);

    const { data: treasuryData, error: treasuryReadError } = await supabase
      .from('company_treasury')
      .select('id, total_initial_budget')
      .eq('id', 1)
      .maybeSingle();

    if (treasuryReadError) throw treasuryReadError;

    if (treasuryData) {
      const currentTreasuryBudget = Number(treasuryData.total_initial_budget || 0);
      await updateCompanyTreasury(currentTreasuryBudget + extractedAmount);
    }
  };

  const applyApprovedAmount = async (post, extractedAmount) => {
    if (!post.tagged_member_id || extractedAmount <= 0) return;

    const targetProfile = allProfiles.find((p) => p.id === post.tagged_member_id);
    if (!targetProfile) {
      throw new Error('Cannot apply funds because the tagged staff profile was not found.');
    }

    const currentUserClaimed = Number(targetProfile.total_amount_claimed || 0);
    await updateProfileBalance(post.tagged_member_id, currentUserClaimed + extractedAmount);

    const { data: treasuryData, error: treasuryReadError } = await supabase
      .from('company_treasury')
      .select('id, total_initial_budget')
      .eq('id', 1)
      .maybeSingle();

    if (treasuryReadError) throw treasuryReadError;

    if (treasuryData) {
      const currentTreasuryBudget = Number(treasuryData.total_initial_budget || 0);
      await updateCompanyTreasury(currentTreasuryBudget - extractedAmount);
    }
  };

  const handleDeactivatePost = async (post) => {
    if (post.status === 'deactivated') {
      alert('This transaction is already deactivated.');
      return;
    }

    const confirmAction = window.confirm(
      'Deactivate this transaction? If this transaction is approved, this will reverse the amount from the user balance and refund the company main treasury.'
    );

    if (!confirmAction) return;

    if (processingPostId) return;
    setProcessingPostId(post.id);

    try {
      const extractedAmount = extractAmountFromContent(post.content);

      if (extractedAmount > 0 && post.status === 'approved') {
        await reverseApprovedAmount(post, extractedAmount);
      }

      const { data, error } = await supabase
        .from('posts')
        .update({
          status: 'deactivated',
          action_reason:
            post.status === 'approved'
              ? 'TRANSACTION DEACTIVATED & BALANCES REVERSED BY ADMIN'
              : 'TRANSACTION DEACTIVATED BY ADMIN',
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)
        .select('id, status, action_reason, updated_at')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error('No post row was updated. Check post id and Supabase RLS policy.');
      }

      await writeAuditLog({
        post_id: post.id,
        action_taken: 'ADMIN_TRANSACTION_DEACTIVATED',
        performed_by: currentUser?.id || null,
        notes:
          post.status === 'approved'
            ? `Deactivated approved transaction $${extractedAmount}. Funds returned to main corporate accounts.`
            : `Deactivated non-approved transaction. No approved funds were reversed.`,
      });

      await safeRefresh();

      alert('Transaction deactivated successfully.');
    } catch (err) {
      console.error('Deactivate post error:', err);
      alert(`Deactivation failed: ${err.message}`);
    } finally {
      setProcessingPostId(null);
    }
  };

 const handleAdminOverride = async (postId, newStatus, customReason = '') => {
    if (!window.confirm(`Are you sure you want to force change this to ${newStatus.toUpperCase()}?`)) return;

    try {
      // 1. Fetch the exact current state of the post
      const { data: targetPost, error: fetchError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (fetchError) throw fetchError;

      const groupMatch = targetPost?.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/);
      const groupId = groupMatch ? groupMatch[1] : null;
      const wasPreviouslyApproved = targetPost.status === 'approved';

      // ====================================================================
      // 🔄 FINANCIAL CLAWBACK PROTOCOL (If Admin revokes an approval)
      // ====================================================================
      if (wasPreviouslyApproved && newStatus !== 'approved') {
        const amountMatch = targetPost?.content.match(/\$([0-9.,]+)/);
        
        if (amountMatch && amountMatch[1]) {
          const extractedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
          
          // Fetch Verifier's current profile balance
          const { data: profile } = await supabase
            .from('profiles')
            .select('total_amount_claimed')
            .eq('id', targetPost.tagged_member_id)
            .maybeSingle();

          const prevAmount = Number(profile?.total_amount_claimed || 0);
          const newRepairedAmount = prevAmount - extractedAmount; // Deduct the money!

          // Update Profile
          await supabase.from('profiles').update({ 
            total_amount_claimed: newRepairedAmount 
          }).eq('id', targetPost.tagged_member_id);

          // Insert Negative Ledger Record
          await supabase.from('member_wallet_logs').insert({
            id: crypto.randomUUID(),
            member_id: targetPost.tagged_member_id,
            post_id: postId,
            prev_amount: prevAmount,
            delta_amount: -Math.abs(extractedAmount), // Negative delta
            new_amount: newRepairedAmount,
            notes: `⚠️ Admin Reversal: ${customReason || 'Approval Revoked'}`,
            action_timestamp: new Date().toISOString()
          });
        }
      }

      // ====================================================================
      // 🚫 GROUP VOIDING PROTOCOL (Kill C's row permanently)
      // ====================================================================
      if (groupId) {
        const { data: groupPosts } = await supabase.from('posts').select('id, action_reason').neq('id', postId);
        const siblingRows = (groupPosts || []).filter(p => p.action_reason?.includes(groupId));

        if (siblingRows.length > 0) {
          await Promise.all(siblingRows.map(sibling => supabase.from('posts').update({
            status: 'deactivated',
            flag_color: 'slate',
            action_reason: `🔒 Workflow permanently closed by Admin Override || GROUP_ID:${groupId}`,
            updated_at: new Date().toISOString()
          }).eq('id', sibling.id)));
        }
      }

      // Finally, update the main target post to the new Admin status
      const flagColor = newStatus === 'approved' ? 'green' : newStatus === 'disapproved' ? 'red' : 'slate';
      const finalActionReason = groupId ? `Admin Override: ${customReason} || GROUP_ID:${groupId}` : `Admin Override: ${customReason}`;

      await supabase.from('posts').update({ 
        status: newStatus, 
        flag_color: flagColor, 
        action_reason: finalActionReason, 
        updated_at: new Date().toISOString() 
      }).eq('id', postId);

      // Log the Admin's action
      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        post_id: postId,
        action_taken: `ADMIN_FORCE_${newStatus.toUpperCase()}`,
        performed_by: currentUser.id,
        notes: customReason || `Admin forced status change.`,
        action_timestamp: new Date().toISOString()
      });

      alert('Admin override successful. Financials and sibling rows adjusted.');
      
      // Call the prop function to refresh the Admin Panel UI
      if (typeof fetchAdminData === 'function') fetchAdminData();

    } catch (err) {
      console.error(err);
      alert(`Admin Override Failed: ${err.message}`);
    }
  };

  const getStatusBadgeClass = (status) => {
    const base = 'text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ';
    if (status === 'approved') return base + 'bg-green-100 text-green-800';
    if (status === 'disapproved') return base + 'bg-red-100 text-red-800';
    if (status === 'edit_requested') return base + 'bg-blue-100 text-blue-800';
    if (status === 'deactivated') return base + 'bg-amber-100 text-amber-800 border border-amber-300';
    return base + 'bg-slate-100 text-slate-600';
  };

  const filteredPosts = allPosts.filter((post) => {
    if (filterStatus === 'all') return true;
    return post.status === filterStatus;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-md space-y-4 p-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">
            Master Transaction History
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Review, edit, and deactivate corporate history logs with verified financial balance adjustments.
          </p>
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none"
        >
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
              <tr>
                <td colSpan="4" className="p-8 text-center text-slate-400 italic">
                  No logs matched this filter.
                </td>
              </tr>
            ) : (
              filteredPosts.map((post) => (
                <tr
                  key={post.id}
                  className={`transition-colors ${
                    post.status === 'deactivated'
                      ? 'bg-slate-50/50 opacity-60 line-through'
                      : 'hover:bg-slate-50/50'
                  }`}
                >
                  <td className="p-4 leading-tight whitespace-nowrap">
                    <p className="font-bold text-slate-800 text-xs">
                      By: <span className="font-normal text-slate-600">{post.author?.full_name}</span>
                    </p>
                    <p className="font-bold text-slate-400 text-[10px] mt-0.5">
                      To: <span className="font-normal text-slate-500">{post.tagged?.full_name}</span>
                    </p>
                  </td>

                  <td className="p-4">
                    {editingPostId === post.id ? (
                      <div className="space-y-1.5 w-full">
                        <textarea
                          value={editedPostContent}
                          onChange={(e) => setEditedPostContent(e.target.value)}
                          className="w-full text-xs p-2.5 bg-slate-50 border rounded-md focus:outline-none h-16"
                          disabled={processingPostId === post.id}
                        />

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEditedPost(post)}
                            disabled={processingPostId === post.id}
                            className="bg-emerald-600 disabled:bg-slate-400 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded shadow"
                          >
                            {processingPostId === post.id ? 'Saving...' : 'Save Changes'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingPostId(null);
                              setEditedPostContent('');
                            }}
                            className="text-slate-400 text-[10px] font-bold hover:underline"
                            disabled={processingPostId === post.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="text-slate-700 font-medium text-xs break-words max-w-lg">
                          {post.content}
                        </p>

                        {post.action_reason && (
                          <p className="text-[10px] text-pink-700 font-semibold bg-pink-50 rounded px-1.5 py-0.5 inline-block mt-1">
                            ⚠️ {post.action_reason}
                          </p>
                        )}

                        <p className="text-[9px] text-slate-400">
                          🗓️ Created: {post.created_at ? new Date(post.created_at).toLocaleString() : 'N/A'}
                          {post.updated_at && (
                            <span className="text-blue-500 font-bold ml-2">
                              ⏱️ Action/Edit: {new Date(post.updated_at).toLocaleString()}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </td>

                  <td className="p-4">
                    <span className={getStatusBadgeClass(post.status)}>{post.status}</span>
                  </td>

                  <td className="p-4 text-right">
                    {post.status !== 'deactivated' ? (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPostId(post.id);
                            setEditedPostContent(post.content || '');
                          }}
                          className="text-blue-600 text-[9px] font-extrabold uppercase bg-blue-50 px-2 py-0.5 rounded"
                          disabled={processingPostId === post.id}
                        >
                          ✏️ Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeactivatePost(post)}
                          className="text-amber-700 text-[9px] font-extrabold uppercase bg-amber-50 px-2 py-0.5 rounded hover:bg-amber-100"
                          title="Deactivate & Reverse Funds"
                          disabled={processingPostId === post.id}
                        >
                          🚫 Deactivate
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic font-bold">Archived/Reversed</span>
                    )}

                    {post.status === 'pending' && (
                      <div className="flex gap-1 justify-end mt-1.5">
                        <button
                          type="button"
                          onClick={() => handleAdminOverride(post, 'approved', 'green')}
                          className="bg-green-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow"
                          disabled={processingPostId === post.id}
                        >
                          Pass
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAdminOverride(post, 'disapproved', 'red')}
                          className="bg-red-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow"
                          disabled={processingPostId === post.id}
                        >
                          Deny
                        </button>
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
