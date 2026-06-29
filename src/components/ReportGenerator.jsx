import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ReportGenerator() {
  const [profiles, setProfiles] = useState([]);
  const [targetEntity, setTargetEntity] = useState('COMPANY');
  const [timeframe, setTimeframe] = useState('1');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true });
    if (data) setProfiles(data);
  };

  const fetchReportData = async () => {
    let dateFilter = null;
    if (timeframe !== 'ALL') {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(timeframe));
      dateFilter = cutoffDate.toISOString();
    }

    let rawData = [];
    let reportTitle = '';

    if (targetEntity === 'COMPANY') {
      reportTitle = 'Company Master Treasury Report';
      let query = supabase.from('audit_logs').select('*').eq('action_taken', 'ADMIN_TREASURY_ADJUST').order('action_timestamp', { ascending: false });
      if (dateFilter) query = query.gte('action_timestamp', dateFilter);
      
      const { data } = await query;
      rawData = (data || []).map(log => ({
        date: new Date(log.action_timestamp).toLocaleDateString(),
        description: log.notes || 'Treasury Adjustment',
        amount: Number(log.delta_amount || 0),
        balance: Number(log.new_amount || 0),
        status: 'EXECUTED'
      }));
    } else {
      const selectedUser = profiles.find(p => p.id === targetEntity);
      reportTitle = `Member Financial Ledger: ${selectedUser?.full_name || 'Unknown'}`;
      
      let query = supabase.from('member_wallet_logs').select('*').eq('member_id', targetEntity).order('action_timestamp', { ascending: false });
      if (dateFilter) query = query.gte('action_timestamp', dateFilter);
      
      const { data } = await query;
      rawData = (data || []).map(log => ({
        date: new Date(log.action_timestamp).toLocaleDateString(),
        description: log.notes || 'Workflow Approved',
        amount: Number(log.delta_amount || 0),
        balance: Number(log.new_amount || 0),
        status: 'EXECUTED'
      }));
    }
    return { rawData, reportTitle };
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const { rawData, reportTitle } = await fetchReportData();
      if (rawData.length === 0) return alert('No data found for this period.');

      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text(reportTitle, 14, 22);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
      
      // Call autoTable as a function, passing doc as the first argument
      autoTable(doc, {
        startY: 40,
        head: [["Date", "Description", "Adjustment ($)", "Balance ($)", "Status"]],
        body: rawData.map(row => [
          row.date,
          row.description,
          `${row.amount >= 0 ? '+' : ''}$${row.amount.toLocaleString()}`,
          `$${row.balance.toLocaleString()}`,
          row.status
        ]),
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9, cellPadding: 4 }
      });

      doc.save(`${reportTitle.replace(/ /g, '_')}_${new Date().toLocaleDateString()}.pdf`);
    } catch (error) {
      console.error("PDF Engine Error:", error);
      alert(`PDF generation failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-xl font-black text-slate-900">🖨️ PDF & CSV Export Engine</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
        <div className="space-y-4">
          <select value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} className="w-full bg-white border p-3 rounded-lg">
            <option value="COMPANY">🏢 Master Company Treasury</option>
            {profiles.map(p => <option key={p.id} value={p.id}>👤 {p.full_name}</option>)}
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="w-full bg-white border p-3 rounded-lg">
            <option value="1">Past 1 Month</option>
            <option value="ALL">All Time History</option>
          </select>
        </div>
        <button onClick={handleExportPDF} className="w-full bg-red-600 text-white font-black p-4 rounded-xl shadow-lg transition-transform hover:scale-[1.02]">
          {isExporting ? 'Generating...' : 'Download PDF Statement'}
        </button>
      </div>
    </div>
  );
}