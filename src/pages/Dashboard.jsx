import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Dashboard({ currentUser }) {
  const [content, setContent] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedTagUser, setSelectedTagUser] = useState('');
  
  // Dashboard states
  const [inboxPosts, setInboxPosts] = useState([]);
  const [outboxPosts, setOutboxPosts] = useState([]);
  const [loading, setLoading] = useState(true);
const [category, setCategory] = useState('');
const [amount, setAmount] = useState('');
const [customAmount, setCustomAmount] = useState('');
const [customCategory, setCustomCategory] = useState('');
const [note, setNote] = useState('');
const [showStatement, setShowStatement] = useState(false);
  // Edit Reason Modal State
  const [reasonMap, setReasonMap] = useState({});
const [editContentMap, setEditContentMap] = useState({}); // <-- Make sure this line is here!
  useEffect(() => {
    fetchUsers();
    fetchDashboardData();
  }, [currentUser]);

  // Fetch all profiles so the user can select who to tag
  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .neq('id', currentUser.id); // Don't allow tagging yourself
    if (data) setAllUsers(data);
  };

  // Fetch Inbox (tagged in) and Outbox (written by me)
  const fetchDashboardData = async () => {
    setLoading(true);
    
    // 1. Fetch Inbox (Posts where I am tagged)
    const { data: inbox } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(full_name)')
      .eq('tagged_member_id', currentUser.id)
      .order('created_at', { ascending: false });

    // 2. Fetch Outbox (Posts I wrote)
    const { data: outbox } = await supabase
      .from('posts')
      .select('*, tagged:profiles!posts_tagged_member_id_fkey(full_name)')
      .eq('author_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (inbox) setInboxPosts(inbox);
    if (outbox) setOutboxPosts(outbox);
    setLoading(false);
  };

  // Handle creating a new post
const handleCreatePost = async (e) => {
  e.preventDefault();
  if (!selectedTagUser) return alert('Please tag a member to review your writing.');
  
  // Resolve Category
  const finalCategory = category === 'custom' ? customCategory : category;
  if (!finalCategory) return alert('Please specify a category.');
  
  // Resolve Amount
  const finalAmount = amount === 'custom' ? customAmount : amount;
  if (!finalAmount) return alert('Please specify an amount.');

  // Storing structure: "Main Content || Optional Note"
  let structuredContent = `[${finalCategory.toUpperCase()}] Request Processing - Amount: $${finalAmount}`;
  if (note.trim()) {
    structuredContent += ` || NOTE: ${note.trim()}`;
  }

  const { data: postData, error: postError } = await supabase
    .from('posts')
    .insert({
      author_id: currentUser.id,
      tagged_member_id: selectedTagUser,
      content: structuredContent,
      status: 'pending',
      flag_color: 'none'
    })
    .select()
    .single();

  if (postError) return alert(postError.message);

  await supabase.from('audit_logs').insert({
    post_id: postData.id,
    action_taken: 'CREATED',
    performed_by: currentUser.id,
    notes: `Created structured workflow request for ${finalCategory}.`
  });

  alert('Workflow data submitted for verification!');
  setCategory('');
  setCustomCategory('');
  setAmount('');
  setCustomAmount('');
  setNote('');
  setSelectedTagUser('');
  fetchDashboardData();
};
    // Handle re-submitting an edited post back into the workflow
const handleResubmitPost = async (postId, updatedContent) => {
  if (!updatedContent || !updatedContent.trim()) {
    return alert('Content cannot be blank.');
  }

  const { error: updateError } = await supabase
    .from('posts')
    .update({
      content: updatedContent,
      status: 'pending',     // Reset to pending
      flag_color: 'none',    // Clear blue flag
      action_reason: null    // Clear out old reason note
    })
    .eq('id', postId);

  if (updateError) {
    return alert(updateError.message);
  }

  // Create an audit trail log
  await supabase.from('audit_logs').insert({
    post_id: postId,
    action_taken: 'RE-SUBMITTED',
    performed_by: currentUser.id,
    notes: 'Author revised content and re-submitted.'
  });

  alert('Revised post sent back for review!');
  fetchDashboardData(); // Refresh both columns
};
 const handleWorkflowAction = async (postId, status, flagColor) => {
  const reason = reasonMap[postId] || '';

  if ((status === 'disapproved' || status === 'edit_requested') && !reason.trim()) {
    alert('You must provide a reason for rejecting or requesting an edit.');
    return;
  }

  // 1. Update the Post Workflow state
  const { error: updateError } = await supabase
    .from('posts')
    .update({
      status: status,
      flag_color: flagColor,
      action_reason: reason
    })
    .eq('id', postId);

  if (updateError) return alert(updateError.message);

  // 2. NEW LOGIC: If APPROVED, parse the numerical value and update the Profile Total!
  if (status === 'approved') {
    // Find the current post item in our state array to read its content string
    const specificPost = inboxPosts.find(p => p.id === postId);
    
    if (specificPost) {
      // Regular Expression to pull the digits right after the dollar sign ($)
      const amountMatch = specificPost.content.match(/\$([0-9.]+)/);
      
      if (amountMatch && amountMatch[1]) {
        const extractedAmount = parseFloat(amountMatch[1]);

        // Get the current user's profile balance directly from Supabase
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('total_amount_claimed')
          .eq('id', currentUser.id)
          .single();

        const currentTotal = currentProfile?.total_amount_claimed || 0;
        const newTotal = Number(currentTotal) + extractedAmount;

        // Save the updated cumulative balance back to the database
        await supabase
          .from('profiles')
          .update({ total_amount_claimed: newTotal })
          .eq('id', currentUser.id);
          
        alert(`Approved! Added $${extractedAmount} to your total.`);
      }
    }
  }

  // 3. Create Audit Log entry
  await supabase.from('audit_logs').insert({
    post_id: postId,
    action_taken: status.toUpperCase(),
    performed_by: currentUser.id,
    notes: reason || 'Action approved.'
  });

  fetchDashboardData();
};

  const getFlagEmoji = (color) => {
    if (color === 'green') return '🟢 (Approved)';
    if (color === 'red') return '🔴 (Disapproved)';
    if (color === 'blue') return '🔵 (Edit Requested)';
    return '⏳ (Pending)';
  };
const renderPostContentWithNote = (fullContent) => {
  const parts = fullContent.split(' || ');
  const mainText = parts[0];
  const noteText = parts[1];

  return (
    <div>
      <p style={{ margin: 0, fontWeight: '500' }}>{mainText}</p>
      {noteText && (
        <p style={{ margin: '5px 0 0 0', padding: '6px 10px', background: '#fff7ed', color: '#ea580c', borderLeft: '3px solid #ea580c', borderRadius: '4px', fontSize: '13px' }}>
          💡 {noteText}
        </p>
      )}
    </div>
  );
};
  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* 1. WRITING FORM */}
<div style={{ background: '#f9f9f9', padding: '25px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ddd' }}>
  <h3 style={{ marginTop: 0 }}>📊 New Structured Workflow Submission</h3>
  <form onSubmit={handleCreatePost}>
    
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '15px' }}>
      
      {/* LEFT SIDE: CATEGORY DROPDOWN + CUSTOM INPUT */}
      <div>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Select Request Item:</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select 
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="">-- Choose Category --</option>
            <option value="Inventory Restock">📦 Inventory Restock</option>
            <option value="Expense Reimbursement">💰 Expense Reimbursement</option>
            <option value="Office Equipment purchase">💻 Office Equipment Purchase</option>
            <option value="Travel Allowance">✈️ Travel Allowance</option>
            <option value="custom">✍️ Add Custom Category...</option>
          </select>

          {category === 'custom' && (
            <input 
              type="text" 
              placeholder="Enter category name"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          )}
        </div>
      </div>

      {/* RIGHT SIDE: AMOUNT SELECTOR */}
      <div>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Specify Amount ($):</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select 
            value={amount} 
            onChange={(e) => setAmount(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="">-- Choose Amount --</option>
            <option value="100">$100</option>
            <option value="500">$500</option>
            <option value="1000">$1,000</option>
            <option value="5000">$5,000</option>
            <option value="custom">✍️ Type Custom Amount...</option>
          </select>

          {amount === 'custom' && (
            <input 
              type="text" 
              placeholder="Enter exact amount"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          )}
        </div>
      </div>
    </div>

    {/* NEW: OPTIONAL NOTE BOX */}
    <div style={{ marginBottom: '15px' }}>
      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Special Note (Optional):</label>
      <input 
        type="text" 
        placeholder="Add any specific context or comments here..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
      />
    </div>

    {/* SUBMISSION FOOTER */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: '15px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <label style={{ fontWeight: 'bold' }}>Assign Verifier:</label>
        <select 
          value={selectedTagUser} 
          onChange={(e) => setSelectedTagUser(e.target.value)}
          required
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">-- Choose Colleague --</option>
          {allUsers.map(user => (
            <option key={user.id} value={user.id}>{user.full_name}</option>
          ))}
        </select>
      </div>
      
      <button type="submit" style={{ padding: '10px 24px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
        🚀 Send into Workflow
      </button>
    </div>

  </form>
</div>
{/* PROFILE ACCOUNTING SUMMARY STATEMENT */}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', padding: '15px 20px', borderRadius: '6px', marginBottom: '30px', border: '1px solid #bfdbfe' }}>
  <div>
    <h4 style={{ margin: 0, color: '#1e40af' }}>💰 Your Active Financial Ledger</h4>
    <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#60a5fa', fontWeight: 'bold' }}>
      Running Total: ${inboxPosts.filter(p => p.status === 'approved').reduce((acc, p) => {
        const match = p.content.match(/\$([0-9.]+)/);
        return acc + (match ? parseFloat(match[1]) : 0);
      }, 0)}
    </p>
  </div>
  <button 
    onClick={() => setShowStatement(true)} 
    style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
  >
    🔍 View Detailed Statement
  </button>
</div>

      <hr style={{ margin: '40px 0', border: '0', borderTop: '1px solid #eee' }} />

      {/* 2. SPLIT LAYOUT FOR INBOX AND OUTBOX */}
      {loading ? <p>Updating ledger...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          
         {/* LEFT SIDE: INBOX (Action Needed by Me) */}
<div>
  <h3>📥 Action Needed By You</h3>
  {inboxPosts.length === 0 ? <p style={{ color: '#888' }}>All caught up!</p> : inboxPosts.map(post => (
    <div key={post.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '6px', marginBottom: '15px', background: post.flag_color === 'none' ? '#fff' : '#f5f5f5' }}>
      <p><strong>From:</strong> {post.author?.full_name}</p>
      <div style={{ background: '#f0f0f0', padding: '10px', borderRadius: '4px' }}>
  {renderPostContentWithNote(post.content)}
</div>
      <p><strong>Current Status:</strong> {getFlagEmoji(post.flag_color)}</p>
      
      {/* ADDED: Shows the action timestamp right here in the reviewer's inbox box once finalized */}
      {post.status !== 'pending' && (
        <p style={{ fontSize: '13px', color: '#16a34a', fontWeight: 'bold' }}>
          ✅ You logged this action on: {new Date().toLocaleString()}
        </p>
      )}

      {post.action_reason && <p style={{ color: 'gray', fontSize: '14px' }}><em>Reason given: {post.action_reason}</em></p>}
      
      {post.status === 'pending' && (
        <div style={{ marginTop: '10px' }}>
          <input 
            type="text" 
            placeholder="Type a reason if Disapproving or requesting Edit..." 
            value={reasonMap[post.id] || ''}
            onChange={(e) => setReasonMap({...reasonMap, [post.id]: e.target.value})}
            style={{ width: '100%', padding: '6px', marginBottom: '8px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleWorkflowAction(post.id, 'approved', 'green')} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>🟢 Approve</button>
            <button onClick={() => handleWorkflowAction(post.id, 'disapproved', 'red')} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>🔴 Disapprove</button>
            <button onClick={() => handleWorkflowAction(post.id, 'edit_requested', 'blue')} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>🔵 Request Edit</button>
          </div>
        </div>
      )}
    </div>
  ))}
</div>

  {/* RIGHT SIDE: OUTBOX (Tracking things I wrote) */}
<div>
  <h3>📤 Your Tracking Log</h3>
  {outboxPosts.length === 0 ? <p style={{ color: '#888' }}>You haven't posted anything yet.</p> : outboxPosts.map(post => (
    <div key={post.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
      
      {/* If the post is flagged for edit, show an active textbox. Otherwise, show flat text. */}
     {post.status === 'edit_requested' ? (
  <div>
    <label style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 'bold' }}>✏️ Revise Your Writing:</label>
    <textarea
      value={editContentMap[post.id] !== undefined ? editContentMap[post.id] : post.content}
      onChange={(e) => setEditContentMap({...editContentMap, [post.id]: e.target.value})}
      style={{ width: '100%', height: '70px', padding: '8px', marginTop: '5px', boxSizing: 'border-box', display: 'block' }}
    />
    <button 
      onClick={() => handleResubmitPost(post.id, editContentMap[post.id] || post.content)}
      style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '4px', marginTop: '8px', cursor: 'pointer', fontWeight: 'bold' }}
    >
      🔄 Re-Submit for Review
    </button>
  </div>
) : (
  <div style={{ background: '#f0f0f0', padding: '10px', borderRadius: '4px' }}>
  {renderPostContentWithNote(post.content)}
</div>
)}

      <p style={{ marginTop: '10px' }}><strong>Reviewer:</strong> {post.tagged?.full_name}</p>
      <p><strong>Status Marker:</strong> {getFlagEmoji(post.flag_color)}</p>
      
      {post.status !== 'pending' && (
        <p style={{ fontSize: '13px', color: '#2563eb', fontWeight: 'bold' }}>
          ⏱️ Action Logged on: {new Date(post.created_at).toLocaleString()} 
        </p>
      )}

      {post.action_reason && (
        <p style={{ color: '#d946ef', fontSize: '14px', background: '#fdf4ff', padding: '6px', borderRadius: '4px' }}>
          <strong>Feedback note from reviewer:</strong> {post.action_reason}
        </p>
      )}
      <p style={{ fontSize: '11px', color: '#aaa' }}>Submitted: {new Date(post.created_at).toLocaleString()}</p>
    </div>
  ))}
</div>

        </div>
      )}
      {/* THE DETAILED STATEMENT POPUP MODAL */}
{showStatement && (
  <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
    <div style={{ background: 'white', padding: '30px', borderRadius: '8px', width: '80%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
        <h2 style={{ margin: 0, color: '#111827' }}>📋 Itemized Transaction Statement</h2>
        <button 
          onClick={() => setShowStatement(false)} 
          style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Close [X]
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
            <th style={{ padding: '12px' }}>Original Author</th>
            <th style={{ padding: '12px' }}>Request Type / Content</th>
            <th style={{ padding: '12px' }}>Amount</th>
            <th style={{ padding: '12px' }}>Finalized Date & Time</th>
          </tr>
        </thead>
        <tbody>
          {inboxPosts.filter(p => p.status === 'approved').length === 0 ? (
            <tr>
              <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No approved logs associated with your profile yet.</td>
            </tr>
          ) : (
            inboxPosts.filter(p => p.status === 'approved').map((post, index) => {
              // Extract values dynamically for itemization rows
              const match = post.content.match(/\$([0-9.]+)/);
              const dollarVal = match ? `$${match[1]}` : '$0';
              
              // Remove the amount text component from display string to leave pure clean category text
              const pureText = post.content.split(' - Amount:')[0];

              return (
                <tr key={post.id} style={{ borderBottom: '1px solid #e5e7eb', background: index % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{post.author?.full_name}</td>
                  <td style={{ padding: '12px', color: '#4b5563' }}>{pureText}</td>
                  <td style={{ padding: '12px', color: '#16a34a', fontWeight: 'bold' }}>{dollarVal}</td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>
                    {new Date(post.created_at).toLocaleString()}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* FOOTER CALCULATION TOTAL BLOCK */}
      <div style={{ marginTop: '20px', textAlign: 'right', padding: '15px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
          Cumulative Ledger Sum: ${inboxPosts.filter(p => p.status === 'approved').reduce((acc, p) => {
            const match = p.content.match(/\$([0-9.]+)/);
            return acc + (match ? parseFloat(match[1]) : 0);
          }, 0)}
        </span>
      </div>

    </div>
  </div>
)}
    </div>
    
  );
}