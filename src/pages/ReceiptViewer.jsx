import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

export default function ReceiptViewer({ currentUser }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  
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

  useEffect(() => {
    fetchReceipts();
    if (isAdmin) fetchUsers();
    fetchCategories();

    // Close dropdowns if clicking outside
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) setIsUserDropdownOpen(false);
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target)) setIsCatDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true });
    if (data) setAllUsers(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('receipt_categories').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data) setCategories(data);
  };

  const fetchReceipts = async () => {
    setLoading(true);
    let query = supabase.from('receipts').select('*').order('created_at', { ascending: false });
    
    if (!isAdmin) {
      query = query.eq('uploaded_by', currentUser.id);
    }
    
    const { data } = await query;
    if (data) setReceipts(data);
    setLoading(false);
  };

  // Dropdown Filtering Logic
  const filteredDropdownUsers = allUsers.filter(u => u.full_name.toLowerCase().includes(searchUser.toLowerCase()));
  const filteredDropdownCats = categories.filter(c => c.name.toLowerCase().includes(searchCategory.toLowerCase()));

  // 🧠 Multi-Layer Filtering Engine for Receipts
  const filteredReceipts = receipts.filter(r => {
    const matchUser = isAdmin ? r.submitter_name.toLowerCase().includes(searchUser.toLowerCase()) : true;
    const matchCategory = r.category.toLowerCase().includes(searchCategory.toLowerCase());
    
    let matchDate = true;
    const receiptDate = new Date(r.created_at);

    if (searchDateFrom) {
      const fromDate = new Date(searchDateFrom);
      fromDate.setHours(0, 0, 0, 0); 
      if (receiptDate < fromDate) matchDate = false;
    }
    
    if (searchDateTo) {
      const toDate = new Date(searchDateTo);
      toDate.setHours(23, 59, 59, 999); 
      if (receiptDate > toDate) matchDate = false;
    }

    return matchUser && matchCategory && matchDate;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
        
        {/* HEADER */}
        <div className="bg-slate-900 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 text-white">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">🗄️ Receipt Vault</h2>
            <p className="text-sm text-slate-400">{isAdmin ? 'Global Company Ledger' : 'Your Personal Uploads'}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => window.location.href = '/receipts'} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-transform hover:scale-105">📸 Upload New</button>
            <button onClick={() => window.location.href = '/'} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 shadow-sm transition-colors">Back to Home</button>
          </div>
        </div>

        {/* 🎛️ ADVANCED SEARCH & FILTER PANEL */}
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
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
                    placeholder="Type to search..." 
                    value={searchUser} 
                    onChange={(e) => { setSearchUser(e.target.value); setIsUserDropdownOpen(true); }}
                    onFocus={() => setIsUserDropdownOpen(true)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-text" 
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">▼</span>
                </div>

                {isUserDropdownOpen && (
                  <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <div 
                      className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-sm font-bold text-slate-600"
                      onClick={() => { setSearchUser(''); setIsUserDropdownOpen(false); }}
                    >
                      -- All Employees --
                    </div>
                    {filteredDropdownUsers.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 italic text-center">No matching employees</div>
                    ) : (
                      filteredDropdownUsers.map(user => (
                        <div 
                          key={user.id} 
                          className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700"
                          onClick={() => { setSearchUser(user.full_name); setIsUserDropdownOpen(false); }}
                        >
                          {user.full_name}
                        </div>
                      ))
                    )}
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
                  onChange={(e) => { setSearchCategory(e.target.value); setIsCatDropdownOpen(true); }}
                  onFocus={() => setIsCatDropdownOpen(true)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-text" 
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">▼</span>
              </div>

              {isCatDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <div 
                    className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-sm font-bold text-slate-600"
                    onClick={() => { setSearchCategory(''); setIsCatDropdownOpen(false); }}
                  >
                    -- All Categories --
                  </div>
                  {filteredDropdownCats.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 italic text-center">No matching categories</div>
                  ) : (
                    filteredDropdownCats.map(cat => (
                      <div 
                        key={cat.id} 
                        className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700 flex items-center gap-2"
                        onClick={() => { setSearchCategory(cat.name); setIsCatDropdownOpen(false); }}
                      >
                        <span>{cat.icon}</span> {cat.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Date From */}
            <div className="z-10">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date From</label>
              <input type="date" value={searchDateFrom} onChange={(e) => setSearchDateFrom(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-slate-700" />
            </div>

            {/* Date To */}
            <div className="z-10">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date To</label>
              <input type="date" value={searchDateTo} onChange={(e) => setSearchDateTo(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-slate-700" />
            </div>

          </div>
        </div>

        {/* 🖼️ GALLERY GRID */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 font-bold animate-pulse">Decrypting vault data...</div>
        ) : filteredReceipts.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-sm">
            <span className="text-4xl block mb-2">📭</span>
            No receipts found matching your current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredReceipts.map(receipt => (
              <div key={receipt.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all group">
                
                <a href={receipt.file_url} target="_blank" rel="noreferrer" className="block relative h-48 overflow-hidden bg-slate-100">
                  <img src={receipt.file_url} alt="Receipt" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow-xl transition-opacity">
                      🔍 Enlarge
                    </span>
                  </div>
                </a>
                
                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider truncate">
                      {receipt.category}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0 bg-slate-50 px-2 py-1 rounded">
                      {new Date(receipt.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-bold text-slate-800 leading-tight">{receipt.purpose}</h4>
                  
                  {isAdmin && (
                    <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                        {receipt.submitter_name.charAt(0)}
                      </div>
                      <p className="text-xs text-slate-600 font-medium truncate">{receipt.submitter_name}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}