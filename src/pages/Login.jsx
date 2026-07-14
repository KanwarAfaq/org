import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export default function Login() {
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME; 
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET; 

  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState(''); 
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    let timer;
    if (countdown > 0 && (view === 'otp' || view === 'forgot_otp')) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown, view]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile)); 
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (view === 'signup') {
      try {
        let uploadedAvatarUrl = null;
        if (file) {
          const cloudFormData = new FormData();
          cloudFormData.append('file', file);
          cloudFormData.append('upload_preset', UPLOAD_PRESET);
          cloudFormData.append('folder', 'profile_pictures');
          const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: cloudFormData });
          const cloudData = await cloudinaryResponse.json();
          if (!cloudinaryResponse.ok) throw new Error(cloudData.error?.message || "Image upload failed.");
          uploadedAvatarUrl = cloudData.secure_url;
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: fullName } }
        });
        if (authError) throw authError;

        if (authData?.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: authData.user.id, email, full_name: fullName, phone, address, avatar_url: uploadedAvatarUrl, role: 'member', is_active: true
          }, { onConflict: 'id' });
          if (profileError) throw profileError;
        }

        toast.success('Verification code sent to your email!');
        setCountdown(120); setOtp(['', '', '', '', '', '']); setView('otp');
      } catch (err) { toast.error(`Signup Failed: ${err.message}`); }
    } else if (view === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message); else toast.success(`Welcome back!`);
    }
    setLoading(false);
  };

  // ==========================================
  // 🔐 FORGOT PASSWORD OTP FLOW
  // ==========================================
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("Please enter your corporate email.");
    setLoading(true);
    try {
      const { data: existingUser, error: searchError } = await supabase.from('profiles').select('id').eq('email', email.trim()).maybeSingle();
      if (searchError) throw searchError;
      if (!existingUser) { toast.error("No account found with that email address."); setLoading(false); return; }

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      
      toast.success("Recovery OTP sent to your inbox!");
      setCountdown(120); setOtp(['', '', '', '', '', '']); setView('forgot_otp');
    } catch (err) { toast.error(`Recovery request failed: ${err.message}`); } 
    finally { setLoading(false); }
  };

  const handleVerifyForgotOtp = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) return toast.error("Please enter the complete 6-digit code.");
    if (newPassword.length < 6) return toast.error("New password must be at least 6 characters.");
    
    setLoading(true);
    try {
      // 1. Verify the OTP (This logs them in temporarily)
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'recovery' });
      if (verifyError) throw verifyError;

      // 2. Immediately update to the new password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      toast.success("Password successfully updated! Securing session...");
    } catch (err) { toast.error(`Recovery Failed: ${err.message}`); } 
    finally { setLoading(false); }
  };

  // ==========================================
  // 🔐 GENERAL OTP LOGIC (Inputs & Resend)
  // ==========================================
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp]; newOtp[index] = value; setOtp(newOtp);
    if (value !== '' && index < 5) otpRefs.current[index + 1].focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1].focus();
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    if (pastedData.some(isNaN)) return;
    const newOtp = [...otp];
    pastedData.forEach((char, i) => { if (i < 6) newOtp[i] = char; });
    setOtp(newOtp);
    if (pastedData.length > 0) otpRefs.current[Math.min(pastedData.length, 5)].focus();
  };

  const handleVerifySignupOtp = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) return toast.error("Please enter the complete 6-digit code.");
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' });
      if (error) throw error;
      toast.success("Verification successful! Securing session...");

      try {
        const { data: admins } = await supabase.from('profiles').select('id').or('role.eq.admin,is_super_admin.eq.true');
        if (admins && admins.length > 0) {
          const pushPromises = admins.map(admin => supabase.functions.invoke('send-push', { body: { target_user_id: admin.id, heading: "New Employee Joined 🎉", message: `${fullName} has verified their account.` } }));
          await Promise.all(pushPromises);
        }
      } catch (pushErr) { console.warn("Push failed:", pushErr); }
    } catch (err) { toast.error(`Verification Failed: ${err.message}`); } 
    finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      if (view === 'forgot_otp') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resend({ type: 'signup', email: email });
        if (error) throw error;
      }
      toast.success("A new OTP has been sent to your email.");
      setCountdown(120); 
    } catch (err) { toast.error(`Resend Failed: ${err.message}`); } 
    finally { setLoading(false); }
  };

 const handleGoogleLogin = async () => {
    // This is the most stable method: it lets the browser handle the redirect naturally
    await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo: window.location.origin // Stay on the standard redirect flow
      }
    }); 
  };
  const formatTime = (seconds) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${s < 10 ? '0' : ''}${s}`; };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#c8f0d8] to-[#e4f9ed] p-4 lg:p-8 font-sans">
      <div className="w-full max-w-5xl bg-[#d5f3df]/60 backdrop-blur-3xl rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white/40 overflow-hidden flex flex-col lg:flex-row">
        
        {/* 🟢 LEFT SIDE: Dynamic Forms */}
        <div className="w-full lg:w-1/2 p-8 sm:p-12 flex flex-col justify-center relative z-10">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">KeepEye</h1>
          </div>

          {/* ================= LOGIN VIEW ================= */}
          {view === 'login' && (
            <div className="animate-fadeIn">
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">Welcome Back !</h2>
              <p className="text-sm text-slate-600 mb-8 font-medium">Enter your credentials to login</p>
              <form onSubmit={handleAuth} className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-5 py-4 bg-white border border-white/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-slate-800 placeholder:text-slate-400 font-medium transition-all" placeholder="Email" />
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-5 py-4 bg-white border border-white/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-slate-800 placeholder:text-slate-400 font-medium transition-all" placeholder="Password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={showPassword ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"}></path></svg></button>
                </div>
                <div className="flex justify-end w-full">
                  <button type="button" onClick={() => setView('forgot_email')} className="text-sm font-semibold text-slate-700 hover:text-emerald-700 transition-colors">Forget password?</button>
                </div>
                <button type="submit" disabled={loading} className="w-full py-4 mt-2 bg-[#121312] hover:bg-black text-white font-bold rounded-2xl shadow-xl transition-all duration-300 disabled:opacity-50">{loading ? 'Authenticating...' : 'Sign in'}</button>
              </form>
              <div className="flex items-center my-8"><div className="flex-1 border-t border-slate-300/50"></div><span className="px-4 text-xs text-slate-500 font-medium">or continue</span><div className="flex-1 border-t border-slate-300/50"></div></div>
              <button onClick={handleGoogleLogin} className="w-full py-3.5 bg-white/40 hover:bg-white/60 border border-white/60 text-slate-800 font-bold rounded-2xl flex items-center justify-center gap-3 transition-all shadow-sm"><svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Log in with Google</button>
              <p className="text-center text-sm text-slate-600 font-medium mt-8">Don't have an account ? <button onClick={() => setView('signup')} className="text-slate-900 font-bold hover:underline">Sign Up</button></p>
            </div>
          )}

          {/* ================= FORGOT EMAIL VIEW ================= */}
          {view === 'forgot_email' && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Recover Access</h2>
              <p className="text-sm text-slate-600 mb-8 font-medium">Enter your corporate email to receive a secure recovery code.</p>
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-5 py-4 bg-white border border-white/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-slate-800 placeholder:text-slate-400 font-medium transition-all" placeholder="Corporate Email" />
                <button type="submit" disabled={loading} className="w-full py-4 mt-2 bg-[#121312] hover:bg-black text-white font-bold rounded-2xl shadow-xl transition-all duration-300 disabled:opacity-50">{loading ? 'Sending Code...' : 'Send Recovery Code'}</button>
              </form>
              <div className="mt-8 text-center pt-6 border-t border-slate-300/50">
                <button onClick={() => setView('login')} className="text-sm text-slate-900 font-bold hover:underline">Back to Sign In</button>
              </div>
            </div>
          )}

          {/* ================= FORGOT OTP + NEW PASSWORD VIEW ================= */}
          {view === 'forgot_otp' && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Reset Password</h2>
              <p className="text-sm text-slate-600 mb-6 font-medium">Enter the 6-digit code sent to <br/><span className="font-bold text-slate-900">{email}</span> and your new password.</p>
              <form onSubmit={handleVerifyForgotOtp} className="space-y-6">
                <div className="flex justify-between gap-2 max-w-sm">
                  {otp.map((digit, index) => (
                    <input key={index} ref={el => otpRefs.current[index] = el} type="text" maxLength={1} value={digit} onChange={(e) => handleOtpChange(index, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(index, e)} onPaste={handleOtpPaste} className="w-12 h-14 sm:w-14 sm:h-16 bg-white border border-slate-200 text-center text-xl font-black text-slate-900 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" />
                  ))}
                </div>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full max-w-sm px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm text-slate-800 placeholder:text-slate-400 font-medium transition-all" placeholder="Enter New Password" />
                <button type="submit" disabled={loading} className="w-full max-w-sm py-4 bg-[#121312] hover:bg-black text-white font-bold rounded-2xl shadow-xl transition-all duration-300 disabled:opacity-50">{loading ? 'Processing...' : 'Verify & Update Password'}</button>
              </form>
              <div className="mt-6 text-sm font-medium text-slate-600 flex items-center gap-2">
                Didn't receive it? {countdown > 0 ? <span className="text-emerald-700 font-bold">Wait {formatTime(countdown)}</span> : <button onClick={handleResendOtp} disabled={loading} className="text-slate-900 font-bold hover:underline">Resend Code</button>}
              </div>
              <button onClick={() => setView('forgot_email')} className="mt-4 text-xs text-slate-500 hover:text-slate-800 underline">Change Email Address</button>
            </div>
          )}

          {/* ================= SIGNUP VIEW ================= */}
          {view === 'signup' && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Create Account</h2>
              <p className="text-sm text-slate-600 mb-6 font-medium">Join the organizational workspace</p>
              <form onSubmit={handleAuth} className="space-y-4">
                <div className="flex justify-center mb-4"><div className="relative w-20 h-20 rounded-full bg-white border border-white/50 flex items-center justify-center overflow-hidden hover:scale-105 cursor-pointer transition-transform shadow-sm group"><input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />{previewUrl ? <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" /> : <span className="text-2xl group-hover:opacity-70">📸</span>}</div></div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="col-span-2 px-4 py-3 bg-white border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-sm" placeholder="Full Name *" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="col-span-2 px-4 py-3 bg-white border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-sm" placeholder="Email *" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="px-4 py-3 bg-white border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-sm" placeholder="Password *" />
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="px-4 py-3 bg-white border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-sm" placeholder="Phone" />
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="col-span-2 px-4 py-3 bg-white border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm text-sm" placeholder="Mailing Address" />
                </div>
                <button type="submit" disabled={loading} className="w-full py-4 mt-4 bg-[#121312] hover:bg-black text-white font-bold rounded-2xl shadow-xl transition-all duration-300 disabled:opacity-50">{loading ? 'Processing...' : 'Continue to Verification'}</button>
              </form>
              <p className="text-center text-sm text-slate-600 font-medium mt-6">Already registered ? <button onClick={() => setView('login')} className="text-slate-900 font-bold hover:underline">Sign In</button></p>
            </div>
          )}

          {/* ================= OTP VERIFICATION VIEW (SIGNUP) ================= */}
          {view === 'otp' && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Enter OTP Code</h2>
              <p className="text-sm text-slate-600 mb-8 font-medium">Please enter the 6-digit code sent to<br/><span className="font-bold text-slate-900">{email}</span></p>
              <form onSubmit={handleVerifySignupOtp} className="space-y-8">
                <div className="flex justify-between gap-2 max-w-sm">
                  {otp.map((digit, index) => (
                    <input key={index} ref={el => otpRefs.current[index] = el} type="text" maxLength={1} value={digit} onChange={(e) => handleOtpChange(index, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(index, e)} onPaste={handleOtpPaste} className="w-12 h-14 sm:w-14 sm:h-16 bg-white border border-slate-200 text-center text-xl font-black text-slate-900 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" />
                  ))}
                </div>
                <button type="submit" disabled={loading} className="w-full max-w-sm py-4 bg-[#121312] hover:bg-black text-white font-bold rounded-2xl shadow-xl transition-all duration-300 disabled:opacity-50">{loading ? 'Verifying...' : 'Verify OTP'}</button>
              </form>
              <div className="mt-8 text-sm font-medium text-slate-600 flex items-center gap-2">Didn't receive it? {countdown > 0 ? <span className="text-emerald-700 font-bold">Wait {formatTime(countdown)}</span> : <button onClick={handleResendOtp} disabled={loading} className="text-slate-900 font-bold hover:underline">Resend OTP</button>}</div>
              <button onClick={() => setView('signup')} className="mt-4 text-xs text-slate-500 hover:text-slate-800 underline">Change Email Address</button>
            </div>
          )}

        </div>

        {/* ⬛ RIGHT SIDE: Corporate Branding Panel */}
        <div className="hidden lg:block w-1/2 p-4">
          <div className="w-full h-full bg-[#0a0a0a] rounded-[1.5rem] p-12 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-inner bg-[url('https://www.transparenttextures.com/patterns/black-paper.png')]">
            <div className="absolute top-10 flex items-center justify-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-emerald-400 flex items-center justify-center text-emerald-400"><span className="text-sm font-black">$</span></div><h2 className="text-2xl font-black text-white tracking-wide">Keep<span className="text-emerald-400">Eye</span></h2></div>
            <div className="relative w-48 h-48 my-auto animate-bounce" style={{ animationDuration: '3s' }}><div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full"></div><div className="text-[120px] leading-none absolute inset-0 flex items-center justify-center filter drop-shadow-2xl">💸</div></div>
            <div className="mt-auto z-10">
              <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Track your all transactions</h3>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto mb-8 font-medium">Easily view and manage every transaction without switching screens. Everything stays organized, clear, and always accessible.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}