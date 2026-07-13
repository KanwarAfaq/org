import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
export default function ReceiptForm({ currentUser }) {
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME; 
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET; 
  const navigate = useNavigate();
  
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [purpose, setPurpose] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [isSensitive, setIsSensitive] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase.from('receipt_categories').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data) setCategories(data);
  };

 const triggerNativeCameraPrompt = async () => {
    try {
      // 1. Trigger camera, but ask for Base64 data instead of a restricted Uri
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64, // 👈 FIX 1: Change to Base64
        source: CameraSource.Prompt 
      });

      // 2. Create a secure Data URL string from the Base64 data
      const base64Data = `data:image/jpeg;base64,${image.base64String}`;

      // 3. Convert the Data URL into a web File object (This bypasses mobile security blocks!)
      const response = await fetch(base64Data); // 👈 FIX 2: Fetch the data string, not the file path
      const blob = await response.blob();
      const newFile = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' });

      // 4. Save to state
      setFile(newFile);
      setPreviewUrl(base64Data); // Use the base64 string for the image preview
    } catch (error) {
      console.warn("User cancelled or camera error:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalCategory = selectedCategory === 'custom' ? customCategory.trim() : selectedCategory;
    if (!finalCategory) return toast.error("Please select or type a category.");
    if (!file) return toast.error("Please attach a receipt photo.");
    setIsUploading(true);

    try {
      const cloudFormData = new FormData();
      cloudFormData.append('file', file);
      
      const targetPreset = isSensitive ? 'sensitive_receipts_preset' : UPLOAD_PRESET;
      cloudFormData.append('upload_preset', targetPreset);
      cloudFormData.append('folder', 'financial_receipts');

      const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { 
        method: 'POST', 
        body: cloudFormData 
      });
      const cloudData = await cloudinaryResponse.json();
      if (!cloudinaryResponse.ok) throw new Error(cloudData.error?.message || "Cloudinary upload failed.");

      // 💾 DATABASE INSERT
      const { error: dbError } = await supabase.from('receipts').insert({
        submitter_name: currentUser.full_name, 
        purpose: purpose,
        category: finalCategory,
        file_url: cloudData.secure_url,
        cloudinary_public_id: cloudData.public_id, 
        is_sensitive: isSensitive,                 
        uploaded_by: currentUser.id
      });

      if (dbError) throw dbError;
      toast.success(isSensitive ? "Sensitive receipt locked in vault!" : "Receipt successfully uploaded!");

      // =========================================================================
      // 📱 PUSH NOTIFICATION: NOTIFY ALL ADMINS OF NEW RECEIPT
      // =========================================================================
      try {
        // Find everyone who is an admin or super admin
        const { data: admins } = await supabase.from('profiles')
          .select('id')
          .or('role.eq.admin,is_super_admin.eq.true');

        if (admins && admins.length > 0) {
          // Send a push notification to every admin's computer simultaneously
          const pushPromises = admins.map(admin => 
            supabase.functions.invoke('send-push', {
              body: {
                target_user_id: admin.id,
                heading: "New Receipt Uploaded 📸",
                message: `${currentUser.full_name} submitted a new ${isSensitive ? '🔒 locked ' : ''}receipt for: ${purpose}.`
              }
            })
          );
          await Promise.all(pushPromises);
        }
      } catch (pushErr) {
        console.warn("Push notification to admins failed:", pushErr);
      }
      // =========================================================================

      navigate('/receipt-vault');

    } catch (error) {
      toast.error(`Upload Error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fadeIn">
        
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black">📸 Upload Receipt</h2>
            <p className="text-sm text-slate-400">Submitting as: {currentUser.full_name}</p>
          </div>
          <button 
            onClick={() => navigate('/')} 
            className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700 shadow-sm"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Receipt Category</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {categories.map(cat => (
                <button key={cat.id} type="button" onClick={() => { setSelectedCategory(cat.name); setCustomCategory(''); }}
                  className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-colors ${selectedCategory === cat.name ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {cat.icon} {cat.name}
                </button>
              ))}
              <button type="button" onClick={() => setSelectedCategory('custom')} className={`text-xs font-bold px-3 py-1.5 rounded-md border ${selectedCategory === 'custom' ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>✍️ Custom...</button>
            </div>
            {selectedCategory === 'custom' && (
              <input type="text" placeholder="Type custom category..." value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} required className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 mt-2" />
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Business Purpose</label>
            <input type="text" required value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. Client Dinner" />
          </div>

         {/* 🚀 Changed from an input field to a native click trigger */}
          <div onClick={triggerNativeCameraPrompt} className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-slate-50 relative hover:bg-slate-100 cursor-pointer transition-colors">
            {previewUrl ? (
              <div className="space-y-2">
                <img src={previewUrl} className="max-h-48 mx-auto rounded-lg shadow-sm" alt="Preview" />
                <p className="text-xs font-bold text-blue-600">Tap to change photo</p>
              </div>
            ) : (
              <div className="py-6 space-y-2">
                <span className="text-4xl">📷</span>
                <p className="text-sm font-bold text-slate-700">Take Photo or Choose File</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mt-2 transition-all">
            <input 
              type="checkbox" 
              id="sensitive-toggle" 
              checked={isSensitive} 
              onChange={(e) => setIsSensitive(e.target.checked)}
              className="w-5 h-5 text-red-600 rounded focus:ring-red-500 cursor-pointer border-red-300"
            />
            <label htmlFor="sensitive-toggle" className="text-sm font-bold text-red-900 cursor-pointer select-none">
              🔒 Mark as Highly Sensitive
              <span className="block text-xs font-normal text-red-700 mt-0.5">
                This document will be encrypted and locked in your personal vault.
              </span>
            </label>
          </div>

          <button type="submit" disabled={isUploading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-6 py-4 rounded-xl shadow-md disabled:opacity-50 flex justify-center items-center gap-2 transition-transform hover:scale-[1.02]">
            {isUploading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processing...</> : '📤 Submit Receipt'}
          </button>
        </form>
      </div>
    </div>
  );
}