import React, { useState } from 'react';
import { 
  Star, ShieldCheck, Zap, ArrowRight, Plus,
  Instagram, Facebook, Twitter, Play, Apple,
  Search, ShoppingBag, MapPin, Heart, ChevronRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// --- ASSETS ---
const ratings = [
  { name: "Ayesha Khan", review: "The Biryani was aromatic and clearly homemade. Finally, a service that prioritizes hygiene over everything else.", stars: 5, tag: "Customer", location: "DHA, Lahore" },
  { name: "Zainab Ali", review: "I started my small kitchen from home, and HomePlates gave me the platform to reach hundreds of people in Lahore.", stars: 5, tag: "Chef", location: "Gulberg, Lahore" },
  { name: "Omar Farooq", review: "Amazing service! The packaging was professional and the food arrived piping hot. Highly recommended.", stars: 5, tag: "Customer", location: "Johar Town, Lahore" },
  { name: "Sana Ahmed", review: "Finding organic, home-cooked food is hard. This app makes it easy. Love the interface!", stars: 5, tag: "Customer", location: "Model Town, Lahore" },
];

const HomePlatesLanding = () => {
  const [activeTab, setActiveTab] = useState("order");
  const navigate = useNavigate();

  const tabContent = {
    order: {
      title: "Crave Nutritious Home-Cooked Food?",
      desc: "Skip the oily restaurant meals. Order fresh, wholesome, home-cooked lunches and dinners prepared by certified kitchen partners in your neighborhood.",
      image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800",
      btnText: "Start Ordering",
      link: "/explore"
    },
    manage: {
      title: "Turn Your Kitchen Into a Business",
      desc: "Register as a HomeChef and share your culinary passion. Manage incoming orders, track daily transactions, and grow your own home business with our easy dashboard.",
      image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&q=80&w=800",
      btnText: "Join as Chef",
      link: "/login"
    },
    delivery: {
      title: "Lightning Fast Logistics Network",
      desc: "We ensure your delicious meals reach you fresh and hot. Our dedicated fleet handles every package with sanitation care and real-time tracking.",
      image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&q=80&w=800",
      btnText: "Become a Rider",
      link: "/login"
    },
  };

  // --- Stagger variants for list container ---
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFB] text-[#1A2316] font-sans selection:bg-[#FBBF24]/30 overflow-x-hidden">
      
      {/* Decorative background grid element */}
      <div className="absolute top-0 left-0 w-full h-[800px] bg-gradient-to-b from-[#FBBF24]/5 to-transparent pointer-events-none -z-10" />

      {/* --- 1. HERO SECTION --- */}
      <section className="relative min-h-[90vh] flex items-center pt-24 pb-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-[45%] h-full bg-[#1A2316]/5 -skew-x-12 translate-x-24 z-0 hidden lg:block" />
        
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center relative z-10 w-full">
          <motion.div 
            initial="hidden"
            animate="show"
            variants={containerVariants}
            className="text-left space-y-8"
          >
            <motion.div 
              variants={itemVariants}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FBBF24]/20 border border-[#FBBF24]/30 text-[#1A2316] rounded-full text-[10px] font-black uppercase tracking-[0.2em]"
            >
              <Zap size={12} className="fill-[#FBBF24] text-[#FBBF24]" /> #1 Home Food Platform in Pakistan
            </motion.div>
            
            <motion.h1 
              variants={itemVariants}
              className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tighter uppercase italic"
            >
              Homemade Taste, <br />
              <span className="text-[#FBBF24] underline decoration-[#1A2316] decoration-wavy underline-offset-[12px] not-italic">Delivered</span> <br />
              With Care.
            </motion.h1>
            
            <motion.p 
              variants={itemVariants}
              className="text-gray-500 text-base md:text-lg max-w-lg leading-relaxed font-medium"
            >
              Experience the unmatched warmth of home-cooked hygiene from local culinary stars. Natural ingredients, custom meal plans, and real-time tracking.
            </motion.p>
            
            <motion.div 
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-5"
            >
              <Link to="/explore">
                <motion.button 
                  whileHover={{ scale: 1.05, backgroundColor: "#FBBF24", color: "#1A2316" }} 
                  whileTap={{ scale: 0.98 }} 
                  className="w-full sm:w-auto bg-[#1A2316] text-[#FBBF24] px-10 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-2xl transition-colors duration-300"
                >
                  Order Now <ArrowRight size={16}/>
                </motion.button>
              </Link>
              
              <div className="flex -space-x-3 items-center justify-start ml-2">
                {[1,2,3,4].map(i => (
                  <img 
                    key={i} 
                    className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" 
                    src={`https://i.pravatar.cc/100?img=${i+12}`} 
                    alt="user" 
                  />
                ))}
                <span className="pl-5 text-[11px] font-black uppercase tracking-wider text-gray-400">
                  5,000+ Active Foodies
                </span>
              </div>
            </motion.div>
          </motion.div>

          {/* REALISTIC MOBILE MOCKUP WITH SIMULATED LIVE APP UI */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, x: 50 }} 
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 1, type: "spring", bounce: 0.25 }}
            className="relative flex justify-center"
          >
            {/* Phone Frame */}
            <div className="relative z-20 w-[290px] md:w-[330px] aspect-[9/18.5] bg-neutral-900 rounded-[50px] p-3 shadow-[0_50px_100px_rgba(26,35,22,0.25)] border-[10px] border-neutral-950">
                {/* Speaker Grill / Notch */}
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-950 rounded-full z-30 flex items-center justify-center">
                  <div className="w-10 h-1 bg-neutral-800 rounded-full mb-1"></div>
                </div>
                
                {/* Screen Content - Interactive simulated application UI */}
                <div className="w-full h-full overflow-hidden rounded-[38px] bg-[#FDFDFB] relative flex flex-col pt-6 text-left selection:bg-transparent">
                  {/* App Header */}
                  <div className="px-4 py-2 flex justify-between items-center bg-white border-b border-gray-50">
                    <div>
                      <div className="flex items-center gap-1 text-[8px] text-gray-400 font-bold uppercase">
                        <MapPin size={8} className="text-[#FBBF24]" /> Lahore, Pakistan
                      </div>
                      <p className="text-[10px] font-black uppercase italic tracking-tighter">HomePlates.</p>
                    </div>
                    <ShoppingBag size={12} className="text-[#1A2316]" />
                  </div>

                  {/* App Search Bar */}
                  <div className="px-4 py-2">
                    <div className="w-full bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2 border border-gray-100">
                      <Search size={10} className="text-gray-400" />
                      <span className="text-[9px] font-semibold text-gray-300">Search Chicken Karahi...</span>
                    </div>
                  </div>

                  {/* App Category Pills */}
                  <div className="px-4 py-1 flex gap-2 overflow-x-auto no-scrollbar">
                    {['All', 'Biryani', 'Karahi', 'Diet Plan'].map((cat, i) => (
                      <span key={cat} className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${i === 0 ? 'bg-[#1A2316] text-[#FBBF24]' : 'bg-gray-100 text-gray-400'}`}>
                        {cat}
                      </span>
                    ))}
                  </div>

                  {/* Featured Product Card */}
                  <div className="p-4 flex-1">
                    <div className="bg-white rounded-3xl p-3 border border-gray-50 shadow-sm flex flex-col h-full">
                      <div className="relative h-28 rounded-2xl overflow-hidden mb-3">
                        <img 
                          src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=600" 
                          className="w-full h-full object-cover" 
                          alt="Special Pizza" 
                        />
                        <div className="absolute top-2 right-2 bg-white p-1.5 rounded-full shadow-sm"><Heart size={10} className="text-red-500 fill-red-500" /></div>
                      </div>
                      <span className="bg-orange-50 text-orange-600 text-[7px] font-black px-2 py-0.5 rounded-md uppercase w-fit mb-1">BESTSELLER</span>
                      <h4 className="text-[11px] font-black uppercase italic text-[#1A2316]">Mom's Special Biryani</h4>
                      <p className="text-[8px] text-gray-400 font-semibold mb-3">by Chef Ayesha Kitchen</p>
                      
                      <div className="mt-auto flex justify-between items-center pt-2 border-t border-gray-50">
                        <span className="text-xs font-black text-[#1A2316]">Rs. 450</span>
                        <div className="bg-[#1A2316] text-white p-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1">Add <Plus size={8} /></div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom tracking banner simulation */}
                  <div className="m-3 p-3 bg-[#1A2316] text-white rounded-2xl flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-[#FBBF24] rounded-full animate-ping"></div>
                      <div>
                        <p className="text-[7px] font-black uppercase text-gray-400">Rider on the way</p>
                        <p className="text-[8px] font-bold">Arriving in 12 mins</p>
                      </div>
                    </div>
                    <ChevronRight size={10} className="text-[#FBBF24]" />
                  </div>
                </div>
            </div>
            
            {/* Ambient Background Radial Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-[#FBBF24]/10 rounded-full blur-[120px] -z-10" />
          </motion.div>
        </div>
      </section>

      {/* --- 2. THE DYNAMIC TABS SECTION --- */}
      <section className="py-24 bg-white border-y border-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-[#FBBF24] text-[10px] font-black uppercase tracking-[0.3em] mb-3">One Platform</p>
            <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter">Everything you need<span className="text-[#FBBF24]">.</span></h2>
          </div>

          <div className="flex justify-center mb-16 p-2 bg-gray-50 rounded-3xl w-fit mx-auto border border-gray-100">
            {Object.keys(tabContent).map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab ? 'text-[#FBBF24]' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {activeTab === tab && (
                  <motion.div 
                    layoutId="tabPill"
                    className="absolute inset-0 bg-[#1A2316] rounded-2xl -z-0"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="relative z-10">
                  {tab === 'delivery' ? 'Fast Logistics' : tab}
                </span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="grid lg:grid-cols-2 gap-16 items-center"
            >
              <div className="space-y-8 text-left">
                <h3 className="text-4xl font-black text-[#1A2316] uppercase italic tracking-tighter leading-tight">
                  {tabContent[activeTab].title}
                </h3>
                <p className="text-gray-500 font-medium leading-relaxed text-base">
                  {tabContent[activeTab].desc}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { title: 'Verified Quality', desc: 'SGS/Food safety tested' },
                    { title: 'Timely Logistics', desc: 'Fresh & hot delivery' },
                    { title: 'Secure Escrow', desc: 'Hassle-free withdrawal' }
                  ].map(item => (
                    <div key={item.title} className="p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:border-[#FBBF24]/30 transition-all">
                      <ShieldCheck className="text-[#FBBF24] mb-3" size={24} />
                      <h5 className="font-black uppercase text-[10px] tracking-wider mb-1">{item.title}</h5>
                      <p className="text-[10px] text-gray-400 font-bold">{item.desc}</p>
                    </div>
                  ))}
                </div>
                {tabContent[activeTab].btnText && (
                  <button 
                    onClick={() => navigate(tabContent[activeTab].link)}
                    className="bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-md inline-flex items-center gap-2"
                  >
                    {tabContent[activeTab].btnText} <ChevronRight size={14}/>
                  </button>
                )}
              </div>
              <div className="rounded-[40px] overflow-hidden shadow-2xl h-[420px] border border-gray-100 relative group">
                <img 
                  src={tabContent[activeTab].image} 
                  alt="Process" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A2316]/30 to-transparent" />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* --- 3. TESTIMONIALS SECTION --- */}
      <section className="py-24 bg-[#F4F7F2] px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <p className="text-[#FBBF24] text-[10px] font-black uppercase tracking-[0.3em]">Our Community</p>
            <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter">Loved by Thousands<span className="text-[#FBBF24]">.</span></h2>
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">Real stories from Lahore foodies & chefs</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {ratings.map((item, idx) => (
              <motion.div 
                key={idx} 
                whileHover={{ y: -8, shadow: "0 20px 40px rgba(26,35,22,0.08)" }}
                className="bg-white p-8 rounded-[40px] border border-gray-50 shadow-sm transition-all text-left flex flex-col justify-between h-full group"
              >
                <div>
                  <div className="flex gap-1 mb-6">
                    {[...Array(item.stars)].map((_, i) => (
                      <Star key={i} size={14} className="fill-[#FBBF24] text-[#FBBF24]" />
                    ))}
                  </div>
                  <p className="text-gray-600 font-semibold italic mb-8 leading-relaxed text-sm">
                    "{item.review}"
                  </p>
                </div>
                
                <div className="flex items-center gap-4 pt-6 border-t border-gray-50">
                  <div className="w-10 h-10 bg-[#1A2316] text-[#FBBF24] rounded-xl flex items-center justify-center font-black text-xs uppercase">
                    {item.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-xs uppercase text-[#1A2316]">{item.name}</p>
                    <p className="text-[8px] uppercase tracking-widest text-gray-400 font-black mt-0.5">
                      {item.tag} • {item.location}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- 4. PREMIUM FOOTER --- */}
      <footer className="bg-[#1A2316] text-white/60 pt-24 pb-12 px-6 lg:px-16 relative overflow-hidden">
        {/* Background glow inside footer */}
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#FBBF24] opacity-5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-20 relative z-10">
          <div className="space-y-6 text-left">
            <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">HomePlates<span className="text-[#FBBF24]">.</span></h3>
            <p className="text-xs leading-relaxed text-gray-400">
              Bringing healthy, hygienic, home-cooked food straight to the doors of families and professionals in Pakistan.
            </p>
            <div className="flex gap-3">
              {[
                { icon: <Instagram size={18}/> },
                { icon: <Facebook size={18}/> },
                { icon: <Twitter size={18}/> }
              ].map((social, i) => (
                <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-xl hover:text-[#FBBF24] hover:bg-white/10 transition-all cursor-pointer">
                  {social.icon}
                </div>
              ))}
            </div>
          </div>
          
          <div className="text-left">
            <h4 className="text-white font-black uppercase text-[10px] tracking-widest mb-6 border-l-2 border-[#FBBF24] pl-3">Company</h4>
            <ul className="space-y-4 text-xs font-black uppercase tracking-wider">
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">About Us</li>
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">Chef Partner Portal</li>
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">Rider Network</li>
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">Contact</li>
            </ul>
          </div>

          <div className="text-left">
            <h4 className="text-white font-black uppercase text-[10px] tracking-widest mb-6 border-l-2 border-[#FBBF24] pl-3">Legal & Support</h4>
            <ul className="space-y-4 text-xs font-black uppercase tracking-wider">
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">Customer Help</li>
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">Refund Policy</li>
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">Privacy Terms</li>
              <li className="hover:text-[#FBBF24] transition-colors cursor-pointer">Service Guidelines</li>
            </ul>
          </div>

          <div className="text-left">
            <h4 className="text-white font-black uppercase text-[10px] tracking-widest mb-6 border-l-2 border-[#FBBF24] pl-3">Get the App</h4>
            <div className="space-y-4">
              <button className="w-full flex items-center gap-3 bg-white/5 border border-white/10 p-3 rounded-2xl hover:bg-white/10 transition-all">
                <Apple className="text-white" size={20} />
                <div className="text-left">
                  <p className="text-[8px] uppercase tracking-wider text-gray-400">Download on the</p>
                  <p className="text-xs font-black text-white">App Store</p>
                </div>
              </button>
              <button className="w-full flex items-center gap-3 bg-white/5 border border-white/10 p-3 rounded-2xl hover:bg-white/10 transition-all">
                <Play className="text-white fill-current" size={16} />
                <div className="text-left">
                  <p className="text-[8px] uppercase tracking-wider text-gray-400">Get it on</p>
                  <p className="text-xs font-black text-white">Google Play</p>
                </div>
              </button>
            </div>
          </div>
        </div>
        
        <div className="text-center pt-10 border-t border-white/5 text-[9px] font-black uppercase tracking-[2px] text-gray-500">
          © 2026 HomePlates Private Limited. Created with ❤️ for home cooks.
        </div>
      </footer>
    </div>
  );
};

export default HomePlatesLanding;