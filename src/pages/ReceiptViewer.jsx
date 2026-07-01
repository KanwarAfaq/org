import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function ReceiptViewer({ currentUser }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 📄 NEW: Pagination States
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 12; // Standard 4x3 grid
  
  // Database Lists for Dropdowns
  const [allUsers, setAllUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // 🔍 Advanced Search States
  const [searchUser, setSearchUser] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);

  const [searchCategory, setSearchCategory] = useState('');
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const catDropdownRef = useRef(null);

  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');

  const isAdmin = currentUser?.role === 'admin' || currentUser?.is_super_admin;

  // 1. Initial Load for Categories and Users
  useEffect(() => {
    if (isAdmin) fetchUsers();
    fetchCategories();

    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) setIsUserDropdownOpen(false);
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target)) setIsCatDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. 🚀 THE MASTER FETCH ENGINE (Server-Side Filtering & Pagination)
  const fetchReceipts = async () => {
    setLoading(true);
    
    // We request 'exact' count to know how many pages exist
    let query = supabase
      .from('receipts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    
    if (!isAdmin) {
      query = query.eq('uploaded_by', currentUser.id);
    }
    
    // 🧠 SERVER-SIDE FILTERS
    if (searchUser) query = query.ilike('submitter_name', `%${searchUser}%`);
    if (searchCategory) query = query.ilike('category', `%${searchCategory}%`);
    if (searchDateFrom) query = query.gte('created_at', `${searchDateFrom}T00:00:00.000Z`);
    if (searchDateTo) query = query.lte('created_at', `${searchDateTo}T23:59:59.999Z`);

    // 📄 SERVER-SIDE PAGINATION
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    
    if (error) {
      toast.error(`Database sync failed: ${error.message}`);
    } else {
      setReceipts(data || []);
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  };

  // 3. ⏱️ AUTO-DEBOUNCER
  // This watches your filters and page. It waits 400ms after you stop typing to fetch data.
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchReceipts();
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [searchUser, searchCategory, searchDateFrom, searchDateTo, page]);

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true });
    if (data) setAllUsers(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('receipt_categories').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data) setCategories(data);
  };

  // ⚡ GOD MODE: Delete Receipt
  const handleDeleteReceipt = async (id, purpose) => {
    toast((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white shadow-2xl rounded-2xl pointer-events-auto border border-red-100 overflow-hidden`}>
        <div className="p-5 text-center border-b border-slate-100">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-500 text-2xl mx-auto mb-3">🚨</div>
          <h3 className="text-sm font-black text-slate-900">Permanently Delete?</h3>
          <p className="text-xs text-slate-500 mt-2 font-medium break-words">Are you sure you want to delete <br/><span className="text-slate-800 font-bold">"{purpose}"</span>?</p>
        </div>
        <div className="flex p-3 gap-3 bg-slate-50">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition-colors shadow-sm">Cancel</button>
          <button onClick={async () => {
              toast.dismiss(t.id);
              setReceipts(prev => prev.filter(r => r.id !== id));
              const { error } = await supabase.from('receipts').delete().eq('id', id);
              if (error) { toast.error(`Failed to delete: ${error.message}`); fetchReceipts(); } 
              else { toast.success('Receipt permanently deleted.'); fetchReceipts(); }
            }} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2.5 rounded-xl transition-colors shadow-md">Yes, Delete</button>
        </div>
      </div>
    ), { duration: Infinity, id: `delete-${id}` });
  };

  // Keep dropdown searches smooth on the client side
  const filteredDropdownUsers = allUsers.filter(u => u.full_name.toLowerCase().includes(searchUser.toLowerCase()));
  const filteredDropdownCats = categories.filter(c => c.name.toLowerCase().includes(searchCategory.toLowerCase()));

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
        
        {/* HEADER */}
        <div className="bg-slate-900 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 text-white">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">🗄️ Receipt Vault</h2>
            <p className="text-sm text-slate-400">{isAdmin ? 'Global Company Ledger' : 'Your Personal Uploads'}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => window.location.href = '/#/receipt-form'} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-transform hover:scale-105">📸 Upload New</button>
            <button onClick={() => window.location.href = '/#/'} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 shadow-sm transition-colors">Back to Home</button>
          </div>
        </div>

        {/* 🎛️ ADVANCED SEARCH & FILTER PANEL */}
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm relative">
          
          {loading && (
            <div className="absolute top-4 right-5 flex items-center gap-2 text-xs font-bold text-blue-600 animate-pulse">
              <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></span> Syncing...
            </div>
          )}

          <div className="mb-4 border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🔎 Filter Records</h3>
          </div>
          
          <div className={`grid gap-4 ${isAdmin ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
            
            {/* 👤 SMART COMBOBOX: Employee Search (Admin Only) */}
            {isAdmin && (
              <div className="relative z-30" ref={userDropdownRef}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Employee Name</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">👤</span>
                  <input 
                    type="text" 
                    placeholder="Search name..." 
                    value={searchUser} 
                    // ⚠️ Changing a filter drops us back to Page 1
                    onChange={(e) => { setSearchUser(e.target.value); setIsUserDropdownOpen(true); setPage(1); }}
                    onFocus={() => setIsUserDropdownOpen(true)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-text" 
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">▼</span>
                </div>

                {isUserDropdownOpen && (
                  <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <div 
                      className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-sm font-bold text-slate-600"
                      onClick={() => { setSearchUser(''); setIsUserDropdownOpen(false); setPage(1); }}
                    >
                      -- All Employees --
                    </div>
                    {filteredDropdownUsers.map(user => (
                      <div 
                        key={user.id} 
                        className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700"
                        onClick={() => { setSearchUser(user.full_name); setIsUserDropdownOpen(false); setPage(1); }}
                      >
                        {user.full_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 🏷️ SMART COMBOBOX: Category Search */}
            <div className="relative z-20" ref={catDropdownRef}>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🏷️</span>
                <input 
                  type="text" 
                  placeholder="Select category..." 
                  value={searchCategory} 
                  onChange={(e) => { setSearchCategory(e.target.value); setIsCatDropdownOpen(true); setPage(1); }}
                  onFocus={() => setIsCatDropdownOpen(true)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-text" 
                />
              </div>

              {isCatDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <div 
                    className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-sm font-bold text-slate-600"
                    onClick={() => { setSearchCategory(''); setIsCatDropdownOpen(false); setPage(1); }}
                  >
                    -- All Categories --
                  </div>
                  {filteredDropdownCats.map(cat => (
                    <div 
                      key={cat.id} 
                      className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700 flex items-center gap-2"
                      onClick={() => { setSearchCategory(cat.name); setIsCatDropdownOpen(false); setPage(1); }}
                    >
                      <span>{cat.icon}</span> {cat.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Date Filters */}
            <div className="z-10">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date From</label>
              <input type="date" value={searchDateFrom} onChange={(e) => { setSearchDateFrom(e.target.value); setPage(1); }} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-slate-700" />
            </div>
            <div className="z-10">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date To</label>
              <input type="date" value={searchDateTo} onChange={(e) => { setSearchDateTo(e.target.value); setPage(1); }} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-slate-700" />
            </div>
          </div>
        </div>

        {/* 🖼️ GALLERY GRID */}
        {receipts.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-sm">
            <span className="text-4xl block mb-2">📭</span>
            No receipts found matching your current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 min-h-[400px]">
            {receipts.map(receipt => (
              <div key={receipt.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all group flex flex-col h-full">
                
                <a href={receipt.file_url} target="_blank" rel="noreferrer" className="block relative h-48 overflow-hidden bg-slate-100 shrink-0 border-b border-slate-100">
                  <img src={receipt.file_url} referrerPolicy="no-referrer" alt="Receipt" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow-xl transition-opacity">
                      🔍 Enlarge
                    </span>
                  </div>
                </a>
                
                <div className="p-5 flex flex-col flex-1 bg-white">
                  <div className="space-y-3 flex-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider truncate">
                        {receipt.category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 bg-slate-50 px-2 py-1 rounded">
                        {new Date(receipt.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <h4 className="text-sm font-bold text-slate-800 leading-tight break-words">{receipt.purpose}</h4>
                  </div>
                  
                  {isAdmin && (
                    <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                          {receipt.submitter_name.charAt(0)}
                        </div>
                        <p className="text-xs text-slate-600 font-medium truncate">{receipt.submitter_name}</p>
                      </div>
                      
                      {currentUser?.is_super_admin && (
                        <button 
                          onClick={() => handleDeleteReceipt(receipt.id, receipt.purpose)}
                          className="shrink-0 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white transition-colors p-1.5 rounded-md"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 📄 PAGINATION CONTROLS */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-sm text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{(page - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-900">{Math.min(page * ITEMS_PER_PAGE, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> receipts
            </p>
            
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                ← Previous
              </button>
              
              <div className="flex items-center px-4 font-mono text-sm font-bold text-slate-400 bg-slate-50 rounded-lg">
                {page} / {totalPages}
              </div>

              <button
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}