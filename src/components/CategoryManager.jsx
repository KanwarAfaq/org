import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('workflow_categories')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) console.error('Error fetching categories:', error.message);
    else setCategories(data || []);
    setLoading(false);
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return alert('Category name is required.');

    const { error } = await supabase.from('workflow_categories').insert({
      name: newCatName.trim(),
      icon: newCatIcon
    });

    if (error) alert(`Failed to add: ${error.message}`);
    else {
      setNewCatName('');
      setNewCatIcon('📦');
      fetchCategories();
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const { error } = await supabase
      .from('workflow_categories')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) alert(`Failed to toggle status: ${error.message}`);
    else fetchCategories();
  };

  // 🆕 NEW: Delete Category Function
  const handleDeleteCategory = async (id, catName) => {
    if (!window.confirm(`🚨 Are you sure you want to permanently delete "${catName}"?\n\nPast workflow records using this category will remain perfectly safe, but it will be erased from the system menu forever.`)) return;

    const { error } = await supabase
      .from('workflow_categories')
      .delete()
      .eq('id', id);

    if (error) alert(`Failed to delete: ${error.message}`);
    else fetchCategories();
  };

  if (loading) return <div className="text-slate-500 animate-pulse">Loading core system categories...</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-xl font-black text-slate-900">🗂️ Global Category Manager</h2>
        <p className="text-sm text-slate-500">Add, edit, disable, or delete the dropdown workflow request items for all users.</p>
      </div>

      <form onSubmit={handleAddCategory} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="flex-shrink-0">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Emoji Icon</label>
          <input type="text" value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)} maxLength={2} className="w-16 text-center text-lg bg-white border border-slate-300 rounded-lg py-2 focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex-grow">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category Name</label>
          <input type="text" placeholder="e.g., Travel Expense" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div className="flex items-end">
          <button type="submit" className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm px-6 py-2 rounded-lg shadow-md h-[42px]">
            + Add System Category
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {categories.map((cat) => (
          <div key={cat.id} className={`flex items-center justify-between p-4 border rounded-xl shadow-sm transition-all ${cat.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl bg-slate-100 p-2 rounded-lg">{cat.icon}</span>
              <div>
                <p className={`font-bold ${cat.is_active ? 'text-slate-900' : 'text-slate-500 line-through'}`}>{cat.name}</p>
                <p className="text-[10px] font-mono text-slate-400">ID: {cat.id.split('-')[0]}</p>
              </div>
            </div>
            
            {/* 🆕 NEW: Action Button Group */}
            <div className="flex items-center gap-2">
              <button onClick={() => handleToggleStatus(cat.id, cat.is_active)} className={`text-xs font-bold px-3 py-1.5 rounded-md ${cat.is_active ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                {cat.is_active ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-xs font-bold px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}