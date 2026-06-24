import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, MapPin, CreditCard, ChevronRight, ShoppingBag, CheckCircle2, ArrowLeft, User, Phone, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../utils/toast';

const CartPage = ({ cartItems, setCartItems, currentUser }) => {
  const [step, setStep] = useState(1); // 1: Review, 2: Checkout
  const navigate = useNavigate();

  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [deliveryCoords, setDeliveryCoords] = useState(null); // { lat, lng } from GPS
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Detect customer's GPS coordinates for the delivery pin
  const detectDeliveryLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDeliveryCoords({ lat: coords.latitude, lng: coords.longitude });
        setDetectingLocation(false);
        toast.success('📍 Delivery location detected!');
      },
      (err) => {
        console.error('GPS error:', err);
        setDetectingLocation(false);
        toast.error('Could not detect location. Please allow GPS access.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (currentUser) {
      setRecipientName(currentUser.name || "");
      setPhone(currentUser.phone || "");
      setDeliveryAddress(currentUser.address || "");
    }
  }, [currentUser]);

  const getImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `${window.API_URL}${url}`;
  };

  // Group cart items by chefId to calculate correct fees
  const getCartFees = () => {
    if (cartItems.length === 0) {
      return { subtotal: 0, deliveryCharges: 0, platformFee: 0, total: 0 };
    }

    const itemsByChef = {};
    cartItems.forEach(item => {
      const chefId = item.chefId || item.chef;
      if (!chefId) return;
      if (!itemsByChef[chefId]) {
        itemsByChef[chefId] = [];
      }
      itemsByChef[chefId].push(item);
    });

    let totalSubtotal = 0;
    let totalDeliveryCharges = 0;
    let totalPlatformFee = 0;

    Object.values(itemsByChef).forEach(chefItems => {
      const chefSubtotal = chefItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const chefQty = chefItems.reduce((sum, item) => sum + item.qty, 0);
      
      const deliveryFee = chefQty > 10 ? 200 : 150;
      const platformFeeForChef = chefSubtotal * 0.10;

      totalSubtotal += chefSubtotal;
      totalDeliveryCharges += deliveryFee;
      totalPlatformFee += platformFeeForChef;
    });

    const roundedPlatformFee = Math.round(totalPlatformFee);
    return {
      subtotal: totalSubtotal,
      deliveryCharges: totalDeliveryCharges,
      platformFee: roundedPlatformFee,
      total: totalSubtotal + totalDeliveryCharges + roundedPlatformFee
    };
  };

  const { subtotal, deliveryCharges, platformFee, total } = getCartFees();

  const updateQty = (id, portion, delta) => {
    setCartItems(items => items.map(item => {
      const itemId = item._id || item.id;
      const itemPortion = item.portion || 'Full';
      return (itemId === id && itemPortion === portion) ? { ...item, qty: Math.max(1, item.qty + delta) } : item;
    }));
  };

  const removeItem = (id, portion) => {
    setCartItems(items => items.filter(item => {
      const itemId = item._id || item.id;
      const itemPortion = item.portion || 'Full';
      return !(itemId === id && itemPortion === portion);
    }));
  };

  const handleFinalConfirm = async () => {
    if (!currentUser) {
      toast.error("Please login to place an order.");
      navigate('/login');
      return;
    }

    if (!recipientName.trim()) {
      toast.error("Please enter a recipient name.");
      return;
    }

    if (!phone.trim()) {
      toast.error("Please enter a contact phone number.");
      return;
    }

    if (!deliveryAddress.trim()) {
      toast.error("Please enter a delivery address.");
      return;
    }

    // Group cart items by chefId
    const itemsByChef = {};
    cartItems.forEach(item => {
      const chefId = item.chefId || item.chef; // Fallback to chef
      if (!chefId) return;
      if (!itemsByChef[chefId]) {
        itemsByChef[chefId] = [];
      }
      itemsByChef[chefId].push(item);
    });

    const chefIds = Object.keys(itemsByChef);
    if (chefIds.length === 0) {
      toast.error("No valid items in the cart.");
      return;
    }

    setPlacingOrder(true);

    try {
      // Place orders for each chef in parallel
      const orderPromises = chefIds.map(async (chefId) => {
        const chefItems = itemsByChef[chefId];
        const chefSubtotal = chefItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const chefQty = chefItems.reduce((sum, item) => sum + item.qty, 0);
        
        // Charges per order
        const deliveryFee = chefQty > 10 ? 200 : 150; 
        const serviceFee = chefSubtotal * 0.10;
        const totalAmount = Math.round(chefSubtotal + deliveryFee + serviceFee);

        const payload = {
          user: currentUser._id,
          chef: chefId,
          items: chefItems.map(item => ({
            dishId: item._id || item.id,
            quantity: item.qty,
            price: item.price,
            portion: item.portion || 'Full'
          })),
          totalAmount: totalAmount,
          deliveryAddress: `${recipientName} | Ph: ${phone} | Addr: ${deliveryAddress} ${notes ? `(Instructions: ${notes})` : ""}`,
          paymentMethod: paymentMethod,
          deliveryCharges: deliveryFee,
          // GPS coordinates stored in Order for instant map display
          deliveryLocation: deliveryCoords || undefined,
        };

        const response = await fetch(window.API_URL + '/api/orders/place', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || errData.error || "Failed to place order");
        }

        return response.json();
      });

      const results = await Promise.all(orderPromises);
      
      // Clear the local cart
      setCartItems([]);
      localStorage.removeItem('cart');

      // ── Store active order IDs so the notification bar picks them up instantly ──
      const newOrderIds = results
        .filter(r => r?.order?._id)
        .map(r => r.order._id);
      if (newOrderIds.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('activeOrderIds') || '[]');
          localStorage.setItem('activeOrderIds', JSON.stringify([...new Set([...existing, ...newOrderIds])]));
        } catch {}
      }

      if (results.length === 1 && results[0].order?._id) {
        toast.success("Order placed successfully! Track it live.");
        navigate(`/track/${results[0].order._id}`);
      } else {
        toast.success(`Successfully placed ${results.length} orders!`);
        navigate('/profile', { state: { tab: 'orders' } });
      }


    } catch (error) {
      console.error(error);
      toast.error("Error placing order: " + error.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFB] pt-28 pb-20 px-6 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* STEP INDICATOR */}
        <div className="flex justify-center items-center gap-6 mb-16">
          <div className="flex flex-col items-center gap-2">
            <button onClick={() => setStep(1)} className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs transition-all duration-500 ${step >= 1 ? 'bg-[#FBBF24] text-[#1A2316] shadow-lg shadow-[#FBBF24]/20' : 'bg-gray-100 text-gray-400'}`}>01</button>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#1A2316]">Basket</span>
          </div>
          <div className={`w-20 h-[2px] rounded-full transition-all duration-500 ${step >= 2 ? 'bg-[#FBBF24]' : 'bg-gray-100'}`} />
          <div className="flex flex-col items-center gap-2">
            <button onClick={() => { if (cartItems.length > 0) setStep(2); }} className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs transition-all duration-500 ${step >= 2 ? 'bg-[#FBBF24] text-[#1A2316] shadow-lg shadow-[#FBBF24]/20' : 'bg-gray-100 text-gray-400'}`}>02</button>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Checkout</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div 
              key="step1" 
              initial={{ opacity: 0, x: -20 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: 20 }} 
              className="grid grid-cols-1 lg:grid-cols-3 gap-12 text-left"
            >
              {/* LEFT: CART ITEMS */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-3xl font-black text-[#1A2316] uppercase italic tracking-tighter">My Basket<span className="text-[#FBBF24]">.</span></h2>
                  <span className="text-[10px] font-black bg-gray-100 px-4 py-2 rounded-full uppercase tracking-widest">{cartItems.length} Items</span>
                </div>

                {cartItems.length > 0 ? cartItems.map((item) => {
                  const itemId = item._id || item.id;
                  const itemPortion = item.portion || 'Full';
                  const itemKey = `${itemId}-${itemPortion}`;
                  return (
                    <motion.div 
                      layout
                      key={itemKey} 
                      className="group bg-white p-6 rounded-[35px] border border-gray-100 flex items-center gap-6 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="relative overflow-hidden rounded-2xl w-24 h-24 bg-gray-100">
                         <img src={getImageUrl(item.img)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={item.name} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-[#1A2316] uppercase text-sm tracking-tight">{item.name}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">By {item.chefName || item.chef || "Home Chef"}</p>
                        
                        {/* Portion Display */}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-block bg-gray-50 border border-gray-100 text-[#1A2316] text-[9px] font-black uppercase px-2.5 py-1 rounded-lg">
                            Portion: {itemPortion}
                          </span>
                        </div>

                        {item.instructions && (
                          <p className="text-[10px] text-orange-500 italic mt-1">Instructions: "{item.instructions}"</p>
                        )}
                        
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center bg-gray-50 rounded-xl p-1 gap-4 border border-gray-100">
                            <button onClick={() => updateQty(itemId, itemPortion, -1)} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-lg transition-all"><Minus size={14}/></button>
                            <span className="font-black text-sm w-4 text-center">{item.qty}</span>
                            <button onClick={() => updateQty(itemId, itemPortion, 1)} className="w-8 h-8 flex items-center justify-center hover:bg-[#FBBF24] rounded-lg transition-all"><Plus size={14}/></button>
                          </div>
                          <span className="font-black text-[#1A2316]">Rs. {item.price * item.qty}</span>
                        </div>
                      </div>
                      <button onClick={() => removeItem(itemId, itemPortion)} className="p-4 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"><Trash2 size={20}/></button>
                    </motion.div>
                  );
                }) : (
                  <div className="text-center py-24 bg-white rounded-[45px] border-2 border-dashed border-gray-100">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                       <ShoppingBag size={32} className="text-gray-200" />
                    </div>
                    <p className="text-gray-400 font-black uppercase text-[11px] tracking-[0.3em]">Basket is empty</p>
                    <button onClick={() => navigate('/explore')} className="mt-6 text-[#FBBF24] font-black text-[10px] uppercase underline tracking-widest">Start Adding Food</button>
                  </div>
                )}
              </div>

              {/* RIGHT: BILLING */}
              <div className="bg-[#1A2316] rounded-[45px] p-10 h-fit text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FBBF24] opacity-5 rounded-full -mr-16 -mt-16" />
                <h3 className="text-xl font-black uppercase italic mb-8 border-b border-white/5 pb-6 text-[#FBBF24]">Total Bill</h3>
                
                <div className="space-y-5 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">
                  <div className="flex justify-between"><span>Items Subtotal</span><span className="text-white">Rs. {subtotal}</span></div>
                  <div className="flex justify-between"><span>Delivery Fee</span><span className="text-white">Rs. {deliveryCharges}</span></div>
                  <div className="flex justify-between"><span>Platform Fee</span><span className="text-white">Rs. {platformFee}</span></div>
                  <div className="h-[1px] bg-white/5 my-6" />
                  <div className="flex justify-between text-lg text-white font-black italic">
                    <span>To Pay</span>
                    <span className="text-[#FBBF24]">Rs. {total}</span>
                  </div>
                </div>

                <button 
                  onClick={() => setStep(2)}
                  disabled={cartItems.length === 0}
                  className="w-full mt-10 py-6 bg-[#FBBF24] text-[#1A2316] rounded-[25px] font-black text-[11px] uppercase tracking-[0.25em] shadow-xl hover:bg-white hover:text-[#1A2316] transition-all disabled:opacity-20 flex items-center justify-center gap-2 group"
                >
                  Proceed to Checkout <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="step2" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="max-w-2xl mx-auto text-left"
            >
              <div className="bg-white rounded-[50px] p-12 border border-gray-100 shadow-2xl">
                <button onClick={() => setStep(1)} className="mb-8 flex items-center gap-2 text-gray-400 hover:text-[#1A2316] transition-all text-[10px] font-black uppercase tracking-widest">
                  <ArrowLeft size={14}/> Back to Basket
                </button>

                <h2 className="text-3xl font-black text-[#1A2316] uppercase italic mb-10 tracking-tighter">Delivery<span className="text-[#FBBF24]">.</span></h2>
                
                {!currentUser ? (
                  <div className="text-center py-10">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6">Please log in to continue with checkout.</p>
                    <button onClick={() => navigate('/login')} className="bg-[#1A2316] text-[#FBBF24] px-10 py-5 rounded-[25px] font-black uppercase text-[10px] tracking-widest shadow-xl">Login / Sign Up</button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Recipient Name */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#1A2316] mb-3 block ml-1">Recipient Name</label>
                      <div className="relative group">
                        <User className="absolute left-6 top-1/2 -translate-y-1/2 text-[#FBBF24]" size={18} />
                        <input 
                          type="text"
                          placeholder="Full Name" 
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          className="w-full pl-16 p-5 bg-gray-50 rounded-[25px] border-2 border-transparent focus:border-[#FBBF24]/20 focus:bg-white outline-none font-bold text-sm transition-all" 
                          required
                        />
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#1A2316] mb-3 block ml-1">Phone Number</label>
                      <div className="relative group">
                        <Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-[#FBBF24]" size={18} />
                        <input 
                          type="text"
                          placeholder="Mobile Number" 
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full pl-16 p-5 bg-gray-50 rounded-[25px] border-2 border-transparent focus:border-[#FBBF24]/20 focus:bg-white outline-none font-bold text-sm transition-all" 
                          required
                        />
                      </div>
                    </div>

                    {/* Drop-off Address */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#1A2316] mb-3 block ml-1">Drop-off Location Address</label>
                      <div className="relative group">
                        <MapPin className="absolute left-6 top-6 text-[#FBBF24] group-focus-within:scale-110 transition-transform" size={20} />
                        <textarea 
                          placeholder="House #, Street Name, Area, City..." 
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          className="w-full pl-16 p-6 bg-gray-50 rounded-[30px] border-2 border-transparent focus:border-[#FBBF24]/20 focus:bg-white outline-none font-bold text-sm h-32 transition-all shadow-inner resize-none" 
                          required
                        />
                      </div>
                      {/* GPS Detection Button */}
                      <button
                        type="button"
                        onClick={detectDeliveryLocation}
                        disabled={detectingLocation}
                        className={`mt-3 flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          deliveryCoords
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : 'bg-[#FEF9ED] text-[#1A2316] border border-[#FBBF24]/30 hover:bg-[#FBBF24]/10'
                        } disabled:opacity-50`}
                      >
                        <MapPin size={14} className={deliveryCoords ? 'text-emerald-500' : 'text-[#FBBF24]'} />
                        {detectingLocation
                          ? 'Detecting...'
                          : deliveryCoords
                          ? `✅ GPS Captured (${deliveryCoords.lat.toFixed(4)}, ${deliveryCoords.lng.toFixed(4)})`
                          : '📍 Detect My Current Location'}
                      </button>
                      {deliveryCoords && (
                        <p className="text-[9px] text-gray-400 font-bold mt-1 ml-1">
                          Your exact GPS coordinates are saved for live map tracking.
                        </p>
                      )}
                    </div>

                    {/* Rider Instructions */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#1A2316] mb-3 block ml-1">Instructions for Rider / Chef</label>
                      <div className="relative group">
                        <MessageSquare className="absolute left-6 top-6 text-[#FBBF24] group-focus-within:scale-110 transition-transform" size={20} />
                        <textarea 
                          placeholder="e.g. Please leave the parcel at the gate, make it extra hot, etc." 
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full pl-16 p-6 bg-gray-50 rounded-[30px] border-2 border-transparent focus:border-[#FBBF24]/20 focus:bg-white outline-none font-bold text-sm h-24 transition-all shadow-inner resize-none" 
                        />
                      </div>
                    </div>

                    {/* Payment Method Selector */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#1A2316] mb-4 block ml-1">Payment Method</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div 
                          onClick={() => setPaymentMethod("cash")}
                          className={`p-6 border-2 rounded-[30px] relative cursor-pointer shadow-md transition-all ${paymentMethod === 'cash' ? 'border-[#FBBF24] bg-[#FEF9ED]' : 'border-gray-100 bg-white'}`}
                        >
                          {paymentMethod === 'cash' && (
                            <div className="absolute top-6 right-6 text-[#1A2316]"><CheckCircle2 size={18} fill="#FBBF24"/></div>
                          )}
                          <CreditCard className="text-[#1A2316] mb-3" size={24}/>
                          <p className="text-[11px] font-black uppercase tracking-tighter text-[#1A2316]">Cash on Delivery</p>
                          <p className="text-[9px] text-[#1A2316]/50 font-bold uppercase mt-1">Pay at your doorstep</p>
                        </div>
                        
                        <div className="p-6 border-2 border-gray-50 bg-gray-50 rounded-[30px] opacity-40 grayscale cursor-not-allowed">
                          <CreditCard className="text-gray-400 mb-3" size={24}/>
                          <p className="text-[11px] font-black uppercase tracking-tighter">Online Payment</p>
                          <p className="text-[9px] font-bold uppercase mt-1">Coming Soon</p>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handleFinalConfirm}
                      disabled={placingOrder}
                      className="w-full mt-6 py-6 bg-[#1A2316] text-[#FBBF24] rounded-[30px] font-black text-[12px] uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {placingOrder ? "Placing Order..." : "Confirm & Place Order"}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CartPage;