import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function StaffDirectory({ allProfiles = [], fetchAdminData, currentUser }) {
  const [editingUser, setEditingUser] = useState(null);
  const [adjustedBalance, setAdjustedBalance] = useState('');
  const [adjustedRole, setAdjustedRole] = useState('');
  const [modificationNote, setModificationNote] = useState('');
  const [savingUserId, setSavingUserId] = useState(null);
  const [togglingUserId, setTogglingUserId] = useState(null);

  const openEditForm = (user) => {
    setEditingUser(user);
    setAdjustedBalance(String(user.total_amount_claimed ?? 0));
    setAdjustedRole(user.role || 'member');
    setModificationNote('');
  };

  const closeEditForm = () => {
    setEditingUser(null);
    setAdjustedBalance('');
    setAdjustedRole('');
    setModificationNote('');
  };

  const safeRefresh = async () => {
    if (typeof fetchAdminData === 'function') {
      await fetchAdminData();
    }
  };

  const writeAuditLog = async (payload) => {
    const { error } = await supabase.from('audit_logs').insert(payload);
    if (error) {
      // Do not hide a successful profile update only because audit logging failed.
      console.warn('Audit log insert failed:', error.message);
    }
  };

  const handleUpdateStaffMember = async (e) => {
    e.preventDefault();

    if (!editingUser || savingUserId) return;

    const originalRole = editingUser.role || 'member';
    const nextRole = adjustedRole || 'member';

    const originalBalance = Number(editingUser.total_amount_claimed ?? 0);
    const nextBalance = Number(adjustedBalance);

    if (Number.isNaN(nextBalance)) {
      alert('Wallet balance must be a valid number.');
      return;
    }

    const payload = {};

    if (nextRole !== originalRole) {
      payload.role = nextRole;
    }

    if (nextBalance !== originalBalance) {
      payload.total_amount_claimed = nextBalance;
    }

    if (Object.keys(payload).length === 0) {
      alert('No changes detected. Please update the role or wallet balance before saving.');
      return;
    }

    payload.action_reason = `[Modified ${new Date().toLocaleString()}: ${
      modificationNote.trim() || 'Profile setting adjustments'
    }]`;

    setSavingUserId(editingUser.id);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUser.id)
        .select('id, full_name, role, total_amount_claimed, action_reason')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          'No profile row was updated. Check that this profile id exists and your Supabase RLS policy allows admin updates.'
        );
      }

      const auditParts = [];
      if (payload.role !== undefined) {
        auditParts.push(`role: ${originalRole} → ${nextRole}`);
      }
      if (payload.total_amount_claimed !== undefined) {
        auditParts.push(`balance: $${originalBalance.toLocaleString()} → $${nextBalance.toLocaleString()}`);
      }

      await writeAuditLog({
        action_taken: 'ADMIN_USER_MODIFICATION',
        performed_by: currentUser?.id || null,
        notes: `Updated profile ${data.full_name || data.id}: ${auditParts.join(', ')} || Reason: ${
          modificationNote.trim() || 'Profile setting adjustments'
        }`,
      });

      closeEditForm();
      await safeRefresh();

      alert('Staff profile updated successfully.');
    } catch (err) {
      console.error('Update staff member error:', err);
      alert(`Update failed: ${err.message}`);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleActiveStatus = async (user) => {
    if (!user || togglingUserId) return;

    const currentlyActive = user.is_active !== false;
    const nextActiveStatus = !currentlyActive;

    const confirmAction = window.confirm(
      nextActiveStatus
        ? `Activate ${user.full_name || 'this staff member'}?`
        : `Deactivate ${user.full_name || 'this staff member'}?`
    );

    if (!confirmAction) return;

    setTogglingUserId(user.id);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          is_active: nextActiveStatus,
          action_reason: `[${nextActiveStatus ? 'Activated' : 'Deactivated'} ${new Date().toLocaleString()}]`,
        })
        .eq('id', user.id)
        .select('id, full_name, is_active, action_reason')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          'No profile row was updated. Check that this profile id exists and your Supabase RLS policy allows admin updates.'
        );
      }

      await writeAuditLog({
        action_taken: nextActiveStatus ? 'ADMIN_USER_ACTIVATED' : 'ADMIN_USER_DEACTIVATED',
        performed_by: currentUser?.id || null,
        notes: `${nextActiveStatus ? 'Activated' : 'Deactivated'} profile ${data.full_name || data.id}`,
      });

      await safeRefresh();

      alert(nextActiveStatus ? 'Staff member activated.' : 'Staff member deactivated.');
    } catch (err) {
      console.error('Toggle active status error:', err);
      alert(
        `Status update failed: ${err.message}\n\nIf the error says column "is_active" does not exist, run the SQL migration below.`
      );
    } finally {
      setTogglingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {editingUser && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 max-w-md mx-auto shadow-md space-y-3">
          <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider">
            ⚙️ Modify Staff Profile: {editingUser.full_name}
          </h4>

          <form onSubmit={handleUpdateStaffMember} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Role Type
                </label>
                <select
                  value={adjustedRole}
                  onChange={(e) => setAdjustedRole(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                  disabled={savingUserId === editingUser.id}
                >
                  <option value="member">MEMBER</option>
                  <option value="admin">ADMIN</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Wallet Balance ($)
                </label>
                <input
                  type="number"
                  value={adjustedBalance}
                  onChange={(e) => setAdjustedBalance(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                  disabled={savingUserId === editingUser.id}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Reason / Modification Audit Note
              </label>
              <input
                type="text"
                placeholder="e.g. Compensation error adjust / Role correction"
                value={modificationNote}
                onChange={(e) => setModificationNote(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                disabled={savingUserId === editingUser.id}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeEditForm}
                className="text-[11px] text-slate-500 font-semibold hover:underline disabled:opacity-50"
                disabled={savingUserId === editingUser.id}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingUserId === editingUser.id}
                className="bg-slate-900 disabled:bg-slate-400 text-white font-bold text-[11px] px-4 py-1.5 rounded-lg shadow"
              >
                {savingUserId === editingUser.id ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-md space-y-4">
        <div>
          <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">
            Staff Directory & Balances
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Toggle active states, manage corporate roles, and update wallet parameters.
          </p>
        </div>

        <div className="divide-y divide-slate-100 overflow-y-auto pr-1">
          {allProfiles.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 italic">
              No staff profiles found.
            </div>
          ) : (
            allProfiles.map((user) => {
              const isActive = user.is_active !== false;

              return (
                <div
                  key={user.id}
                  className={`flex justify-between items-center py-4 first:pt-0 last:pb-0 ${
                    !isActive ? 'opacity-60' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-bold text-slate-800">{user.full_name || 'Unnamed Staff'}</p>

                      <button
                        type="button"
                        onClick={() => openEditForm(user)}
                        className="text-slate-400 hover:text-blue-600 transition-colors text-xs"
                        title="Edit staff profile"
                      >
                        ⚙️
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-block text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {user.role || 'member'}
                      </span>

                      <span
                        className={`inline-block text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {user.action_reason && (
                      <p className="text-[10px] text-amber-700 font-medium bg-amber-50/60 rounded px-2 py-0.5 mt-1 border border-amber-100 max-w-md">
                        ⏱️ {user.action_reason}
                      </p>
                    )}
                  </div>

                  <div className="text-right space-y-2">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        ${Number(user.total_amount_claimed || 0).toLocaleString()}
                      </p>
                      <span className="text-[10px] text-slate-400 font-medium">Claim Balance</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleActiveStatus(user)}
                      disabled={togglingUserId === user.id}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                        isActive
                          ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100'
                      }`}
                    >
                      {togglingUserId === user.id ? 'Updating...' : isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
