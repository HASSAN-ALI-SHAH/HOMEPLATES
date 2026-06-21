import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Sparkles, Minus, Utensils, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../utils/toast';

const AddDishPage = () => {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [dishInfo, setDishInfo] = useState({ name: '', category: 'Main Course', prepTime: '', description: '', image: null });
  const [calcData, setCalcData] = useState({ rawMaterials: 0, packaging: 0, gasElectric: 0, sellingPrice: 0 });
  const [results, setResults] = useState({ totalCost: 0, profit: 0, margin: 0, suggested: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const cost = Number(calcData.rawMaterials) + Number(calcData.packaging) + Number(calcData.gasElectric);
    const suggested = Math.ceil(cost * 1.4);
    const profit = Number(calcData.sellingPrice) - cost;
    const margin = calcData.sellingPrice > 0 ? (profit / calcData.sellingPrice) * 100 : 0;
    setResults({ totalCost: cost, profit, margin: margin.toFixed(1), suggested });
  }, [calcData]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) { setDishInfo({ ...dishInfo, image: file }); setPreview(URL.createObjectURL(file)); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dishInfo.name || !dishInfo.name.trim()) { toast.error('Please enter a dish name'); return; }
    if (!dishInfo.category) { toast.error('Please select a category'); return; }
    if (!dishInfo.prepTime || !dishInfo.prepTime.trim()) { toast.error('Please enter preparation time (e.g. 45 mins)'); return; }
    if (!dishInfo.description || !dishInfo.description.trim()) { toast.error('Please enter a description for the dish'); return; }
    if (!dishInfo.image) { toast.error('Please upload an image for the dish'); return; }
    if (!calcData.sellingPrice || Number(calcData.sellingPrice) <= 0) { toast.error('Please enter a valid selling price greater than 0'); return; }
    if (!currentUser._id) { toast.error('Not logged in! Please login again.'); navigate('/login'); return; }

    setSubmitting(true);
    const formData = new FormData();
    formData.append('name', dishInfo.name.trim());
    formData.append('category', dishInfo.category);
    formData.append('prepTime', dishInfo.prepTime.trim());
    formData.append('description', dishInfo.description.trim());
    formData.append('price', calcData.sellingPrice);
    formData.append('chefId', currentUser._id);
    formData.append('chef', currentUser.name);
    formData.append('image', dishInfo.image);
    formData.append('pricingDetails', JSON.stringify({
      rawMaterials: Number(calcData.rawMaterials),
      packaging: Number(calcData.packaging),
      gasElectric: Number(calcData.gasElectric),
    }));

    try {
      const response = await axios.post('http://localhost:5000/api/chef/add-dish', formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.status === 201) {
        toast.success('Dish added successfully!');
        navigate('/chef/dashboard');
      }
    } catch (error) {
      toast.error('Error: ' + (error.response?.data?.error || error.response?.data?.message || 'Server connection failed'));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-6 lg:p-12 font-sans">
      <header className="max-w-6xl mx-auto flex items-center justify-between mb-12">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-4 bg-white rounded-3xl shadow-sm hover:scale-105 transition-all text-[#1A2316]"><ArrowLeft size={24} /></button>
          <div>
            <h1 className="text-4xl font-black text-[#1A2316] uppercase italic">Add New Dish</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Adding as: {currentUser.name}</p>
          </div>
        </div>
        <button onClick={handleSubmit} disabled={submitting} className="bg-[#1A2316] text-[#FBBF24] px-10 py-5 rounded-3xl font-black uppercase text-[11px] tracking-widest shadow-2xl hover:bg-black transition-all active:scale-95 disabled:opacity-50">
          {submitting ? 'Saving...' : 'Publish Dish'}
        </button>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <div className="bg-white p-10 rounded-[50px] shadow-sm border border-gray-100">
            <h3 className="text-xl font-black text-[#1A2316] uppercase italic mb-8 flex items-center gap-2"><Utensils size={20} className="text-[#FBBF24]"/>Basic Information</h3>
            <div className="space-y-5">
              <input type="text" placeholder="Dish Name *" className="w-full p-5 bg-gray-50 rounded-[25px] outline-none font-bold border-2 border-transparent focus:border-[#FBBF24] transition-all" value={dishInfo.name} onChange={e => setDishInfo({...dishInfo, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-5">
                <select className="w-full p-5 bg-gray-50 rounded-[25px] outline-none font-bold border-2 border-transparent focus:border-[#FBBF24]" value={dishInfo.category} onChange={e => setDishInfo({...dishInfo, category: e.target.value})}>
                  {['Main Course','Desi','BBQ','Chinese','Desserts','Beverages','Appetizers','Rice & Grains'].map(c => <option key={c}>{c}</option>)}
                </select>
                <input type="text" placeholder="Prep Time (e.g. 45 mins)" className="w-full p-5 bg-gray-50 rounded-[25px] outline-none font-bold border-2 border-transparent focus:border-[#FBBF24] transition-all" value={dishInfo.prepTime} onChange={e => setDishInfo({...dishInfo, prepTime: e.target.value})} />
              </div>
              <textarea rows="4" placeholder="Description (optional)" className="w-full p-6 bg-gray-50 rounded-[30px] outline-none font-bold border-2 border-transparent focus:border-[#FBBF24] transition-all resize-none" value={dishInfo.description} onChange={e => setDishInfo({...dishInfo, description: e.target.value})} />
            </div>
          </div>

          {/* Image Upload */}
          <input type="file" id="imgInput" className="hidden" accept="image/*" onChange={handleImageChange} />
          <label htmlFor="imgInput" className="block cursor-pointer">
            {preview ? (
              <div className="relative h-64 rounded-[40px] overflow-hidden shadow-sm border-4 border-[#FBBF24]">
                <img src={preview} alt="preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
                  <p className="text-white font-black uppercase text-[10px]"><Camera size={20} className="inline mr-2"/>Change Photo</p>
                </div>
              </div>
            ) : (
              <div className="border-4 border-dashed border-gray-200 p-12 rounded-[40px] flex flex-col items-center text-gray-400 hover:border-[#FBBF24] hover:text-[#FBBF24] transition-all">
                <Camera size={32} /><p className="font-black uppercase text-[10px] tracking-widest mt-3">Upload Dish Photo</p>
              </div>
            )}
          </label>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="bg-[#1A2316] p-10 rounded-[50px] shadow-2xl text-white">
            <h3 className="text-2xl font-black uppercase italic mb-8 flex items-center gap-3"><Sparkles className="text-[#FBBF24]"/>Price Engine</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[['rawMaterials','Raw Mat.'],['packaging','Packing'],['gasElectric','Utilities']].map(([k,l]) => (
                  <div key={k}><label className="text-[8px] font-black text-gray-500 uppercase block mb-1">{l}</label><input type="number" placeholder="0" className="w-full p-4 bg-white/5 rounded-2xl outline-none text-sm text-[#FBBF24] font-bold" value={calcData[k]} onChange={e => setCalcData({...calcData,[k]:e.target.value})}/></div>
                ))}
              </div>
              <div className="bg-white/5 p-4 rounded-2xl flex justify-between items-center">
                <div><p className="text-[9px] text-gray-400 font-black uppercase">Suggested (40% margin)</p><h4 className="text-xl font-black text-[#FBBF24]">Rs. {results.suggested}</h4></div>
                <button onClick={() => setCalcData({...calcData, sellingPrice: results.suggested})} className="bg-[#FBBF24] text-[#1A2316] px-4 py-2 rounded-xl text-[10px] font-black">APPLY</button>
              </div>
              <div className="pt-4 border-t border-white/10">
                <label className="text-[9px] font-black text-gray-400 uppercase block mb-3 text-center">Final Selling Price (PKR) *</label>
                <input type="number" className="w-full p-5 bg-white/10 rounded-2xl text-center text-3xl font-black text-[#FBBF24] outline-none border-2 border-transparent focus:border-[#FBBF24]" value={calcData.sellingPrice} onChange={e => setCalcData({...calcData, sellingPrice: e.target.value})} placeholder="0"/>
              </div>
              {calcData.sellingPrice > 0 && (
                <div className="bg-white/5 p-4 rounded-2xl space-y-2 text-[10px] font-black uppercase">
                  <div className="flex justify-between"><span className="text-gray-400">Profit:</span><span className="text-green-400">PKR {results.profit}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Margin:</span><span className={results.margin > 20 ? 'text-green-400' : 'text-yellow-400'}>{results.margin}%</span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddDishPage;