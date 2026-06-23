import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { X, RefreshCw } from 'lucide-react';

// Components imports (Keep your existing imports)
import HomePlatesLanding from './components/HomePlatesLanding';
import Navbar from './components/Navbar';
import ExploreFood from './components/ExploreFood';
import AllChefs from './components/AllChefs';
import Auth from './Auth';
import ChefProfile from './components/ChefProfile';
import OrderPage from './components/OrderPage';
import PlatformReviewPage from './components/PlatformReviewPage';
import CartPage from './components/CartPage';
import OrderTracking from './components/OrderTracking';
import ChefDashboard from './components/ChefDashboard'; 
import AddDishPage from './components/AddDishPage'; 
import EditDishPage from './components/EditDishPage'; 
import WalletPage from './components/WalletPage';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import UserProfile from './components/UserProfile'; 
import RiderDashboard from './components/RiderDashboard'; 
import OrderTrackingNotification from './components/OrderTrackingNotification';
import { Toaster } from 'react-hot-toast';

const AppRoutes = ({ cart, setCart, cartCount, currentUser, onLogin, onLogout, handleAddToCart }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isChefView = location.pathname.startsWith('/chef');
  const isAdminView = location.pathname.startsWith('/admin');
  const isRiderView = location.pathname.startsWith('/rider');

  // UPDATED: Handle Login and Routing logic with safer state synchronization
  const handleLogin = (userData) => {
    onLogin(userData); // Set state first
    
    // Use a small timeout to ensure currentUser state is updated before navigation
    setTimeout(() => {
      if (userData.role === 'chef') {
        navigate('/chef/dashboard');
      } else if (userData.role === 'rider') {
        navigate('/rider/dashboard');
      } else if (userData.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/explore');
      }
    }, 100);
  };

  return (
    <>
      {!isChefView && !isAdminView && !isRiderView && (
        <Navbar cartCount={cartCount} currentUser={currentUser} onLogout={onLogout} />
      )}

      <Routes>
        <Route path="/" element={<HomePlatesLanding />} /> 
        <Route path="/explore" element={<ExploreFood currentUser={currentUser} handleAddToCart={handleAddToCart} />} />
        <Route path="/chefs" element={<AllChefs />} />
        <Route path="/login" element={<Auth onLogin={handleLogin} currentUser={currentUser} />} />
        <Route path="/auth" element={<Auth onLogin={handleLogin} currentUser={currentUser} />} />
        
        <Route path="/profile" element={currentUser ? <UserProfile user={currentUser} onLogout={onLogout} onUserUpdate={onLogin} /> : <Navigate to="/login" />} />
        <Route path="/cart" element={<CartPage cartItems={cart} setCartItems={setCart} currentUser={currentUser} />} />
        <Route path="/order/:dishId" element={<OrderPage onAddToCart={handleAddToCart} />} />
        <Route path="/track/:orderId" element={<OrderTracking />} />
        <Route path="/reviews" element={<PlatformReviewPage currentUser={currentUser} />} />

        <Route path="/admin-entry" element={<AdminLogin onLogin={handleLogin} />} />
        <Route path="/admin/dashboard" element={currentUser?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/admin-entry" />} />
        
        <Route path="/rider/dashboard" element={currentUser?.role === 'rider' ? <RiderDashboard user={currentUser} onLogout={onLogout} onUserUpdate={onLogin} /> : <Navigate to="/login" />} />

        <Route path="/chef/:id" element={<ChefProfile handleAddToCart={handleAddToCart} />} />
        <Route path="/chef/dashboard" element={currentUser ? (currentUser.role === 'chef' ? <ChefDashboard onLogout={onLogout} onUserUpdate={onLogin} /> : <Navigate to="/explore" />) : <Navigate to="/login" />} />
        <Route path="/chef/add-dish" element={currentUser ? (currentUser.role === 'chef' ? <AddDishPage /> : <Navigate to="/explore" />) : <Navigate to="/login" />} />
        <Route path="/chef/edit-dish/:id" element={currentUser ? (currentUser.role === 'chef' ? <EditDishPage /> : <Navigate to="/explore" />) : <Navigate to="/login" />} />
        <Route path="/chef/wallet" element={currentUser ? (currentUser.role === 'chef' ? <WalletPage /> : <Navigate to="/explore" />) : <Navigate to="/login" />} />
      </Routes>
    </>
  );
};

const AppContent = ({ cart, setCart, cartCount, currentUser, onLogin, onLogout, handleAddToCart }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const location = useLocation();

  const isDashboardRoute = location.pathname.startsWith('/chef') || location.pathname.startsWith('/admin') || location.pathname.startsWith('/rider');

  useEffect(() => {
    if (isDashboardRoute || currentUser) {
      setShowAuthModal(false);
      return;
    }
    const hasSeenPopup = sessionStorage.getItem('hasSeenPopup');
    if (!hasSeenPopup) {
      const timer = setTimeout(() => {
        setShowAuthModal(true);
        sessionStorage.setItem('hasSeenPopup', 'true');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isDashboardRoute, currentUser]);

  const applyBlurEffect = showAuthModal && !isDashboardRoute;

  return (
    <>
      <div className={`min-h-screen bg-[#FDFDFB] transition-all duration-700 ${applyBlurEffect ? 'blur-md pointer-events-none' : ''}`}>
        <AppRoutes cart={cart} setCart={setCart} cartCount={cartCount} currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} handleAddToCart={handleAddToCart} />
      </div>

      {/* Global order tracking notification — shows for users & admin */}
      <OrderTrackingNotification currentUser={currentUser} />

      {/* Global toast notification system */}
      <Toaster position="top-right" />

      {applyBlurEffect && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowAuthModal(false)} />
          <div className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-6 right-6 z-[2001] p-2 bg-gray-100 rounded-full"><X size={24} /></button>
            <div className="max-h-[85vh] overflow-y-auto custom-scrollbar">
              <Auth onLogin={onLogin} isModal={true} currentUser={currentUser} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

function App() {
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cart')) || [];
    } catch {
      return [];
    }
  });

  // Restore session from localStorage on page load
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) || null; } catch { return null; }
  });

  // Track if we are currently validating the session with the backend on app mount
  const [syncing, setSyncing] = useState(() => {
    try {
      return !!localStorage.getItem('user');
    } catch {
      return false;
    }
  });

  // Sync user session with the database on mount to prevent stale local storage state
  useEffect(() => {
    const syncUser = async () => {
      if (!currentUser?._id) {
        setSyncing(false);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${window.API_URL}/api/user/profile/${currentUser._id}`, { headers });
        if (res.ok) {
          const freshUser = await res.json();
          setCurrentUser(freshUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
        } else {
          // If the profile sync fails with a non-OK status (e.g. 404 deleted, 401 unauthorized),
          // clear the stale credentials.
          console.warn(`Profile sync failed with status ${res.status}. Clearing stale session.`);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setCurrentUser(null);
        }
      } catch (e) {
        console.error("Failed to sync user session from DB:", e);
      } finally {
        setSyncing(false);
      }
    };
    syncUser();
  }, []);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const handleAddToCart = (item) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(i => 
        (i._id || i.id) === (item._id || item.id) && 
        (i.portion || 'Full') === (item.portion || 'Full')
      );
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx].qty += item.qty;
        if (item.instructions) {
          updated[existingIdx].instructions = item.instructions;
        }
        return updated;
      }
      return [...prev, item];
    });
  };

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const onLogin = (userData) => { setCurrentUser(userData); };
  
  const onLogout = () => { 
    localStorage.removeItem('token'); 
    localStorage.removeItem('user'); 
    setCurrentUser(null); 
    setCart([]); // Clear cart on logout
  };

  if (syncing) {
    return (
      <div className="min-h-screen bg-[#1A2316] flex flex-col items-center justify-center text-white relative font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.08)_0%,transparent_100%)]" />
        <div className="relative flex flex-col items-center max-w-sm px-6 text-center animate-in zoom-in duration-300">
          <div className="relative mb-6 flex items-center justify-center w-20 h-20 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
            <RefreshCw className="text-[#FBBF24] animate-spin" size={36} />
          </div>
          <h2 className="text-2xl font-black italic uppercase tracking-wider text-white mb-2">
            Verifying Session<span className="text-[#FBBF24]">.</span>
          </h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-relaxed">
            Please wait while we secure your connection
          </p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <AppContent 
        cart={cart} 
        setCart={setCart} 
        cartCount={cartCount} 
        currentUser={currentUser} 
        onLogin={onLogin} 
        onLogout={onLogout} 
        handleAddToCart={handleAddToCart} 
      />
    </Router>
  );
}

export default App;