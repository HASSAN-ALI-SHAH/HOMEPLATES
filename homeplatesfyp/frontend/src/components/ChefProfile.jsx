import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, MapPin, ShieldCheck, ArrowLeft,
  Coffee, Sun, Moon, CheckCircle2,
  Bell, Search, ShoppingCart,
  User, Send, Heart, ChefHat, ChevronRight, Loader2
} from 'lucide-react';
import { toast } from '../utils/toast';

const ChefProfile = ({ handleAddToCart }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  // --- API Data ---
  const [chef, setChef] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  // --- UI States ---
  const [activeTab, setActiveTab] = useState('Menu');
  const [notification, setNotification] = useState(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [subscribing, setSubscribing] = useState(false);
  // FIX: [B15] - Food categories selection state
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Review States
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviews, setReviews] = useState([]);

  // Subscription States
  const [selectedPlanType, setSelectedPlanType] = useState('monthly');
  const [selectedMeals, setSelectedMeals] = useState({ breakfast: true, lunch: true, dinner: false });

  // Custom plans states
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [planSelectedDays, setPlanSelectedDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);

  // Portion Customization States
  const [customizingItem, setCustomizingItem] = useState(null);
  const [selectedPortion, setSelectedPortion] = useState('Full');

  useEffect(() => {
    const fetchPlans = async () => {
      if (!id) return;
      setLoadingPlans(true);
      try {
        const res = await fetch(`${window.API_URL}/api/subscriptions/plans/chef/${id}`);
        if (res.ok) {
          const data = await res.json();
          setPlans(data || []);
        }
      } catch (err) {
        console.error('Error fetching subscription plans:', err);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, [id]);

  const handleSubscribePlan = (plan) => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (!currentUser._id) {
      showToast('Please login to subscribe!');
      navigate('/login');
      return;
    }
    if (planSelectedDays.length === 0) {
      showToast('Please select at least one delivery day!');
      return;
    }
    setPaymentDetails({
      isPlan: true,
      planId: plan._id,
      selectedDays: planSelectedDays,
      totalCost: Math.round((plan.price / 7) * planSelectedDays.length)
    });
    setShowPaymentModal(true);
  };

  const submitSubscriptionWithPayment = async (e) => {
    e.preventDefault();
    if (!screenshotFile) {
      showToast('Please upload a screenshot of your transaction!');
      return;
    }
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    setSubscribing(true);

    const formData = new FormData();
    formData.append('userId', currentUser._id);
    formData.append('screenshot', screenshotFile);

    if (paymentDetails.isPlan) {
      formData.append('planId', paymentDetails.planId);
      formData.append('selectedDays', JSON.stringify(paymentDetails.selectedDays));
      formData.append('totalCost', paymentDetails.totalCost);
      formData.append('startDate', new Date().toISOString());
    } else {
      formData.append('chefId', id);
      formData.append('planType', paymentDetails.planType);
      formData.append('selectedDays', JSON.stringify(paymentDetails.selectedDays));
      formData.append('mealType', paymentDetails.mealType);
      formData.append('totalCost', paymentDetails.totalCost);
      formData.append('startDate', new Date().toISOString());
    }

    const endpoint = paymentDetails.isPlan 
      ? window.API_URL + '/api/subscriptions/subscribe-plan'
      : window.API_URL + '/api/subscriptions/add';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      if (res.ok) {
        toast.success('🎉 Subscription request submitted successfully! Your subscription will become active once the administrator verifies your payment screenshot (usually within 1-2 hours).');
        setShowPaymentModal(false);
        setScreenshotFile(null);
        setPaymentDetails(null);
        setSelectedPlan(null);
        navigate('/profile', { state: { tab: 'subscriptions' } });
      } else {
        toast.error(data.message || 'Subscription failed');
      }
    } catch (err) {
      toast.error('Error uploading payment details');
    } finally {
      setSubscribing(false);
    }
  };


  // Dynamic recipes state
  const [recipes, setRecipes] = useState([]);

  // --- Fetch Chef Data + Menu + Reviews + Recipes from Backend ---
  useEffect(() => {
    const fetchChef = async () => {
      if (!id) return;
      setDataLoading(true);
      try {
        const [chefRes, reviewRes, recipeRes] = await Promise.allSettled([
          fetch(`${window.API_URL}/api/chef/${id}/profile`),
          fetch(`${window.API_URL}/api/reviews/chef/${id}`),
          fetch(`${window.API_URL}/api/chef/recipes/chef/${id}`)
        ]);

        if (chefRes.status === 'fulfilled' && chefRes.value.ok) {
          const data = await chefRes.value.json();
          setChef(data.chef);
          setMenuItems(data.menu || []);
        }
        if (reviewRes.status === 'fulfilled' && reviewRes.value.ok) {
          const reviewData = await reviewRes.value.json();
          setReviews(reviewData.reviews || []);
        }
        if (recipeRes.status === 'fulfilled' && recipeRes.value.ok) {
          const recipeData = await recipeRes.value.json();
          setRecipes(recipeData || []);
        }
      } catch (err) {
        console.error('Chef profile fetch error:', err);
      } finally {
        setDataLoading(false);
      }
    };
    fetchChef();
  }, [id]);

  // --- Helpers ---
  const showToast = (msg) => {
    toast.info(msg);
  };

  const getImageUrl = (url) => {
    if (!url) return 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `${window.API_URL}${url}`;
  };

  // --- Add to Cart ---
  const handleAddToCartLocal = (item, portion = 'Full') => {
    if (!handleAddToCart) {
      navigate('/cart');
      return;
    }
    const finalPrice = portion === 'Half' ? Math.round(item.price * 0.6) : item.price;
    handleAddToCart({
      _id: item._id,
      name: `${item.name} (${portion})`,
      price: finalPrice,
      img: item.img,
      chefId: id,
      chefName: chef?.name || 'Chef',
      qty: 1,
      portion: portion
    });
    showToast(`${item.name} (${portion}) added to cart! 🛒`);
  };

  // --- Review Submit ---
  const handleReviewSubmit = async () => {
    if (userRating === 0 || reviewText.trim() === '') {
      showToast('Please add a rating and comment!');
      return;
    }
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (!currentUser._id) {
      showToast('Please login to submit a review');
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await fetch(window.API_URL + '/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId: currentUser._id,
          chefId: id,
          rating: userRating,
          comment: reviewText
        })
      });
      if (res.ok) {
        const data = await res.json();
        setReviews(prev => [
          { ...data.review, userId: { name: currentUser.name || 'You' } },
          ...prev
        ]);
        setUserRating(0);
        setReviewText('');
        showToast('Review posted! ❤️');
      } else {
        const err = await res.json();
        showToast(err.message || 'Failed to post review');
      }
    } catch (e) {
      showToast('Error submitting review');
    } finally {
      setSubmittingReview(false);
    }
  };

  // --- Subscription Price ---
  const calculatePrice = () => {
    let price = 0;
    if (selectedPlanType === 'weekly') {
      if (selectedMeals.breakfast) price += chef?.weeklyBreakfastPrice !== undefined ? chef.weeklyBreakfastPrice : 1000;
      if (selectedMeals.lunch) price += chef?.weeklyLunchPrice !== undefined ? chef.weeklyLunchPrice : 2300;
      if (selectedMeals.dinner) price += chef?.weeklyDinnerPrice !== undefined ? chef.weeklyDinnerPrice : 2000;
    } else {
      if (selectedMeals.breakfast) price += chef?.monthlyBreakfastPrice !== undefined ? chef.monthlyBreakfastPrice : 3800;
      if (selectedMeals.lunch) price += chef?.monthlyLunchPrice !== undefined ? chef.monthlyLunchPrice : 8900;
      if (selectedMeals.dinner) price += chef?.monthlyDinnerPrice !== undefined ? chef.monthlyDinnerPrice : 7600;
    }
    return price;
  };

  // --- Subscribe ---
  const handleSubscribe = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (!currentUser._id) {
      showToast('Please login to subscribe!');
      navigate('/login');
      return;
    }
    if (!Object.values(selectedMeals).some(Boolean)) {
      showToast('Please select at least one meal!');
      return;
    }
    const mealTypes = Object.entries(selectedMeals)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setPaymentDetails({
      isPlan: false,
      planType: selectedPlanType,
      selectedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      mealType: mealTypes.join(' + '),
      totalCost: calculatePrice()
    });
    setShowPaymentModal(true);
  };

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-[#FDFDFB] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-[#FBBF24] mx-auto mb-4" />
          <p className="font-black uppercase text-[10px] tracking-widest text-gray-400 animate-pulse">
            Loading Chef Profile...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFB] pb-20 text-left font-sans selection:bg-[#FBBF24]">

      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-full shadow-2xl flex items-center gap-3"
          >
            <Bell size={18} className="animate-bounce" />
            <span className="font-black text-[10px] uppercase tracking-[0.2em]">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Header */}
      <div className="relative h-[300px] bg-[#1A2316]">
        <img
          src={getImageUrl(chef?.kitchenImage)}
          className="w-full h-full object-cover opacity-40"
          alt="Kitchen Banner"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FDFDFB] via-transparent to-transparent" />

        <div className="absolute top-8 left-8 right-8 flex justify-between items-center">
          <button
            onClick={() => navigate(-1)}
            className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white hover:text-[#1A2316] transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            onClick={() => { setIsFavorite(!isFavorite); showToast(isFavorite ? 'Removed from Favs' : 'Added to Favorites!'); }}
            className={`p-3 rounded-full backdrop-blur-md transition-all ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}
          >
            <Heart size={20} fill={isFavorite ? 'white' : 'none'} />
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6">
        {/* Chef Profile Card */}
        <div className="relative -mt-24 bg-white rounded-[40px] shadow-2xl p-8 border border-gray-50 flex flex-col md:flex-row gap-8 items-center text-center md:text-left">
          <div className="relative">
            <div className="w-36 h-36 rounded-[40px] border-4 border-white shadow-xl bg-[#1A2316] flex items-center justify-center overflow-hidden">
              {chef?.img ? (
                <img src={getImageUrl(chef.img)} className="w-full h-full object-cover" alt={chef.name} />
              ) : (
                <span className="text-5xl font-black text-[#FBBF24]">{(chef?.name || 'C').charAt(0)}</span>
              )}
            </div>
            {chef?.isVerified && (
              <div className="absolute -bottom-2 -right-2 bg-[#FBBF24] p-2 rounded-xl shadow-lg border-2 border-white">
                <ShieldCheck size={20} className="text-[#1A2316]" />
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
              <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">
                {chef?.specialty || 'Home Chef'}
              </span>
              {chef?.rating > 0 && (
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                  <Star size={10} className="fill-green-700" />
                  {chef.rating.toFixed(1)} ({chef.totalReviews || 0} Reviews)
                </span>
              )}
              {chef?.isVerified && (
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">
                  ✓ Verified
                </span>
              )}
            </div>
            <h1 className="text-4xl font-black text-[#1A2316] italic uppercase tracking-tighter">
              {chef?.kitchenName || `${chef?.name || 'Chef'}'s Kitchen`}
            </h1>
            {chef?.kitchenName && (
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                Chef: {chef?.name}
              </p>
            )}
            <p className="text-gray-400 font-medium italic mt-2 flex items-center justify-center md:justify-start gap-2">
              <MapPin size={16} className="text-[#FBBF24]" />
              {chef?.city || chef?.address || 'Lahore'}
            </p>
            {chef?.phone && (
              <a href={`tel:${chef.phone}`} className="text-sm text-[#FBBF24] font-bold mt-1 block">
                📞 {chef.phone}
              </a>
            )}
          </div>

          <div className="flex gap-6 border-l pl-8 border-gray-100 hidden lg:flex">
            <div className="text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase">Experience</p>
              <p className="text-xl font-black text-[#1A2316] italic">{chef?.experience || 'N/A'}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase">Menu Items</p>
              <p className="text-xl font-black text-[#1A2316] italic">{menuItems.length}</p>
            </div>
          </div>
        </div>

        {/* FIX #7: Offline Banner — shown when chef is NOT active */}
        {chef && !chef.isActive && (
          <div className="mt-6 bg-red-50 border-2 border-red-200 rounded-[30px] p-6 flex items-center gap-4">
            <div className="bg-red-500 p-3 rounded-2xl flex-shrink-0">
              <span className="text-white text-lg">🔴</span>
            </div>
            <div>
              <p className="font-black uppercase text-red-700 text-sm tracking-wide">Kitchen Currently Offline</p>
              <p className="text-red-500 text-xs font-bold mt-0.5">This chef is not accepting orders right now. You can browse their menu but cannot place an order.</p>
            </div>
          </div>
        )}

        {/* FIX #1: Unverified chef banner */}
        {chef && !chef.isVerified && (
          <div className="mt-4 bg-yellow-50 border-2 border-yellow-200 rounded-[30px] p-6 flex items-center gap-4">
            <div className="bg-yellow-400 p-3 rounded-2xl flex-shrink-0">
              <span className="text-white text-lg">⚠️</span>
            </div>
            <div>
              <p className="font-black uppercase text-yellow-700 text-sm tracking-wide">Pending Verification</p>
              <p className="text-yellow-600 text-xs font-bold mt-0.5">This chef is awaiting admin verification. Orders are temporarily unavailable.</p>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mt-12 flex gap-10 border-b border-gray-100 overflow-x-auto no-scrollbar">
          {['Menu', 'About', 'Recipes', 'Subscription', 'Reviews'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative whitespace-nowrap ${activeTab === tab ? 'text-[#1A2316]' : 'text-gray-300 hover:text-gray-500'}`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div layoutId="tabUnderline" className="absolute bottom-0 left-0 right-0 h-1 bg-[#FBBF24] rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="py-12">

          {/* 1. MENU TAB */}
          {activeTab === 'Menu' && (
            <div className="space-y-10">
              <div className="relative max-w-md">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                <input
                  type="text"
                  placeholder="Search dishes (e.g Biryani...)"
                  className="w-full pl-14 pr-6 py-4 rounded-3xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-[#FBBF24] shadow-inner font-medium"
                  onChange={(e) => setMenuSearch(e.target.value)}
                />
              </div>

              {/* FIX: [B15] - Food categories filters tag list */}
              {menuItems.length > 0 && (
                <div className="flex flex-wrap gap-2 py-2">
                  {['All', ...new Set(menuItems.map(item => item.category).filter(Boolean))].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                        selectedCategory === cat
                          ? 'bg-[#1A2316] text-[#FBBF24] shadow-md scale-105'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {menuItems.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-300">
                  <ChefHat size={56} className="mb-4 opacity-20" />
                  <p className="font-black text-[10px] uppercase tracking-widest">No menu items added yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {menuItems
                    .filter(i => i.name.toLowerCase().includes(menuSearch.toLowerCase()))
                    .filter(i => selectedCategory === 'All' || i.category === selectedCategory)
                    .map(item => (
                      <div
                        key={item._id}
                        className="group bg-white p-5 rounded-[45px] border border-gray-50 shadow-sm hover:shadow-xl transition-all duration-500"
                      >
                        <div className="h-48 rounded-[35px] mb-6 overflow-hidden relative">
                          <img
                            src={getImageUrl(item.img)}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                            alt={item.name}
                          />
                          {item.tag && (
                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest">
                              {item.tag}
                            </div>
                          )}
                          {!item.isAvailable && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-[35px]">
                              <span className="text-white font-black text-[10px] uppercase">Unavailable</span>
                            </div>
                          )}
                        </div>
                        <h3 className="font-black uppercase text-sm italic text-[#1A2316] mb-1">{item.name}</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                          {item.category || 'Homemade'} · {item.prepTime || '30 min'}
                        </p>
                        {item.description && (
                          <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>
                        )}
                        <div className="flex justify-between mt-6 items-center">
                          <span className="font-black text-2xl text-[#1A2316]">Rs. {item.price}</span>
                          <button
                            onClick={() => {
                              if (!chef?.isActive || !chef?.isVerified) {
                                toast.error(chef?.isActive === false ? 'This chef is currently offline.' : 'Chef not verified yet.');
                                return;
                              }
                              handleAddToCart({
                                _id: item._id,
                                name: item.name,
                                price: item.price,
                                basePrice: item.price,
                                img: item.img,
                                chefId: id,
                                chefName: chef?.name || 'Chef',
                                qty: 1,
                                portion: 'Full'
                              });
                              navigate('/cart');
                            }}
                            disabled={!item.isAvailable || !chef?.isActive || !chef?.isVerified}
                            className="bg-[#1A2316] text-white p-4 rounded-2xl hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <ShoppingCart size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* 2. ABOUT TAB */}
          {activeTab === 'About' && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="max-w-3xl space-y-8">
              <div className="space-y-4">
                <h2 className="text-3xl font-black text-[#1A2316] italic uppercase">The Home Kitchen Story</h2>
                <p className="text-gray-600 leading-[1.8] text-lg font-medium italic">
                  "{chef?.about || `Welcome to ${chef?.name || 'our'} home kitchen! We cook authentic, fresh home-cooked meals with love and care. No artificial ingredients, no shortcuts — just real food prepared with passion every single day.`}"
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-8 bg-[#1A2316] text-white rounded-[40px] relative overflow-hidden">
                  <ChefHat className="absolute -right-4 -bottom-4 text-white/5 w-32 h-32" />
                  <h4 className="font-black uppercase text-xs tracking-widest text-[#FBBF24] mb-4">Our Standards</h4>
                  <ul className="space-y-3 text-sm font-medium">
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#FBBF24]" /> Hand-picked Fresh Ingredients</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#FBBF24]" /> No Artificial Colors or Flavors</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#FBBF24]" /> 100% Halal Certified Meat</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#FBBF24]" /> Cooked Fresh on Order</li>
                  </ul>
                </div>
                <div className="p-8 bg-gray-50 rounded-[40px] flex items-center justify-center text-center">
                  <div>
                    <h4 className="text-5xl font-black text-[#1A2316]">{chef?.rating ? `${chef.rating.toFixed(1)}★` : '98%'}</h4>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                      {chef?.rating ? 'Average Rating' : 'Satisfied Customers'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2 font-bold">Based on {chef?.totalReviews || 0} reviews</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. RECIPES TAB */}
          {activeTab === 'Recipes' && (
            <div>
              {!selectedRecipe ? (
                recipes.length === 0 ? (
                  <div className="text-center py-16 text-gray-300 w-full">
                    <ChefHat size={56} className="mb-4 opacity-20 mx-auto" />
                    <p className="font-black text-[10px] uppercase tracking-widest text-center">No recipes added yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {recipes.map(recipe => (
                      <div
                        key={recipe._id}
                        onClick={() => setSelectedRecipe(recipe)}
                        className="group cursor-pointer flex gap-6 bg-white p-5 rounded-[35px] border border-gray-100 items-center hover:shadow-lg transition-all"
                      >
                        {recipe.img ? (
                          <img src={getImageUrl(recipe.img)} className="w-24 h-24 rounded-3xl object-cover" alt="" />
                        ) : (
                          <div className="w-24 h-24 rounded-3xl bg-gray-100 flex items-center justify-center text-gray-300">
                            <ChefHat size={32} />
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="font-black uppercase italic text-[#1A2316]">{recipe.name}</h3>
                          <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">{recipe.time} · {recipe.difficulty}</p>
                        </div>
                        <ChevronRight size={20} className="text-gray-300 group-hover:text-[#FBBF24]" />
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="bg-white rounded-[40px] border border-gray-100 overflow-hidden">
                  <div className="relative h-64">
                    <img src={getImageUrl(selectedRecipe.img)} className="w-full h-full object-cover" alt="" />
                    <button
                      onClick={() => setSelectedRecipe(null)}
                      className="absolute top-6 left-6 bg-white p-2 rounded-full shadow-lg"
                    >
                      <ArrowLeft size={18} />
                    </button>
                  </div>
                  <div className="p-8">
                    <h2 className="text-2xl font-black uppercase italic text-[#1A2316] mb-6">{selectedRecipe.name}</h2>
                    <div className="grid md:grid-cols-2 gap-8">
                      <div>
                        <h4 className="font-black uppercase text-[10px] tracking-widest text-yellow-600 mb-4">Ingredients</h4>
                        <ul className="space-y-2">
                          {selectedRecipe.ingredients.map((ing, idx) => (
                            <li key={idx} className="flex items-center gap-3 text-sm font-medium text-gray-600">
                              <CheckCircle2 size={14} className="text-green-500" /> {ing}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-black uppercase text-[10px] tracking-widest text-yellow-600 mb-4">Method</h4>
                        <div className="space-y-4">
                          {selectedRecipe.steps.map((step, idx) => (
                            <div key={idx} className="flex gap-3">
                              <span className="font-black text-gray-300 text-lg">{idx + 1}</span>
                              <p className="text-sm font-medium text-gray-600 pt-1">{step}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. SUBSCRIPTION TAB */}
          {activeTab === 'Subscription' && (
            <div className="space-y-8">
              {loadingPlans ? (
                <div className="text-center py-16">
                  <div className="w-8 h-8 border-4 border-[#FBBF24] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="font-black text-[10px] uppercase tracking-widest text-gray-400">Loading Meal Plans...</p>
                </div>
              ) : plans.length > 0 ? (
                <div className="grid lg:grid-cols-2 gap-16 items-start">
                  {/* Left Column: Plans List */}
                  <div className="space-y-6">
                    <h2 className="text-3xl font-black uppercase italic text-[#1A2316]">Meal Plan Packages</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider -mt-3">Select a package uploaded by this Chef</p>
                    
                    <div className="space-y-4">
                      {plans.map(plan => (
                        <button
                          key={plan._id}
                          onClick={() => {
                            setSelectedPlan(plan);
                          }}
                          className={`w-full p-6 rounded-[35px] border-2 text-left transition-all flex flex-col ${selectedPlan?._id === plan._id ? 'border-[#1A2316] bg-white shadow-xl' : 'border-gray-50 bg-gray-50/50 hover:bg-gray-50'}`}
                        >
                          <div className="flex justify-between items-start w-full mb-3">
                            <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{plan.duration}</span>
                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{plan.mealType}</span>
                          </div>
                          <h3 className="font-black text-xl text-[#1A2316] mb-1">{plan.title}</h3>
                          <p className="text-xs text-gray-500 font-medium line-clamp-2 mb-4">{plan.description}</p>
                          
                          <div className="flex justify-between items-center w-full border-t border-gray-100 pt-3">
                            <span className="text-lg font-black text-[#1A2316]">PKR {plan.price}</span>
                            <span className="text-[10px] font-black uppercase text-[#FBBF24] tracking-widest">Select Package ➔</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Selection Details & Days Config */}
                  <div className="sticky top-10">
                    {selectedPlan ? (
                      <div className="bg-[#1A2316] text-white p-10 rounded-[55px] shadow-2xl space-y-6">
                        <div>
                          <span className="bg-[#FBBF24] text-[#1A2316] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{selectedPlan.duration} Plan</span>
                          <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mt-2">{selectedPlan.title}</h3>
                          <p className="text-xs text-gray-400 font-bold mt-1">{selectedPlan.description}</p>
                        </div>

                        {/* Menu Grid */}
                        <div className="bg-white/5 p-6 rounded-[30px] border border-white/5 space-y-2 text-xs">
                          <p className="font-black uppercase text-[9px] tracking-wider text-[#FBBF24] mb-3">Menu Schedule</p>
                          {selectedPlan.menu?.map(m => (
                            <div key={m.day} className="flex justify-between">
                              <span className="text-gray-400 font-bold">{m.day}:</span>
                              <span className="font-semibold text-right text-white max-w-[180px] truncate" title={m.items}>{m.items || 'None'}</span>
                            </div>
                          ))}
                        </div>

                        {/* Delivery Days config */}
                        <div className="space-y-2">
                          <p className="font-black uppercase text-[9px] tracking-wider text-[#FBBF24]">Select Delivery Days</p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                              const isChecked = planSelectedDays.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    if (isChecked) {
                                      setPlanSelectedDays(planSelectedDays.filter(d => d !== day));
                                    } else {
                                      setPlanSelectedDays([...planSelectedDays, day]);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${isChecked ? 'bg-[#FBBF24] text-[#1A2316]' : 'bg-white/5 text-gray-400'}`}
                                >
                                  {day.slice(0, 3)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-6">
                          <p className="text-gray-400 text-xs font-black uppercase tracking-[0.2em] mb-1">Price</p>
                          <h3 className="text-5xl font-black text-[#FBBF24] italic">Rs. {Math.round((selectedPlan.price / 7) * planSelectedDays.length)}</h3>
                          <p className="text-gray-500 text-[10px] font-bold mt-1">Inclusive of all taxes & delivery</p>
                        </div>

                        <button
                          onClick={() => handleSubscribePlan(selectedPlan)}
                          disabled={subscribing}
                          className="w-full bg-[#FBBF24] text-[#1A2316] py-5 rounded-[25px] font-black uppercase text-xs tracking-[0.2em] mt-4 hover:scale-105 transition-all shadow-xl shadow-[#FBBF24]/20 disabled:opacity-60"
                        >
                          {subscribing ? 'Processing...' : 'Subscribe to Package'}
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border-2 border-dashed border-gray-200 p-12 rounded-[55px] text-center flex flex-col justify-center items-center h-80 text-gray-300">
                        <Star size={40} className="mb-4 opacity-20" />
                        <p className="font-black text-[10px] uppercase">Select a Plan Package</p>
                        <p className="text-xs text-gray-400 mt-2 font-bold max-w-[200px] mx-auto">Click any meal plan package on the left to configure delivery days and subscribe.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 p-12 rounded-[55px] text-center flex flex-col justify-center items-center h-80 text-gray-300 w-full">
                  <Star size={40} className="mb-4 opacity-20" />
                  <p className="font-black text-[10px] uppercase">No Subscription Plans Available</p>
                  <p className="text-xs text-gray-400 mt-2 font-bold max-w-[200px] mx-auto">This chef has not uploaded any subscription plans yet.</p>
                </div>
              )}
            </div>
          )}


          {/* 5. REVIEWS TAB */}
          {activeTab === 'Reviews' && (
            <div className="max-w-3xl space-y-16">
              <div className="bg-white p-10 rounded-[50px] border border-gray-50 shadow-sm">
                <h3 className="text-2xl font-black uppercase italic mb-8 text-[#1A2316]">Share Your Experience</h3>
                <div className="flex gap-3 mb-8">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setUserRating(s)}
                      onMouseEnter={() => setHoverRating(s)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="transition-transform hover:scale-125"
                    >
                      <Star
                        size={32}
                        className={`${(hoverRating || userRating) >= s ? 'fill-[#FBBF24] text-[#FBBF24]' : 'text-gray-100'}`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="How was the food? Share your honest feedback..."
                  className="w-full p-8 bg-gray-50 rounded-[35px] border-none outline-none focus:ring-2 focus:ring-[#FBBF24] mb-8 min-h-[150px] font-medium resize-none"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
                <button
                  onClick={handleReviewSubmit}
                  disabled={submittingReview}
                  className="bg-[#1A2316] text-[#FBBF24] px-12 py-5 rounded-[25px] text-[11px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all disabled:opacity-60"
                >
                  <Send size={16} /> {submittingReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>

              <div className="space-y-10">
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-gray-300">
                  Community Feedback ({reviews.length})
                </h3>
                {reviews.length === 0 ? (
                  <p className="text-gray-300 font-black text-[10px] uppercase">No reviews yet. Be the first!</p>
                ) : (
                  reviews.map((rev, index) => (
                    <div key={rev._id || index} className="flex gap-8 items-start group">
                      <div className="w-14 h-14 bg-gray-50 rounded-[20px] flex items-center justify-center text-[#1A2316] group-hover:bg-[#FBBF24] transition-colors flex-shrink-0">
                        <User size={24} />
                      </div>
                      <div className="flex-1 border-b border-gray-50 pb-8">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-black uppercase text-sm italic">
                            {rev.userId?.name || rev.user || 'Anonymous'}
                          </h4>
                          <span className="text-[10px] text-gray-400 font-bold uppercase">
                            {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString() : 'Recently'}
                          </span>
                        </div>
                        <div className="flex gap-1 mb-4">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={12}
                              className={i < rev.rating ? 'fill-[#FBBF24] text-[#FBBF24]' : 'text-gray-100'}
                            />
                          ))}
                        </div>
                        <p className="text-gray-600 font-medium leading-relaxed">{rev.comment}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EasyPaisa / JazzCash Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && paymentDetails && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowPaymentModal(false); setScreenshotFile(null); }} />
            <div className="relative w-full max-w-lg bg-white rounded-[45px] shadow-2xl p-8 border border-gray-100 overflow-hidden text-left">
              <button onClick={() => { setShowPaymentModal(false); setScreenshotFile(null); }} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200">✕</button>
              
              <h3 className="text-2xl font-black italic uppercase text-[#1A2316] mb-6">Payment Verification</h3>
              
              <div className="bg-[#1A2316] text-white p-6 rounded-[30px] mb-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">EasyPaisa / JazzCash Number</span>
                  <span className="font-black text-[#FBBF24] text-lg">03174674299</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Account Title</span>
                  <span className="font-black text-white text-sm">HomePlates Subscriptions</span>
                </div>
                <div className="border-t border-white/10 pt-4 flex justify-between items-center">
                  <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Total Amount Due</span>
                  <span className="font-black text-[#FBBF24] text-2xl">PKR {paymentDetails.totalCost}</span>
                </div>
              </div>

              <form onSubmit={submitSubscriptionWithPayment} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 block mb-2">Upload Payment Screenshot *</label>
                  <div className="border-2 border-dashed border-gray-200 hover:border-[#FBBF24] p-6 rounded-3xl text-center cursor-pointer transition-all relative">
                    <input 
                      type="file" 
                      accept="image/*" 
                      required
                      onChange={(e) => setScreenshotFile(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    {screenshotFile ? (
                      <p className="text-xs font-black text-green-600 truncate">{screenshotFile.name}</p>
                    ) : (
                      <>
                        <p className="text-xs font-black text-[#1A2316] uppercase">Click to Select Proof Image</p>
                        <p className="text-[9px] text-gray-400 font-bold mt-1">PNG, JPG, or JPEG up to 5MB</p>
                      </>
                    )}
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={subscribing}
                  className="w-full bg-[#1A2316] text-[#FBBF24] py-5 rounded-[25px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-[#253120] active:scale-95 transition-all disabled:opacity-60"
                >
                  {subscribing ? 'Uploading Proof...' : 'Submit Payment Proof'}
                </button>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default ChefProfile;