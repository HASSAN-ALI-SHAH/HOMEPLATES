import React, { useState, useEffect } from 'react'; // useEffect add kiya
import { Link } from 'react-router-dom';
import { MapPin, Star, Utensils, ArrowRight, Search } from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './Navbar'; 
import API from '../api'; // Aapki axios instance wali file

const AllChefs = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("All");
  const [chefs, setChefs] = useState([]); // Empty array se initialize kiya

  const getImageUrl = (url) => {
    if (!url) return 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `http://localhost:5000${url}`;
  };

  // Backend se chefs fetch karne ka logic
  useEffect(() => {
    const fetchChefs = async () => {
      try {
        const response = await API.get('/api/chefs'); 
        if (Array.isArray(response.data)) {
          setChefs(response.data);
        } else {
          console.error("Expected array for chefs data, got:", response.data);
          setChefs([]);
        }
      } catch (error) {
        console.error("Error fetching chefs:", error);
        setChefs([]);
      }
    };
    fetchChefs();
  }, []);


  // Filter logic wahi hai
  const filteredChefs = chefs.filter(chef => {
    const matchesSearch = chef?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          chef?.specialty?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCity = selectedCity === "All" || 
                        chef?.city?.trim().toLowerCase() === selectedCity.trim().toLowerCase();
    return matchesSearch && matchesCity;
  });

  const cities = ["All", "Lahore", "Karachi", "Islamabad"];

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#FDFEFA] py-16 px-6 lg:px-20 font-sans">
        <div className="max-w-7xl mx-auto">
          
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div className="text-left">
              <h1 className="text-5xl md:text-7xl font-black text-[#1A2316] tracking-tighter uppercase leading-[0.9] mb-4">
                Our <span className="text-[#FBBF24]">Master</span> <br />Home Chefs
              </h1>
              <p className="text-gray-500 font-medium max-w-md">
                Verified home chefs bringing authentic flavors from their Home kitchen to your Plates.
              </p>
            </div>
            
            <div className="w-full md:w-auto space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search ..." 
                  className="w-full md:w-80 pl-12 pr-4 py-4 rounded-2xl border-none bg-white shadow-sm focus:ring-2 focus:ring-[#FBBF24] outline-none transition-all"
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {cities.map(city => (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all
                      ${selectedCity === city ? 'bg-[#1A2316] text-white' : 'bg-white text-gray-400 hover:bg-gray-100'}`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <motion.div layout className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode='popLayout'>
              {filteredChefs.map((chef) => (
                <motion.div 
                  layout
                  key={chef._id} // MongoDB ka _id use karein
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="group bg-white rounded-[40px] overflow-hidden shadow-sm border border-gray-100 p-4 hover:shadow-2xl transition-all duration-500"
                >
                  <div className="relative h-72 mb-6 overflow-hidden rounded-[32px] bg-gray-200">
                    <img 
                      src={getImageUrl(chef.img)} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                      alt={chef.name} 
                    />
                    <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl flex items-center gap-1 shadow-sm">
                      <Star size={14} className="fill-[#FBBF24] text-[#FBBF24]" />
                      <span className="text-[13px] font-bold text-[#1A2316]">{chef.rating || "N/A"}</span>
                    </div>
                  </div>

                  <div className="px-2">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-2xl font-black text-[#1A2316] tracking-tight uppercase leading-tight">
                          {chef.name}
                        </h3>
                        <div className="flex items-center gap-1 text-[#FBBF24] mt-1">
                          <MapPin size={14} />
                          <span className="text-[11px] font-bold uppercase tracking-tighter">{chef.city || "Pakistan"}</span>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-xl text-center min-w-[60px]">
                        <p className="text-[10px] text-gray-400 font-bold uppercase leading-none">Exp</p>
                        <p className="text-[12px] font-black text-[#1A2316]">
                          {chef.experience ? `${chef.experience}y+` : "0y+"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 py-3">
                      <div className="bg-[#1A2316]/5 p-2 rounded-lg">
                          <Utensils size={16} className="text-[#1A2316]" />
                      </div>
                      <p className="text-[13px] font-bold text-gray-600 leading-tight">
                          {chef.specialty}
                      </p>
                    </div>

                    <div className="pt-4 pb-2">
                      <Link 
                        to={`/chef/${chef._id}`} 
                        className="group/btn relative flex items-center justify-center gap-3 bg-[#1A2316] text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all duration-300 shadow-lg active:scale-95"
                      >
                        View Kitchen <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {filteredChefs.length === 0 && (
            <div className="text-center py-20">
              <h3 className="text-2xl font-bold text-gray-400">No chefs found in this category.</h3>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AllChefs;