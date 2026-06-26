import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Dashboard({ currentUser }) {
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [note, setNote] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedTagUser, setSelectedTagUser] = useState('');
  
  const [inboxPosts, setInboxPosts] = useState([]);
  const [outboxPosts, setOutboxPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reasonMap, setReasonMap] = useState({});
  const [editContentMap, setEditContentMap] = useState({});

  useEffect(() => {
    fetchUsers();
    fetchDashboardData();
  }, [currentUser]);

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').neq('id', currentUser.id);
    if (data) setAllUsers(data);
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    const { data: inbox } = await supabase.from('posts').select('*, author:profiles!posts_author_id_fkey(full_name)').eq('tagged_member_id', currentUser.id).order('created_at', { ascending: false });
    const { data: outbox } = await supabase.from('posts').select('*, tagged:profiles!posts_tagged_member_id_fkey(full_name)').eq('author_id', currentUser.id).order('created_at', { ascending: false });
    if (inbox) setInboxPosts(inbox);
    if (outbox) setOutboxPosts(outbox);
    setLoading(false);
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!selectedTagUser) return alert('Please assign a verifier.');
    const finalCategory = category === 'custom' ? customCategory : category;
    const finalAmount = amount === 'custom' ? customAmount : amount;
    if (!finalCategory || !finalAmount) return alert('Fill in all required fields.');

    let structuredContent = `[${finalCategory.toUpperCase()}] Request Processing - Amount: $${finalAmount}`;
    if (note.trim()) structuredContent += ` || NOTE: ${note.trim()}`;

    const { data: postData, error: postError } = await supabase.from('posts').insert({
      author_id: currentUser.id,
      tagged_member_id: selectedTagUser,
      content: structuredContent,
      status: 'pending',
      flag_color: 'none'
    }).select().single();

    if (postError) return alert(postError.message);

    await supabase.from('audit_logs').insert({
      post_id: postData.id,
      action_taken: 'CREATED',
      performed_by: currentUser.id,
      notes: `Created request for ${finalCategory}.`
    });

    alert('Workflow data submitted!');
    setCategory(''); setCustomCategory(''); setAmount(''); setCustomAmount(''); setNote(''); setSelectedTagUser('');
    fetchDashboardData();
  };

  const handleWorkflowAction = async (postId, status, flagColor) => {
    const reason = reasonMap[postId] || '';
    if ((status === 'disapproved' || status === 'edit_requested') && !reason.trim()) {
      return alert('Provide a reason for this action.');
    }

    const { error } = await supabase.from('posts').update({ status, flag_color: flagColor, action_reason: reason }).eq('id', postId);
    if (error) return alert(error.message);

    if (status === 'approved') {
      const specificPost = inboxPosts.find(p => p.id === postId);
      const amountMatch = specificPost?.content.match(/\$([0-9.]+)/);
      if (amountMatch && amountMatch[1]) {
        const extractedAmount = parseFloat(amountMatch[1]);
        const { data: profile } = await supabase.from('profiles').select('total_amount_claimed').eq('id', currentUser.id).single();
        await supabase.from('profiles').update({ total_amount_claimed: (profile?.total_amount_claimed || 0) + extractedAmount }).eq('id', currentUser.id);
      }
    }

    await supabase.from('audit_logs').insert({ post_id: postId, action_taken: status.toUpperCase(), performed_by: currentUser.id, notes: reason || 'Approved.' });
    fetchDashboardData();
  };

  const handleResubmitPost = async (postId, updatedContent) => {
    if (!updatedContent?.trim()) return alert('Content cannot be blank.');
    await supabase.from('posts').update({ content: updatedContent, status: 'pending', flag_color: 'none', action_reason: null }).eq('id', postId);
    await supabase.from('audit_logs').insert({ post_id: postId, action_taken: 'RE-SUBMITTED', performed_by: currentUser.id, notes: 'Author revised content.' });
    alert('Revised post sent!');
    fetchDashboardData();
  };

  const renderPostContentWithNote = (fullContent) => {
    const parts = fullContent.split(' || ');
    return (
      <div className="space-y-2">
        <p className="text-slate-700 font-medium">{parts[0]}</p>
        {parts[1] && (
          <p className="text-xs bg-amber-50 text-amber-800 border-l-4 border-amber-500 p-2.5 rounded-r-md font-sans">
            💡 {parts[1]}
          </p>
        )}
      </div>
    );
  };

  const getFlagBadge = (color) => {
    const base = "text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ";
    if (color === 'green') return base + "bg-green-100 text-green-800";
    if (color === 'red') return base + "bg-red-100 text-red-800";
    if (color === 'blue') return base + "bg-blue-100 text-blue-800";
    return base + "bg-slate-100 text-slate-600";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* WRITING FORM */}
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
          <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-semibold text-slate-700">Assign Verifier:</label>
              <select value={selectedTagUser} onChange={(e) => setSelectedTagUser(e.target.value)} required className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">-- Select Colleague --</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-2 rounded-lg shadow-md transition-all">🚀 Send</button>
          </div>
        </form>
      </div>

      {/* COLUMNS SPLIT */}
      {loading ? <div className="text-center text-slate-500">Syncing workflows...</div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* INBOX */}
          <div className="space-y-4">
            <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">📥 ACTION REQUIRED BY YOU</h3>
            {inboxPosts.length === 0 ? <p className="text-sm text-slate-400 bg-white border rounded-xl p-6 text-center shadow-inner">All caught up!</p> : inboxPosts.map(post => (
              <div key={post.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-bold text-slate-900">From: <span className="font-normal text-slate-600">{post.author?.full_name}</span></p>
                  <span className={getFlagBadge(post.flag_color)}>{post.status}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">{renderPostContentWithNote(post.content)}</div>
                {post.status !== 'pending' && <p className="text-xs text-green-600 font-bold">✅ Logged at: {new Date(post.created_at).toLocaleString()}</p>}
                {post.action_reason && <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded">Note: {post.action_reason}</p>}
                {post.status === 'pending' && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <input type="text" placeholder="Reason if rejecting/editing..." value={reasonMap[post.id] || ''} onChange={(e) => setReasonMap({...reasonMap, [post.id]: e.target.value})} className="w-full text-xs px-3 py-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleWorkflowAction(post.id, 'approved', 'green')} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">Approve</button>
                      <button onClick={() => handleWorkflowAction(post.id, 'disapproved', 'red')} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">Deny</button>
                      <button onClick={() => handleWorkflowAction(post.id, 'edit_requested', 'blue')} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">Request Edit</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* OUTBOX */}
          <div className="space-y-4">
            <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">📤 YOUR TRACKING LOG</h3>
            {outboxPosts.length === 0 ? <p className="text-sm text-slate-400 bg-white border rounded-xl p-6 text-center shadow-inner">No submissions logged.</p> : outboxPosts.map(post => (
              <div key={post.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                {post.status === 'edit_requested' ? (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-blue-600 uppercase">✏️ Revise Your Submission:</label>
                    <textarea value={editContentMap[post.id] !== undefined ? editContentMap[post.id] : post.content} onChange={(e) => setEditContentMap({...editContentMap, [post.id]: e.target.value})} className="w-full text-sm p-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 h-16" />
                    <button onClick={() => handleResubmitPost(post.id, editContentMap[post.id] || post.content)} className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow">🔄 Re-Submit</button>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">{renderPostContentWithNote(post.content)}</div>
                )}
                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-50">
                  <span className="text-slate-500">Reviewer: <strong>{post.tagged?.full_name}</strong></span>
                  <span className={getFlagBadge(post.flag_color)}>{post.status}</span>
                </div>
                {post.status !== 'pending' && <p className="text-xs text-blue-600 font-bold">⏱️ Handled on: {new Date(post.created_at).toLocaleString()}</p>}
                {post.action_reason && <p className="text-xs bg-purple-50 text-purple-700 p-2 rounded">Feedback: {post.action_reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}