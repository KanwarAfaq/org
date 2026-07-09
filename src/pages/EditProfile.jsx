import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function EditProfile({ currentUser, refreshProfile }) { // ⬅️ Add it here
  const navigate = useNavigate();
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME; 
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET; 

  const [formData, setFormData] = useState({ fullName: '', phone: '', address: '' });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // OTP State
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    // 🚀 THE FIX: Only populate the form if we are NOT in the middle of verifying an OTP!
    // This stops React from overwriting your new text with the old database data.
    if (currentUser && !isVerifyingOtp) {
      setFormData({
        fullName: currentUser.full_name || '', 
        phone: currentUser.phone || '', 
        address: currentUser.address || ''
      });
      setPreviewUrl(currentUser.avatar_url || null);
    }
  }, [currentUser, isVerifyingOtp]);

  useEffect(() => {
    let timer;
    if (countdown > 0 && isVerifyingOtp) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown, isVerifyingOtp]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile)); 
    }
  };

  // ==========================================
  // 🔐 TRIGGER OTP FOR PROFILE CHANGES
  // ==========================================
  const handleInitiateSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // Send OTP to their current email as an identity check
      const { error } = await supabase.auth.signInWithOtp({ email: currentUser.email });
      if (error) throw error;

      toast.success("Security Check: Code sent to your email.");
      setOtp(['', '', '', '', '', '']);
      setCountdown(120);
      setIsVerifyingOtp(true);
    } catch (err) {
      toast.error(`Verification setup failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // 🔐 VERIFY & APPLY CHANGES
  // ==========================================
  const handleVerifyAndSave = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) return toast.error("Please enter the complete 6-digit code.");
    
    setIsSaving(true);
    try {
      // 1. Verify Identity (Changed type to 'magiclink')
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: currentUser.email, token: otpCode, type: 'magiclink'
      });
      if (verifyError) throw verifyError;

      // 2. Upload photo if changed
      let finalAvatarUrl = currentUser.avatar_url;
      if (file) {
        const cloudFormData = new FormData();
        cloudFormData.append('file', file);
        cloudFormData.append('upload_preset', UPLOAD_PRESET);
        cloudFormData.append('folder', 'profile_pictures');

        const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: cloudFormData });
        const cloudData = await cloudinaryResponse.json();
        if (!cloudinaryResponse.ok) throw new Error("Failed to upload new profile picture.");
        finalAvatarUrl = cloudData.secure_url;
      }

    // 3. Update Database
      const { error: dbError } = await supabase.from('profiles').update({
        full_name: formData.fullName, 
        phone: formData.phone, 
        address: formData.address, 
        avatar_url: finalAvatarUrl
      })
      .eq('id', currentUser.id)
      .select()
      .single();

      if (dbError) throw dbError;

      toast.success("Profile verified and updated successfully!");
      
      // 🚀 THE REACT WAY: Ask App.jsx to update its state, THEN smoothly route back!
      if (refreshProfile) {
        await refreshProfile(); 
      }
      
      navigate('/'); // Smooth SPA routing restored!

    } catch (error) {
      toast.error(`Update Error: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // 🔐 OTP UI HELPERS
  // ==========================================
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
  
  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: currentUser.email });
      if (error) throw error;
      toast.success("A new OTP has been sent to your email.");
      setCountdown(120);
    } catch (err) { toast.error(`Resend Failed: ${err.message}`); } 
    finally { setIsSaving(false); }
  };

  const formatTime = (seconds) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${s < 10 ? '0' : ''}${s}`; };

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden animate-fadeIn">
        
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
          <div><h2 className="text-xl font-black">⚙️ Edit Profile</h2><p className="text-xs text-slate-400 mt-1">{currentUser?.email}</p></div>
          {!isVerifyingOtp && <button onClick={() => navigate('/')} className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700">Cancel</button>}
        </div>

        {!isVerifyingOtp ? (
          <form onSubmit={handleInitiateSave} className="p-8 space-y-5">
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="relative w-24 h-24 rounded-full bg-slate-100 border border-slate-300 shadow-sm flex items-center justify-center overflow-hidden hover:opacity-80 cursor-pointer transition-all">
                <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                {previewUrl ? <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" /> : <span className="text-3xl text-slate-300">👤</span>}
              </div>
              <p className="text-[10px] font-bold text-blue-600 uppercase mt-2 tracking-wider">Tap to change photo</p>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label><input type="text" name="fullName" value={formData.fullName} onChange={handleChange} required className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label><input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1">Mailing Address</label><textarea name="address" value={formData.address} onChange={handleChange} rows="3" className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" /></div>
            </div>
            <button type="submit" disabled={isSaving} className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-xl shadow-md transition-all disabled:opacity-50 mt-4">{isSaving ? 'Processing...' : 'Save Profile'}</button>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndSave} className="p-8 space-y-8 animate-fadeIn">
            <div>
              <h3 className="text-xl font-extrabold text-slate-900 text-center mb-2">Verify Identity</h3>
              <p className="text-sm text-slate-600 text-center font-medium">To apply these changes, please enter the 6-digit code sent to <br/><span className="font-bold text-slate-900">{currentUser?.email}</span></p>
            </div>
            
            <div className="flex justify-between gap-1 sm:gap-2">
              {otp.map((digit, index) => (
                <input key={index} ref={el => otpRefs.current[index] = el} type="text" maxLength={1} value={digit} onChange={(e) => handleOtpChange(index, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(index, e)} onPaste={handleOtpPaste} className="w-10 h-12 sm:w-12 sm:h-14 bg-white border border-slate-300 text-center text-lg font-black text-slate-900 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" />
              ))}
            </div>

            <button type="submit" disabled={isSaving} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl shadow-md transition-all disabled:opacity-50">
              {isSaving ? 'Updating...' : 'Confirm & Apply Changes'}
            </button>

            <div className="text-center mt-6">
              <p className="text-xs font-medium text-slate-500">
                Didn't receive it? {countdown > 0 ? <span className="text-emerald-700 font-bold">Wait {formatTime(countdown)}</span> : <button type="button" onClick={handleResendOtp} disabled={isSaving} className="text-slate-900 font-bold hover:underline">Resend Code</button>}
              </p>
              <button type="button" onClick={() => setIsVerifyingOtp(false)} className="mt-6 text-xs text-slate-400 hover:text-slate-700 underline block w-full">Cancel and go back</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}