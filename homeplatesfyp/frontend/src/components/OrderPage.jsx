import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Minus, Plus, ChevronLeft, ShoppingBag, MessageSquare, ShieldCheck, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from '../utils/toast';

const OrderPage = ({ onAddToCart }) => {
  const { dishId } = useParams();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [dish, setDish] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portion, setPortion] = useState("Full");

  const getImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `${window.API_URL}${url}`;
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchDish = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${window.API_URL}/api/chef/dish/${dishId}`);
        if (response.ok) {
          const data = await response.json();
          setDish(data);
        } else {
          console.error("Failed to fetch dish:", response.statusText);
        }
      } catch (err) {
        console.error("Error fetching dish:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDish();
  }, [dishId]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#FDFDFB] p-6 text-center">
        <h2 className="text-xl font-black text-[#1A2316] uppercase italic tracking-widest animate-pulse">Loading Dish Details...</h2>
      </div>
    );
  }

  if (!dish) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#FDFDFB] p-6 text-center">
        <h2 className="text-3xl font-black text-[#1A2316] uppercase italic mb-4">Dish Not Found</h2>
        <button onClick={() => navigate('/explore')} className="bg-[#1A2316] text-white px-8 py-3 rounded-xl font-black uppercase text-[10px]">
            Back to Explore
        </button>
      </div>
    );
  }

  const handleAddClick = () => {
    const finalPrice = portion === 'Half' ? Math.round(dish.price * 0.6) : dish.price;
    onAddToCart({ 
      ...dish, 
      name: `${dish.name} (${portion})`, 
      price: finalPrice, 
      qty, 
      instructions: note, 
      portion 
    });
    toast.success(`Added ${qty}x ${dish.name} (${portion}) to your cart!`);
    navigate('/cart');
  };

  return (
    <div className="min-h-screen bg-[#FDFDFB] pb-20">
      {/* HERO SECTION */}
      <div className="relative h-[40vh] md:h-[50vh] bg-[#1A2316] flex items-center justify-center p-6 overflow-hidden">
        <button 
          onClick={() => navigate(-1)} 
          className="absolute top-8 left-8 bg-white/10 backdrop-blur-md p-3 rounded-2xl text-white z-20 hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all shadow-xl"
        >
          <ChevronLeft size={24} strokeWidth={3} /> 
        </button>
        
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10">
            <img 
              src={getImageUrl(dish.img)} 
              className="w-56 h-56 md:w-80 md:h-80 object-cover rounded-[60px] shadow-2xl border-8 border-white/5 rotate-3" 
              alt={dish.name} 
            />
        </motion.div>
        <div className="absolute -bottom-1 w-full h-16 bg-[#FDFDFB] rounded-t-[50px] z-0"></div>
      </div>

      {/* CONTENT AREA */}
      <div className="max-w-3xl mx-auto px-6 relative z-10 -mt-12">
        <div className="bg-white rounded-[50px] p-8 md:p-12 shadow-sm border border-gray-50">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 text-left">
            <div className="space-y-2">
              <div className="bg-[#FEF9ED] text-[#FBBF24] px-4 py-1.5 rounded-full inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <ShieldCheck size={14} /> 100% Home Cooked
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-[#1A2316] uppercase tracking-tighter italic leading-none">{dish.name}</h1>
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">
                  Cooked by <span className="text-[#1A2316] underline decoration-[#FBBF24] decoration-2">{dish.chef || "Home Chef"}</span>
              </p>
            </div>
            
            <div className="bg-[#1A2316] p-6 rounded-[35px] text-center min-w-[140px] self-stretch md:self-auto">
                <p className="text-[#FBBF24] text-[10px] font-black uppercase mb-1">Total Price</p>
                <div className="text-white text-2xl font-black tracking-tight">Rs. {(portion === 'Half' ? Math.round(dish.price * 0.6) : dish.price) * qty}</div>
            </div>
          </div>

          {/* Portion Selector */}
          <div className="bg-gray-50 p-6 rounded-[30px] mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left">
              <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Select Portion Size</span>
                  <p className="text-xs text-gray-400 font-bold mt-1">Half is approx. 60% of price & portion</p>
              </div>
              <div className="flex bg-white p-1 rounded-2xl border border-gray-100">
                {[
                  { key: 'Half', label: `Half (Rs. ${Math.round(dish.price * 0.6)})` },
                  { key: 'Full', label: `Full (Rs. ${dish.price})` }
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPortion(opt.key)}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${portion === opt.key ? 'bg-[#1A2316] text-[#FBBF24]' : 'text-gray-400'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-10 text-left">
              <div className="bg-gray-50 p-6 rounded-[30px] flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-[#1A2316] tracking-widest">Quantity</span>
                  <div className="flex items-center gap-6 bg-white p-2 rounded-2xl">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 flex items-center justify-center bg-gray-50 text-[#1A2316] rounded-xl hover:bg-[#FBBF24] transition-all"><Minus size={18}/></button>
                    <span className="font-black text-[#1A2316] text-xl min-w-[30px] text-center">{qty}</span>
                    <button onClick={() => setQty(qty + 1)} className="w-10 h-10 flex items-center justify-center bg-gray-50 text-[#1A2316] rounded-xl hover:bg-[#FBBF24] transition-all"><Plus size={18}/></button>
                  </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-[30px] flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#FBBF24]">
                      <Timer size={24} />
                  </div>
                  <div>
                      <p className="text-[10px] font-black uppercase text-[#1A2316] tracking-widest">Est. Preparation</p>
                      <p className="text-sm font-bold text-gray-500">{dish.prepTime || "45-60 Mins"}</p>
                  </div>
              </div>
          </div>

          <div className="mb-10 text-left">
            <label className="text-[10px] font-black uppercase text-gray-400 mb-4 flex items-center gap-2 tracking-widest">
              <MessageSquare size={16} className="text-[#FBBF24]"/> Special Instructions
            </label>
            <textarea 
              placeholder="e.g. Make it extra spicy..." 
              className="w-full bg-gray-50 p-6 rounded-[30px] outline-none border-2 border-transparent focus:border-[#FBBF24]/30 focus:bg-white text-sm font-bold text-[#1A2316] transition-all h-32 resize-none shadow-inner"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <button 
            onClick={handleAddClick}
            className="w-full bg-[#1A2316] text-white py-6 rounded-[30px] font-black text-[12px] uppercase tracking-[3px] shadow-xl hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all flex items-center justify-center gap-4 group"
          >
            <ShoppingBag size={20}/> Add To Kitchen Cart
          </button>
          
        </div>
      </div>
    </div>
  );
};

export default OrderPage;