import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import WalletProfile from './WalletProfile'; 

export default function Dashboard({ currentUser }) {
  const [currentTab, setCurrentTab] = useState('workflow'); 
  const [dbCategories, setDbCategories] = useState([]);
  
  // Form State (Updated for multiple categories)
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  
  // Verifier Selection State
  const [allUsers, setAllUsers] = useState([]);
  const [selectedTagUsers, setSelectedTagUsers] = useState([]);
  const [verifierSearch, setVerifierSearch] = useState(''); 
  
  // Data Logs State
  const [inboxPosts, setInboxPosts] = useState([]);
  const [outboxPosts, setOutboxPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reasonMap, setReasonMap] = useState({});
  const [editContentMap, setEditContentMap] = useState({});

  useEffect(() => {
    if (!currentUser?.id) return;
    
    fetchUsers();
    fetchActiveCategories();
    fetchDashboardData();

    const workflowChannel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          fetchDashboardData(); 
      }).subscribe();

    return () => supabase.removeChannel(workflowChannel);
  }, [currentUser?.id]);

  const fetchActiveCategories = async () => {
    const { data } = await supabase.from('workflow_categories').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data) setDbCategories(data);
  };
// 🆕 NEW: Master Refresh Function
  const handleRefreshAll = async () => {
    setLoading(true);
    
    // Clear out the form so it feels like a fresh page
    setSelectedCategories([]); 
    setCustomCategory(''); 
    setAmount(''); 
    setNote(''); 
    setSelectedTagUsers([]); 
    setVerifierSearch('');

    // Fetch ALL system data again
    await Promise.all([
      fetchActiveCategories(),
      fetchUsers(),
      fetchDashboardData() // This handles setting loading back to false
    ]);
  };
  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, email').neq('id', currentUser.id).order('full_name', { ascending: true });
    if (data) setAllUsers(data);
  };

  const fetchDashboardData = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const [allPostsRes, profilesRes] = await Promise.all([
        supabase.from('posts').select('*'),
        supabase.from('profiles').select('id, full_name')
      ]);

      const safePosts = allPostsRes.data || [];
      const safeProfiles = profilesRes.data || [];

      let fullyMappedPosts = safePosts.map(p => {
        const authorProf = safeProfiles.find(prof => prof.id === p.author_id);
        const taggedProf = safeProfiles.find(prof => prof.id === p.tagged_member_id);
        return {
          ...p,
          author: authorProf ? { full_name: authorProf.full_name } : { full_name: 'Unknown Staff' },
          tagged: taggedProf ? { full_name: taggedProf.full_name } : { full_name: 'Unknown Verifier' }
        };
      });

      fullyMappedPosts = fullyMappedPosts.map(post => {
        const groupId = post.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/)?.[1] || null;
        if (groupId && post.status === 'pending') {
          const peerApproved = fullyMappedPosts.find(other => other.action_reason?.includes(groupId) && other.status === 'approved');
          if (peerApproved) return { ...post, status: 'deactivated', flag_color: 'slate', action_reason: `Approved by peer: ${peerApproved.tagged?.full_name || 'System'} || GROUP_ID:${groupId}` };
        }
        return post;
      });

      const inbox = fullyMappedPosts.filter(p => p.tagged_member_id === currentUser.id);
      const outbox = fullyMappedPosts.filter(p => p.author_id === currentUser.id);
      
      setInboxPosts([...inbox].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setOutboxPosts([...outbox].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 🆕 NEW: Multi-Select Category Logic
  const handleToggleCategory = (catName) => {
    setSelectedCategories(prev => 
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (selectedTagUsers.length === 0) return alert('Assign at least one verifier.');
    
    // Combine selected categories into a single string
    let activeCats = selectedCategories.filter(c => c !== 'custom');
    if (selectedCategories.includes('custom') && customCategory.trim()) {
      activeCats.push(customCategory.trim());
    }

    if (activeCats.length === 0) return alert('Please select at least one category.');
    if (!amount) return alert('Please enter an amount.');

    const finalCategoryString = activeCats.join(' + ');
    const sharedGroupId = crypto.randomUUID();
    let structuredContent = `[${finalCategoryString.toUpperCase()}] Request Processing - Amount: $${amount}`;
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
          performed_by: currentUser.id, notes: `Created request group ${sharedGroupId}. Assigned: ${verifierId}`,
          action_timestamp: new Date().toISOString()
        });
      });

      await Promise.all(submissionPromises);
      alert(`Broadcasted to ${selectedTagUsers.length} verifiers!`);
      
      // Reset Form
      setSelectedCategories([]); setCustomCategory(''); setAmount(''); setNote(''); setSelectedTagUsers([]); setVerifierSearch('');
      fetchDashboardData();
    } catch (error) {
      alert(`Submission failure: ${error.message}`);
    }
  };

  const handleToggleVerifierCheckbox = (userId) => {
    setSelectedTagUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const filteredUsers = allUsers.filter(u => u.full_name.toLowerCase().includes(verifierSearch.toLowerCase()));

  const handleWorkflowAction = async (postId, status, flagColor) => {
    const customReason = reasonMap[postId] || '';
    if ((status === 'disapproved' || status === 'edit_requested') && !customReason.trim()) return alert('Provide a reason.');

    try {
      const { data: targetPost, error: fetchPostError } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
      if (fetchPostError) throw fetchPostError;

      const groupId = targetPost?.action_reason?.match(/GROUP_ID:([a-f0-9-]+)/)?.[1] || null;

      if (status === 'approved' && groupId) {
        const { data: groupPosts } = await supabase.from('posts').select('*');
        const alreadyApproved = (groupPosts || []).some(p => p.action_reason?.includes(groupId) && p.status === 'approved' && p.id !== postId);
        if (alreadyApproved) {
          alert("Request group already approved by another verifier!");
          await supabase.from('posts').update({ status: 'deactivated', flag_color: 'slate', action_reason: `System: Already approved.`, updated_at: new Date().toISOString()}).eq('id', postId);
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
            notes: `Workflow Approved: ${targetPost?.content.split(' || ')[0]}`, action_timestamp: new Date().toISOString()
          });

          if (ledgerError) throw new Error(`Ledger Save Failed: ${ledgerError.message}`);
          await supabase.from('profiles').update({ total_amount_claimed: newAmount }).eq('id', currentUser.id);
        }
        
        if (groupId) {
          const { data: freshGroup } = await supabase.from('posts').select('id, action_reason, status');
          const pendingSiblings = (freshGroup || []).filter(p => p.action_reason?.includes(groupId) && p.id !== postId && p.status === 'pending');
          if (pendingSiblings.length > 0) {
            await Promise.all(pendingSiblings.map(sibling => supabase.from('posts').update({
              status: 'deactivated', flag_color: 'slate', action_reason: `Approved by peer: ${currentUser.full_name} || GROUP_ID:${groupId}`, updated_at: new Date().toISOString()
            }).eq('id', sibling.id)));
          }
        }
      }

      await supabase.from('audit_logs').insert({ 
        id: crypto.randomUUID(), post_id: postId, action_taken: status.toUpperCase(), performed_by: currentUser.id, 
        notes: customReason || `Handled state as ${status}.`, action_timestamp: new Date().toISOString()
      });

      fetchDashboardData();
    } catch (err) {
      alert(`Transaction Failed: ${err.message}`);
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
  <button type="button" onClick={() => setCurrentTab('wallet')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${currentTab === 'wallet' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800'}`}>🏦 Financial Wallet</button>
  
  {/* REMOVED THE ADMIN RESTRICTION - NOW VISIBLE TO ANYONE ON DASHBOARD */}
  <button type="button" onClick={() => window.location.href = '/receipts'} className="px-4 py-2 text-xs font-bold rounded-lg transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow ml-4">
    📸 Upload Receipt
  </button>
</div>

        <div className="flex items-center justify-end gap-2.5">
          
        {/* 🆕 UPDATED: Animated Refresh Button points to handleRefreshAll */}
          <button 
            type="button" 
            onClick={handleRefreshAll} 
            disabled={loading}
            className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-2 rounded font-mono hover:bg-slate-700 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? <span className="animate-spin text-sm leading-none">⏳</span> : <span>🔄</span>}
            REFRESH DATA
          </button>
          <button type="button" onClick={async () => { if (window.confirm("Are you sure you want to sign out?")) await supabase.auth.signOut(); }} className="text-[10px] bg-red-950/40 border border-red-900/50 text-red-400 px-3 py-2 rounded font-mono hover:bg-red-900">❌ SIGN OUT</button>
        </div>
      </div>

      {currentTab === 'wallet' ? (
        <div className="animate-fadeIn"><WalletProfile currentUser={currentUser} /></div>
      ) : (
        <div className="space-y-8 animate-fadeIn">
          {/* 📊 NEW SUBMISSION FORM */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">📊 New Workflow Submission</h3>
            <form onSubmit={handleCreatePost} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 🆕 NEW: Multi-Select Category Chips */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Request Categories (Select Multiple)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {dbCategories.map(cat => (
                      <button 
                        key={cat.id} 
                        type="button" 
                        onClick={() => handleToggleCategory(cat.name)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-colors ${selectedCategories.includes(cat.name) ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'}`}
                      >
                        {cat.icon} {cat.name}
                      </button>
                    ))}
                    <button 
                      type="button" 
                      onClick={() => handleToggleCategory('custom')}
                      className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-colors ${selectedCategories.includes('custom') ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'}`}
                    >
                      ✍️ Custom...
                    </button>
                  </div>
                  
                  {selectedCategories.includes('custom') && (
                    <input 
                      type="text" 
                      placeholder="Type custom category name..." 
                      value={customCategory} 
                      onChange={(e) => setCustomCategory(e.target.value)} 
                      required 
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 animate-fadeIn mt-2" 
                    />
                  )}
                </div>

                {/* Amount Selection */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Amount ($)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {[100, 500, 1000, 5000, 10000].map(val => (
                      <button 
                        key={val} 
                        type="button" 
                        onClick={() => setAmount(val.toString())}
                        className={`text-xs font-bold px-2.5 py-1 rounded-md border transition-colors ${amount === val.toString() ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'}`}
                      >
                        ${val.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="Type custom amount..." 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                      required 
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" 
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Special Note (Optional)</label>
                <input type="text" placeholder="Add context for the verifier..." value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-sm font-semibold text-slate-700 mb-3">Assign Verifiers</label>
                <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
                  {selectedTagUsers.length === 0 ? (
                    <span className="text-xs text-slate-400 italic flex items-center">No verifiers assigned yet...</span>
                  ) : (
                    selectedTagUsers.map(id => {
                      const user = allUsers.find(u => u.id === id);
                      return (
                        <span key={id} className="bg-blue-100 border border-blue-200 text-blue-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2 shadow-sm">
                          {user?.full_name || 'Unknown'} 
                          <button type="button" onClick={() => handleToggleVerifierCheckbox(id)} className="text-blue-500 hover:text-red-500 hover:bg-white rounded-full h-4 w-4 flex items-center justify-center leading-none">×</button>
                        </span>
                      );
                    })
                  )}
                </div>

                <div className="relative mb-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                  <input type="text" placeholder="Search directory by name..." value={verifierSearch} onChange={(e) => setVerifierSearch(e.target.value)} className="w-full bg-white border border-slate-300 rounded-t-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-b-lg p-2 max-h-48 overflow-y-auto shadow-inner">
                  {filteredUsers.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No employees match your search.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {filteredUsers.map((user) => (
                        <label key={user.id} className={`flex items-center space-x-3 p-2.5 border rounded-lg cursor-pointer transition-all ${selectedTagUsers.includes(user.id) ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-400 shadow-sm'}`}>
                          <input type="checkbox" checked={selectedTagUsers.includes(user.id)} onChange={() => handleToggleVerifierCheckbox(user.id)} className="h-4 w-4 rounded text-blue-600 border-slate-300 cursor-pointer focus:ring-blue-500" />
                          <div className="text-left min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{user.full_name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{user.email || 'No email saved'}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-8 py-3 rounded-xl shadow-md transition-transform hover:scale-[1.02]">
                  🚀 Broadcast Request
                </button>
              </div>
            </form>
          </div>

          {/* GRID COLUMNS (Inbox / Outbox) */}
          {loading ? (
            /* 🆕 NEW: Skeleton Loader for Dashboard Grids */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="h-6 w-1/2 bg-slate-200 rounded animate-pulse"></div>
                {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-xl animate-pulse"></div>)}
              </div>
              <div className="space-y-4">
                <div className="h-6 w-1/2 bg-slate-200 rounded animate-pulse"></div>
                {[1,2,3].map(i => <div key={i} className="h-28 bg-slate-200 rounded-xl animate-pulse"></div>)}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* INBOX */}
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