import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import emailjs from '@emailjs/browser';
import { v4 as uuidv4 } from 'uuid';
import sha256 from 'crypto-js/sha256';
export default function ReceiptViewer({ currentUser }) {
  const [activeTab, setActiveTab] = useState('standard');

  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 12; 
  
  const [allUsers, setAllUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  
  const [searchUser, setSearchUser] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);

  const [searchCategory, setSearchCategory] = useState('');
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const catDropdownRef = useRef(null);

  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');

  const isAdmin = currentUser?.role === 'admin' || currentUser?.is_super_admin;

  // =========================================================================
  // 🔒 VAULT SECURITY STATES & ENGINES
  // =========================================================================
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [sensitiveReceipts, setSensitiveReceipts] = useState([]);

  // 🆕 NEW: 4-Digit Vault PIN States
  const [pin, setPin] = useState(['', '', '', '']);
  const pinRefs = useRef([]);

  // 🆕 NEW: 4-Digit New PIN State (For Reset)
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const newPinRefs = useRef([]);

  // 6-Digit OTP State for Email Recovery
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);

  // Browser-native cryptographic hashing for the PIN
// 📱 Mobile-Safe Cryptographic Hashing for the PIN
  const hashPin = async (plainPin) => {
    // This generates a perfect SHA-256 hash without relying on the Android WebView
    return sha256(plainPin).toString();
  };

  const handleUnlockVault = async (e) => {
    e.preventDefault();

    const loadingToast = toast.loading(currentUser.is_super_admin ? "Verifying Master Clearance..." : "Decrypting Vault...");

    try {
      // ==========================================
      // 1. PIN CHECK (MEMBERS ONLY)
      // ==========================================
      if (!currentUser.is_super_admin) {
        const pinAttempt = pin.join('');
        if (pinAttempt.length !== 4) throw new Error("Please enter a complete 4-digit PIN.");

        const hashedAttempt = await hashPin(pinAttempt);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('sensitive_vault_pin')
          .eq('id', currentUser.id)
          .single();

        if (profileError) throw new Error(`Profile sync failed: ${profileError.message}`);

        // Setup PIN if first time
        if (!profile.sensitive_vault_pin) {
           const { error: updateError } = await supabase.from('profiles').update({ sensitive_vault_pin: hashedAttempt }).eq('id', currentUser.id);
           if (updateError) throw new Error(`Failed to save new PIN: ${updateError.message}`);
           toast.success("New Secure 4-Digit PIN Configured!", { id: loadingToast });
        } else if (profile.sensitive_vault_pin !== hashedAttempt) {
           throw new Error("Incorrect Security PIN.");
        }
      }

      // ==========================================
      // 2. FETCH RECEIPTS
      // ==========================================
      let query = supabase.from('receipts').select('*').eq('is_sensitive', true).order('created_at', { ascending: false });
      if (!currentUser.is_super_admin) query = query.eq('uploaded_by', currentUser.id);

      const { data: sReceipts, error: receiptError } = await query;
      if (receiptError) throw new Error(`Failed to fetch receipts: ${receiptError.message}`);

      const pathsToSign = [];
      const validReceipts = [];

      (sReceipts || []).forEach(r => {
        if (!r.cloudinary_public_id || !r.file_url) return;
        const extension = r.file_url.split('.').pop() || 'jpg';
        pathsToSign.push(`${r.cloudinary_public_id}.${extension}`);
        validReceipts.push(r);
      });

      // ==========================================
      // 3. SIGN SECURE CLOUDINARY URLS
      // ==========================================
      if (pathsToSign.length > 0) {
        const { data: sigData, error: funcError } = await supabase.functions.invoke('sign-cloudinary-url', {
          body: { paths_to_sign: pathsToSign }
        });

        if (funcError) {
           throw new Error(`Edge Function Blocked: ${funcError.message} (Did you forget to add CORS headers to sign-cloudinary-url?)`);
        }
        if (!sigData || !sigData.signatures) {
           throw new Error("Cloudinary Edge Function returned empty signature data.");
        }

        const fullySignedReceipts = validReceipts.map((receipt, index) => {
           const signature = sigData.signatures[index];
           const extension = receipt.file_url.split('.').pop() || 'jpg';
           const cloudName = receipt.file_url.split('/res.cloudinary.com/')[1].split('/')[0];
           const versionMatch = receipt.file_url.match(/\/v(\d+)\//);
           const versionString = versionMatch ? `v${versionMatch[1]}` : 'v1';
           const exactPathToSign = `${receipt.cloudinary_public_id}.${extension}`;
           const secureUrl = `https://res.cloudinary.com/${cloudName}/image/authenticated/s--${signature}--/${versionString}/${exactPathToSign}`;

           return { ...receipt, signed_url: secureUrl };
        });

        setSensitiveReceipts(fullySignedReceipts);
      } else {
        setSensitiveReceipts([]);
      }

      // ==========================================
      // 4. LOG ADMIN OVERRIDE & UNLOCK
      // ==========================================
      if (currentUser.is_super_admin) {
         await supabase.from('audit_logs').insert({
            id: uuidv4(),
            action_taken: 'ADMIN_VAULT_OVERRIDE',
            performed_by: currentUser.id,
            notes: `Master Admin bypassed global receipt vault PIN.`,
            action_timestamp: new Date().toISOString()
         });
      }

      setIsUnlocked(true);
      setPin(['', '', '', '']);
      toast.success(currentUser.is_super_admin ? "Master Override: Vault Unlocked" : "Vault Unlocked.", { id: loadingToast });

    } catch (err) {
      console.error("Vault Unlock Crash:", err);
      // 🔥 This explicitly shows the exact error on the screen!
      toast.error(err.message, { id: loadingToast, duration: 8000 });
    }
  };

  const handleTriggerRecovery = async () => {
    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString(); 
    await supabase.from('profiles').update({ vault_recovery_code: generatedCode }).eq('id', currentUser.id);
    
    try {
      await emailjs.send(
        'service_tmrlwmt',    
        'template_qlqf4ht',    
        { user_name: currentUser.full_name, user_email: currentUser.email, recovery_code: generatedCode },
        'R7rTyfs6mW0RnZ5bj'      
      );
      
      // Reset all fields when opening recovery view
      setOtp(['', '', '', '', '', '']);
      setNewPin(['', '', '', '']);
      setIsRecovering(true);
      toast.success("A secure recovery code has been sent to your email.");
    } catch (err) {
      toast.error("Failed to send recovery email.");
    }
  };

  const handleResetPin = async (e) => {
    e.preventDefault();
    
    const recoveryCodeInput = otp.join('');
    const newPinAttempt = newPin.join('');

    if (recoveryCodeInput.length !== 6) return toast.error("Please enter the complete 6-digit code.");
    if (newPinAttempt.length !== 4) return toast.error("Please enter a complete 4-digit new PIN.");

    const { data: profile } = await supabase.from('profiles').select('vault_recovery_code').eq('id', currentUser.id).single();
    
    if (profile.vault_recovery_code === recoveryCodeInput) {
      const hashedNewPin = await hashPin(newPinAttempt);
      await supabase.from('profiles').update({ sensitive_vault_pin: hashedNewPin, vault_recovery_code: null }).eq('id', currentUser.id);
      setIsRecovering(false);
      setNewPin(['', '', '', '']);
      setOtp(['', '', '', '', '', '']);
      toast.success("Vault PIN successfully reset! You may now log in.");
    } else {
      toast.error("Invalid recovery code.");
    }
  };

  // ==========================================
  // 🔐 INTERACTIVE BOX HANDLERS
  // ==========================================

  // --- Main Vault PIN Handlers ---
  const handlePinChange = (index, value) => {
    if (isNaN(value)) return;
    const newPinArr = [...pin]; newPinArr[index] = value; setPin(newPinArr);
    if (value !== '' && index < 3) pinRefs.current[index + 1].focus();
  };
  const handlePinKeyDown = (index, e) => { if (e.key === 'Backspace' && !pin[index] && index > 0) pinRefs.current[index - 1].focus(); };
  const handlePinPaste = (e) => {
    e.preventDefault(); const pastedData = e.clipboardData.getData('text').slice(0, 4).split('');
    if (pastedData.some(isNaN)) return;
    const newPinArr = [...pin]; pastedData.forEach((char, i) => { if (i < 4) newPinArr[i] = char; }); setPin(newPinArr);
    if (pastedData.length > 0) pinRefs.current[Math.min(pastedData.length, 3)].focus();
  };

  // --- New PIN Handlers (For Reset) ---
  const handleNewPinChange = (index, value) => {
    if (isNaN(value)) return;
    const newPinArr = [...newPin]; newPinArr[index] = value; setNewPin(newPinArr);
    if (value !== '' && index < 3) newPinRefs.current[index + 1].focus();
  };
  const handleNewPinKeyDown = (index, e) => { if (e.key === 'Backspace' && !newPin[index] && index > 0) newPinRefs.current[index - 1].focus(); };
  const handleNewPinPaste = (e) => {
    e.preventDefault(); const pastedData = e.clipboardData.getData('text').slice(0, 4).split('');
    if (pastedData.some(isNaN)) return;
    const newPinArr = [...newPin]; pastedData.forEach((char, i) => { if (i < 4) newPinArr[i] = char; }); setNewPin(newPinArr);
    if (pastedData.length > 0) newPinRefs.current[Math.min(pastedData.length, 3)].focus();
  };

  // --- 6-Digit OTP Handlers ---
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp]; newOtp[index] = value; setOtp(newOtp);
    if (value !== '' && index < 5) otpRefs.current[index + 1].focus();
  };
  const handleOtpKeyDown = (index, e) => { if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1].focus(); };
  const handleOtpPaste = (e) => {
    e.preventDefault(); const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    if (pastedData.some(isNaN)) return;
    const newOtp = [...otp]; pastedData.forEach((char, i) => { if (i < 6) newOtp[i] = char; }); setOtp(newOtp);
    if (pastedData.length > 0) otpRefs.current[Math.min(pastedData.length, 5)].focus();
  };


  // =========================================================================
  // STANDARD ENGINE
  // =========================================================================
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

  const fetchReceipts = async () => {
    setLoading(true);
    let query = supabase.from('receipts').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    
    query = query.eq('is_sensitive', false);
    
    if (!isAdmin) query = query.eq('uploaded_by', currentUser.id);
    
    if (searchUser) query = query.ilike('submitter_name', `%${searchUser}%`);
    if (searchCategory) query = query.ilike('category', `%${searchCategory}%`);
    if (searchDateFrom) query = query.gte('created_at', `${searchDateFrom}T00:00:00.000Z`);
    if (searchDateTo) query = query.lte('created_at', `${searchDateTo}T23:59:59.999Z`);

    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) toast.error(`Database sync failed: ${error.message}`);
    else {
      setReceipts(data || []);
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (activeTab === 'standard') fetchReceipts();
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [searchUser, searchCategory, searchDateFrom, searchDateTo, page, activeTab]);

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true });
    if (data) setAllUsers(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('receipt_categories').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data) setCategories(data);
  };

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
              setSensitiveReceipts(prev => prev.filter(r => r.id !== id));
              const { error } = await supabase.from('receipts').delete().eq('id', id);
              if (error) { toast.error(`Failed to delete: ${error.message}`); } 
              else { toast.success('Receipt permanently deleted.'); }
            }} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2.5 rounded-xl transition-colors shadow-md">Yes, Delete</button>
        </div>
      </div>
    ), { duration: Infinity, id: `delete-${id}` });
  };

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

        {/* 🚀 NAVBAR TOGGLE */}
        <div className="bg-white rounded-2xl p-2 flex gap-2 border border-slate-200 shadow-sm">
          <button 
            onClick={() => { setActiveTab('standard'); setIsUnlocked(false); }}
            className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${activeTab === 'standard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            📄 Standard Public Receipts
          </button>
          <button 
            onClick={() => setActiveTab('sensitive')}
            className={`flex-1 py-3 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'sensitive' ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            🔒 Highly Sensitive Vault
          </button>
        </div>

        {/* ========================================================= */}
        {/* VIEW 1: STANDARD RECEIPTS */}
        {/* ========================================================= */}
        {activeTab === 'standard' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 🎛️ ADVANCED SEARCH & FILTER PANEL */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm relative">
              {loading && (
                <div className="absolute top-4 right-5 flex items-center gap-2 text-xs font-bold text-blue-600 animate-pulse">
                  <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></span> Syncing...
                </div>
              )}
              <div className="mb-4 border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🔎 Filter Public Records</h3>
              </div>
              <div className={`grid gap-4 ${isAdmin ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
                
                {isAdmin && (
                  <div className="relative z-30" ref={userDropdownRef}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Employee Name</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">👤</span>
                      <input 
                        type="text" placeholder="Search name..." value={searchUser} 
                        onChange={(e) => { setSearchUser(e.target.value); setIsUserDropdownOpen(true); setPage(1); }}
                        onFocus={() => setIsUserDropdownOpen(true)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">▼</span>
                    </div>
                    {isUserDropdownOpen && (
                      <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg max-h-60 overflow-y-auto">
                        <div className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-sm font-bold text-slate-600" onClick={() => { setSearchUser(''); setIsUserDropdownOpen(false); setPage(1); }}>-- All Employees --</div>
                        {filteredDropdownUsers.map(user => (
                          <div key={user.id} className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700" onClick={() => { setSearchUser(user.full_name); setIsUserDropdownOpen(false); setPage(1); }}>{user.full_name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="relative z-20" ref={catDropdownRef}>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🏷️</span>
                    <input 
                      type="text" placeholder="Select category..." value={searchCategory} 
                      onChange={(e) => { setSearchCategory(e.target.value); setIsCatDropdownOpen(true); setPage(1); }}
                      onFocus={() => setIsCatDropdownOpen(true)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                  {isCatDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 shadow-xl rounded-lg max-h-60 overflow-y-auto">
                      <div className="p-2.5 hover:bg-slate-50 border-b border-slate-100 cursor-pointer text-sm font-bold text-slate-600" onClick={() => { setSearchCategory(''); setIsCatDropdownOpen(false); setPage(1); }}>-- All Categories --</div>
                      {filteredDropdownCats.map(cat => (
                        <div key={cat.id} className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm text-slate-700 flex items-center gap-2" onClick={() => { setSearchCategory(cat.name); setIsCatDropdownOpen(false); setPage(1); }}><span>{cat.icon}</span> {cat.name}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="z-10"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date From</label><input type="date" value={searchDateFrom} onChange={(e) => { setSearchDateFrom(e.target.value); setPage(1); }} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-slate-700" /></div>
                <div className="z-10"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date To</label><input type="date" value={searchDateTo} onChange={(e) => { setSearchDateTo(e.target.value); setPage(1); }} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-slate-700" /></div>
              </div>
            </div>

            {/* 🖼️ GALLERY GRID */}
            {receipts.length === 0 && !loading ? (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-sm"><span className="text-4xl block mb-2">📭</span>No public receipts found matching your current filters.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 min-h-[400px]">
                {receipts.map(receipt => (
                  <div key={receipt.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all group flex flex-col h-full">
                    <a href={receipt.file_url} target="_blank" rel="noreferrer" className="block relative h-48 overflow-hidden bg-slate-100 shrink-0 border-b border-slate-100">
                      <img src={receipt.file_url} referrerPolicy="no-referrer" alt="Receipt" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </a>
                    <div className="p-5 flex flex-col flex-1 bg-white">
                      <div className="space-y-3 flex-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider truncate">{receipt.category}</span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0 bg-slate-50 px-2 py-1 rounded">{new Date(receipt.created_at).toLocaleDateString()}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 leading-tight break-words">{receipt.purpose}</h4>
                      </div>
                      {isAdmin && (
                        <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0"><div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">{receipt.submitter_name.charAt(0)}</div><p className="text-xs text-slate-600 font-medium truncate">{receipt.submitter_name}</p></div>
                          {currentUser?.is_super_admin && (<button onClick={() => handleDeleteReceipt(receipt.id, receipt.purpose)} className="shrink-0 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white transition-colors p-1.5 rounded-md">🗑️</button>)}
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
                <p className="text-sm text-slate-500 font-medium">Showing <span className="font-bold text-slate-900">{(page - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-900">{Math.min(page * ITEMS_PER_PAGE, totalCount)}</span> of <span className="font-bold text-slate-900">{totalCount}</span> receipts</p>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all">← Previous</button>
                  <div className="flex items-center px-4 font-mono text-sm font-bold text-slate-400 bg-slate-50 rounded-lg">{page} / {totalPages}</div>
                  <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: SENSITIVE VAULT */}
        {/* ========================================================= */}
        {activeTab === 'sensitive' && (
          <div className="animate-fadeIn">
            {!isUnlocked && (
              <div className="max-w-md mx-auto bg-white rounded-3xl p-8 shadow-2xl border border-slate-200 mt-12 text-center relative overflow-hidden">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🔒</div>
                
                {!isRecovering ? (
                  <>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">{currentUser.is_super_admin ? 'Master Admin Access' : 'Restricted Area'}</h2>
                    <p className="text-sm text-slate-500 mb-8">{currentUser.is_super_admin ? 'Click below to execute master override.' : 'Enter or Create a 4-Digit PIN to access the Vault.'}</p>
                    
                    <form onSubmit={handleUnlockVault} className="space-y-4">
                      
                      {/* 🚀 THE NEW 4-BOX VAULT PIN INTERFACE */}
                      {!currentUser.is_super_admin && (
                        <div className="flex justify-center gap-3 sm:gap-4 mb-6">
                          {pin.map((digit, index) => (
                            <input
                              key={index}
                              ref={el => pinRefs.current[index] = el}
                              type="password"
                              inputMode="numeric"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handlePinChange(index, e.target.value)}
                              onKeyDown={(e) => handlePinKeyDown(index, e)}
                              onPaste={handlePinPaste}
                              className="w-14 h-16 sm:w-16 sm:h-20 bg-slate-50 border-2 border-slate-200 text-center text-3xl font-black text-slate-900 rounded-2xl shadow-inner focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
                            />
                          ))}
                        </div>
                      )}

                      <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-xl shadow-md transition-all">
                        {currentUser.is_super_admin ? 'Override Vault Lock' : 'Access Vault'}
                      </button>

                      {!currentUser.is_super_admin && (
                        <button type="button" onClick={handleTriggerRecovery} className="text-xs text-red-500 font-bold hover:underline pt-2">Forgot PIN?</button>
                      )}
                    </form>
                  </>
                ) : (
                  
                  // 🚀 THE UPGRADED RECOVERY UI
                  <form onSubmit={handleResetPin} className="space-y-6 animate-fadeIn">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 mb-2">Reset Vault PIN</h3>
                      <p className="text-sm text-slate-600 font-medium">Enter the 6-digit code sent to your email and create a new PIN.</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-left mb-2">1. Verification Code</p>
                      <div className="flex justify-between gap-1 sm:gap-2">
                        {otp.map((digit, index) => (
                          <input
                            key={index}
                            ref={el => otpRefs.current[index] = el}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpChange(index, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            onPaste={handleOtpPaste}
                            className="w-10 h-12 sm:w-12 sm:h-14 bg-slate-50 border border-slate-300 text-center text-lg font-black text-slate-900 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-left mb-2">2. Create New 4-Digit PIN</p>
                      <div className="flex justify-center gap-3 max-w-[240px] mx-auto">
                        {newPin.map((digit, index) => (
                          <input
                            key={index}
                            ref={el => newPinRefs.current[index] = el}
                            type="password"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleNewPinChange(index, e.target.value)}
                            onKeyDown={(e) => handleNewPinKeyDown(index, e)}
                            onPaste={handleNewPinPaste}
                            className="w-12 h-14 sm:w-14 sm:h-16 bg-slate-50 border-2 border-slate-200 text-center text-2xl font-black text-slate-900 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
                          />
                        ))}
                      </div>
                    </div>

                    <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl shadow-md transition-all">
                      Verify & Reset PIN
                    </button>
                    
                    <button type="button" onClick={() => setIsRecovering(false)} className="text-xs text-slate-500 hover:text-slate-700 underline pt-2 block w-full">
                      Cancel Request
                    </button>
                  </form>
                )}
              </div>
            )}

            {isUnlocked && (
              <div className="p-8 bg-red-50 rounded-3xl shadow-inner border border-red-200 border-dashed">
                <div className="flex justify-between items-center mb-8 border-b border-red-200 pb-4">
                  <h3 className="text-xl font-black text-red-900 flex items-center gap-2">🔓 Secure Sensitive Vault</h3>
                  {currentUser.is_super_admin && <span className="bg-red-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-widest shadow-sm">Master Override Active</span>}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {sensitiveReceipts.length === 0 ? (
                    <p className="text-sm text-red-800 font-medium col-span-full text-center py-10">No sensitive documents found in this vault.</p>
                  ) : (
                    sensitiveReceipts.map((receipt) => (
                      <div key={receipt.id} className="bg-white border border-red-200 rounded-2xl shadow-md overflow-hidden flex flex-col h-full">
                        <a href={receipt.signed_url} target="_blank" rel="noreferrer" className="block relative h-48 overflow-hidden bg-slate-100 shrink-0 border-b border-red-100">
                          <img src={receipt.signed_url} referrerPolicy="no-referrer" alt="Sensitive Receipt" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                          <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md">LOCKED</div>
                        </a>
                        <div className="p-4 flex flex-col flex-1 bg-white">
                          <h4 className="text-sm font-bold text-red-900 leading-tight mb-2">{receipt.purpose}</h4>
                          <span className="text-[10px] text-red-400 font-mono">{new Date(receipt.created_at).toLocaleDateString()}</span>
                          
                          {currentUser.is_super_admin && (
                            <div className="mt-4 pt-3 border-t border-red-50 flex justify-between items-center">
                              <p className="text-[10px] font-bold text-red-500 uppercase">{receipt.submitter_name}</p>
                              <button onClick={() => handleDeleteReceipt(receipt.id, receipt.purpose)} className="text-red-500 hover:text-red-700">🗑️</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}