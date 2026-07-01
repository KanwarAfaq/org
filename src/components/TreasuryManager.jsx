import { useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
export default function TreasuryManager({
  currentTreasuryPool,
  treasuryHistoryLogs = [],
  currentUser,
  fetchAdminData,
}) {
  const [treasuryAdjustment, setTreasuryAdjustment] = useState('');
  const [treasuryNote, setTreasuryNote] = useState('');
  const [editingLogId, setEditingLogId] = useState(null);
  const [editedNoteText, setEditedNoteText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const safeRefresh = async () => {
    if (typeof fetchAdminData === 'function') await fetchAdminData();
  };

  const syncCompanyTreasuryTable = async (nextPoolTotal) => {
    const { error } = await supabase
      .from('company_treasury')
      .update({ total_initial_budget: Number(nextPoolTotal || 0), updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) console.warn('Failed to update company_treasury baseline row:', error.message);
  };

  const handleUpdateTreasury = async (e) => {
    e.preventDefault();
    if (isProcessing) return;

    const inputDelta = Number(treasuryAdjustment);
    if (Number.isNaN(inputDelta)) return toast.success('Please enter a valid numeric value.');
    if (!treasuryNote.trim()) return toast.success('Please enter a treasury note.');

    setIsProcessing(true);

    try {
      const nextCalculatedPoolSum = currentTreasuryPool + inputDelta;

      // 1. Explicitly write to the new financial columns
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          id: crypto.randomUUID(),
          post_id: null,
          action_taken: 'ADMIN_TREASURY_ADJUST',
          performed_by: currentUser?.id || null,
          notes: treasuryNote.trim(), // Clean string only
          prev_amount: currentTreasuryPool,
          delta_amount: inputDelta,
          new_amount: nextCalculatedPoolSum,
          is_active: true,
          action_timestamp: new Date().toISOString()
        });

      if (error) throw error;

      // 2. Synchronize the master table
      await syncCompanyTreasuryTable(nextCalculatedPoolSum);

      setTreasuryAdjustment('');
      setTreasuryNote('');
      await safeRefresh();
      toast.success('Treasury entry added successfully.');
    } catch (err) {
      console.error('Treasury insert error:', err);
      toast.success(`Treasury update failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleTreasuryState = async (log) => {
    if (isProcessing) return;

    const isCurrentlyActive = log.is_active;
    const confirmation = window.confirm(
      isCurrentlyActive
        ? 'Are you sure you want to deactivate this entry? This will subtract its value from the total balance.'
        : 'Are you sure you want to reactivate this entry? This will restore its value to the total balance.'
    );
    if (!confirmation) return;

    setIsProcessing(true);

    try {
      const targetDeltaVal = Number(log.delta_amount || 0);
      const nextCalculatedPoolSum = isCurrentlyActive
        ? currentTreasuryPool - targetDeltaVal
        : currentTreasuryPool + targetDeltaVal;

      // Update the boolean state rather than string hacking
      const { error } = await supabase
        .from('audit_logs')
        .update({ is_active: !isCurrentlyActive, action_timestamp: new Date().toISOString() })
        .eq('id', log.id);

      if (error) throw error;

      await syncCompanyTreasuryTable(nextCalculatedPoolSum);
      await safeRefresh();
      toast.success(isCurrentlyActive ? 'Treasury row deactivated.' : 'Treasury row activated.');
    } catch (err) {
      console.error('Treasury state toggle error:', err);
      toast.success(`Treasury status update failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEditedTreasuryRow = async (log) => {
    if (isProcessing) return;
    if (!editedNoteText.trim()) return toast.success('Note description cannot be left blank.');

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('audit_logs')
        .update({ 
          notes: `${editedNoteText.trim()} (Edited ${new Date().toLocaleDateString()})`, 
          action_timestamp: new Date().toISOString() 
        })
        .eq('id', log.id);

      if (error) throw error;

      setEditingLogId(null);
      setEditedNoteText('');
      await safeRefresh();
      toast.success('Note updated successfully.');
    } catch (err) {
      toast.success(`Update failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">💰 Corporate Treasury Allocation Console</h2>
          <p className="text-sm text-slate-500 mt-1">Full ledger view processing real-time tracking queues.</p>
        </div>
        <div className="text-right bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono shadow-inner">
          <span className="text-[10px] block uppercase text-slate-400 font-bold">Live Vault Balance</span>
          <span className="text-xl font-black text-slate-900">${Number(currentTreasuryPool || 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {treasuryHistoryLogs.map((log) => {
          // Read from exact database columns
          const prevAmount = Number(log.prev_amount || 0).toLocaleString();
          const deltaAmount = Number(log.delta_amount || 0);
          const totalCompiled = Number(log.new_amount || 0).toLocaleString();
          const isDeactivated = !log.is_active;
          const logDateTimeStr = log.action_timestamp
            ? new Date(log.action_timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
            : new Date().toLocaleString();

          return (
            <div key={log.id} className={`border rounded-2xl p-5 shadow-sm space-y-3 relative transition-all ${isDeactivated ? 'bg-slate-100 opacity-60 text-slate-400 line-through' : 'bg-slate-50 text-slate-800'}`}>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 font-mono text-xs opacity-90">
                <span>⏮️ TOTAL LAST BALANCE: <span className="font-bold">${prevAmount}</span></span>
                <span className="bg-white/80 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-black/5 shadow-sm text-slate-700">📅 {logDateTimeStr}</span>
              </div>
              
              <div className="py-1">
                {editingLogId === log.id ? (
                  <div className="mt-2 space-y-2 max-w-md bg-white p-3 rounded-xl border border-slate-200 shadow-inner">
                    <input type="text" value={editedNoteText} onChange={(e) => setEditedNoteText(e.target.value)} className="w-full bg-slate-50 border rounded-md text-xs px-3 py-2 focus:outline-none" placeholder="Update Note Description" />
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={() => setEditingLogId(null)} className="text-slate-400 text-[10px] font-bold hover:underline">Cancel</button>
                      <button onClick={() => handleSaveEditedTreasuryRow(log)} className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded shadow">Save</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-black tracking-tight">
                      New Added Amount: <span className={isDeactivated ? "text-slate-400" : deltaAmount >= 0 ? "text-emerald-600" : "text-red-600"}>{deltaAmount >= 0 ? '+' : ''}${deltaAmount.toLocaleString()}</span>
                    </p>
                    <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5">
                      <p className="text-xs font-medium opacity-75 bg-black/5 px-3 py-1.5 rounded-lg inline-block text-slate-800">With Note: <span className="font-bold font-mono">"{log.notes}"</span></p>
                      <div className="flex gap-3 text-[10px] font-extrabold uppercase tracking-wider">
                        {!isDeactivated && <button onClick={() => { setEditingLogId(log.id); setEditedNoteText(String(log.notes || '').replace(/\(Edited.*?\)/g, '').trim()); }} className="text-blue-600" disabled={isProcessing}>✏️ Edit Note</button>}
                        <button onClick={() => handleToggleTreasuryState(log)} className={isDeactivated ? "text-emerald-600" : "text-amber-700"} disabled={isProcessing}>{isDeactivated ? "🔄 Activate" : "🚫 Deactivate"}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-black/10 pt-3 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider opacity-60">🟰 COMPILED BALANCE</span>
                <span className="text-xl font-black text-slate-900 tracking-tight font-mono">${totalCompiled}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Execute Budget Matrix Adjustment</h3>
        <form onSubmit={handleUpdateTreasury} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="number" placeholder="Adjustment Balance Delta Value (+/- $)" value={treasuryAdjustment} onChange={(e) => setTreasuryAdjustment(e.target.value)} className="bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none md:col-span-2 shadow-inner" required />
            <button type="submit" className="bg-slate-900 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md">Apply Entry</button>
          </div>
          <input type="text" placeholder="Provide context note detail string..." value={treasuryNote} onChange={(e) => setTreasuryNote(e.target.value)} className="bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none w-full shadow-inner" required />
        </form>
      </div>
    </div>
  );
}