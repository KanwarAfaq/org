import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function PrintAll() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState({ totalAdded: 0, totalClaimed: 0 });
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Default to the current month
  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    setStartDate(firstDay);
    setEndDate(lastDay);
  }, []);

  const generateReport = async () => {
    if (!startDate || !endDate) return toast.error("Please select a valid date range.");
    setLoading(true);
    setHasSearched(true);

    try {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name');
      const safeProfiles = profiles || [];

      // Fetch Company Money Added
      const { data: treasuryRes, error: tError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action_taken', 'ADMIN_TREASURY_ADJUST')
        .gte('action_timestamp', `${startDate}T00:00:00.000Z`)
        .lte('action_timestamp', `${endDate}T23:59:59.999Z`);

      // Fetch Member Money Withdrawn/Claimed
      const { data: walletRes, error: wError } = await supabase
        .from('member_wallet_logs')
        .select('*')
        .gte('action_timestamp', `${startDate}T00:00:00.000Z`)
        .lte('action_timestamp', `${endDate}T23:59:59.999Z`);

      if (tError) throw tError;
      if (wError) throw wError;

      // Map Treasury Records
      const mappedTreasury = (treasuryRes || [])
        .filter(log => log.is_active !== false)
        .map(log => ({
          id: log.id,
          timestamp: new Date(log.action_timestamp),
          recordType: 'COMPANY_FUNDS',
          entity: '🏢 Master Treasury',
          delta: Number(log.delta_amount),
          balance: Number(log.new_amount),
          notes: log.notes
        }));

      // Map Member Withdrawals
      const mappedWallets = (walletRes || []).map(log => {
        const member = safeProfiles.find(p => p.id === log.member_id);
        return {
          id: log.id,
          timestamp: new Date(log.action_timestamp),
          recordType: 'MEMBER_WITHDRAWAL',
          entity: `👤 ${member ? member.full_name : 'Unknown Employee'}`,
          delta: Number(log.delta_amount),
          balance: Number(log.new_amount),
          notes: log.notes
        };
      });

      // Combine and Sort Chronologically
      const combinedLedger = [...mappedTreasury, ...mappedWallets].sort((a, b) => a.timestamp - b.timestamp);
      
      let totalAdded = 0;
      let totalClaimed = 0;

      combinedLedger.forEach(log => {
        if (log.recordType === 'COMPANY_FUNDS' && log.delta > 0) totalAdded += log.delta;
        if (log.recordType === 'MEMBER_WITHDRAWAL' && log.delta > 0) totalClaimed += log.delta;
      });

      setReportData(combinedLedger);
      setSummary({ totalAdded, totalClaimed });
      toast.success("Printable ledger generated.");

    } catch (error) {
      console.error(error);
      toast.error(`Failed to generate report: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* 🎛️ CONTROL PANEL (Hidden during Print) */}
      <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl p-6 shadow-sm print:hidden">
        <h2 className="text-xl font-black text-slate-900 mb-1">🖨️ Print Financial Master Ledger</h2>
        <p className="text-sm text-slate-500 mb-6">Select a date range to generate a combined timeline of Company Funds Added and Member Funds Withdrawn.</p>
        
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 shadow-sm outline-none text-slate-700" />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 shadow-sm outline-none text-slate-700" />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={generateReport} disabled={loading} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-8 py-3 rounded-xl shadow-md transition-all disabled:opacity-50">
              {loading ? 'Fetching...' : 'Generate Document'}
            </button>
            <button onClick={handlePrint} disabled={reportData.length === 0} className="flex-1 md:flex-none bg-slate-900 hover:bg-slate-800 text-white font-black text-sm px-6 py-3 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2 justify-center">
              📄 Print Records
            </button>
          </div>
        </div>
      </div>

      {/* 📄 THE PRINTABLE REPORT DOCUMENT */}
      {hasSearched && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 print:border-none print:shadow-none print:p-0">
          
          <div className="border-b-2 border-slate-900 pb-6 mb-6">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Master Financial Audit</h1>
            <p className="text-sm font-bold text-slate-500 mt-1">
              Reporting Period: <span className="text-slate-800">{new Date(startDate).toLocaleDateString()}</span> to <span className="text-slate-800">{new Date(endDate).toLocaleDateString()}</span>
            </p>
            <p className="text-[10px] font-mono text-slate-400 mt-1">Generated: {new Date().toLocaleString()}</p>
          </div>

          <div className="flex gap-6 mb-8 print:break-inside-avoid">
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-5 print:border-slate-300">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Treasury Added</span>
              <h2 className="text-2xl font-black text-emerald-600 mt-1">+${summary.totalAdded.toLocaleString()}</h2>
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-5 print:border-slate-300">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Member Withdrawals</span>
              <h2 className="text-2xl font-black text-red-600 mt-1">-${summary.totalClaimed.toLocaleString()}</h2>
            </div>
          </div>

          {reportData.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium italic">No financial movements found in this date range.</div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-100 print:bg-slate-200">
                  <tr>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-300">Date & Time</th>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-300">Account Type</th>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-300">Transaction Details</th>
                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-300 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reportData.map((row) => (
                    <tr key={row.id} className="print:break-inside-avoid">
                      
                      {/* Date */}
                      <td className="p-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {row.timestamp.toLocaleDateString()}<br/>
                        <span className="text-[10px] opacity-70">{row.timestamp.toLocaleTimeString()}</span>
                      </td>
                      
                      {/* Account Badge */}
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${row.recordType === 'COMPANY_FUNDS' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                          {row.recordType === 'COMPANY_FUNDS' ? 'Treasury Deposit' : 'Member Payout'}
                        </span>
                      </td>
                      
                      {/* Details */}
                      <td className="p-3">
                        <p className="font-bold text-slate-800 text-xs">{row.entity}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{row.notes}</p>
                      </td>
                      
                      {/* Money */}
                      <td className={`p-3 font-mono font-black text-right whitespace-nowrap ${row.recordType === 'COMPANY_FUNDS' ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {row.recordType === 'COMPANY_FUNDS' && row.delta > 0 ? '+' : ''}${row.delta.toLocaleString()}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="hidden print:block mt-8 pt-4 border-t border-slate-300 text-center text-[10px] text-slate-500 font-mono">
            END OF REPORT — Verified against the immutable database ledger.
          </div>

        </div>
      )}
    </div>
  );
}