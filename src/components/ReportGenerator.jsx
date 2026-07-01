import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
export default function ReportGenerator() {
  const [profiles, setProfiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [targetEntity, setTargetEntity] = useState({ id: 'COMPANY', name: '🏢 Master Company Treasury' });
  const dropdownRef = useRef(null);
  const [timeframe, setTimeframe] = useState('1_MONTH'); 
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [reportMetadata, setReportMetadata] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchProfiles();
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true });
    if (data) setProfiles(data);
  };

  const filteredProfiles = profiles.filter(p => p.full_name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleGeneratePreview = async () => {
    setIsLoadingPreview(true);
    setPreviewData(null);
    setReportMetadata(null);

    try {
      let startDate = null;
      let endDate = null;
      let dateString = "All Time History";
      const now = new Date();

      if (timeframe !== 'ALL') {
        if (timeframe === 'CUSTOM') {
          if (!customFrom || !customTo) return toast.success("Please select both From and To dates.");
          startDate = new Date(customFrom);
          endDate = new Date(customTo);
          endDate.setHours(23, 59, 59, 999);
          dateString = `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
        } else {
          startDate = new Date();
          if (timeframe === '1_WEEK') startDate.setDate(now.getDate() - 7);
          if (timeframe === '1_MONTH') startDate.setMonth(now.getMonth() - 1);
          if (timeframe === '6_MONTHS') startDate.setMonth(now.getMonth() - 6);
          if (timeframe === '1_YEAR') startDate.setFullYear(now.getFullYear() - 1);
          dateString = `Past ${timeframe.replace('_', ' ').toLowerCase()}`;
        }
      }

      let rawData = [];
      let totalIn = 0;
      let totalOut = 0;

      if (targetEntity.id === 'COMPANY') {
        let query = supabase.from('audit_logs').select('*').eq('action_taken', 'ADMIN_TREASURY_ADJUST').order('action_timestamp', { ascending: false });
        if (startDate) query = query.gte('action_timestamp', startDate.toISOString());
        if (endDate) query = query.lte('action_timestamp', endDate.toISOString());
        
        const { data } = await query;
        rawData = (data || []).map(log => {
          const parts = (log.notes || '').split('||');
          const amount = Number(parts[1] || log.delta_amount || 0);
          if (amount > 0) totalIn += amount; else totalOut += Math.abs(amount);
          return {
            date: new Date(log.action_timestamp).toLocaleDateString(),
            description: String(parts[3] || log.notes || 'Treasury Adjustment').replace(' [DEACTIVATED RECORD]', '').trim(),
            source: 'Master Admin',
            amount: amount,
            balance: Number(parts[2] || log.new_amount || 0)
          };
        });
      } else {
        let query = supabase.from('member_wallet_logs').select('*').eq('member_id', targetEntity.id).order('action_timestamp', { ascending: false });
        if (startDate) query = query.gte('action_timestamp', startDate.toISOString());
        if (endDate) query = query.lte('action_timestamp', endDate.toISOString());
        
        const { data: walletLogs } = await query;
        const postIds = (walletLogs || []).map(l => l.post_id).filter(Boolean);
        let postsMap = {};
        
        if (postIds.length > 0) {
          const { data: posts } = await supabase.from('posts').select('id, tagged_member_id').in('id', postIds);
          (posts || []).forEach(p => {
            const verifier = profiles.find(prof => prof.id === p.tagged_member_id);
            postsMap[p.id] = verifier ? verifier.full_name : 'Admin Override';
          });
        }

        rawData = (walletLogs || []).map(log => {
          const amount = Number(log.delta_amount || 0);
          if (amount > 0) totalIn += amount; else totalOut += Math.abs(amount);
          return {
            date: new Date(log.action_timestamp).toLocaleDateString(),
            description: log.notes || 'Workflow Approved',
            source: postsMap[log.post_id] || (log.notes?.includes('Admin') ? 'Super Admin' : 'System'),
            amount: amount,
            balance: Number(log.new_amount || 0)
          };
        });
      }

      setPreviewData(rawData);
      setReportMetadata({
        title: targetEntity.id === 'COMPANY' ? 'Company Master Treasury Report' : `Member Ledger: ${targetEntity.name.replace('👤 ', '')}`,
        dateString, totalIn, totalOut, netChange: totalIn - totalOut
      });

    } catch (error) {
      console.error(error);
      toast.success('Failed to generate preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExportCSV = () => {
    if (!previewData || previewData.length === 0) return toast.success('No data to export.');
    setIsExporting(true);
    const headers = ['Date', 'Description', 'Source/Approver', 'Amount ($)', 'Balance ($)'];
    const csvRows = [headers.join(',')];

    previewData.forEach(row => {
      const safeDescription = `"${row.description.replace(/"/g, '""')}"`;
      csvRows.push(`${row.date},${safeDescription},${row.source},${row.amount},${row.balance}`);
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${reportMetadata.title.replace(/ /g, '_')}_${new Date().toLocaleDateString()}.csv`;
    link.click();
    setIsExporting(false);
  };

  const handleExportPDF = () => {
    if (!previewData || previewData.length === 0) return toast.success('No data to export.');
    setIsExporting(true);
    
    try {
      const doc = new jsPDF();
      
      // 🛡️ TEXT SANITIZER: Removes emojis and unsupported PDF characters to prevent the "Ø=Üd" bug
      const cleanText = (str) => {
        if (!str) return '';
        return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").trim();
      };

      const safeTitle = cleanText(reportMetadata.title);
      
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text(safeTitle, 14, 20);
      
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
      doc.text(`Timeframe: ${reportMetadata.dateString}`, 14, 33);
      
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Approved/Added: $${reportMetadata.totalIn.toLocaleString()}`, 14, 43);
      doc.text(`Total Deducted/Voided: -$${reportMetadata.totalOut.toLocaleString()}`, 14, 48);
      doc.setFont(undefined, 'bold');
      doc.text(`Net Period Change: $${reportMetadata.netChange.toLocaleString()}`, 14, 53);
      doc.setFont(undefined, 'normal');

      autoTable(doc, {
        startY: 60,
        head: [["Date", "Description", "Source/Approver", "Amount ($)", "Balance ($)"]],
        body: previewData.map(row => [
          cleanText(row.date),
          cleanText(row.description),
          cleanText(row.source),
          `${row.amount >= 0 ? '+' : ''}$${row.amount.toLocaleString()}`,
          `$${row.balance.toLocaleString()}`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 8, cellPadding: 4 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } }
      });

      doc.save(`${safeTitle.replace(/ /g, '_')}_${new Date().toLocaleDateString()}.pdf`);
    } catch (error) {
      console.error(error);
      toast.success('PDF generation failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="border-b border-slate-100 pb-4 mb-6">
          <h2 className="text-xl font-black text-slate-900">🖨️ Report Configuration</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
          <div className="relative z-20" ref={dropdownRef}>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">1. Search Target Ledger</label>
            <div 
              className="bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 flex justify-between items-center cursor-pointer hover:border-blue-400"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span className="text-sm font-bold text-slate-700 truncate">{targetEntity.name}</span>
              <span className="text-slate-400 text-xs">▼</span>
            </div>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden max-h-72 flex flex-col">
                <div className="p-2 border-b border-slate-100 bg-slate-50">
                  <input type="text" placeholder="Search by name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full text-sm p-2 border rounded-md focus:ring-2 focus:ring-blue-500" autoFocus />
                </div>
                <div className="overflow-y-auto p-2">
                  <div className="p-2 hover:bg-blue-50 cursor-pointer rounded-md text-sm font-bold text-slate-700 mb-1" onClick={() => { setTargetEntity({ id: 'COMPANY', name: '🏢 Master Company Treasury' }); setIsDropdownOpen(false); }}>
                    🏢 Master Company Treasury
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase ml-2 mb-1 mt-2">Individual Members</div>
                  {filteredProfiles.map(p => (
                    <div key={p.id} className="p-2 hover:bg-blue-50 cursor-pointer rounded-md text-sm text-slate-600" onClick={() => { setTargetEntity({ id: p.id, name: `👤 ${p.full_name}` }); setIsDropdownOpen(false); }}>
                      {p.full_name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">2. Select Timeframe</label>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500">
              <option value="1_WEEK">Past 1 Week</option>
              <option value="1_MONTH">Past 1 Month</option>
              <option value="6_MONTHS">Past 6 Months</option>
              <option value="1_YEAR">Past 1 Year</option>
              <option value="ALL">All Time History</option>
              <option value="CUSTOM">📅 Custom Date Range...</option>
            </select>
          </div>

          {timeframe === 'CUSTOM' ? (
            <div className="flex gap-2">
              <div className="w-1/2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">From</label>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-xs" />
              </div>
              <div className="w-1/2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To</label>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-xs" />
              </div>
            </div>
          ) : (
            <div>
              <button onClick={handleGeneratePreview} disabled={isLoadingPreview} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-2.5 rounded-lg shadow-md">
                {isLoadingPreview ? 'Scanning...' : 'Generate Data Preview'}
              </button>
            </div>
          )}
        </div>
      </div>

      {previewData && reportMetadata && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-slate-900 p-6 text-white flex justify-between items-end gap-4">
            <div>
              <h3 className="text-xl font-black">{reportMetadata.title}</h3>
              <p className="text-sm text-slate-400">🗓️ {reportMetadata.dateString}</p>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-500 font-semibold text-[11px] uppercase">
                <tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Source</th><th className="p-3 text-right">Adj.</th><th className="p-3 text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewData.map((row, idx) => (
                  <tr key={idx}><td className="p-3 text-slate-500 text-[11px]">{row.date}</td><td className="p-3 font-medium text-slate-800">{row.description}</td><td className="p-3 text-xs text-blue-600 font-semibold">{row.source}</td><td className="p-3 text-right font-mono">${row.amount.toLocaleString()}</td><td className="p-3 text-right font-mono font-black">${row.balance.toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-50 border-t p-4 flex justify-end gap-3">
            <button onClick={handleExportCSV} className="bg-white border text-slate-700 font-bold px-6 py-2 rounded-lg">📊 Export as CSV</button>
            <button onClick={handleExportPDF} className="bg-red-600 text-white font-black px-6 py-2 rounded-lg">📄 Download PDF</button>
          </div>
        </div>
      )}
    </div>
  );
}