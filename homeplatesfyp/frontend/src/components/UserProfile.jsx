import React, { useState, useEffect, useCallback } from 'react';
import {
  LogOut, ChevronRight, Truck, Save, Edit2, User,
  Pause, Play, Package, Star, HelpCircle, Home,
  Phone, Mail, MapPin, Clock, CheckCircle, XCircle, AlertTriangle, X
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from '../utils/toast';
import { io } from 'socket.io-client';

const UserProfile = ({ user, onLogout, onUserUpdate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    return location.state?.tab || 'overview';
  });

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // B16: Cancel order modal
  const [cancelOrderModal, setCancelOrderModal] = useState(null); // { orderId } or null
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [profileData, setProfileData] = useState({ name: '', phone: '', email: '', address: '' });
  const [orders, setOrders] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [helpMessage, setHelpMessage] = useState('');
  const [sendingHelp, setSendingHelp] = useState(false);

  // States for re-uploading payment screenshot
  const [reuploadingSubId, setReuploadingSubId] = useState(null);
  const [reuploadFile, setReuploadFile] = useState(null);
  const [reuploading, setReuploading] = useState(false);
  const [expandedSubId, setExpandedSubId] = useState(null);

  // -------------------------------------------------------
  // FETCH ALL DATA ON MOUNT
  // -------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!user?._id) return;
    setIsLoading(true);
    try {
      const [userRes, ordersRes, subsRes] = await Promise.allSettled([
        fetch(`${window.API_URL}/api/user/profile/${user._id}`),
        fetch(`${window.API_URL}/api/orders/my-orders/${user._id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`${window.API_URL}/api/subscriptions/${user._id}`)
      ]);

      if (userRes.status === 'fulfilled' && userRes.value.ok) {
        const u = await userRes.value.json();
        setProfileData({
          name: u.name || '',
          phone: u.phone || '',
          email: u.email || '',
          address: u.address || ''
        });
      }

      if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
        const o = await ordersRes.value.json();
        setOrders(Array.isArray(o) ? o : []);
      }

      if (subsRes.status === 'fulfilled' && subsRes.value.ok) {
        const s = await subsRes.value.json();
        setSubscriptions(Array.isArray(s) ? s : []);
      }
    } catch (err) {
      console.error('UserProfile fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?._id]);

  useEffect(() => {
    fetchData();

    // B4: Connect to socket and listen for payment events
    if (user?._id) {
      const socket = io(window.API_URL, { transports: ['websocket', 'polling'] });
      socket.emit('join_user_room', user._id);
      socket.on('connect', () => socket.emit('join_user_room', user._id));

      // B4: Payment approved — refresh subscriptions immediately and switch to subscriptions tab
      socket.on('payment_approved', ({ message }) => {
        toast.success(message || '✅ Payment approved! Your subscription is now active.');
        fetchData();
        setActiveTab('subscriptions'); // Auto-switch to subscriptions tab to show updated status
      });
      // B3: Payment rejected — refresh subscriptions to show red banner and switch to subscriptions tab
      socket.on('payment_rejected', ({ message }) => {
        toast.error(message || '❌ Payment rejected. Please re-upload your proof.');
        fetchData();
        setActiveTab('subscriptions'); // Auto-switch to show rejection banner
      });

      return () => socket.disconnect();
    }
  }, [user, fetchData]);

  // B16: Cancel order handler
  const handleCancelOrder = async () => {
    if (!cancelOrderModal || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${window.API_URL}/api/orders/${cancelOrderModal.orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'cancelled', cancellationReason: cancelReason })
      });
      if (res.ok) {
        setOrders(prev => prev.map(o => o._id === cancelOrderModal.orderId ? { ...o, status: 'cancelled' } : o));
        toast.success('Order cancelled successfully.');
        setCancelOrderModal(null);
        setCancelReason('');
      } else {
        const err = await res.json();
        toast.error(err.message || 'Failed to cancel order.');
      }
    } catch (err) {
      toast.error('Network error. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const handleSave = async () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${window.API_URL}/api/users/${user._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileData.name,
          phone: profileData.phone,
          address: profileData.address
        })
      });
      if (res.ok) {
        const data = await res.json();
        const updatedUser = { ...user, ...data.user };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setIsEditing(false);
        toast.success('Profile updated successfully!');
        if (onUserUpdate) onUserUpdate(updatedUser);
      } else {
        const err = await res.json();
        toast.error('Update failed: ' + (err.message || 'Unknown error'));
      }
    } catch (err) {
      toast.error('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------
  // SUBSCRIPTION PAUSE/RESUME
  // -------------------------------------------------------
  const toggleSubscription = async (subId, isPaused) => {
    try {
      const res = await fetch(`${window.API_URL}/api/subscriptions/${subId}/pause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: !isPaused })
      });
      if (res.ok) {
        setSubscriptions(prev =>
          prev.map(s =>
            s._id === subId
              ? { ...s, isPaused: !isPaused, status: !isPaused ? 'paused' : 'active' }
              : s
          )
        );
      }
    } catch (err) {
      console.error('Toggle subscription error:', err);
    }
  };

  const toggleSubscriptionDay = async (subId, day) => {
    try {
      const res = await fetch(`${window.API_URL}/api/subscriptions/${subId}/toggle-day`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day })
      });
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(prev =>
          prev.map(s =>
            s._id === subId
              ? { ...s, pausedDays: data.pausedDays }
              : s
          )
        );
        toast.success(`Schedule updated for ${day}!`);
      } else {
        toast.error("Failed to toggle schedule.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error.");
    }
  };

  const handleReuploadSubmit = async (e, subId) => {
    e.preventDefault();
    if (!reuploadFile) {
      toast.error('Please select a payment screenshot!');
      return;
    }
    setReuploading(true);
    const formData = new FormData();
    formData.append('screenshot', reuploadFile);

    try {
      const res = await fetch(`${window.API_URL}/api/subscriptions/${subId}/reupload-payment`, {
        method: 'PATCH',
        body: formData
      });
      if (res.ok) {
        toast.success("Payment screenshot re-uploaded successfully! Awaiting verification.");
        setReuploadingSubId(null);
        setReuploadFile(null);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.message || "Re-upload failed.");
      }
    } catch (err) {
      toast.error("Network error. Please try again.");
    } finally {
      setReuploading(false);
    }
  };

  // -------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------
  const statusBadge = (status) => {
    const classes = {
      pending: 'bg-yellow-100 text-yellow-700',
      preparing: 'bg-blue-100 text-blue-700',
      accepted: 'bg-indigo-100 text-indigo-700',
      picked_up: 'bg-purple-100 text-purple-700',
      on_the_way: 'bg-orange-100 text-orange-700',
      'out-for-delivery': 'bg-purple-100 text-purple-700',
      delivered: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return classes[status] || 'bg-gray-100 text-gray-600';
  };

  const statusIcon = (status) => {
    if (status === 'delivered') return <CheckCircle size={14} className="text-green-600" />;
    if (status === 'cancelled') return <XCircle size={14} className="text-red-500" />;
    return <Clock size={14} className="text-orange-500" />;
  };

  const isActiveOrder = (status) => !['delivered', 'cancelled'].includes(status);

  const subscriptionSpent = subscriptions
    .filter(s => s.paymentStatus === 'approved')
    .reduce((sum, s) => sum + (s.totalCost || 0), 0);

  const totalSpent = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0) + subscriptionSpent;

  // -------------------------------------------------------
  // TABS CONFIG
  // -------------------------------------------------------
  const TABS = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'orders', label: 'My Orders', icon: Package },
    { id: 'subscriptions', label: 'Subscription Status', icon: Star },
    { id: 'help', label: 'Help & Support', icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7F2] pt-24 pb-20 px-4 md:px-8 font-sans">

      {/* B16: Cancel Order Modal */}
      {cancelOrderModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2 text-red-600">Cancel Order?</h3>
            <p className="text-xs text-gray-500 font-bold mb-4">
              This order will be cancelled and the chef will be notified. Please provide a reason.
            </p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (required)..."
              className="w-full border-2 border-gray-200 rounded-2xl p-3 text-sm font-bold outline-none focus:border-red-400 resize-none h-24 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setCancelOrderModal(null); setCancelReason(''); }}
                className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={!cancelReason.trim() || cancelling}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-red-600 transition-all disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto grid lg:grid-cols-4 gap-8">

        {/* ===== SIDEBAR ===== */}
        <div className="bg-white p-8 rounded-[40px] shadow-sm h-fit">
          {/* Avatar */}
          <div className="w-20 h-20 bg-[#1A2316] rounded-[28px] flex items-center justify-center mb-5 border-4 border-[#FBBF24] shadow-lg">
            <span className="text-3xl font-black text-[#FBBF24]">
              {(profileData.name || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <h1 className="text-xl font-black uppercase italic leading-tight">
            {profileData.name || 'User'}
          </h1>
          <p className="text-xs text-gray-400 font-bold mt-1 break-all">{profileData.email}</p>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-gray-50 p-3 rounded-2xl text-center">
              <p className="text-xl font-black text-[#1A2316]">{orders.length}</p>
              <p className="text-[9px] font-black text-gray-400 uppercase">Orders</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-2xl text-center">
              <p className="text-xl font-black text-[#FBBF24]">
                {subscriptions.filter(s => s.status === 'active').length}
              </p>
              <p className="text-[9px] font-black text-gray-400 uppercase">Plans</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2 mt-6">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full p-4 rounded-2xl flex items-center justify-between font-black uppercase text-[10px] tracking-widest transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#1A2316] text-[#FBBF24]'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <tab.icon size={14} />
                  {tab.label}
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>

          <button
            onClick={() => { onLogout?.(); navigate('/'); }}
            className="w-full p-4 mt-6 text-red-500 font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-red-50 rounded-2xl transition-all"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div className="lg:col-span-3 bg-white p-8 md:p-10 rounded-[40px] shadow-sm">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-[#FBBF24] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-400 font-black uppercase text-[10px] tracking-widest animate-pulse">Loading Profile...</p>
            </div>
          ) : (
            <>
              {/* ===== OVERVIEW TAB ===== */}
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                      My Profile<span className="text-[#FBBF24]">.</span>
                    </h2>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 bg-[#1A2316] text-[#FBBF24] px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-60"
                    >
                      {isEditing
                        ? <><Save size={14} />{saving ? 'Saving...' : 'Save Changes'}</>
                        : <><Edit2 size={14} />Edit Profile</>
                      }
                    </button>
                  </div>

                  {/* Profile Fields */}
                  <div className="grid md:grid-cols-2 gap-5">
                    {[
                      { key: 'name', label: 'Full Name', icon: User, editable: true },
                      { key: 'phone', label: 'Phone Number', icon: Phone, editable: true },
                      { key: 'email', label: 'Email Address', icon: Mail, editable: false },
                      { key: 'address', label: 'Delivery Address', icon: MapPin, editable: true, full: true },
                    ].map(({ key, label, icon: Icon, editable, full }) => (
                      <div key={key} className={`p-6 bg-gray-50 rounded-2xl ${full ? 'md:col-span-2' : ''}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={12} className="text-[#FBBF24]" />
                          <label className="text-[9px] uppercase font-black text-gray-400">{label}</label>
                        </div>
                        {isEditing && editable ? (
                          <input
                            type="text"
                            value={profileData[key] || ''}
                            onChange={(e) => setProfileData({ ...profileData, [key]: e.target.value })}
                            className="w-full bg-transparent font-bold text-sm outline-none border-b-2 border-[#FBBF24] pb-1 transition-all"
                          />
                        ) : (
                          <p className="font-bold text-sm text-[#1A2316]">{profileData[key] || 'Not provided'}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Total Orders', val: orders.length, color: 'text-white' },
                      { label: 'Delivered', val: orders.filter(o => o.status === 'delivered').length, color: 'text-green-400' },
                      { label: 'Total Spent', val: `PKR ${totalSpent.toLocaleString()}`, color: 'text-[#FBBF24]' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-[#1A2316] p-6 rounded-[24px] text-center">
                        <p className={`text-2xl font-black italic ${color}`}>{val}</p>
                        <p className="text-[9px] font-black uppercase text-gray-400 mt-2">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Active orders quick peek */}
                  {orders.filter(o => isActiveOrder(o.status)).length > 0 && (
                    <div className="bg-orange-50 border-2 border-orange-200 p-6 rounded-3xl">
                      <p className="text-[10px] font-black uppercase text-orange-600 mb-3">
                        ⚡ {orders.filter(o => isActiveOrder(o.status)).length} Active Order(s)
                      </p>
                      {orders.filter(o => isActiveOrder(o.status)).slice(0, 2).map(order => (
                        <div key={order._id} className="flex justify-between items-center py-2 border-t border-orange-100">
                          <p className="font-black text-sm">{order.chef?.name || 'Chef'}</p>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${statusBadge(order.status)}`}>
                              {order.status}
                            </span>
                            <button
                              onClick={() => navigate(`/track/${order._id}`)}
                              className="bg-orange-500 text-white px-3 py-1 rounded-xl font-black text-[9px] uppercase"
                            >
                              Track
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Active subscriptions quick peek */}
                  {subscriptions.filter(s => s.status === 'active' || s.status === 'paused' || s.status === 'pending' || s.status === 'payment_failed').length > 0 && (
                    <div className="bg-green-50 border-2 border-green-200 p-6 rounded-3xl mt-4 text-left">
                      <p className="text-[10px] font-black uppercase text-green-600 mb-3">
                        📅 Active & Pending Meal Plans ({subscriptions.filter(s => s.status === 'active' || s.status === 'paused' || s.status === 'pending' || s.status === 'payment_failed').length})
                      </p>
                      {subscriptions.filter(s => s.status === 'active' || s.status === 'paused' || s.status === 'pending' || s.status === 'payment_failed').slice(0, 2).map(sub => (
                        <div key={sub._id} className="flex flex-col md:flex-row justify-between items-start md:items-center py-3 border-t border-green-100 gap-3">
                          <div>
                            <p className="font-black text-sm text-[#1A2316]">{sub.chefId?.name || 'Home Chef'}</p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">
                              {sub.mealType} Meal · {sub.planType} Plan · {sub.deliveredDays || 0} Delivered / {sub.remainingDays} Left
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                              sub.status === 'active' ? 'bg-green-100 text-green-700' :
                              sub.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                              sub.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-600'
                            }`}>
                              {sub.status}
                            </span>
                            <button
                              onClick={() => setActiveTab('subscriptions')}
                              className="bg-[#1A2316] text-[#FBBF24] px-4 py-1.5 rounded-xl font-black text-[9px] uppercase hover:scale-105 transition-all"
                            >
                              Manage
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== ORDERS TAB ===== */}
              {activeTab === 'orders' && (
                <div className="space-y-5">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                      My Orders<span className="text-[#FBBF24]">.</span>
                    </h2>
                    <span className="bg-gray-100 px-4 py-2 rounded-full text-[10px] font-black uppercase">{orders.length} total</span>
                  </div>

                  {orders.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-gray-300">
                      <Package size={56} className="mb-4 opacity-20" />
                      <p className="font-black text-[10px] uppercase tracking-widest">No Orders Yet</p>
                      <p className="text-[9px] text-gray-400 mt-2 font-bold">Your orders will appear here</p>
                      <button
                        onClick={() => navigate('/explore')}
                        className="mt-6 bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
                      >
                        Explore Food
                      </button>
                    </div>
                  ) : (
                    orders.map(order => (
                      <div
                        key={order._id}
                        className="bg-gray-50 hover:bg-gray-100 p-6 rounded-[28px] transition-all cursor-default"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-black text-base text-[#1A2316]">
                              {order.chef?.name || 'Home Chef'}
                            </p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                              {new Date(order.orderDate || order.createdAt).toLocaleDateString('en-PK', {
                                day: 'numeric', month: 'short', year: 'numeric'
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {statusIcon(order.status)}
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${statusBadge(order.status)}`}>
                              {order.status}
                            </span>
                          </div>
                        </div>

                        {/* Items list */}
                        <div className="space-y-1 mb-4">
                          {order.items?.slice(0, 3).map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-gray-600 font-bold">
                                {item.dishId?.name || 'Item'} ({item.portion || 'Full'}) × {item.quantity}
                              </span>
                              <span className="font-black text-[#1A2316]">
                                PKR {(item.price * item.quantity).toLocaleString()}
                              </span>
                            </div>
                          ))}
                          {order.items?.length > 3 && (
                            <p className="text-gray-400 text-xs font-bold">+{order.items.length - 3} more items</p>
                          )}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                          <div>
                            <span className="text-[9px] font-black uppercase text-gray-400">Total Paid</span>
                            <p className="font-black text-[#1A2316] text-lg">PKR {order.totalAmount?.toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2">
                            {isActiveOrder(order.status) ? (
                              <button
                                onClick={() => navigate(`/track/${order._id}`)}
                                className="flex items-center gap-2 bg-[#1A2316] text-[#FBBF24] px-5 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:scale-105 transition-all"
                              >
                                <Truck size={12} /> Live Track
                              </button>
                            ) : (
                              <button
                                onClick={() => navigate(`/track/${order._id}`)}
                                className="flex items-center gap-2 bg-gray-100 text-[#1A2316] px-5 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                              >
                                <Package size={12} /> View Details
                              </button>
                            )}
                            {order.status === 'delivered' && (
                              <button
                                onClick={() => navigate(`/chef/${order.chef?._id}`)}
                                className="flex items-center gap-2 bg-[#FBBF24] text-[#1A2316] px-5 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:scale-105 transition-all"
                              >
                                <Star size={12} /> Review Chef
                              </button>
                            )}
                            {/* B16: Cancel button for pending/accepted orders */}
                            {['pending', 'accepted'].includes(order.status) && (
                              <button
                                onClick={() => setCancelOrderModal({ orderId: order._id })}
                                className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-5 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-100 transition-all"
                              >
                                <XCircle size={12} /> Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ===== SUBSCRIPTIONS TAB ===== */}
              {activeTab === 'subscriptions' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">
                      Subscription Status<span className="text-[#FBBF24]">.</span>
                    </h2>
                    <button
                      onClick={() => navigate('/chefs')}
                      className="bg-[#1A2316] text-[#FBBF24] px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
                    >
                      + Subscribe to Chef
                    </button>
                  </div>

                  {subscriptions.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-gray-300">
                      <Star size={56} className="mb-4 opacity-20" />
                      <p className="font-black text-[10px] uppercase tracking-widest">No Active Meal Plans</p>
                      <p className="text-[9px] text-gray-400 mt-2 font-bold">Subscribe to a chef for daily home-cooked meals</p>
                      <button
                        onClick={() => navigate('/chefs')}
                        className="mt-6 bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
                      >
                        Browse Chefs
                      </button>
                    </div>
                  ) : (
                    subscriptions.map(sub => (
                      <div key={sub._id} className="bg-gray-50 p-7 rounded-[28px] border border-gray-200/50 shadow-sm">

                        {/* Approved Banner */}
                        {sub.paymentStatus === 'approved' && sub.status === 'active' && (
                          <div className="mb-5 bg-green-50 border-2 border-green-300 rounded-2xl p-4 flex items-start gap-3">
                            <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-green-800 font-black text-[10px] uppercase tracking-widest mb-1">
                                ✅ Subscription Active
                              </p>
                              <p className="text-xs text-green-700 font-bold">
                                Admin approved your subscription. Your status is active.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Pending Review Banner */}
                        {sub.paymentStatus === 'pending' && (
                          <div className="mb-5 bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 flex items-start gap-3">
                            <Clock size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-yellow-800 font-black text-[10px] uppercase tracking-widest mb-1">
                                ⏳ Payment Under Review
                              </p>
                              <p className="text-xs text-yellow-700 font-bold">
                                Your subscription payment proof has been submitted and is awaiting admin verification. You will be notified once approved.
                              </p>
                              {sub.paymentScreenshot && (
                                <a
                                  href={`${window.API_URL}${sub.paymentScreenshot}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-flex items-center gap-1 text-[9px] font-black uppercase text-yellow-700 underline hover:text-yellow-850"
                                >
                                  📎 View Submitted Screenshot →
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Rejected Banner */}
                        {(sub.paymentStatus === 'rejected' || sub.status === 'payment_failed') && (
                          <div className="mb-5 bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex items-start gap-3">
                            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="w-full">
                              <p className="text-red-800 font-black text-[10px] uppercase tracking-widest mb-1">
                                ❌ Payment Rejected
                              </p>
                              <p className="text-xs text-red-700 font-bold mb-3">
                                Admin rejected your payment proof. Please re-upload the proof.
                              </p>
                              {reuploadingSubId === sub._id ? (
                                <form onSubmit={(e) => handleReuploadSubmit(e, sub._id)} className="mt-3 space-y-2 text-left bg-white p-4 rounded-xl border border-red-100">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setReuploadFile(e.target.files[0])}
                                    className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-red-50 file:text-red-750 hover:file:bg-red-100 transition-all cursor-pointer"
                                  />
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      type="submit"
                                      disabled={reuploading || !reuploadFile}
                                      className="bg-red-600 text-white text-[9px] font-black uppercase px-4 py-2.5 rounded-xl disabled:opacity-50 hover:bg-red-700 transition-all"
                                    >
                                      {reuploading ? 'Uploading...' : 'Submit Screenshot'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setReuploadingSubId(null); setReuploadFile(null); }}
                                      className="bg-gray-100 text-[#1A2316] text-[9px] font-black uppercase px-4 py-2.5 rounded-xl hover:bg-gray-200 transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <button
                                  onClick={() => setReuploadingSubId(sub._id)}
                                  className="mt-2 bg-red-650 text-white text-[9px] font-black uppercase px-4 py-2.5 rounded-xl hover:bg-red-700 transition-all inline-block"
                                >
                                  Re-upload Proof Now
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between items-start mb-5">
                          <div>
                            <p className="font-black text-lg text-[#1A2316]">
                              {sub.chefId?.name || 'Chef'}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {sub.mealType} Meal · {sub.planType} Plan
                            </p>
                          </div>
                          <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase ${
                            sub.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : sub.status === 'paused'
                              ? 'bg-yellow-100 text-yellow-700'
                              : sub.status === 'pending'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {sub.status}
                          </span>
                        </div>

                        {sub.paymentStatus && (
                          <div className="flex items-center gap-2 mb-4 bg-white p-3 rounded-xl">
                            <span className="text-[9px] font-black uppercase text-gray-400">Payment Status</span>
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                              sub.paymentStatus === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : sub.paymentStatus === 'rejected'
                                ? 'bg-red-100 text-red-600'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {sub.paymentStatus === 'approved' ? 'Verified ✓' : sub.paymentStatus === 'rejected' ? 'Rejected ✗' : 'Pending Verification'}
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                          {[
                            ['Days Included', sub.selectedDays?.join(', ') || 'N/A'],
                            ['Food Delivered', `${sub.deliveredDays || 0} deliveries`],
                            ['Remaining Left', `${sub.remainingDays || 0} deliveries left`],
                            ['Start Date', sub.startDate ? new Date(sub.startDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'],
                            ['End Date', sub.endDate ? new Date(sub.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'],
                            ['Purchase Date', sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'],
                            ['Total Cost', `PKR ${sub.totalCost?.toLocaleString() || 0}`],
                          ].map(([l, v]) => (
                            <div key={l} className={`bg-white p-4 rounded-xl ${l === 'Days Included' ? 'col-span-2' : ''}`}>
                              <p className="text-[9px] font-black uppercase text-gray-400 mb-1">{l}</p>
                              <p className="font-black text-sm text-[#1A2316]">{v}</p>
                            </div>
                          ))}
                        </div>

                        {/* Interactive day pause/resume control */}
                        {sub.status === 'active' && (
                          <div className="bg-white p-5 rounded-2xl mb-5 border border-gray-100 text-left">
                            <p className="text-[9px] font-black uppercase text-gray-400 mb-3">📅 Manage Delivery Schedule (Tap to Pause/Resume Specific Days)</p>
                            <div className="flex flex-wrap gap-2">
                              {sub.selectedDays?.map(day => {
                                const isDayPaused = sub.pausedDays?.includes(day);
                                return (
                                  <button
                                    key={day}
                                    onClick={() => toggleSubscriptionDay(sub._id, day)}
                                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${
                                      isDayPaused
                                        ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                        : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                    }`}
                                    title={isDayPaused ? `Click to Resume ${day} deliveries` : `Click to Pause ${day} deliveries`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isDayPaused ? 'bg-red-500' : 'bg-green-500'}`} />
                                    {day} {isDayPaused ? '(Paused)' : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Progress bar */}
                        {sub.remainingDays > 0 && sub.status === 'active' && (
                          <div className="mb-5">
                            <div className="flex justify-between text-[9px] font-black uppercase text-gray-400 mb-1">
                              <span>Progress</span>
                              <span>{sub.remainingDays} days left</span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#FBBF24] rounded-full transition-all"
                                style={{ width: `${Math.min(100, (sub.remainingDays / (sub.planType === 'weekly' ? 7 : sub.planType === '21days' ? 21 : 30)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Delivery history accordion */}
                        <div className="bg-white p-5 rounded-2xl mb-5 border border-gray-150">
                          <button
                            type="button"
                            onClick={() => setExpandedSubId(expandedSubId === sub._id ? null : sub._id)}
                            className="w-full flex items-center justify-between text-[10px] font-black uppercase text-gray-500 hover:text-gray-800 transition-all"
                          >
                            <span>📦 View Complete Delivery History ({sub.orders?.length || 0})</span>
                            <ChevronRight
                              size={14}
                              className={`transform transition-transform ${expandedSubId === sub._id ? 'rotate-90' : ''}`}
                            />
                          </button>

                          {expandedSubId === sub._id && (
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                              {!sub.orders || sub.orders.length === 0 ? (
                                <p className="text-xs text-gray-400 font-bold py-2 text-left">
                                  No deliveries recorded yet. Deliveries will occur on your selected days.
                                </p>
                              ) : (
                                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                  {sub.orders.map(order => (
                                    <div key={order._id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-left">
                                      <div className="flex justify-between items-start gap-2 mb-2">
                                        <div>
                                          <p className="text-[10px] text-gray-400 font-black">
                                            {new Date(order.orderDate || order.createdAt).toLocaleDateString('en-PK', {
                                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                            })}
                                          </p>
                                          <p className="text-xs font-black text-[#1A2316] mt-0.5">Order ID: ...{order._id.slice(-6)}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                          order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                                          order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                          'bg-blue-100 text-blue-700'
                                        }`}>
                                          {order.status}
                                        </span>
                                      </div>

                                      <div className="text-xs font-bold text-gray-600 mb-2">
                                        {order.items?.map((item, i) => (
                                          <span key={i} className="block">
                                            🍽️ {item.dishId?.name || 'Meal'} ({item.portion || 'Full'}) × {item.quantity}
                                          </span>
                                        ))}
                                      </div>

                                      <div className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-400 pt-2 border-t border-gray-200/60">
                                        <div>
                                          Rider: <span className="text-[#1A2316]">{order.rider?.name || 'Finding Rider...'}</span>
                                        </div>
                                        {order.rider?.phone && (
                                          <div>
                                            Contact: <span className="text-[#1A2316]">{order.rider.phone}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {(sub.status === 'active' || sub.status === 'paused') && (
                          <button
                            onClick={() => toggleSubscription(sub._id, sub.isPaused)}
                            className={`w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                              sub.isPaused
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                            }`}
                          >
                            {sub.isPaused
                              ? <><Play size={12} /> Resume Meal Plan</>
                              : <><Pause size={12} /> Pause Meal Plan</>
                            }
                          </button>
                        )}

                        {sub.status === 'expired' && (
                          <button
                            onClick={() => navigate(`/chef/${sub.chefId?._id}`)}
                            className="w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-[#1A2316] text-[#FBBF24] hover:scale-[1.02] transition-all"
                          >
                            Renew Plan
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ===== HELP TAB ===== */}
              {activeTab === 'help' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-8">
                    Help & Support<span className="text-[#FBBF24]">.</span>
                  </h2>

                  {/* FAQs */}
                  <div className="space-y-3 mb-8">
                    {[
                      {
                        q: 'How do I cancel an order?',
                        a: 'Go to "My Orders" and click "Live Track" on an active order. You can cancel from the tracking page within 5 minutes of placing the order.'
                      },
                      {
                        q: 'How does a meal plan subscription work?',
                        a: 'Subscribe to a chef\'s meal plan and receive home-cooked meals delivered daily on your selected days. You can pause or cancel anytime.'
                      },
                      {
                        q: 'Why is my order taking long?',
                        a: 'Home-cooked meals are prepared fresh, which can take 30–60 minutes. Use "Live Track" to see real-time status updates.'
                      },
                      {
                        q: 'How do I contact the chef?',
                        a: 'Visit the chef\'s profile page — their phone number is listed there. You can also leave special instructions when placing an order.'
                      },
                      {
                        q: 'What payment methods are available?',
                        a: 'Currently we support Cash on Delivery. Online payment options are coming soon.'
                      },
                    ].map((item, i) => (
                      <div key={i} className="bg-gray-50 p-6 rounded-2xl">
                        <div className="flex items-start gap-3">
                          <HelpCircle size={16} className="text-[#FBBF24] mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-black text-sm text-[#1A2316]">{item.q}</p>
                            <p className="text-xs text-gray-500 font-bold mt-2 leading-relaxed">{item.a}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Contact Form */}
                  <div className="bg-[#1A2316] p-8 rounded-[35px] text-white">
                    <div className="flex items-center gap-3 mb-5">
                      <AlertTriangle size={20} className="text-[#FBBF24]" />
                      <h4 className="font-black uppercase text-sm text-[#FBBF24]">Still Need Help?</h4>
                    </div>
                    <p className="text-xs text-gray-400 font-bold mb-5">
                      Describe your issue and our support team will get back to you within 24 hours.
                    </p>
                    <textarea
                      value={helpMessage}
                      onChange={(e) => setHelpMessage(e.target.value)}
                      className="w-full bg-white/10 border border-white/10 p-5 rounded-2xl text-white placeholder-gray-500 outline-none font-bold text-sm h-36 resize-none focus:border-[#FBBF24] transition-all"
                      placeholder="Describe your issue in detail..."
                    />
                    <button
                      disabled={sendingHelp || !helpMessage.trim()}
                      onClick={async () => {
                        setSendingHelp(true);
                        try {
                          const res = await fetch(window.API_URL + '/api/support', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              name: profileData.name || user.name,
                              email: profileData.email || user.email,
                              userId: user._id,
                              subject: 'General Support Inquiry',
                              message: helpMessage
                            })
                          });
                          if (res.ok) {
                            toast.success("Your message has been sent to our support team. We'll respond within 24 hours.");
                            setHelpMessage('');
                          } else {
                            const errData = await res.json();
                            toast.error(errData.message || "Failed to submit support request.");
                          }
                        } catch (err) {
                          toast.error("Network error. Please check your connection.");
                        } finally {
                          setSendingHelp(false);
                        }
                      }}
                      className="mt-4 w-full py-4 bg-[#FBBF24] text-[#1A2316] rounded-2xl font-black uppercase text-[10px] tracking-widest hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingHelp ? 'Sending...' : 'Send to Support Team'}
                    </button>
                  </div>

                  {/* Quick links */}
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Explore Food', action: () => navigate('/explore'), icon: Home },
                      { label: 'Browse Chefs', action: () => navigate('/chefs'), icon: Star },
                    ].map(({ label, action, icon: Icon }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="flex items-center justify-center gap-3 bg-gray-50 hover:bg-gray-100 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                      >
                        <Icon size={16} className="text-[#FBBF24]" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;