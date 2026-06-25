import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function WalletProfile({ currentUser }) {
  const [approvedTransactions, setApprovedTransactions] = useState([]);
  const [treasury, setTreasury] = useState({ total_initial_budget: 0 });
  const [companyTotalApproved, setCompanyTotalApproved] = useState(0);
  
  // Tracking metadata for the cards
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState(null);
  const [lastGlobalUser, setLastGlobalUser] = useState(null);
  const [lastGlobalUserAvatar, setLastGlobalUserAvatar] = useState(null);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinancialData();
  }, [currentUser]);

  const fetchFinancialData = async () => {
    setLoading(true);

    // 1. Fetch Company Master Treasury Pool
    const { data: treasuryData } = await supabase
      .from('company_treasury')
      .select('total_initial_budget')
      .eq('id', 1)
      .single();
    if (treasuryData) setTreasury(treasuryData);

    // 2. Fetch ALL Approved items across the company + join with user profile for pictures
    const { data: allApproved } = await supabase
      .from('posts')
      .select(`
        content, 
        created_at,
        tagged:profiles!posts_tagged_member_id_fkey(full_name, avatar_url)
      `)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    let globalSum = 0;
    if (allApproved && allApproved.length > 0) {
      allApproved.forEach(p => {
        const match = p.content.match(/\$([0-9.]+)/);
        if (match) globalSum += parseFloat(match[1]);
      });
      
      // Extract data for the absolute latest claim made in the company
      const latestClaim = allApproved[0];
      setLastGlobalUpdate(new Date(latestClaim.created_at).toLocaleString());
      setLastGlobalUser(latestClaim.tagged?.full_name || 'System Member');
      setLastGlobalUserAvatar(latestClaim.tagged?.avatar_url || 'https://via.placeholder.com/150');
    }
    setCompanyTotalApproved(globalSum);

    // 3. Fetch specific history ledger rows for THIS logged-in user
    const { data: myLedger } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(full_name)')
      .eq('tagged_member_id', currentUser.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (myLedger) setApprovedTransactions(myLedger);
    setLoading(false);
  };

  // Calculations
  const companyInitial = Number(treasury?.total_initial_budget || 0);
  const remainingCompanyBudget = companyInitial - companyTotalApproved;

  const userTotalApproved = approvedTransactions.reduce((acc, p) => {
    const match = p.content.match(/\$([0-9.]+)/);
    return acc + (match ? parseFloat(match[1]) : 0);
  }, 0);

  const latestUserTx = approvedTransactions[0];
  const latestUserTxAmount = latestUserTx ? (latestUserTx.content.match(/\$([0-9.]+)/)?.[1] || 0) : 0;

  if (loading) return <div style={{ padding: '30px' }}>Loading Financial Data Ledger...</div>;

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* SECTION 1: GLOBAL COMPANY TREASURY MASTER HUD */}
      <h2 style={{ borderBottom: '2px solid #333', paddingBottom: '10px' }}>🏦 Organization Financial Treasury</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        
        {/* TOTAL COMPANY FUNDS CARD */}
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '20px', borderRadius: '6px' }}>
          <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '13px' }}>TOTAL COMPANY FUNDS</span>
          <h2 style={{ margin: '5px 0 0 0', color: '#0f172a' }}>${companyInitial.toLocaleString()}</h2>
          <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>
            📅 Last Configuration Update: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* TOTAL ACCUMULATED CLAIMS CARD (WITH USER PIC + TIME) */}
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '20px', borderRadius: '6px' }}>
          <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '13px' }}>TOTAL ACCUMULATED CLAIMS</span>
          <h2 style={{ margin: '5px 0 0 0', color: '#991b1b' }}>-${companyTotalApproved.toLocaleString()}</h2>
          
          {lastGlobalUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', borderTop: '1px dashed #fca5a5', paddingTop: '8px' }}>
              <img 
                src={lastGlobalUserAvatar} 
                alt="Profile" 
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', background: '#ccc' }} 
              />
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#7f1d1d' }}>Last Claim by: {lastGlobalUser}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#b91c1c' }}>⏱️ {lastGlobalUpdate}</p>
              </div>
            </div>
          ) : (
            <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#fca5a5' }}>No transactions logged yet</p>
          )}
        </div>

        {/* REMAINING COMPANY AMOUNT CARD */}
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '20px', borderRadius: '6px' }}>
          <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '13px' }}>REMAINING COMPANY AMOUNT</span>
          <h2 style={{ margin: '5px 0 0 0', color: '#166534' }}>${remainingCompanyBudget.toLocaleString()}</h2>
          <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#15803d', fontWeight: 'bold' }}>
            🔄 Calculated Real-time: {new Date().toLocaleDateString()} - {new Date().toLocaleTimeString()}
          </p>
        </div>

      </div>

      {/* SECTION 2: USER METRIC ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '4px' }}>
        
        <div style={{ background: '#eff6ff', padding: '20px', borderRadius: '6px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0, color: '#1e40af' }}>👤 Your Total Wallet Balance</h4>
            <span style={{ fontSize: '12px', color: '#60a5fa' }}>All combined approved workflows</span>
          </div>
          <h2 style={{ margin: 0, color: '#1d4ed8' }}>${userTotalApproved.toLocaleString()}</h2>
        </div>

        <div style={{ background: '#faf5ff', padding: '20px', borderRadius: '6px', border: '1px solid #e9d5ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0, color: '#6b21a8' }}>⏱️ Your Last Transaction</h4>
            <span style={{ fontSize: '11px', color: '#a855f7' }}>
              {latestUserTx ? `Executed: ${new Date(latestUserTx.created_at).toLocaleString()}` : 'No activity logged'}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, color: '#7e22ce' }}>
              {latestUserTx ? `+$${parseFloat(latestUserTxAmount).toLocaleString()}` : '$0'}
            </h2>
            <span style={{ fontSize: '11px', color: '#a855f7' }}>Remaining Comp: ${remainingCompanyBudget.toLocaleString()}</span>
          </div>
        </div>

      </div>

      {/* SECTION 3: TRANSACTION LOG HISTORY TABLE */}
      <h3 style={{ marginTop: '40px', marginBottom: '15px' }}>📋 Personal Itemized Transaction Log</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'white', border: '1px solid #e5e7eb' }}>
        <thead>
          <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
            <th style={{ padding: '12px' }}>Request Creator</th>
            <th style={{ padding: '12px' }}>Operational Action Description</th>
            <th style={{ padding: '12px' }}>Claim Value</th>
            <th style={{ padding: '12px' }}>Execution Date & Time</th>
          </tr>
        </thead>
        <tbody>
          {approvedTransactions.map((post, idx) => {
            const match = post.content.match(/\$([0-9.]+)/);
            const valString = match ? `$${parseFloat(match[1]).toLocaleString()}` : '$0';
            const labelText = post.content.split(' - Amount:')[0];

            return (
              <tr key={post.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{post.author?.full_name}</td>
                <td style={{ padding: '12px' }}>{labelText}</td>
                <td style={{ padding: '12px', color: '#16a34a', fontWeight: 'bold' }}>{valString}</td>
                <td style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
                  🗓️ {new Date(post.created_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

    </div>
  );
}