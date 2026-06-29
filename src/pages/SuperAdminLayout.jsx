import { useState } from 'react';
import { supabase } from '../supabaseClient';
import CategoryManager from '../components/CategoryManager';
import MasterWorkflowLedger from '../components/MasterWorkflowLedger';
import MasterFinancialLedger from '../components/MasterFinancialLedger';
import ReportGenerator from '../components/ReportGenerator';

export default function SuperAdminLayout({ currentUser }) {
  const [activeView, setActiveView] = useState('categories');

  if (!currentUser?.is_super_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-red-200 p-8 rounded-2xl shadow-xl max-w-md text-center">
          <h2 className="text-2xl font-black text-slate-900 mb-2">🛑 Access Denied</h2>
          <p className="text-slate-500 mb-6">You do not have Super Admin clearance to view this console.</p>
          <button onClick={() => window.location.reload()} className="bg-slate-900 text-white font-bold px-6 py-2 rounded-lg">Return to Dashboard</button>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    if (window.confirm("Sign out of Master Console?")) await supabase.auth.signOut();
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      
      {/* SIDEBAR NAVIGATION */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-20">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            <span className="text-blue-500">⚡</span> MASTER ADMIN
          </h1>
          <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-widest">Global Command Center</p>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <button onClick={() => setActiveView('categories')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'categories' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-400'}`}>
            🗂️ Category Manager
          </button>
          
          <button onClick={() => setActiveView('workflows')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'workflows' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-400'}`}>
            📋 Master Workflows
          </button>
          
          <button onClick={() => setActiveView('financials')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'financials' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-400'}`}>
            🏦 Global Ledgers
          </button>

          <button onClick={() => setActiveView('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeView === 'reports' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-400'}`}>
            🖨️ PDF / CSV Reports
          </button>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={handleSignOut} className="w-full bg-red-950/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 py-2.5 rounded-lg text-xs font-bold transition-colors">
            Exit System
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 z-10 shadow-sm shrink-0">
          <h2 className="text-lg font-black text-slate-800">
            {activeView === 'categories' && 'System Configuration'}
            {activeView === 'workflows' && 'Global Workflow Oversight'}
            {activeView === 'financials' && 'Master Financial Ledgers'}
            {activeView === 'reports' && 'Data Export Engine'}
          </h2>
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser.full_name}</p>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Super Admin Active</p>
            </div>
            <img src={currentUser?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg'} className="w-9 h-9 rounded-full border-2 border-blue-500 shadow-sm" alt="Admin" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 bg-slate-50 relative">
          <div className="max-w-6xl mx-auto pb-12 animate-fadeIn">
            {activeView === 'categories' && <CategoryManager />}
            {activeView === 'workflows' && <MasterWorkflowLedger currentUser={currentUser} />}
            {activeView === 'financials' && <MasterFinancialLedger />}
            {activeView === 'reports' && <ReportGenerator />}
          </div>
        </main>
      </div>
    </div>
  );
}