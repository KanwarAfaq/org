import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import WalletProfile from './WalletProfile'; 

export default function Dashboard({ currentUser }) {
  const [currentTab, setCurrentTab] = useState('workflow'); 
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [note, setNote] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedTagUsers, setSelectedTagUsers] = useState([]);
  
  const [inboxPosts, setInboxPosts] = useState([]);
  const [outboxPosts, setOutboxPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reasonMap, setReasonMap] = useState({});
  const [editContentMap, setEditContentMap] = useState({});

  useEffect(() => {
    if (!currentUser?.id) return;
    
    fetchUsers();
    fetchDashboardData();

    // ⚡ REAL-TIME DATABASE LIVE STREAM LISTENER
    const workflowChannel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => { fetchDashboardData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(workflowChannel); };
  }, [currentUser?.id]);

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, email').neq('id', currentUser.id);
    if (data) setAllUsers(data);
  };

  const fetchDashboardData = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const { data: allPosts, error: postsError } = await supabase.from('posts').select('*');
      if (postsError) throw postsError;

      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name');
      if (profilesError) throw profilesError;

      const safePosts = allPosts || [];
      const safeProfiles = profiles || [];

      let fullyMappedPosts = safePosts.map(p => {
        const authorProf = safeProfiles.find(prof => prof.id === p.author_id);
        const taggedProf = safeProfiles.find(prof => prof.id === p.tagged_member_id);
        return {
          ...p,
          author: authorProf ? { full_name: authorProf.full_name } : { full_name: 'Unknown Staff' },
          tagged: taggedProf ? { full_name: taggedProf.full_name } : { full_name: 'Unknown Verifier' }
        };
      });

      // 🛡️ DYNAMIC RLS BYPASS: Force group resolution on the client side
      fullyMappedPosts = fullyMappedPosts.map(post => {
        const groupMatch = post.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/);
        const groupId = groupMatch ? groupMatch[1] : null;

        if (groupId && post.status === 'pending') {
          const peerApproved = fullyMappedPosts.find(other => 
            other.action_reason?.includes(groupId) && other.status === 'approved'
          );

          if (peerApproved) {
            return {
              ...post,
              status: 'deactivated',
              flag_color: 'slate',
              action_reason: `Approved by peer: ${peerApproved.tagged?.full_name || 'System'} || GROUP_ID:${groupId}`
            };
          }
        }
        return post;
      });

      const inbox = fullyMappedPosts.filter(p => p.tagged_member_id === currentUser.id);
      const outbox = fullyMappedPosts.filter(p => p.author_id === currentUser.id);
      
      setInboxPosts([...inbox].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setOutboxPosts([...outbox].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      
    } catch (err) {
      console.error("Dashboard database synchronization failure:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (selectedTagUsers.length === 0) return alert('Please assign at least one verifier.');
    
    const finalCategory = category === 'custom' ? customCategory : category;
    const finalAmount = amount === 'custom' ? customAmount : amount;
    if (!finalCategory || !finalAmount) return alert('Fill in all required fields.');

    const sharedGroupId = crypto.randomUUID();
    let structuredContent = `[${finalCategory.toUpperCase()}] Request Processing - Amount: $${finalAmount}`;
    if (note.trim()) structuredContent += ` || NOTE: ${note.trim()}`;

    try {
      const submissionPromises = selectedTagUsers.map(async (verifierId) => {
        const generatedPostId = crypto.randomUUID();
        const groupTrackingToken = `GROUP_ID:${sharedGroupId}`;

        const { error: postError } = await supabase.from('posts').insert({
          id: generatedPostId, author_id: currentUser.id, tagged_member_id: verifierId,
          content: structuredContent, status: 'pending', flag_color: 'none',
          action_reason: groupTrackingToken, created_at: new Date().toISOString()
        });

        if (postError) throw postError;

        await supabase.from('audit_logs').insert({
          id: crypto.randomUUID(), post_id: generatedPostId, action_taken: 'CREATED',
          performed_by: currentUser.id, notes: `Created request group ${sharedGroupId}. Sent to verifier: ${verifierId}`,
          action_timestamp: new Date().toISOString()
        });
      });

      await Promise.all(submissionPromises);
      alert(`Workflow request successfully broadcasted to ${selectedTagUsers.length} verifiers!`);
      setCategory(''); setCustomCategory(''); setAmount(''); setCustomAmount(''); setNote(''); setSelectedTagUsers([]);
      fetchDashboardData();
    } catch (error) {
      console.error(error);
      alert(`Submission failure: ${error.message}`);
    }
  };

  const handleToggleVerifierCheckbox = (userId) => {
    setSelectedTagUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const handleWorkflowAction = async (postId, status, flagColor) => {
    const customReason = reasonMap[postId] || '';
    if ((status === 'disapproved' || status === 'edit_requested') && !customReason.trim()) return alert('Provide a reason for this action.');

    try {
      const { data: targetPost, error: fetchPostError } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
      if (fetchPostError) throw fetchPostError;

      const groupMatch = targetPost?.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/);
      const groupId = groupMatch ? groupMatch[1] : null;

      if (status === 'approved' && groupId) {
        const { data: groupPosts } = await supabase.from('posts').select('*');
        const alreadyApproved = (groupPosts || []).some(p => p.action_reason?.includes(groupId) && p.status === 'approved' && p.id !== postId);
        if (alreadyApproved) {
          alert("This request group has already been approved by another verifier!");
          await supabase.from('posts').update({ status: 'deactivated', flag_color: 'slate', action_reason: `System: Already approved by a peer verifier.`, updated_at: new Date().toISOString() }).eq('id', postId);
          fetchDashboardData(); return;
        }
      }

      const finalActionReason = groupId ? `${customReason.trim()} || GROUP_ID:${groupId}` : customReason.trim();
      const { error: updateError } = await supabase.from('posts').update({ status, flag_color: flagColor, action_reason: finalActionReason, updated_at: new Date().toISOString() }).eq('id', postId);
      if (updateError) throw updateError;

      if (status === 'approved') {
        const amountMatch = targetPost?.content.match(/\$([0-9.,]+)/);
        
        if (amountMatch && amountMatch[1]) {
          const extractedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
          
          const { data: profile } = await supabase.from('profiles').select('total_amount_claimed').eq('id', currentUser.id).maybeSingle();
          const prevAmount = Number(profile?.total_amount_claimed || 0);
          const newAmount = prevAmount + extractedAmount;
            
          const { error: ledgerError } = await supabase.from('member_wallet_logs').insert({
            id: crypto.randomUUID(), member_id: currentUser.id, post_id: postId,
            prev_amount: prevAmount, delta_amount: extractedAmount, new_amount: newAmount,
            notes: `Workflow Approved: ${targetPost?.content.split(' || ')[0]}`,
            action_timestamp: new Date().toISOString()
          });

          if (ledgerError) throw new Error(`Ledger Save Failed: ${ledgerError.message}`);

          await supabase.from('profiles').update({ total_amount_claimed: newAmount }).eq('id', currentUser.id);
        } else {
          throw new Error("Critical Data Error: Could not extract dollar amount from the request content.");
        }
        
        if (groupId) {
          const { data: freshGroupLookup } = await supabase.from('posts').select('id, action_reason, status');
          const pendingSiblings = (freshGroupLookup || []).filter(p => p.action_reason?.includes(groupId) && p.id !== postId && p.status === 'pending');
          if (pendingSiblings.length > 0) {
            await Promise.all(pendingSiblings.map(sibling => supabase.from('posts').update({
              status: 'deactivated', flag_color: 'slate', action_reason: `Approved by peer: ${currentUser.full_name} || GROUP_ID:${groupId}`, updated_at: new Date().toISOString()
            }).eq('id', sibling.id)));
          }
        }
      }

      await supabase.from('audit_logs').insert({ 
        id: crypto.randomUUID(), post_id: postId, action_taken: status.toUpperCase(), performed_by: currentUser.id, 
        notes: customReason || `Handled workflow state as ${status}.`, action_timestamp: new Date().toISOString()
      });

      fetchDashboardData();
    } catch (err) {
      console.error(err);
      alert(`Ledger Transaction Failed: ${err.message}`);
    }
  };

  const handleResubmitPost = async (postId, updatedContent) => {
    if (!updatedContent?.trim()) return alert('Content cannot be blank.');
    await supabase.from('posts').update({ content: updatedContent, status: 'pending', flag_color: 'none', action_reason: null, updated_at: new Date().toISOString() }).eq('id', postId);
    await supabase.from('audit_logs').insert({ id: crypto.randomUUID(), post_id: postId, action_taken: 'RE-SUBMITTED', performed_by: currentUser.id, notes: 'Author revised content.', action_timestamp: new Date().toISOString() });
    alert('Revised post sent!');
    fetchDashboardData();
  };

  const renderPostContentWithNote = (fullContent) => {
    const parts = fullContent.split(' || ');
    return (
      <div className="space-y-2">
        <p className="text-slate-700 font-medium">{parts[0]}</p>
        {parts[1] && <p className="text-xs bg-amber-50 text-amber-800 border-l-4 border-amber-500 p-2.5 rounded-r-md font-sans">💡 {parts[1]}</p>}
      </div>
    );
  };

  const getFlagBadge = (status, color) => {
    const base = "text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ";
    if (status === 'deactivated') return base + "bg-slate-100 text-slate-500 border border-slate-200";
    if (color === 'green') return base + "bg-green-100 text-green-800";
    if (color === 'red') return base + "bg-red-100 text-red-800";
    if (color === 'blue') return base + "bg-blue-100 text-blue-800";
    return base + "bg-slate-100 text-slate-600";
  };

  const getHistoryFeedback = (post) => {
    const cleanReason = post.action_reason?.split(' || GROUP_ID')[0] || '';
    if (post.status === 'approved') return `✅ You approved this request.`;
    if (post.status === 'deactivated') return `ℹ️ ${cleanReason || 'Handled by another verifier.'}`;
    if (post.status === 'disapproved') return `🚫 You denied this request. (${cleanReason})`;
    if (post.status === 'edit_requested') return `🔄 You requested an edit. (${cleanReason})`;
    return `📝 Marked as ${post.status}`;
  };

  const processedOutboxItems = useMemo(() => {
    const grouped = {};
    outboxPosts.forEach(post => {
      const groupId = (post.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/) || [])[1] || post.id;
      if (!grouped[groupId]) grouped[groupId] = [];
      grouped[groupId].push(post);
    });

    return Object.values(grouped).map(group => {
      const approvedPost = group.find(p => p.status === 'approved');
      if (approvedPost) return { ...approvedPost, displayStatus: 'approved', displayFlag: 'green', feedbackText: `Approved by verifier: ${approvedPost.tagged?.full_name}` };
      
      const pendingPost = group.find(p => p.status === 'pending');
      if (pendingPost) return { ...pendingPost, displayStatus: 'pending', displayFlag: 'none', feedbackText: `Awaiting checks from: ${group.map(p => p.tagged?.full_name).join(', ')}` };

      const editReqPost = group.find(p => p.status === 'edit_requested');
      if (editReqPost) return { ...editReqPost, displayStatus: 'edit_requested', displayFlag: 'blue', feedbackText: editReqPost.action_reason?.split(' || GROUP_ID')[0] };

      const primary = group[0];
      return { ...primary, displayStatus: primary.status, displayFlag: primary.flag_color, feedbackText: primary.action_reason?.split(' || GROUP_ID')[0] };
    });
  }, [outboxPosts]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* HEADER BAR */}
      <div className="bg-slate-900 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 text-white">
        <div className="flex items-center gap-3 bg-slate-800/60 p-2 rounded-xl border border-slate-700/50">
          <img src={currentUser?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg'} className="w-10 h-10 rounded-full object-cover border-2 border-blue-500 bg-slate-700 shrink-0" alt="" />
          <div className="text-left leading-tight min-w-0">
            <p className="text-xs font-black text-slate-100 truncate">{currentUser?.full_name || 'System Member'}</p>
            <p className="text-[10px] font-medium text-slate-400 truncate mt-0.5">{currentUser?.email || 'Active verified session'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCurrentTab('workflow')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${currentTab === 'workflow' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>📋 Workflow Requests</button>
          <button type="button" onClick={() => setCurrentTab('history')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${currentTab === 'history' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>📜 Workflow History</button>
          <button type="button" onClick={() => setCurrentTab('wallet')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${currentTab === 'wallet' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>🏦 Financial Wallet</button>
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <button type="button" onClick={fetchDashboardData} className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-2 rounded font-mono hover:bg-slate-700">REFRESH DATA</button>
          <button type="button" onClick={async () => { if (window.confirm("Are you sure you want to sign out?")) await supabase.auth.signOut(); }} className="text-[10px] bg-red-950/40 border border-red-900/50 text-red-400 px-3 py-2 rounded font-mono hover:bg-red-900">❌ SIGN OUT</button>
        </div>
      </div>

      {currentTab === 'wallet' && <div className="animate-fadeIn"><WalletProfile currentUser={currentUser} /></div>}

      {/* NEW HISTORY TAB */}
      {currentTab === 'history' && (
        <div className="animate-fadeIn space-y-6">
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">📜 VERIFIER HISTORY ARCHIVE</h3>
            <p className="text-sm text-slate-500 mb-6">A complete ledger of workflows you have engaged with or been tagged in.</p>
            
            {inboxPosts.filter(p => p.status !== 'pending').length === 0 ? (
              <p className="text-sm text-slate-400 bg-slate-50 border rounded-xl p-6 text-center shadow-inner italic">No historical records found.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {inboxPosts.filter(p => p.status !== 'pending').map(post => (
                  <div key={post.id} className={`bg-white border rounded-xl p-5 shadow-sm space-y-4 ${post.status === 'deactivated' ? 'opacity-80' : ''}`}>
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-slate-900">From: <span className="font-normal text-slate-600">{post.author?.full_name}</span></p>
                      <span className={getFlagBadge(post.status, post.flag_color)}>{post.status}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">{renderPostContentWithNote(post.content)}</div>
                    
                    <div className="bg-slate-100 text-slate-600 font-mono text-[11px] p-2.5 rounded border border-slate-200">
                      {getHistoryFeedback(post)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {currentTab === 'workflow' && (
        <div className="space-y-8 animate-fadeIn">
          {/* SUBMISSION FORM */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">📊 New Workflow Submission</h3>
            <form onSubmit={handleCreatePost} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Request Item</label>
                  <div className="flex gap-2">
                    <select value={category} onChange={(e) => setCategory(e.target.value)} required className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                      <option value="">-- Choose Category --</option>
                      <option value="Inventory Restock">📦 Inventory Restock</option>
                      <option value="Expense Reimbursement">💰 Expense Reimbursement</option>
                      <option value="Office Equipment purchase">💻 Office Equipment Purchase</option>
                      <option value="custom">✍️ Add Custom...</option>
                    </select>
                    {category === 'custom' && <input type="text" placeholder="Category Name" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} required className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Amount ($)</label>
                  <div className="flex gap-2">
                    <select value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                      <option value="">-- Choose Amount --</option>
                      <option value="100">$100</option>
                      <option value="500">$500</option>
                      <option value="1000">$1,000</option>
                      <option value="custom">✍️ Custom Type...</option>
                    </select>
                    {amount === 'custom' && <input type="text" placeholder="Exact Amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} required className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Special Note (Optional)</label>
                <input type="text" placeholder="Context..." value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="pt-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Assign Verifiers (Select all that apply):</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 shadow-inner">
                  {allUsers.map((user) => (
                    <label key={user.id} className="flex items-center space-x-2.5 bg-white p-2 border rounded-lg cursor-pointer select-none shadow-sm hover:bg-slate-50">
                      <input type="checkbox" checked={selectedTagUsers.includes(user.id)} onChange={() => handleToggleVerifierCheckbox(user.id)} className="h-4 w-4 rounded text-blue-600 border-slate-300 cursor-pointer" />
                      <div className="text-left">
                        <p className="text-xs font-bold text-slate-800">{user.full_name}</p>
                        <p className="text-[9px] text-slate-400 truncate max-w-[150px]">{user.email || 'No email saved'}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Selected: <span className="text-blue-600 font-bold font-mono">{selectedTagUsers.length}</span> verifier(s)</p>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg shadow-md">🚀 Submit Request</button>
              </div>
            </form>
          </div>

          {/* GRID COLUMNS */}
          {loading ? <div className="text-center text-slate-500">Syncing active workflows...</div> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* INBOX - NOW STRICTLY PENDING ITEMS ONLY */}
              <div className="space-y-4">
                <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">📥 ACTION REQUIRED BY YOU</h3>
                {inboxPosts.filter(p => p.status === 'pending').length === 0 ? (
                  <p className="text-sm text-slate-400 bg-white border rounded-xl p-6 text-center shadow-inner">All caught up! Desk is clean.</p>
                ) : (
                  inboxPosts.filter(p => p.status === 'pending').map(post => (
                    <div key={post.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-bold text-slate-900">From: <span className="font-normal text-slate-600">{post.author?.full_name}</span></p>
                        <span className={getFlagBadge(post.status, post.flag_color)}>{post.status}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">{renderPostContentWithNote(post.content)}</div>
                      
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <input type="text" placeholder="Reason if rejecting/editing..." value={reasonMap[post.id] || ''} onChange={(e) => setReasonMap({...reasonMap, [post.id]: e.target.value})} className="w-full text-xs px-3 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleWorkflowAction(post.id, 'approved', 'green')} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">Approve</button>
                          <button onClick={() => handleWorkflowAction(post.id, 'disapproved', 'red')} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">Deny</button>
                          <button onClick={() => handleWorkflowAction(post.id, 'edit_requested', 'blue')} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">Request Edit</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* OUTBOX */}
              <div className="space-y-4">
                <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">📤 YOUR TRACKING LOG</h3>
                {processedOutboxItems.length === 0 ? <p className="text-sm text-slate-400 bg-white border rounded-xl p-6 text-center shadow-inner">No submissions logged.</p> : processedOutboxItems.map(post => (
                  <div key={post.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                    {post.displayStatus === 'edit_requested' ? (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-blue-600 uppercase">✏️ Revise Your Submission:</label>
                        <textarea value={editContentMap[post.id] !== undefined ? editContentMap[post.id] : post.content} onChange={(e) => setEditContentMap({...editContentMap, [post.id]: e.target.value})} className="w-full text-sm p-2 bg-slate-50 border rounded-lg h-16" />
                        <button onClick={() => handleResubmitPost(post.id, editContentMap[post.id] || post.content)} className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">🔄 Re-Submit</button>
                      </div>
                    ) : (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">{renderPostContentWithNote(post.content)}</div>
                    )}
                    <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-50">
                      <span className="text-slate-500 font-medium">Tracking Mode Active</span>
                      <span className={getFlagBadge(post.displayStatus, post.displayFlag)}>{post.displayStatus}</span>
                    </div>
                    {post.feedbackText && <p className="text-xs bg-purple-50 text-purple-700 p-2 rounded font-medium">✨ {post.feedbackText}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}