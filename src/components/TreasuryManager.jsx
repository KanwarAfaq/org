import { useState } from 'react';
import { supabase } from '../supabaseClient';

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
  const [editedAmountVal, setEditedAmountVal] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);

  const safeRefresh = async () => {
    if (typeof fetchAdminData === 'function') {
      await fetchAdminData();
    }
  };

  const syncCompanyTreasuryTable = async (nextPoolTotal) => {
    const { error } = await supabase
      .from('company_treasury')
      .update({ total_initial_budget: Number(nextPoolTotal || 0), updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) {
      console.warn('Failed to update company_treasury baseline row:', error.message);
    }
  };

  const handleUpdateTreasury = async (e) => {
    e.preventDefault();
    if (isProcessing) return;

    const inputDelta = Number(treasuryAdjustment);
    if (Number.isNaN(inputDelta)) return alert('Please enter a valid numeric value.');
    if (!treasuryNote.trim()) return alert('Please enter a treasury note.');

    setIsProcessing(true);

    try {
      const structuredNotes = `0||${inputDelta}||0||${treasuryNote.trim()}||LIVE`;

      // ALIGNED SCHEMA FIX: Pass dynamic UUID and action_timestamp parameters
      const { data, error } = await supabase
        .from('audit_logs')
        .insert({
          id: crypto.randomUUID(),
          post_id: null,
          action_taken: 'ADMIN_TREASURY_ADJUST',
          performed_by: currentUser?.id || null,
          notes: structuredNotes,
          action_timestamp: new Date().toISOString()
        })
        .select('id, notes')
        .maybeSingle();

      if (error) throw error;

      const nextCalculatedPoolSum = currentTreasuryPool + inputDelta;
      await syncCompanyTreasuryTable(nextCalculatedPoolSum);

      setTreasuryAdjustment('');
      setTreasuryNote('');
      await safeRefresh();
      alert('Treasury entry added successfully.');
    } catch (err) {
      console.error('Treasury insert error:', err);
      alert(`Treasury update failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEditedTreasuryRow = async (log, parts) => {
    if (isProcessing) return;

    const freshAmountDelta = Number(editedAmountVal);
    const originalAmountDelta = Number(parts[1] || 0);
    const nextNoteText = editedNoteText.replace(/\(Edited on.*?\)/g, '').trim();

    if (Number.isNaN(freshAmountDelta)) return alert('Please enter a valid numeric value.');
    if (!nextNoteText) return alert('Note description cannot be left blank.');

    setIsProcessing(true);

    try {
      const currentTimestamp = `(Edited on ${new Date().toLocaleDateString()} @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      const updatedPayload = `0||${freshAmountDelta}||0||${nextNoteText} ${currentTimestamp}||${parts[4] || 'LIVE'}`;

      const { error } = await supabase
        .from('audit_logs')
        .update({ notes: updatedPayload, action_timestamp: new Date().toISOString() })
        .eq('id', log.id);

      if (error) throw error;

      const balanceDiscrepancyDelta = freshAmountDelta - originalAmountDelta;
      const nextCalculatedPoolSum = currentTreasuryPool + balanceDiscrepancyDelta;
      await syncCompanyTreasuryTable(nextCalculatedPoolSum);

      setEditingLogId(null);
      setEditedNoteText('');
      setEditedAmountVal('');
      await safeRefresh();
      alert('Treasury row updated successfully.');
    } catch (err) {
      console.error('Treasury row edit error:', err);
      alert(`Treasury row update failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleTreasuryState = async (log, parts) => {
    if (isProcessing) return;

    const currentStateToken = parts[4] || 'LIVE';
    const isMovingToDeactivated = currentStateToken === 'LIVE';

    const confirmation = window.confirm(
      isMovingToDeactivated
        ? 'Are you sure you want to deactivate this entry? This will subtract its value from the total balance.'
        : 'Are you sure you want to reactivate this entry? This will restore its value to the total balance.'
    );
    if (!confirmation) return;

    setIsProcessing(true);

    try {
      const targetStateToken = isMovingToDeactivated ? 'DEACTIVATED' : 'LIVE';
      const cleanNoteTextContent = String(parts[3] || '').replace(' [DEACTIVATED RECORD]', '').trim();
      const updatedPayload = `0||${parts[1]}||0||${cleanNoteTextContent}${isMovingToDeactivated ? ' [DEACTIVATED RECORD]' : ''}||${targetStateToken}`;

      const { error } = await supabase
        .from('audit_logs')
        .update({ notes: updatedPayload, action_timestamp: new Date().toISOString() })
        .eq('id', log.id);

      if (error) throw error;

      const targetDeltaVal = Number(parts[1] || 0);
      const nextCalculatedPoolSum = isMovingToDeactivated
        ? currentTreasuryPool - targetDeltaVal
        : currentTreasuryPool + targetDeltaVal;
      await syncCompanyTreasuryTable(nextCalculatedPoolSum);

      await safeRefresh();
      alert(isMovingToDeactivated ? 'Treasury row deactivated.' : 'Treasury row activated.');
    } catch (err) {
      console.error('Treasury state toggle error:', err);
      alert(`Treasury status update failed: ${err.message}`);
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
        {treasuryHistoryLogs.map((log, index) => {
          const parts = (log.notes || '').split('||');
          if (parts.length < 5) return null;

          const prevAmount = Number(parts[0] || 0).toLocaleString();
          const deltaAmount = Number(parts[1] || 0);
          const totalCompiled = Number(parts[2] || 0).toLocaleString();
          const logCustomNote = parts[3];
          const isDeactivated = parts[4] === 'DEACTIVATED';

          // ALIGNED SCHEMA FIX: Read values using action_timestamp
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
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" value={editedAmountVal} onChange={(e) => setEditedAmountVal(e.target.value)} className="bg-slate-50 border rounded-md text-xs px-2 py-1.5 focus:outline-none" placeholder="Amount" />
                      <input type="text" value={editedNoteText} onChange={(e) => setEditedNoteText(e.target.value)} className="bg-slate-50 border rounded-md text-xs px-2 py-1.5 col-span-2 focus:outline-none" placeholder="Note Description" />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={() => setEditingLogId(null)} className="text-slate-400 text-[10px] font-bold hover:underline">Cancel</button>
                      <button onClick={() => handleSaveEditedTreasuryRow(log, parts)} className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded shadow">Save</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-black tracking-tight">
                      New Added Amount: <span className={isDeactivated ? "text-slate-400" : deltaAmount >= 0 ? "text-emerald-600" : "text-red-600"}>{deltaAmount >= 0 ? '+' : ''}${deltaAmount.toLocaleString()}</span>
                    </p>
                    <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5">
                      <p className="text-xs font-medium opacity-75 bg-black/5 px-3 py-1.5 rounded-lg inline-block text-slate-800">With Note: <span className="font-bold font-mono">"{logCustomNote}"</span></p>
                      <div className="flex gap-3 text-[10px] font-extrabold uppercase tracking-wider">
                        {!isDeactivated && <button onClick={() => { setEditingLogId(log.id); setEditedNoteText(String(logCustomNote || '').replace(/\(Edited on.*?\)/g, '').trim()); setEditedAmountVal(String(deltaAmount)); }} className="text-blue-600" disabled={isProcessing}>✏️ Edit Row</button>}
                        <button onClick={() => handleToggleTreasuryState(log, parts)} className={isDeactivated ? "text-emerald-600" : "text-amber-700"} disabled={isProcessing}>{isDeactivated ? "🔄 Activate" : "🚫 Deactivate"}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-black/10 pt-3 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider opacity-60">🟰 TOTAL BALANCE</span>
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