import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Camera, Utensils, Sparkles, Minus, Plus, Percent } from 'lucide-react';
import API from '../api';
import { toast } from '../utils/toast';

const EditDishPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const [dish, setDish] = useState({ name: '', price: 0, category: 'Main Course', description: '', prepTime: '', imagePreview: null, image: null });
  const [calcData, setCalcData] = useState({ rawMaterials: 0, packaging: 0, gasElectric: 0 });
  const [results, setResults] = useState({ suggested: 0, margin: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchDish = async () => {
      try {
        const res = await API.get(`/api/chef/dish/${id}`);
        const found = res.data;
        if (found) {
          setDish({ name: found.name, price: found.price, category: found.category, description: found.description || '', prepTime: found.prepTime || '', imagePreview: found.img ? `${window.API_URL}${found.img}` : null, image: null });
          if (found.pricingDetails) setCalcData({ rawMaterials: found.pricingDetails.rawMaterials || 0, packaging: found.pricingDetails.packaging || 0, gasElectric: found.pricingDetails.gasElectric || 0 });
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    };
    fetchDish();
  }, [id]);

  useEffect(() => {
    const cost = Number(calcData.rawMaterials) + Number(calcData.packaging) + Number(calcData.gasElectric);
    const suggested = Math.ceil(cost * 1.4);
    const profit = Number(dish.price) - cost;
    const margin = dish.price > 0 ? (profit / dish.price) * 100 : 0;
    setResults({ suggested, margin: margin.toFixed(1) });
  }, [calcData, dish.price]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) setDish({ ...dish, image: file, imagePreview: URL.createObjectURL(file) });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!dish.name || !dish.name.trim()) { toast.error('Please enter a dish name'); return; }
    if (!dish.category) { toast.error('Please select a category'); return; }
    if (!dish.prepTime || !dish.prepTime.trim()) { toast.error('Please enter preparation time (e.g. 45 mins)'); return; }
    if (!dish.description || !dish.description.trim()) { toast.error('Please enter a description for the dish'); return; }
    if (!dish.price || Number(dish.price) <= 0) { toast.error('Please enter a valid price greater than 0'); return; }

    setSubmitting(true);
    const formData = new FormData();
    formData.append('name', dish.name.trim());
    formData.append('category', dish.category);
    formData.append('prepTime', dish.prepTime.trim());
    formData.append('description', dish.description.trim());
    formData.append('price', dish.price);
    if (dish.image) {
      formData.append('image', dish.image);
    }
    formData.append('pricingDetails', JSON.stringify(calcData));

    try {
      await API.put(`/api/chef/dish/${id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      toast.success(`${dish.name} updated successfully!`);
      navigate('/chef/dashboard');
    } catch (e) {
      toast.error('Error updating dish: ' + (e.response?.data?.error || e.response?.data?.message || e.message));
    } finally { setSubmitting(false); }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-gray-400 uppercase tracking-widest animate-pulse">Loading Dish...</div>;

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-6 lg:p-12 font-sans">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-4 bg-white rounded-[25px] shadow-sm hover:bg-gray-50 transition-all border border-gray-100"><ArrowLeft size={22} /></button>
          <div><h1 className="text-4xl font-black text-[#1A2316] uppercase italic tracking-tighter">Edit <span className="text-[#FBBF24]">Dish.</span></h1><p className="text-[10px] font-bold text-gray-400 uppercase tracking-[3px]">Refine your culinary creation</p></div>
        </div>
        <button onClick={handleSave} disabled={submitting} className="bg-[#1A2316] text-[#FBBF24] px-12 py-5 rounded-[25px] font-black uppercase text-[11px] tracking-[4px] shadow-xl hover:scale-105 transition-all flex items-center gap-3 disabled:opacity-50">
          <Save size={18}/>{submitting ? 'Saving...' : 'Update Menu'}
        </button>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-7 space-y-8">
          <div className="relative group rounded-[55px] overflow-hidden shadow-2xl h-[380px] bg-white border-8 border-white">
            {dish.imagePreview ? <img src={dish.imagePreview} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" alt="Preview"/> : <div className="w-full h-full flex flex-col items-center justify-center text-gray-200"><Camera size={60}/><p className="font-black uppercase text-[10px] mt-3">Click to upload photo</p></div>}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
              <div className="text-center text-white"><Camera size={40} className="text-[#FBBF24] mx-auto mb-2"/><span className="font-black uppercase text-[10px]">Change Photo</span></div>
            </div>
            <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 opacity-0 cursor-pointer z-10"/>
          </div>

          <div className="bg-white p-10 rounded-[55px] shadow-sm border border-gray-100">
            <h3 className="text-sm font-black text-[#1A2316] uppercase tracking-[4px] mb-8 flex items-center gap-3"><div className="w-8 h-8 bg-[#FBBF24] rounded-lg flex items-center justify-center text-[#1A2316]"><Utensils size={16}/></div>Dish Details</h3>
            <div className="space-y-6">
              <div><label className="text-[10px] font-black uppercase text-gray-400 mb-2 block ml-2">Dish Name</label><input type="text" value={dish.name} className="w-full p-6 bg-gray-50 rounded-[30px] border-2 border-transparent focus:border-[#FBBF24] outline-none font-bold" onChange={e => setDish({...dish, name: e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-6">
                <div><label className="text-[10px] font-black uppercase text-gray-400 mb-2 block ml-2">Category</label>
                  <select value={dish.category} onChange={e => setDish({...dish, category: e.target.value})} className="w-full p-6 bg-gray-50 rounded-[30px] border-2 border-transparent focus:border-[#FBBF24] outline-none font-bold cursor-pointer">
                    {['Main Course','Desi','BBQ','Chinese','Desserts','Beverages','Appetizers','Rice & Grains'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="text-[10px] font-black uppercase text-gray-400 mb-2 block ml-2">Prep Time</label><input type="text" value={dish.prepTime} onChange={e => setDish({...dish, prepTime: e.target.value})} className="w-full p-6 bg-gray-50 rounded-[30px] border-2 border-transparent focus:border-[#FBBF24] outline-none font-bold"/></div>
              </div>
              <div><label className="text-[10px] font-black uppercase text-gray-400 mb-2 block ml-2">Description</label><textarea rows="4" value={dish.description} className="w-full p-7 bg-gray-50 rounded-[35px] border-2 border-transparent focus:border-[#FBBF24] outline-none font-bold resize-none" onChange={e => setDish({...dish, description: e.target.value})}/></div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-8">
          <div className="bg-[#1A2316] p-10 rounded-[55px] shadow-2xl">
            <h3 className="text-xl font-black text-[#FBBF24] uppercase italic tracking-tighter mb-8 flex items-center gap-3"><Sparkles size={20}/>Price Engine</h3>
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                {[['rawMaterials','Raw Mat.'],['packaging','Packaging'],['gasElectric','Utilities']].map(([k,l]) => (
                  <div key={k}><label className="text-[8px] font-black text-gray-500 uppercase mb-2 block">{l}</label><input type="number" value={calcData[k]} className="w-full p-4 bg-white/5 rounded-2xl text-[#FBBF24] font-bold outline-none" onChange={e => setCalcData({...calcData,[k]:e.target.value})}/></div>
                ))}
              </div>
              <div className="bg-white/5 p-5 rounded-[25px] flex justify-between items-center">
                <h4 className="text-2xl font-black italic text-[#FBBF24]">Rs. {results.suggested}</h4>
                <button onClick={() => setDish({...dish, price: results.suggested})} className="bg-[#FBBF24] text-[#1A2316] px-5 py-2 rounded-xl font-black text-[10px] uppercase">Apply</button>
              </div>
              <div className="pt-6 border-t border-white/10">
                <label className="text-[10px] font-black text-gray-400 uppercase mb-4 block text-center">Final Price (PKR)</label>
                <div className="flex items-center justify-between px-4">
                  <button onClick={() => setDish(p => ({...p, price: Math.max(0, Number(p.price)-10)}))} className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white"><Minus/></button>
                  <input type="number" value={dish.price} className="w-32 text-center text-5xl font-black bg-transparent text-[#FBBF24] outline-none" onChange={e => setDish({...dish, price: e.target.value})}/>
                  <button onClick={() => setDish(p => ({...p, price: Number(p.price)+10}))} className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white"><Plus/></button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Profit Margin</span>
              <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${results.margin > 20 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{results.margin > 20 ? 'Healthy' : 'Low Margin'}</span>
            </div>
            <div className="flex items-end gap-3 mb-5"><Percent className="text-[#FBBF24] mb-1" size={28} strokeWidth={3}/><h2 className="text-6xl font-black text-[#1A2316] italic tracking-tighter">{results.margin}%</h2></div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${results.margin > 20 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{width:`${Math.min(Math.max(results.margin,0),100)}%`}}/></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditDishPage;