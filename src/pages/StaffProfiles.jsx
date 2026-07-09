import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function StaffProfiles({ currentUser }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '', phone: '', address: '', role: 'member', is_active: true
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });
      
    if (error) {
      toast.error(`Failed to fetch staff: ${error.message}`);
    } else {
      setStaff(data || []);
    }
    setLoading(false);
  };

  const handleEditClick = (user) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || '',
      phone: user.phone || '',
      address: user.address || '',
      role: user.role || 'member',
      is_active: user.is_active ?? true
    });
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // 🛡️ Security Check: Prevent Super Admin from demoting themselves by accident
      if (editingUser.id === currentUser.id && formData.role !== 'admin' && !currentUser.is_super_admin) {
         throw new Error("You cannot demote your own admin account.");
      }

      const { error } = await supabase.from('profiles').update({
        full_name: formData.full_name,
        phone: formData.phone,
        address: formData.address,
        role: formData.role,
        is_active: formData.is_active
      }).eq('id', editingUser.id);

      if (error) throw error;

      toast.success(`${formData.full_name}'s profile updated successfully!`);
      setEditingUser(null);
      fetchStaff(); // Refresh the table
    } catch (error) {
      toast.error(`Update failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredStaff = staff.filter(user => 
    (user.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
    (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full animate-fadeIn">
      
      {/* 🎛️ Header & Search */}
      <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">👥 Corporate Directory</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Manage employee access, roles, and profiles.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
          <input 
            type="text" 
            placeholder="Search name or email..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all"
          />
        </div>
      </div>

      {/* 📊 Data Table */}
      <div className="overflow-x-auto flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-blue-600">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-sm font-bold animate-pulse">Syncing Directory...</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-500 text-[10px] uppercase tracking-wider font-black">
                <th className="p-4 rounded-tl-lg">Employee</th>
                <th className="p-4">Contact</th>
                <th className="p-4 text-center">Role / Access</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right rounded-tr-lg">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStaff.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-12 text-slate-400 font-medium">No employees found matching "{searchQuery}"</td></tr>
              ) : (
                filteredStaff.map(user => (
                  <tr key={user.id} className="hover:bg-blue-50/50 transition-colors group">
                    
                    {/* User Column */}
                    <div className="flex items-center gap-3 p-4 min-w-[200px]">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border border-slate-300 shrink-0">
                        {user.avatar_url ? <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : <span className="text-lg">👤</span>}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 leading-tight">{user.full_name || 'Unnamed User'}</p>
                        {user.is_super_admin && <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase mt-1 inline-block tracking-wider">Super Admin</span>}
                      </div>
                    </div>

                    {/* Contact Column */}
                    <td className="p-4 min-w-[180px]">
                      <p className="text-xs font-bold text-slate-700 truncate">{user.email}</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">{user.phone || 'No phone provided'}</p>
                    </td>

                    {/* Role Column */}
                    <td className="p-4 text-center">
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${
                        user.role === 'admin' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                        user.role === 'viewer' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                        'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {user.role}
                      </span>
                    </td>

                    {/* Status Column */}
                    <td className="p-4 text-center">
                      <span className={`flex items-center justify-center gap-1.5 text-xs font-bold ${user.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
                        <div className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                        {user.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    {/* Actions Column */}
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleEditClick(user)}
                        className="bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm group-hover:shadow-md"
                      >
                        Edit Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 🪟 EDIT PROFILE MODAL (Glassmorphism Overlay) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black">⚙️ Edit Employee</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">{editingUser.email}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">✕</button>
            </div>
            
            <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Legal Name</label>
                <input type="text" name="full_name" value={formData.full_name} onChange={handleFormChange} required className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone</label>
                  <input type="text" name="phone" value={formData.phone} onChange={handleFormChange} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">System Role</label>
                  <select name="role" value={formData.role} onChange={handleFormChange} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer">
                    <option value="member">Member (Standard)</option>
                    <option value="viewer">Viewer (Read-Only)</option>
                    <option value="admin">Admin (Manager)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Mailing Address</label>
                <textarea name="address" value={formData.address} onChange={handleFormChange} rows="2" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>

              {/* Account Suspend Toggle */}
              <div className={`mt-4 p-4 rounded-xl border flex items-center justify-between transition-colors ${formData.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div>
                  <p className={`text-sm font-black ${formData.is_active ? 'text-emerald-800' : 'text-red-800'}`}>Account Access</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${formData.is_active ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formData.is_active ? 'Employee can log in' : 'Employee is locked out'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleFormChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-red-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                </label>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setEditingUser(null)} className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-all shadow-sm">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-all shadow-md disabled:opacity-50">
                  {isSaving ? 'Saving...' : 'Apply Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}