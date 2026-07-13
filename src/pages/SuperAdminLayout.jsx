import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import StaffDirectory from '../components/StaffDirectory'; 
import CategoryManager from '../components/CategoryManager';
import MasterWorkflowLedger from '../components/MasterWorkflowLedger';
import MasterFinancialLedger from '../components/MasterFinancialLedger';
import ReportGenerator from '../components/ReportGenerator';
import PrintAll from '../components/PrintAll'; 
import { useNavigate } from 'react-router-dom';
import StaffProfiles from './StaffProfiles';

export default function SuperAdminLayout({ currentUser }) {
  const [activeView, setActiveView] = useState('directory');
  const [allProfiles, setAllProfiles] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const navigate = useNavigate();

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
    if (data) setAllProfiles(data);
  };

  useEffect(() => {
    fetchProfiles(); 
    const profileChannel = supabase.channel('super-admin-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
         fetchProfiles();
      }).subscribe();
    return () => supabase.removeChannel(profileChannel);
  }, []);

  if (!currentUser?.is_super_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="bg-white/10 backdrop-blur-lg border border-red-500/30 p-8 rounded-3xl shadow-2xl max-w-md text-center">
          <h2 className="text-3xl font-black text-white mb-2 tracking-tight">🛑 Access Denied</h2>
          <p className="text-slate-400 mb-8 font-medium">Clearance Level: Master Admin Required.</p>
          <button onClick={() => navigate('/')} className="bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-all w-full">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleSignOut = () => {
    toast((t) => (
      <div className="max-w-sm w-full bg-slate-900 shadow-2xl rounded-2xl border border-slate-700 overflow-hidden">
        <div className="p-5 text-center border-b border-slate-800">
          <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-2xl mx-auto mb-3">🔌</div>
          <h3 className="text-sm font-black text-white">Disconnect Console?</h3>
        </div>
        <div className="flex p-3 gap-3 bg-slate-800/50">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl">Cancel</button>
          <button onClick={async () => { toast.dismiss(t.id); await supabase.auth.signOut(); }} className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold text-xs py-2.5 rounded-xl">Sign Out</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const NavButton = ({ id, icon, label, isDanger }) => {
    const isActive = activeView === id;
    
    const handleTabClick = () => {
      if (isDanger) navigate('/receipt-vault');
      else setActiveView(id);
      setIsMobileMenuOpen(false); 
    };

    if (isDanger) {
      return (
        <button onClick={handleTabClick} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all hover:bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group">
          <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span> {label}
        </button>
      );
    }
    return (
      <button onClick={handleTabClick} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'}`}>
        <span className="text-lg">{icon}</span> {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 overflow-hidden font-sans text-slate-200 relative">
      
      {/* 🖥️ DESKTOP-ONLY SIDEBAR DRAWER (Hidden on Mobile) */}
      <div className="hidden md:flex flex-col w-72 bg-slate-900 border-r border-slate-800/50 shadow-2xl shrink-0">
        <div className="p-8 border-b border-slate-800/50">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-white text-sm font-black">⚡</span>
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">SUPER ADMIN</h1>
          </div>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest pl-11">Command Center</p>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          <NavButton id="directory" icon="👥" label="Staff Directory" />
          <NavButton id="categories" icon="🗂️" label="System Configuration" />
          <NavButton id="workflows" icon="📋" label="Global Workflows" />
          <NavButton id="financials" icon="🏦" label="Master Ledger" />
          <NavButton id="reports" icon="🖨️" label="Data Export Engine" />
          <NavButton id="staff" icon="🧑‍💻" label="Manage Roles & Access" />
          <div className="my-2 border-t border-slate-800/50"></div>
          <NavButton id="printall" icon="📑" label="Print All Records" />
          <div className="pt-4">
            <NavButton id="receipt_vault" icon="🗄️" label="Global Receipt Vault" isDanger={true} />
          </div>
        </div>
           
        <div className="p-6 border-t border-slate-800/50">
          <button onClick={handleSignOut} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-3 rounded-xl text-xs font-bold transition-all">🔌 Terminate Session</button>
        </div>
      </div>

      {/* 📱 MOBILE NAVIGATION BAR (4 Primary App Features + 'More' Menu Trigger) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 z-40 px-2 flex justify-between items-center text-center h-16 shadow-2xl pb-safe">
        <button onClick={() => { setActiveView('directory'); setIsMobileMenuOpen(false); }} className={`flex-1 py-1 flex flex-col items-center justify-center text-[10px] font-black ${activeView === 'directory' ? 'text-blue-500' : 'text-slate-500'}`}><span className="text-base mb-0.5">👥</span>Dir</button>
        <button onClick={() => { setActiveView('workflows'); setIsMobileMenuOpen(false); }} className={`flex-1 py-1 flex flex-col items-center justify-center text-[10px] font-black ${activeView === 'workflows' ? 'text-blue-500' : 'text-slate-500'}`}><span className="text-base mb-0.5">📋</span>Flows</button>
        <button onClick={() => { setActiveView('financials'); setIsMobileMenuOpen(false); }} className={`flex-1 py-1 flex flex-col items-center justify-center text-[10px] font-black ${activeView === 'financials' ? 'text-blue-500' : 'text-slate-500'}`}><span className="text-base mb-0.5">🏦</span>Ledger</button>
        <button onClick={() => navigate('/receipt-vault')} className="flex-1 py-1 flex flex-col items-center justify-center text-[10px] font-black text-emerald-400"><span className="text-base mb-0.5">🗄️</span>Vault</button>
        <button onClick={() => setIsMobileMenuOpen(true)} className="flex-1 py-1 flex flex-col items-center justify-center text-[10px] font-black text-slate-400 hover:text-white"><span className="text-base mb-0.5">☰</span>More</button>
      </div>

      {/* 📱 MOBILE "MORE" DRAWER OVERLAY (Holds the remaining missing buttons) */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex justify-end">
          {/* Dark background click-away closer */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          
          {/* Sliding Side Panel */}
          <div className="relative w-64 bg-slate-900 h-full border-l border-slate-800 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 flex justify-between items-center border-b border-slate-800">
              <span className="font-black text-white text-sm">More Options</span>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl px-2">×</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <NavButton id="categories" icon="🗂️" label="System Configuration" />
              <NavButton id="reports" icon="🖨️" label="Data Export Engine" />
              <NavButton id="staff" icon="🧑‍💻" label="Manage Roles" />
              <div className="my-2 border-t border-slate-800"></div>
              <NavButton id="printall" icon="📑" label="Print Master" />
            </div>

            <div className="p-4 border-t border-slate-800 mb-16">
              <button onClick={handleSignOut} className="w-full bg-red-500/10 text-red-400 border border-red-500/20 py-3 rounded-xl text-xs font-bold">🔌 Sign Out</button>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE FRAME CONTENT */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-900 pb-16 md:pb-0 z-10">
        <header className="bg-white border-b border-slate-200 h-20 hidden md:flex items-center justify-between px-10 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl shadow-inner">
              {activeView === 'categories' && '🗂️'}
              {activeView === 'workflows' && '📋'}
              {activeView === 'financials' && '🏦'}
              {activeView === 'reports' && '🖨️'}
              {activeView === 'directory' && '👥'}
              {activeView === 'staff' && '🧑‍💻'} 
              {activeView === 'printall' && '📑'} 
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">
                {activeView === 'categories' && 'System Configuration'}
                {activeView === 'workflows' && 'Global Workflow Oversight'}
                {activeView === 'financials' && 'Master Financial Ledgers'}
                {activeView === 'reports' && 'Data Export Engine'}
                {activeView === 'directory' && 'Staff Directory'}
                {activeView === 'staff' && 'Employee Access & Roles'} 
                {activeView === 'printall' && 'Master Export Engine'} 
              </h2>
              <p className="text-xs font-bold text-slate-400 mt-0.5">Live Database Connection</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-50 p-2 pr-4 rounded-full border border-slate-200 shadow-sm">
            <img src={currentUser?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg'} referrerPolicy="no-referrer" className="w-10 h-10 rounded-full bg-white shadow-sm" alt="Admin" />
            <div className="text-left">
              <p className="text-sm font-black text-slate-900 leading-tight">{currentUser.full_name}</p>
              <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest mt-0.5">Super Admin</p>
            </div>
          </div>
        </header>

        {/* MOBILE HEADER (When Drawer is closed) */}
        <header className="md:hidden bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 shrink-0 shadow-sm">
           <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
              {activeView === 'directory' && '👥 Directory'}
              {activeView === 'workflows' && '📋 Workflows'}
              {activeView === 'financials' && '🏦 Ledgers'}
              {activeView === 'categories' && '🗂️ Config'}
              {activeView === 'reports' && '🖨️ Exports'}
              {activeView === 'staff' && '🧑‍💻 Roles'}
              {activeView === 'printall' && '📑 Print'}
           </h2>
           <button onClick={() => navigate('/')} className="text-[10px] font-black border border-slate-300 px-3 py-1.5 rounded-lg bg-slate-50 shadow-sm">🏠 App Home</button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-10 relative">
          <div className="max-w-7xl mx-auto pb-12 animate-fadeIn">
            {activeView === 'categories' && <CategoryManager />}
            {activeView === 'workflows' && <MasterWorkflowLedger currentUser={currentUser} />}
            {activeView === 'financials' && <MasterFinancialLedger />}
            {activeView === 'reports' && <ReportGenerator />}
            {activeView === 'directory' && <StaffDirectory allProfiles={allProfiles} currentUser={currentUser} fetchAdminData={fetchProfiles} />}
            {activeView === 'staff' && <StaffProfiles currentUser={currentUser} />}
            {activeView === 'printall' && <PrintAll />}
          </div>
        </main>
      </div>
    </div>
  );
}