import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function ReceiptForm({ currentUser }) {
  // ⚠️ PASTE YOUR GOOGLE SCRIPT WEB APP URL HERE:
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxag4w6_YKJTrdH7kv0PF4E__91TV12t6fsnmc7_GALSOUgHA_8EPtATNftCc0blSrLGQ/exec";

  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({ name: '', purpose: '', category: '' });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase.from('workflow_categories').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data) setCategories(data);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile)); 
    }
  };

  const convertBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.readAsDataURL(file);
      fileReader.onload = () => resolve(fileReader.result);
      fileReader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return alert("Please take a photo or upload a receipt.");
    setIsUploading(true);

    try {
      // 1. Convert image for Google Drive
      const base64File = await convertBase64(file);
      
      // 2. Upload to Google Drive Bridge
      const driveResponse = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          base64: base64File,
          mimeType: file.type,
          fileName: `Receipt_${Date.now()}_${file.name}`
        })
      });
      
      const driveData = await driveResponse.json();
      
      if (driveData.status !== 'success') {
        throw new Error(driveData.message || "Google Drive upload failed.");
      }

      // 3. Save Form Data + Drive Link to Supabase
      const { error: dbError } = await supabase.from('receipts').insert({
        submitter_name: formData.name,
        purpose: formData.purpose,
        category: formData.category,
        file_url: driveData.url,
        uploaded_by: currentUser.id
      });

      if (dbError) throw dbError;

      alert("Receipt successfully uploaded to Google Drive and logged in system!");
      window.location.href = '/'; // ⚙️ FIXED: Native navigation back to Dashboard

    } catch (error) {
      console.error(error);
      alert(`Upload Error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black">📸 Upload Receipt</h2>
            <p className="text-sm text-slate-400">Direct-to-Drive Secure Upload</p>
          </div>
          {/* ⚙️ FIXED: Native navigation for Cancel button */}
          <button onClick={() => window.location.href = '/'} className="text-slate-400 hover:text-white font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-lg">Cancel</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Submitter Name</label>
            <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. John Doe" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Receipt Category</label>
            <select required value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">-- Select Category --</option>
              {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Business Purpose</label>
            <input type="text" required value={formData.purpose} onChange={(e) => setFormData({...formData, purpose: e.target.value})} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. Client Dinner" />
          </div>

          {/* 📸 CAMERA / GALLERY UPLOAD */}
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-slate-50 relative hover:bg-slate-100 transition-colors cursor-pointer">
            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            {previewUrl ? (
              <div className="space-y-2">
                <img src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded-lg shadow-sm" />
                <p className="text-xs font-bold text-blue-600">Tap to retake / change photo</p>
              </div>
            ) : (
              <div className="py-6 space-y-2">
                <span className="text-4xl">📷</span>
                <p className="text-sm font-bold text-slate-700">Tap to Take Photo or Choose from Gallery</p>
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={isUploading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-6 py-4 rounded-xl shadow-md transition-all disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {isUploading ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Uploading to Google Drive...</>
            ) : (
              '📤 Submit Receipt'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}