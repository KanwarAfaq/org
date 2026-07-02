import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function CategoryManager() {
  const [targetTable, setTargetTable] = useState('workflow_categories');
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📁');
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
    if (!newCatName.trim()) return toast.error('Category name is required.');
    
    const { error } = await supabase.from(targetTable).insert({ name: newCatName.trim(), icon: newCatIcon });
    if (error) {
      toast.error(error.message);
    } else { 
      setNewCatName(''); 
      setNewCatIcon(targetTable === 'workflow_categories' ? '📁' : '🧾'); 
      fetchCategories(); 
      toast.success('Category added successfully.');
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    await supabase.from(targetTable).update({ is_active: !currentStatus }).eq('id', id);
    fetchCategories();
    toast.success(currentStatus ? 'Category disabled.' : 'Category enabled.');
  };

  const handleDeleteCategory = async (id, catName) => {
    // 🎨 CUSTOM TOAST INSTEAD OF WINDOW.CONFIRM
    toast((t) => (
      <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 max-w-sm">
        <h3 className="font-black text-slate-900 mb-2">Delete Category?</h3>
        <p className="text-xs text-slate-500 mb-4">Permanently delete "{catName}"? This action cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg text-xs">Cancel</button>
          <button onClick={async () => {
            toast.dismiss(t.id);
            const { error } = await supabase.from(targetTable).delete().eq('id', id);
            if (error) {
              toast.error(error.message);
            } else {
              toast.success('Category permanently deleted.');
              fetchCategories();
            }
          }} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg text-xs">Yes, Delete</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      
      {/* DB Table Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-lg">
        <button onClick={() => setTargetTable('workflow_categories')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${targetTable === 'workflow_categories' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>📁 Workflow Categories</button>
        <button onClick={() => setTargetTable('receipt_categories')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${targetTable === 'receipt_categories' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>🧾 Receipt Categories</button>
      </div>

      <form onSubmit={handleAddCategory} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
        <div className="flex-shrink-0">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Emoji</label>
          <input type="text" value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)} maxLength={2} className="w-16 text-center text-lg bg-white border border-slate-300 py-2 rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex-grow">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">New Category Name</label>
          <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="w-full bg-white border border-slate-300 px-3 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div className="flex items-end">
          <button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm px-6 py-2 rounded-lg h-[42px] transition-colors">+ Add</button>
        </div>
      </form>

      {loading ? <div className="animate-pulse flex gap-2 items-center text-slate-500"><span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></span> Loading categories...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className={`flex items-center justify-between p-4 border rounded-xl shadow-sm transition-all ${cat.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl bg-slate-100 p-2 rounded-lg shadow-inner">{cat.icon}</span>
                <p className={`font-bold ${cat.is_active ? 'text-slate-900' : 'text-slate-500 line-through'}`}>{cat.name}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleToggleStatus(cat.id, cat.is_active)} className="text-[10px] uppercase font-black px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">{cat.is_active ? 'Disable' : 'Enable'}</button>
                <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-[10px] uppercase font-black px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}