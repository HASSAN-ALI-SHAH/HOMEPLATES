{activeTab === 'My Menu' ? (
  <div className="animate-in fade-in zoom-in-95 duration-700">
    
    {/* --- NEW HERO SECTION FOR MENU --- */}
    <div className="relative h-64 rounded-[50px] overflow-hidden mb-12 group">
        <img 
          src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1000" 
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
          alt="Kitchen Header"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1A2316] via-[#1A2316]/60 to-transparent flex flex-col justify-center px-12">
            <h1 className="text-5xl font-black text-[#FBBF24] italic uppercase tracking-tighter">Your Signature<br/>Menu<span className="text-white">.</span></h1>
            <p className="text-white/70 text-[10px] font-black uppercase tracking-[4px] mt-4 flex items-center gap-2">
                <Flame size={14} className="text-orange-500"/> Spice up the world, one dish at a time
            </p>
        </div>
    </div>

    {/* --- BENTO STYLE GRID --- */}
    <div className="grid grid-cols-12 gap-6">
      
      {/* Small Stats Bubble */}
      <div className="col-span-12 md:col-span-3 bg-[#FBBF24] p-8 rounded-[45px] flex flex-col justify-between shadow-xl shadow-yellow-500/20">
         <div className="w-12 h-12 bg-[#1A2316] rounded-2xl flex items-center justify-center text-[#FBBF24]">
            <Utensils size={24}/>
         </div>
         <div>
            <h4 className="text-4xl font-black text-[#1A2316] tracking-tighter">12</h4>
            <p className="text-[10px] font-black uppercase text-[#1A2316]/60 tracking-widest">Active Dishes</p>
         </div>
      </div>

      {/* Search & Action Box */}
      <div className="col-span-12 md:col-span-9 bg-white p-8 rounded-[45px] border border-gray-100 flex items-center gap-6 shadow-sm">
         <div className="relative flex-1">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
            <input 
              type="text" 
              placeholder="Search your menu..." 
              className="w-full pl-16 pr-8 py-6 bg-gray-50 border-none rounded-[30px] outline-none focus:ring-2 focus:ring-[#FBBF24] font-bold"
            />
         </div>
         <button 
           onClick={() => navigate('/chef/add-dish')}
           className="bg-[#1A2316] text-[#FBBF24] h-[72px] px-10 rounded-[30px] font-black text-[11px] uppercase tracking-[3px] hover:bg-black transition-all shadow-xl active:scale-95"
         >
            + Add New
         </button>
      </div>

      {/* DISH CARDS */}
      {dishes.map((dish, index) => (
        <motion.div 
          key={dish.id}
          whileHover={{ y: -15 }}
          className={`col-span-12 md:col-span-6 lg:col-span-4 group relative ${index === 0 ? 'lg:col-span-8' : ''}`}
        >
          {/* --- ULTRA-CLICKABLE EDIT BUTTON --- */}
          <button 
             type="button"
             onClick={(e) => {
               e.preventDefault();
               e.stopPropagation();
               console.log("Edit clicked for:", dish.id); // Check console if it fires
               navigate(`/chef/edit-dish/${dish.id}`);
             }}
             className="absolute top-10 right-10 z-[60] bg-white text-[#1A2316] px-6 py-4 rounded-2xl shadow-2xl hover:bg-[#FBBF24] transition-all duration-300 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
          >
             <Settings size={16} /> Edit
          </button>

          {/* MAIN CARD BODY */}
          <div 
            onClick={() => setSelectedDish(dish)}
            className="relative h-80 rounded-[50px] overflow-hidden shadow-lg border-8 border-white cursor-pointer z-10"
          >
            <img src={dish.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={dish.name} />
            
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
            
            {/* Content on Image */}
            <div className="absolute bottom-8 left-8 right-8">
               <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[9px] font-black uppercase text-[#FBBF24] tracking-[3px] mb-2 block">{dish.category}</span>
                    <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-tight group-hover:text-[#FBBF24] transition-colors">
                        {dish.name}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-black text-xl italic leading-none">Rs. {dish.price}</p>
                    <p className="text-white/50 text-[9px] font-bold uppercase mt-1 tracking-widest">per plate</p>
                  </div>
               </div>
            </div>

            {/* Quick Status Floating Badge */}
            <div className="absolute top-6 left-6">
                <div className={`px-4 py-2 rounded-full backdrop-blur-md border border-white/20 text-[9px] font-black uppercase tracking-widest ${dish.status ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
                    {dish.status ? '• Available' : '• Out of Stock'}
                </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  </div>
) : null}