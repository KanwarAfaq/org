import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function ReceiptForm({ currentUser, setActivePage }) {
  const CLOUD_NAME = "dfmi4udfs"; 
  const UPLOAD_PRESET = "org_receipt"; 

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [purpose, setPurpose] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase.from('receipt_categories').select('*').eq('is_active', true).order('created_at', { ascending: true });
    if (data) setCategories(data);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile)); 
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalCategory = selectedCategory === 'custom' ? customCategory.trim() : selectedCategory;
    if (!finalCategory) return alert("Please select or type a category.");
    if (!file) return alert("Please attach a receipt photo.");
    setIsUploading(true);

    try {
      const cloudFormData = new FormData();
      cloudFormData.append('file', file);
      cloudFormData.append('upload_preset', UPLOAD_PRESET);
      cloudFormData.append('folder', 'financial_receipts');

      const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: cloudFormData });
      const cloudData = await cloudinaryResponse.json();
      if (!cloudinaryResponse.ok) throw new Error(cloudData.error?.message || "Cloudinary upload failed.");

      const { error: dbError } = await supabase.from('receipts').insert({
        submitter_name: currentUser.full_name, // 👤 AUTO-FETCHED!
        purpose: purpose,
        category: finalCategory,
        file_url: cloudData.secure_url,
        uploaded_by: currentUser.id
      });

      if (dbError) throw dbError;
      alert("Receipt successfully uploaded!");
     setActivePage('receipt_vault'); // Routes to the new viewer page!

    } catch (error) {
      alert(`Upload Error: ${error.message}`);
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
         <button onClick={() => setActivePage('home')} className="text-slate-400 hover:text-white font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Receipt Category</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {categories.map(cat => (
                <button key={cat.id} type="button" onClick={() => { setSelectedCategory(cat.name); setCustomCategory(''); }}
                  className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-colors ${selectedCategory === cat.name ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
                  {cat.icon} {cat.name}
                </button>
              ))}
              <button type="button" onClick={() => setSelectedCategory('custom')} className={`text-xs font-bold px-3 py-1.5 rounded-md border ${selectedCategory === 'custom' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>✍️ Custom...</button>
            </div>
            {selectedCategory === 'custom' && (
              <input type="text" placeholder="Type custom category..." value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} required className="w-full bg-slate-50 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 mt-2" />
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Business Purpose</label>
            <input type="text" required value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full bg-slate-50 border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. Client Dinner" />
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-slate-50 relative hover:bg-slate-100 cursor-pointer">
            <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            {previewUrl ? (
              <div className="space-y-2"><img src={previewUrl} className="max-h-48 mx-auto rounded-lg shadow-sm" /><p className="text-xs font-bold text-blue-600">Tap to change photo</p></div>
            ) : (
              <div className="py-6 space-y-2"><span className="text-4xl">📷</span><p className="text-sm font-bold text-slate-700">Take Photo or Choose File</p></div>
            )}
          </div>

          <button type="submit" disabled={isUploading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-6 py-4 rounded-xl shadow-md disabled:opacity-50 flex justify-center items-center gap-2">
            {isUploading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Uploading...</> : '📤 Submit Receipt'}
          </button>
        </form>
      </div>
    </div>
  );
}