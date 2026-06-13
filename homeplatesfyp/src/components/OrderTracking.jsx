import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Phone, MessageSquare, Clock, CheckCircle2, Bike, ChefHat, PackageCheck, AlertTriangle } from 'lucide-react';

const OrderTracking = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  // Review states
  const [chefRating, setChefRating] = useState(0);
  const [chefHover, setChefHover] = useState(0);
  const [chefComment, setChefComment] = useState("");
  const [riderRating, setRiderRating] = useState(0);
  const [riderHover, setRiderHover] = useState(0);
  const [riderComment, setRiderComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const handleSubmitReviews = async () => {
    if (chefRating === 0 || (order.rider && riderRating === 0)) {
      alert("Please select a rating for all entities.");
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      alert("Please login to submit feedback.");
      return;
    }
    setSubmittingReview(true);
    try {
      // Submit Chef Review
      const chefPromise = fetch('http://localhost:5000/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chefId: order.chef?._id,
          orderId: order._id,
          rating: chefRating,
          comment: chefComment || "Great food!"
        })
      });

      // Submit Rider Review if rider exists
      let riderPromise = Promise.resolve();
      if (order.rider) {
        riderPromise = fetch('http://localhost:5000/api/reviews', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            riderId: order.rider?._id,
            orderId: order._id,
            rating: riderRating,
            comment: riderComment || "Fast delivery!"
          })
        });
      }

      const [chefRes, riderRes] = await Promise.all([chefPromise, riderPromise]);

      if (chefRes.ok && (!order.rider || riderRes.ok)) {
        setReviewSubmitted(true);
      } else {
        alert("Some reviews failed to submit. Please try again.");
      }
    } catch (err) {
      console.error("Error submitting reviews:", err);
      alert("An error occurred while submitting reviews.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const fetchOrder = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/orders/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
      }
    } catch (err) {
      console.error("Error fetching order:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // 10-second polling to update status dynamically
    const interval = setInterval(fetchOrder, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  const handleCancelOrder = async () => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    try {
      const response = await fetch(`http://localhost:5000/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: 'cancelled', cancellationReason: 'Cancelled by customer' })
      });
      if (response.ok) {
        alert("Order cancelled successfully!");
        fetchOrder();
      } else {
        alert("Failed to cancel order.");
      }
    } catch (err) {
      console.error(err);
      alert("Error cancelling order");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFDFB] flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-black text-[#1A2316] uppercase italic tracking-widest animate-pulse">Loading Tracking Details...</h2>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#FDFDFB] flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-3xl font-black text-[#1A2316] uppercase italic mb-4">Order Not Found</h2>
        <button onClick={() => navigate('/explore')} className="bg-[#1A2316] text-white px-8 py-3 rounded-xl font-black uppercase text-[10px]">
            Back to Explore
        </button>
      </div>
    );
  }

  // Map database status to stepper states
  const getStepStatus = (stepIndex) => {
    if (order.status === 'cancelled') return 'pending';
    
    const statusMap = {
      'pending': 1,
      'accepted': 1,
      'preparing': 2,
      'ready-for-pickup': 3,
      'picked-up': 3,
      'out-for-delivery': 3,
      'delivered': 4
    };
    
    const currentStep = statusMap[order.status] || 1;
    
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'active';
    return 'pending';
  };

  const steps = [
    { 
      id: 1, 
      label: order.status === 'pending' ? "Order Placed" : "Order Confirmed", 
      desc: order.status === 'pending' 
        ? "Waiting for chef confirmation..." 
        : `Chef ${order.chef?.name || "Home Chef"} has received your order`, 
      icon: <CheckCircle2 size={18}/>, 
      status: getStepStatus(1) 
    },
    { id: 2, label: "Preparing Food", desc: "Your meal is being cooked with love", icon: <ChefHat size={18}/>, status: getStepStatus(2) },
    { 
      id: 3, 
      label: order.status === 'ready-for-pickup' ? "Ready for Pickup" : "Out for Delivery", 
      desc: order.status === 'ready-for-pickup' 
        ? (order.rider ? `Rider ${order.rider.name} is heading to kitchen` : "Waiting for rider to accept")
        : order.status === 'picked-up'
        ? `Rider ${order.rider?.name || "Rider"} has picked up and is in transit`
        : order.rider 
        ? `Rider ${order.rider.name} is on the way` 
        : "Waiting for a rider", 
      icon: <Bike size={18}/>, 
      status: getStepStatus(3) 
    },
    { id: 4, label: "Delivered", desc: "Enjoy your home-cooked meal!", icon: <PackageCheck size={18}/>, status: getStepStatus(4) },
  ];

  return (
    <div className="min-h-screen bg-[#FDFDFB] pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* LEFT: MAP/STATUS PLACEHOLDER (7 Columns) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Cancellation Alert */}
          {order.status === 'cancelled' && (
            <div className="bg-red-50 border-2 border-red-200 p-6 rounded-[30px] text-left flex items-start gap-4 shadow-sm">
              <AlertTriangle className="text-red-500 mt-1 flex-shrink-0" size={24} />
              <div>
                <h4 className="font-black text-red-700 uppercase text-sm">Order Cancelled</h4>
                <p className="text-xs text-red-600 font-bold mt-1">Reason: {order.cancellationReason || "Cancelled by chef/customer"}</p>
              </div>
            </div>
          )}

          {order.status === 'delivered' && !reviewSubmitted ? (
            <div className="bg-white p-10 rounded-[45px] border border-gray-100 shadow-xl text-left space-y-8">
              <div>
                <span className="text-[#FBBF24] text-[10px] font-black uppercase tracking-[3px] mb-2 block">Rate Your Experience</span>
                <h3 className="text-3xl font-black text-[#1A2316] uppercase italic tracking-tighter">How was everything?</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">Your feedback helps us maintain high-quality home-cooked meals.</p>
              </div>

              {/* Chef Review Section */}
              <div className="bg-[#FEF9ED]/50 p-6 rounded-3xl border border-[#FBBF24]/10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#1A2316] text-[#FBBF24] p-2 rounded-xl">
                    <ChefHat size={20} />
                  </div>
                  <div>
                    <h4 className="font-black text-[#1A2316] text-sm uppercase">Rate Chef {order.chef?.name || "Kitchen"}</h4>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">{order.chef?.specialty || "Home Chef"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 py-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setChefRating(star)}
                      onMouseEnter={() => setChefHover(star)}
                      onMouseLeave={() => setChefHover(0)}
                      className="transition-transform active:scale-90 animate-pulse"
                    >
                      <svg
                        className="w-8 h-8 transition-colors duration-150"
                        fill={(chefHover || chefRating) >= star ? "#FBBF24" : "none"}
                        stroke={(chefHover || chefRating) >= star ? "#FBBF24" : "#D1D5DB"}
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.246.6 1.792l-3.97 2.887a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.887a1 1 0 00-1.176 0l-3.97 2.887c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.97-2.887c-.76-.546-.361-1.792.6-1.792h4.906a1 1 0 00.95-.69l1.519-4.674z" />
                      </svg>
                    </button>
                  ))}
                </div>

                <textarea
                  value={chefComment}
                  onChange={(e) => setChefComment(e.target.value)}
                  placeholder="Share details of your experience with the food and packaging..."
                  className="w-full h-24 bg-white border border-gray-200 rounded-2xl p-4 text-xs font-semibold focus:outline-none focus:border-[#FBBF24] transition-all resize-none"
                />
              </div>

              {/* Rider Review Section */}
              {order.rider && (
                <div className="bg-[#F4F7F2]/50 p-6 rounded-3xl border border-green-100 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-500 text-white p-2 rounded-xl">
                      <Bike size={20} />
                    </div>
                    <div>
                      <h4 className="font-black text-[#1A2316] text-sm uppercase">Rate Rider {order.rider?.name || "Delivery Agent"}</h4>
                      <p className="text-[10px] text-gray-500 font-bold uppercase">Logistics Fleet</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRiderRating(star)}
                        onMouseEnter={() => setRiderHover(star)}
                        onMouseLeave={() => setRiderHover(0)}
                        className="transition-transform active:scale-90"
                      >
                        <svg
                          className="w-8 h-8 transition-colors duration-150"
                          fill={(riderHover || riderRating) >= star ? "#FBBF24" : "none"}
                          stroke={(riderHover || riderRating) >= star ? "#FBBF24" : "#D1D5DB"}
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.246.6 1.792l-3.97 2.887a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.887a1 1 0 00-1.176 0l-3.97 2.887c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.97-2.887c-.76-.546-.361-1.792.6-1.792h4.906a1 1 0 00.95-.69l1.519-4.674z" />
                        </svg>
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={riderComment}
                    onChange={(e) => setRiderComment(e.target.value)}
                    placeholder="Share details of your experience with the rider speed, communication..."
                    className="w-full h-24 bg-white border border-gray-200 rounded-2xl p-4 text-xs font-semibold focus:outline-none focus:border-[#FBBF24] transition-all resize-none"
                  />
                </div>
              )}

              <button
                onClick={handleSubmitReviews}
                disabled={submittingReview || chefRating === 0 || (order.rider && riderRating === 0)}
                className="w-full bg-[#1A2316] text-[#FBBF24] py-5 rounded-3xl font-black uppercase text-xs tracking-widest hover:scale-[1.01] active:scale-95 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingReview ? "Submitting Reviews..." : "Submit Feedback"}
              </button>
            </div>
          ) : reviewSubmitted ? (
            <div className="bg-white p-12 rounded-[45px] border border-gray-100 shadow-xl text-center space-y-4">
              <div className="w-16 h-16 bg-green-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-2xl font-black text-[#1A2316] uppercase italic tracking-tighter">Feedback Submitted!</h3>
              <p className="text-xs text-gray-500 font-bold max-w-sm mx-auto">Thank you for sharing your thoughts. Your reviews help keep HomePlates safe, friendly, and delicious.</p>
              <button
                onClick={() => navigate('/explore')}
                className="mt-4 px-8 py-4 bg-[#1A2316] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all"
              >
                Back to Explore
              </button>
            </div>
          ) : (
            <div className="h-[400px] lg:h-[500px] bg-gray-100 rounded-[45px] relative overflow-hidden border-4 border-white shadow-2xl">
              <div className="absolute inset-0 bg-[#E5E7EB] flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="mx-auto text-[#FBBF24] animate-bounce mb-2" size={40} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 italic">Live Tracking Active</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Status: {order.status}</p>
                </div>
              </div>

              {/* Floating Rider Card */}
              {order.rider && (
                <div className="absolute bottom-8 left-8 right-8 bg-[#1A2316] p-6 rounded-[35px] flex items-center justify-between shadow-2xl text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-[#FBBF24] rounded-2xl flex items-center justify-center">
                      <Bike size={28} className="text-[#1A2316]"/>
                    </div>
                    <div>
                      <h4 className="text-white font-black text-xs uppercase italic">Rider: {order.rider.name}</h4>
                      <p className="text-gray-400 text-[10px] font-bold uppercase tracking-tighter">Phone: {order.rider.phone || "N/A"}</p>
                    </div>
                  </div>
                  {order.rider.phone && (
                    <a href={`tel:${order.rider.phone}`} className="p-4 bg-white/10 text-white rounded-2xl hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all">
                      <Phone size={18}/>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: TRACKING STATUS (5 Columns) */}
        <div className="lg:col-span-5 bg-white p-10 rounded-[45px] border border-gray-100 shadow-xl text-left flex flex-col justify-between">
          <div>
            <div className="mb-10">
              <h2 className="text-3xl font-black text-[#1A2316] uppercase italic tracking-tighter">Track Order<span className="text-[#FBBF24]">.</span></h2>
              <div className="flex items-center gap-2 mt-2">
                 <Clock size={14} className="text-gray-400"/>
                 <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Est. Arrival: 30 - 45 Mins</p>
              </div>
            </div>

            {/* STEPPER */}
            <div className="space-y-8 relative">
              <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-gray-100" />

              {steps.map((step) => (
                <div key={step.id} className="relative flex gap-6 group">
                  <div className={`z-10 w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg ${
                    step.status === 'completed' ? 'bg-[#1A2316] text-[#FBBF24]' : 
                    step.status === 'active' ? 'bg-[#FBBF24] text-[#1A2316] ring-4 ring-[#FEF9ED]' : 
                    'bg-white border-2 border-gray-100 text-gray-300'
                  }`}>
                    {step.icon}
                  </div>
                  <div>
                    <h4 className={`text-[11px] font-black uppercase tracking-widest ${
                      step.status === 'pending' ? 'text-gray-300' : 'text-[#1A2316]'
                    }`}>{step.label}</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase italic mt-1">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ORDER SUMMARY PREVIEW */}
          <div className="mt-12 pt-8 border-t border-gray-50">
             <div className="bg-gray-50 p-6 rounded-3xl space-y-3">
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order ID</span>
                   <span className="text-[10px] font-black text-[#1A2316] truncate max-w-[150px]">#{order._id}</span>
                </div>
                
                <div className="border-t border-dashed border-gray-200 my-2 pt-2">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Items Ordered</span>
                  {order.items?.map((item, index) => (
                    <div key={index} className="flex justify-between text-xs font-bold text-gray-600">
                      <span>{item.dishId?.name || "Item"} ({item.portion || "Full"}) x {item.quantity}</span>
                      <span>Rs. {item.price * item.quantity}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center border-t border-dashed border-gray-200 pt-2">
                   <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Bill</span>
                   <span className="text-[12px] font-black text-[#1A2316]">Rs. {order.totalAmount}</span>
                </div>
                
                <div className="border-t border-dashed border-gray-200 pt-2">
                   <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Delivery Destination</span>
                   <p className="text-[10px] font-semibold text-gray-600 mt-1">{order.deliveryAddress}</p>
                </div>
             </div>

             {order.status === 'pending' && (
               <button 
                 onClick={handleCancelOrder}
                 className="w-full mt-6 py-4 bg-red-50 text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-red-200 hover:bg-red-500 hover:text-white transition-all"
               >
                 Cancel Order
               </button>
             )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default OrderTracking;