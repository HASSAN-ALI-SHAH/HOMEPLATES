import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Star, ArrowRight, Menu, MapPin, TrendingUp, 
  ChefHat, LayoutGrid, Flame, Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const getImageUrl = (url) => {
  if (!url) return 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${window.API_URL}${url}`;
};

const ExploreFood = ({ currentUser, handleAddToCart }) => {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState("explore");
  const [foodItems, setFoodItems] = useState([]);
  const [chefs, setChefs] = useState([]); // Dynamic chefs state
  const [subscriptions, setSubscriptions] = useState([]); // User's subscriptions status
  const navigate = useNavigate();

  // Data Fetching from Backend
  useEffect(() => {
    const userCity = currentUser?.city || '';
    const menuUrl = userCity 
      ? `${window.API_URL}/api/all-dishes?city=${encodeURIComponent(userCity)}` 
      : window.API_URL + '/api/all-dishes';
    const chefsUrl = userCity 
      ? `${window.API_URL}/api/chefs?city=${encodeURIComponent(userCity)}` 
      : window.API_URL + '/api/chefs';

    // Fetch Menu
    fetch(menuUrl)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setFoodItems(data);
        } else {
          console.error("Expected array for food items, got:", data);
          setFoodItems([]);
        }
      })
      .catch(err => {
        console.error("Error fetching menu:", err);
        setFoodItems([]);
      });

    // Fetch Chefs
    fetch(chefsUrl)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setChefs(data);
        } else {
          console.error("Expected array for chefs, got:", data);
          setChefs([]);
        }
      })
      .catch(err => {
        console.error("Error fetching chefs:", err);
        setChefs([]);
      });

    // Fetch Subscriptions for Status Notice
    if (currentUser?._id) {
      fetch(`${window.API_URL}/api/subscriptions/${currentUser._id}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setSubscriptions(data);
          }
        })
        .catch(err => {
          console.error("Error fetching subscriptions:", err);
        });
    }
  }, [currentUser]);


  const nearDishes = useMemo(() => foodItems.filter(item => item.distance < 1.5), [foodItems]);

  const filteredFood = useMemo(() => {
    return foodItems.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(query.toLowerCase()) || 
                            item.chef?.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = activeTab === "All" || item.category === activeTab;
      
      if (viewMode === "trending") return matchesSearch && matchesCategory && (item.tag === "Best Seller" || item.tag === "Popular");
      if (viewMode === "near") return matchesSearch && matchesCategory && item.distance < 1.5;
      
      return matchesSearch && matchesCategory;
    });
  }, [query, activeTab, viewMode, foodItems]);

  const goToChef = (e, id) => {
    e.stopPropagation();
    navigate(`/chef/${id}`);
  };

  return (
    <div className="flex h-screen bg-[#FDFDFB] overflow-hidden font-sans">
      <aside className={`${sidebarOpen ? 'w-72' : 'w-24'} bg-white border-r border-gray-100 transition-all duration-300 flex flex-col z-50`}>
        <div className="p-6 flex items-center justify-between">
          {sidebarOpen && <h2 className="text-xl font-black italic tracking-tighter uppercase">HomePlates<span className="text-[#FBBF24]">.</span></h2>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><Menu size={20}/></button>
        </div>
        <nav className="flex-1 px-4 mt-6 space-y-2">
           <NavItem icon={<LayoutGrid size={18}/>} label="Explore" active={viewMode === "explore"} open={sidebarOpen} onClick={() => setViewMode("explore")} />
           <NavItem icon={<Flame size={18}/>} label="Trending" active={viewMode === "trending"} open={sidebarOpen} onClick={() => setViewMode("trending")} />
           <NavItem icon={<Zap size={18}/>} label="Near You" active={viewMode === "near"} open={sidebarOpen} onClick={() => setViewMode("near")} />
           <NavItem icon={<Star size={18}/>} label="Subscription Status" active={viewMode === "subscriptions"} open={sidebarOpen} onClick={() => setViewMode("subscriptions")} />
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto pb-20 scroll-smooth">
        <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 p-6 border-b border-gray-50 text-left">
            {viewMode === "subscriptions" ? (
              <h2 className="text-xl font-black italic tracking-tighter uppercase text-[#1A2316]">
                Subscription Status<span className="text-[#FBBF24]">.</span>
              </h2>
            ) : (
              <div className="max-w-xl relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                  <input 
                      type="text" 
                      placeholder="Search for food or home chefs..." 
                      className="w-full pl-16 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#FBBF24]/30 focus:bg-white rounded-2xl outline-none font-bold text-sm transition-all"
                      value={query} 
                      onChange={(e) => setQuery(e.target.value)}
                  />
              </div>
            )}
        </div>

        <div className="p-8 max-w-7xl mx-auto text-left">
          {viewMode === "subscriptions" ? (
            <div className="bg-white p-7 rounded-[35px] border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Zap className="text-[#FBBF24]" size={20}/>
                <h3 className="text-lg font-black text-[#1A2316] uppercase italic">My Subscriptions</h3>
              </div>
              {subscriptions.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-300">
                  <Star size={56} className="mb-4 opacity-20" />
                  <p className="font-black text-[10px] uppercase tracking-widest">No Subscriptions Yet</p>
                  <p className="text-[9px] text-gray-400 mt-2 font-bold">Subscribe to a chef to track your status here</p>
                  <button
                    onClick={() => setViewMode("explore")}
                    className="mt-6 bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
                  >
                    Browse Chefs
                  </button>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {subscriptions.map(sub => {
                    let alertBg = 'bg-yellow-50 border-yellow-200 text-yellow-800';
                    let statusLabel = 'Awaiting Admin Approval';
                    let statusDesc = `Your payment proof for ${sub.chefId?.name || 'Chef'}'s ${sub.planType} meal plan has been submitted and is currently awaiting admin verification.`;
                    let actionBtnText = 'View Details';

                    if (sub.paymentStatus === 'approved' && sub.status === 'active') {
                      alertBg = 'bg-green-50 border-green-200 text-green-800';
                      statusLabel = 'Active';
                      statusDesc = `Admin approved your subscription with ${sub.chefId?.name || 'Chef'}. Status is active (${sub.deliveredDays || 0} delivered / ${sub.remainingDays || 0} remaining).`;
                    } else if (sub.paymentStatus === 'rejected' || sub.status === 'payment_failed') {
                      alertBg = 'bg-red-50 border-red-200 text-red-800';
                      statusLabel = 'Payment Rejected';
                      statusDesc = `Admin rejected your payment proof for ${sub.chefId?.name || 'Chef'}. Please click below to re-upload.`;
                      actionBtnText = 'Re-upload Proof';
                    } else if (sub.status === 'paused') {
                      alertBg = 'bg-gray-50 border-gray-200 text-gray-800';
                      statusLabel = 'Paused';
                      statusDesc = `Your subscription with ${sub.chefId?.name || 'Chef'} is paused.`;
                    }

                    return (
                      <div key={sub._id} className={`p-6 rounded-2xl border-2 ${alertBg} flex flex-col justify-between gap-4 text-left shadow-sm transition-all`}>
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[9px] font-black uppercase tracking-widest bg-white/60 px-2.5 py-1 rounded-md">{statusLabel}</span>
                            <span className="text-[9px] font-black text-gray-500 uppercase">{sub.planType} Plan</span>
                          </div>
                          <p className="text-xs font-bold leading-relaxed">{statusDesc}</p>
                        </div>
                        <button
                          onClick={() => navigate('/profile', { state: { tab: 'subscriptions' } })}
                          className="self-start text-[9px] font-black uppercase tracking-widest bg-white/80 hover:bg-white hover:scale-[1.02] px-4 py-2.5 rounded-xl border border-black/5 transition-all shadow-sm"
                        >
                          {actionBtnText} →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <section className="mb-12">
                  <div className="flex items-center gap-2 mb-6">
                     <ChefHat className="text-[#FBBF24]" size={20}/>
                     <h3 className="text-lg font-black text-[#1A2316] uppercase italic">Top HomeChefs</h3>
                  </div>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                    {chefs.length > 0 ? chefs.map(chef => (
                        <div key={chef._id} onClick={(e) => goToChef(e, chef._id)} className="min-w-[260px] bg-white border border-gray-100 p-4 rounded-[30px] shadow-sm flex items-center gap-4 cursor-pointer hover:border-[#FBBF24] transition-all">
                          <img src={getImageUrl(chef.img)} className="w-14 h-14 rounded-2xl object-cover" alt=""/>
                          <div>
                              <h4 className="font-black text-[#1A2316] text-[12px] uppercase italic">{chef.name}</h4>
                              <div className="flex items-center gap-1 text-[9px] font-bold text-gray-400">
                                 <Star size={10} fill="#FBBF24" className="text-[#FBBF24]"/> {chef.rating} • {chef.city}
                              </div>
                          </div>
                        </div>
                    )) : <div className="text-[10px] uppercase font-black tracking-widest text-gray-300 p-4">No chefs available</div>}
                  </div>
              </section>

              {viewMode === "explore" && !query && (
                <section className="mb-14">
                   <div className="flex items-center gap-2 mb-6">
                      <Zap className="text-[#FBBF24]" size={20}/>
                      <h3 className="text-lg font-black text-[#1A2316] uppercase italic">Near You</h3>
                   </div>
                   <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4">
                      {nearDishes.map(food => (
                        <motion.div 
                          key={food._id} 
                          whileHover={{ scale: 1.02 }} 
                          onClick={() => {
                            handleAddToCart({
                              _id: food._id,
                              name: food.name,
                              price: food.price,
                              basePrice: food.price,
                              img: food.img,
                              chefId: food.chefId?._id || food.chefId || food.chef,
                              chefName: food.chef || 'Chef',
                              qty: 1,
                              portion: 'Full'
                            });
                            navigate('/cart');
                          }} 
                          className="min-w-[340px] bg-[#1A2316] p-4 rounded-[35px] flex gap-5 items-center cursor-pointer group transition-all shadow-xl"
                        >
                           <img src={getImageUrl(food.img)} className="w-24 h-24 rounded-[28px] object-cover" alt=""/>
                           <div className="flex-1">
                              <h4 className="text-white font-black uppercase italic text-[13px] group-hover:text-[#FBBF24] transition-colors">{food.name}</h4>
                              <p className="text-gray-400 text-[9px] font-bold uppercase mt-1 tracking-widest">{food.time} • {food.distance}km</p>
                              <div className="flex justify-between items-center mt-3">
                                 <span className="text-[#FBBF24] font-black text-sm">Rs. {food.price}</span>
                                 <div className="bg-white/10 p-2 rounded-xl text-white group-hover:bg-[#FBBF24] group-hover:text-[#1A2316] transition-all"><ArrowRight size={14}/></div>
                              </div>
                           </div>
                        </motion.div>
                      ))}
                   </div>
                </section>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                 <AnimatePresence>
                    {filteredFood.map(food => (
                      <FoodCard 
                        key={food._id} 
                        food={food} 
                        onCardClick={() => {
                          handleAddToCart({
                            _id: food._id,
                            name: food.name,
                            price: food.price,
                            basePrice: food.price,
                            img: food.img,
                            chefId: food.chefId?._id || food.chefId || food.chef,
                            chefName: food.chef || 'Chef',
                            qty: 1,
                            portion: 'Full'
                          });
                          navigate('/cart');
                        }} 
                        onChefClick={(e) => goToChef(e, food.chefId)} 
                      />
                    ))}
                 </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const FoodCard = ({ food, onCardClick, onChefClick }) => (
  <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileHover={{ y: -8 }} onClick={onCardClick} className="bg-white rounded-[40px] border border-gray-50 shadow-sm hover:shadow-xl overflow-hidden cursor-pointer flex flex-col h-full text-left">
     <div className="relative h-48 m-3 rounded-[28px] overflow-hidden">
        <img src={getImageUrl(food.img)} className="w-full h-full object-cover" alt=""/>
        {food.tag && <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest shadow-sm">{food.tag}</div>}
     </div>
     <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-black text-[#1A2316] uppercase text-sm italic mb-1">{food.name}</h3>
        <button onClick={onChefClick} className="text-[9px] text-gray-400 font-bold uppercase underline decoration-[#FBBF24]/50">{food.chef}</button>
        <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-50">
            <span className="text-lg font-black text-[#1A2316]">Rs. {food.price}</span>
            <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center"><ArrowRight size={16}/></div>
        </div>
     </div>
  </motion.div>
);

const NavItem = ({ icon, label, active, open, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${active ? 'bg-[#1A2316] text-white' : 'text-gray-400'}`}>
    {icon}
    {open && <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>}
  </button>
);

export default ExploreFood;