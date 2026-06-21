import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu, X, User, ChevronRight, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar = ({ cartCount, currentUser, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Explore Food', path: '/explore' },
    { name: 'All Chefs', path: '/chefs' },
    { name: 'Platform Reviews', path: '/reviews' }, 
  ];

  const handleProfileClick = () => {
    if (!currentUser) {
      navigate('/login');
    } else {
      setShowProfileMenu(!showProfileMenu);
    }
  };

  const handleLogoutAction = () => {
    setShowProfileMenu(false);
    onLogout();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-[#FBBF24] rounded-lg flex items-center justify-center text-[#1A2316] font-black text-xl">
            H
          </div>
          <span className="text-xl md:text-2xl font-black text-[#1A2316] tracking-tighter uppercase italic">
            HomePlates<span className="text-[#FBBF24]">.</span>
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex gap-10 items-center text-[11px] font-black uppercase tracking-[0.15em]">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link 
                key={link.name} 
                to={link.path} 
                className={`relative py-1 transition-all duration-300 ${isActive ? 'text-[#1A2316]' : 'text-gray-400 hover:text-[#1A2316]'}`}
              >
                {link.name}
                {isActive && (
                  <motion.div 
                    layoutId="navUnderline"
                    className="absolute -bottom-1 left-0 right-0 h-[3px] bg-[#FBBF24] rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right Icons & Action Buttons */}
        <div className="flex items-center gap-2 md:gap-4 relative">
          
          {/* Cart Icon */}
          <div 
            onClick={() => navigate('/cart')}
            className="relative cursor-pointer text-[#1A2316] w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-all"
          >
            <ShoppingCart size={20} strokeWidth={2.5} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#1A2316] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black shadow-sm border-2 border-white">
                {cartCount}
              </span>
            )}
          </div>
          
          {/* Dynamic User Profile & Dropdown */}
          <div className="relative">
            <button 
              onClick={handleProfileClick}
              className={`flex w-10 h-10 items-center justify-center rounded-xl transition-all duration-300 overflow-hidden border-2 ${currentUser ? 'border-[#FBBF24]' : 'bg-gray-100 border-transparent hover:bg-[#FBBF24]'}`}
            >
              {currentUser && (currentUser.img || currentUser.avatar) ? (
                <img 
                  src={
                    (currentUser.img || currentUser.avatar).startsWith('http') 
                      ? (currentUser.img || currentUser.avatar) 
                      : `http://localhost:5000${currentUser.img || currentUser.avatar}`
                  } 
                  className="w-full h-full object-cover" 
                  alt="Profile" 
                />
              ) : currentUser ? (
                <span className="font-black text-sm text-[#1A2316]">{(currentUser.name || 'U').charAt(0).toUpperCase()}</span>
              ) : (
                <User size={20} strokeWidth={2.5} />
              )}
            </button>

            {/* Profile Dropdown Menu */}
            <AnimatePresence>
              {showProfileMenu && currentUser && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-4 w-56 bg-white rounded-[30px] shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-gray-100 p-2 z-[110]"
                >
                  <div className="px-5 py-4 border-b border-gray-50 mb-2 flex items-center gap-3">
                    {(currentUser.img || currentUser.avatar) ? (
                      <img
                        src={(currentUser.img || currentUser.avatar).startsWith('http') ? (currentUser.img || currentUser.avatar) : `http://localhost:5000${currentUser.img || currentUser.avatar}`}
                        className="w-10 h-10 rounded-xl object-cover border-2 border-[#FBBF24] flex-shrink-0"
                        alt="Profile"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#1A2316] flex items-center justify-center flex-shrink-0">
                        <span className="font-black text-[#FBBF24] text-sm">{(currentUser.name || 'U').charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Signed in as</p>
                      <p className="text-[12px] font-black text-[#1A2316] truncate italic uppercase">{currentUser.name}</p>
                      <span className="bg-orange-100 text-orange-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase mt-1 inline-block">
                        {currentUser.role}
                      </span>
                    </div>
                  </div>

                  {/* CUSTOMER ONLY: My Profile */}
                  {currentUser.role === 'user' && (
                    <button 
                      onClick={() => { navigate('/profile'); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase text-[#1A2316] hover:bg-gray-50 rounded-2xl transition-all group"
                    >
                      <Settings size={16} className="text-gray-400 group-hover:text-[#1A2316]" /> 
                      My Profile
                    </button>
                  )}

                  {/* CHEF ONLY: Chef Dashboard */}
                  {currentUser.role === 'chef' && (
                    <button 
                      onClick={() => { navigate('/chef/dashboard'); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase text-[#1A2316] hover:bg-[#FBBF24]/10 rounded-2xl transition-all group"
                    >
                      <LayoutDashboard size={16} className="text-[#FBBF24] group-hover:scale-110 transition-transform" /> 
                      Chef Panel
                    </button>
                  )}

                  {/* RIDER ONLY: Rider Dashboard */}
                  {currentUser.role === 'rider' && (
                    <button 
                      onClick={() => { navigate('/rider/dashboard'); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase text-[#1A2316] hover:bg-[#FBBF24]/10 rounded-2xl transition-all group"
                    >
                      <LayoutDashboard size={16} className="text-[#FBBF24] group-hover:scale-110 transition-transform" /> 
                      Rider Panel
                    </button>
                  )}

                  <div className="h-px bg-gray-50 my-1 mx-2" />

                  <button 
                    onClick={handleLogoutAction}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <LogOut size={16} /> Logout Account
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Order Now - CTA */}
          <button 
            onClick={() => navigate('/explore')}
            className="hidden lg:flex bg-[#FBBF24] text-[#1A2316] px-7 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#1A2316] hover:text-white transition-all shadow-lg active:scale-95 items-center gap-2"
          >
            Order Now <ChevronRight size={14} />
          </button>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden w-10 h-10 flex items-center justify-center text-[#1A2316] bg-gray-50 rounded-xl" 
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white overflow-hidden border-t border-gray-100"
          >
            <div className="flex flex-col p-6 gap-4">
              {navLinks.map((link) => (
                <Link 
                  key={link.name} 
                  to={link.path} 
                  onClick={() => setIsOpen(false)}
                  className={`text-[11px] font-black uppercase tracking-widest py-3 border-b border-gray-50 ${location.pathname === link.path ? 'text-[#FBBF24]' : 'text-[#1A2316]'}`}
                >
                  {link.name}
                </Link>
              ))}
              
              {/* Role Based Mobile Profile */}
              {currentUser ? (
                currentUser.role === 'chef' ? (
                  <Link 
                    to="/chef/dashboard"
                    onClick={() => setIsOpen(false)}
                    className="text-[11px] font-black uppercase tracking-widest py-3 border-b border-gray-50 text-[#1A2316]"
                  >
                    Chef Dashboard
                  </Link>
                ) : (
                  <Link 
                    to="/profile"
                    onClick={() => setIsOpen(false)}
                    className="text-[11px] font-black uppercase tracking-widest py-3 border-b border-gray-50 text-[#1A2316]"
                  >
                    My Profile
                  </Link>
                )
              ) : (
                <Link 
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="text-[11px] font-black uppercase tracking-widest py-3 border-b border-gray-50 text-[#1A2316]"
                >
                  Login / Sign Up
                </Link>
              )}

              {currentUser && (
                <button 
                  onClick={handleLogoutAction}
                  className="text-[11px] font-black uppercase tracking-widest py-3 text-red-500 text-left border-b border-gray-50"
                >
                  Logout Account
                </button>
              )}

              <button 
                onClick={() => { navigate('/explore'); setIsOpen(false); }}
                className="bg-[#FBBF24] text-[#1A2316] py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest mt-2"
              >
                Start Ordering
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;