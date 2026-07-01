import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
export default function CategoryManager() {
  const [targetTable, setTargetTable] = useState('workflow_categories');
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, [targetTable]);

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase.from(targetTable).select('*').order('created_at', { ascending: true });
    if (!error) setCategories(data || []);
    setLoading(false);
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return toast.success('Category name is required.');
    const { error } = await supabase.from(targetTable).insert({ name: newCatName.trim(), icon: newCatIcon });
    if (!error) { setNewCatName(''); setNewCatIcon(targetTable === 'workflow_categories' ? '📦' : '🧾'); fetchCategories(); }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    await supabase.from(targetTable).update({ is_active: !currentStatus }).eq('id', id);
    fetchCategories();
  };

  const handleDeleteCategory = async (id, catName) => {
    if (!window.confirm(`🚨 Permanently delete "${catName}" from ${targetTable}?`)) return;
    await supabase.from(targetTable).delete().eq('id', id);
    fetchCategories();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      
      {/* DB Table Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-lg">
        <button onClick={() => setTargetTable('workflow_categories')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${targetTable === 'workflow_categories' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>📋 Workflow Categories</button>
        <button onClick={() => setTargetTable('receipt_categories')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${targetTable === 'receipt_categories' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>🧾 Receipt Categories</button>
      </div>

      <form onSubmit={handleAddCategory} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
        <div className="flex-shrink-0">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Emoji</label>
          <input type="text" value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)} maxLength={2} className="w-16 text-center text-lg bg-white border py-2 rounded-lg" />
        </div>
        <div className="flex-grow">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">New Category Name</label>
          <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="w-full bg-white border px-3 py-2 text-sm rounded-lg" required />
        </div>
        <div className="flex items-end">
          <button type="submit" className="bg-slate-900 text-white font-bold text-sm px-6 py-2 rounded-lg h-[42px]">+ Add</button>
        </div>
      </form>

      {loading ? <p className="animate-pulse text-slate-500">Loading...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className={`flex items-center justify-between p-4 border rounded-xl shadow-sm ${cat.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl bg-slate-100 p-2 rounded-lg">{cat.icon}</span>
                <p className={`font-bold ${cat.is_active ? 'text-slate-900' : 'text-slate-500 line-through'}`}>{cat.name}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleToggleStatus(cat.id, cat.is_active)} className="text-xs font-bold px-3 py-1.5 rounded-md bg-slate-100 text-slate-600">{cat.is_active ? 'Disable' : 'Enable'}</button>
                <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-xs font-bold px-3 py-1.5 rounded-md bg-red-50 text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}