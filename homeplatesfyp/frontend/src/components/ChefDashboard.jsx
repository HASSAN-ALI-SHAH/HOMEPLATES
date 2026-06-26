import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Bell, Calculator, ScrollText, LayoutDashboard, Star, TrendingUp, Package, CheckCircle, Clock, LogOut, Info, Plus, Minus, Search, User, Edit3, Trash2, ToggleLeft, ToggleRight, RefreshCw, Wallet, CheckSquare, XSquare, BookOpen, Camera, X, XCircle } from 'lucide-react';
import API from '../api';
import { io } from 'socket.io-client';
import { toast } from '../utils/toast';
import LiveTrackingMap from './LiveTrackingMap';
import { geocodeAddress } from '../utils/geocode';

const ChefDashboard = ({ onLogout, onUserUpdate }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const token = localStorage.getItem('token');
  const chefId = currentUser._id;
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [subTab, setSubTab] = useState('subscribers'); // 'subscribers' or 'plans'
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({
    title: '',
    description: '',
    price: '',
    duration: 'weekly',
    mealType: 'Breakfast',
    menu: [
      { day: 'Monday', items: '' },
      { day: 'Tuesday', items: '' },
      { day: 'Wednesday', items: '' },
      { day: 'Thursday', items: '' },
      { day: 'Friday', items: '' },
      { day: 'Saturday', items: '' },
      { day: 'Sunday', items: '' },
    ]
  });
  const [walletData, setWalletData] = useState({ totalBalance: 0, pendingBalance: 0, withdrawnTotal: 0, transactions: [] });
  const [calc, setCalc] = useState({ ingredients: 0, utilities: 0, packaging: 0, manualAdjustment: 0 });
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const [riderAlert, setRiderAlert] = useState(null);
  const socketRef = useRef(null);

  // ─── Rider live-tracking state ──────────────────────────────────────────────
  const [riderLiveLocation, setRiderLiveLocation] = useState(null); // { lat, lng, orderId }
  const [chefOwnCoords, setChefOwnCoords] = useState(null); // geocoded kitchen

  const [kitchenActive, setKitchenActive] = useState(currentUser.isActive !== false);
  const [subscribersFilter, setSubscribersFilter] = useState('active');
  const [notifications, setNotifications] = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user && user._id) {
        return JSON.parse(localStorage.getItem(`chef_notifications_${user._id}`) || '[]');
      }
    } catch (e) {
      console.error('Error loading notifications from localStorage:', e);
    }
    return [];
  });
  const [showNoti, setShowNoti] = useState(false);

  // B14: Delete dish modal state
  const [deleteDishModal, setDeleteDishModal] = useState(null); // { id, name } or null
  const [deletePlanModal, setDeletePlanModal] = useState(null); // { id, title } or null
  const [rejectOrderModal, setRejectOrderModal] = useState(null); // { orderId } or null
  const [rejectReason, setRejectReason] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('EasyPaisa');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setWithdrawError('');
    setWithdrawSuccess('');

    const amt = Number(withdrawAmount);
    if (!withdrawAmount || isNaN(amt) || amt <= 0) {
      setWithdrawError('Please enter a valid amount.');
      return;
    }
    if (amt < 1000) {
      setWithdrawError('Minimum withdrawal is Rs. 1000.');
      return;
    }
    if (amt > walletData.totalBalance) {
      setWithdrawError('Insufficient balance.');
      return;
    }
    if (!withdrawAccount.trim()) {
      setWithdrawError('Please enter account details.');
      return;
    }

    setWithdrawing(true);
    try {
      const res = await API.post('/api/wallet/withdraw', {
        chefId,
        amount: amt,
        paymentMethod: withdrawMethod,
        accountDetails: withdrawAccount
      }, authH);
      if (res.status === 200 || res.status === 201) {
        setWithdrawSuccess('Withdrawal request submitted successfully!');
        setWithdrawAmount('');
        setWithdrawAccount('');
        fetchAll(); // refresh data
        setTimeout(() => {
          setShowWithdrawModal(false);
          setWithdrawSuccess('');
        }, 2000);
      } else {
        setWithdrawError(res.data?.message || 'Withdrawal request failed.');
      }
    } catch (err) {
      setWithdrawError(err.response?.data?.message || 'Network error. Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  const addNotification = useCallback((title, body, referenceId = null, time = null) => {
    setNotifications(prev => {
      if (referenceId && prev.some(n => n.referenceId === referenceId)) {
        return prev;
      }
      return [
        {
          id: Date.now() + Math.random(),
          title,
          body,
          time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          referenceId
        },
        ...prev.slice(0, 19)
      ];
    });
  }, []);

  const toggleKitchenStatus = async () => {
    try {
      const nextStatus = !kitchenActive;
      const res = await API.put(`/api/users/${chefId}`, { isActive: nextStatus }, authH);
      if (res.data) {
        setKitchenActive(nextStatus);
        const updatedUser = { ...currentUser, isActive: nextStatus };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
        toast.success(`Kitchen status updated: ${nextStatus ? 'Online' : 'Offline'}`);
        if (onUserUpdate) onUserUpdate(updatedUser);
      }
    } catch (err) {
      toast.error("Failed to toggle kitchen status: " + (err.response?.data?.message || err.message));
    }
  };


  const filteredSubscribers = () => {
    return subscriptions.filter(s => {
      if (subscribersFilter === 'active') {
        return s.status === 'active' || s.status === 'paused';
      }
      if (subscribersFilter === 'expired') {
        return s.status === 'expired';
      }
      if (subscribersFilter === 'pending') {
        return s.status === 'pending';
      }
      return true;
    });
  };

  const baseCost = Number(calc.ingredients) + Number(calc.utilities) + Number(calc.packaging);
  const finalPrice = (baseCost * 1.4) + Number(calc.manualAdjustment);

  const fetchAll = useCallback(async () => {
    if (!chefId) return;
    setLoading(true);
    try {
      // FIX: authH is now passed to ALL protected routes
      const [o, m, s, w, p, u, n] = await Promise.allSettled([
        API.get(`/api/chef/${chefId}/orders`, authH),
        API.get('/api/chef/add-dish', authH),
        API.get(`/api/chef/${chefId}/subscriptions`, authH),
        API.get(`/api/chef/${chefId}/wallet`, authH),
        API.get(`/api/subscriptions/plans/chef/${chefId}`),
        API.get(`/api/users/${chefId}`, authH),
        API.get('/api/support/notifications', authH),
      ]);
      if (o.status === 'fulfilled') setOrders(o.value.data);
      if (m.status === 'fulfilled') setMenuItems(m.value.data);
      if (s.status === 'fulfilled') setSubscriptions(s.value.data);
      if (w.status === 'fulfilled') setWalletData(w.value.data);
      if (p.status === 'fulfilled') setSubscriptionPlans(p.value.data);
      if (u.status === 'fulfilled') {
        const userData = u.value.data.user || u.value.data;
        setKitchenActive(userData.isActive !== false);
        const updated = { ...currentUser, ...userData };
        localStorage.setItem('user', JSON.stringify(updated));
        setCurrentUser(updated);
        // Propagate updated user to parent so Navbar reflects changes immediately
        if (onUserUpdate) onUserUpdate(updated);
      }
      if (n.status === 'fulfilled') {
        const dbNotis = n.value.data || [];
        const mapped = dbNotis.map(item => ({
          id: item._id,
          title: item.title || 'Alert',
          body: item.message,
          time: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setNotifications(mapped);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [chefId]);

  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (!planForm.title || !planForm.description || !planForm.price) {
      toast.error("Please fill in all required fields!");
      return;
    }
    try {
      if (editingPlan) {
        const res = await API.put(`/api/subscriptions/plans/${editingPlan._id}`, planForm, authH);
        toast.success(res.data.message || "Plan updated!");
      } else {
        const res = await API.post('/api/subscriptions/plans', { ...planForm, chefId }, authH);
        toast.success(res.data.message || "Plan created!");
      }
      setShowPlanModal(false);
      setEditingPlan(null);
      setPlanForm({
        title: '',
        description: '',
        price: '',
        duration: 'weekly',
        mealType: 'Breakfast',
        menu: [
          { day: 'Monday', items: '' },
          { day: 'Tuesday', items: '' },
          { day: 'Wednesday', items: '' },
          { day: 'Thursday', items: '' },
          { day: 'Friday', items: '' },
          { day: 'Saturday', items: '' },
          { day: 'Sunday', items: '' },
        ]
      });
      fetchAll();
    } catch (e) {
      toast.error("Error: " + (e.response?.data?.message || e.message));
    }
  };

  const handleDeletePlan = async (planId) => {
    setDeletePlanModal(null);
    try {
      const res = await API.delete(`/api/subscriptions/plans/${planId}`, authH);
      toast.success(res.data?.message || "Plan deleted!");
      fetchAll();
    } catch (e) {
      toast.error("Delete failed: " + (e.response?.data?.message || e.response?.data?.error || e.message));
    }
  };

  const handleResubmitVerification = async () => {
    try {
      const res = await API.post('/api/chef/resubmit-verification', {}, authH);
      toast.success(res.data?.message || 'Verification request resubmitted!');
      const updatedUser = { ...currentUser, verificationStatus: 'pending' };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      if (onUserUpdate) onUserUpdate(updatedUser);
      fetchAll();
    } catch (err) {
      toast.error('Resubmit failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const openEditPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      title: plan.title,
      description: plan.description,
      price: plan.price,
      duration: plan.duration,
      mealType: plan.mealType,
      menu: plan.menu && plan.menu.length > 0 ? plan.menu : [
        { day: 'Monday', items: '' },
        { day: 'Tuesday', items: '' },
        { day: 'Wednesday', items: '' },
        { day: 'Thursday', items: '' },
        { day: 'Friday', items: '' },
        { day: 'Saturday', items: '' },
        { day: 'Sunday', items: '' },
      ]
    });
    setShowPlanModal(true);
  };


  // FIX: Connect to socket and join chef room for real-time order notifications
  useEffect(() => {
    if (!chefId) return;
    fetchAll();

    const socket = io(window.API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    // Join room immediately (buffered until connection is ready)
    socket.emit('join_chef_room', chefId);

    socket.on('connect', () => {
      socket.emit('join_chef_room', chefId);
    });

    socket.on('new_order_notification', ({ status, message, orderId }) => {
      // Always refresh orders
      fetchAll();
      // Show appropriate alerts based on status
      if (!status || status === 'pending') {
        setNewOrderAlert(true); // New incoming order
        addNotification('🍽️ New Order Received', message || 'A new customer has placed an order.', `order_pending_${orderId}`);
      } else if (status === 'rider_accepted') {
        setRiderAlert('🚴 A rider has accepted your order and is heading to your kitchen! Head to your kitchen.');
        setTimeout(() => setRiderAlert(null), 10000);
        addNotification('🚴 Rider Accepted Order', message || 'A rider is heading to your kitchen.', `order_rider_accepted_${orderId}`);
      } else if (status === 'rider_rejected') {
        setRiderAlert('⚠️ The rider rejected your order. We are finding another rider...');
        setTimeout(() => setRiderAlert(null), 8000);
        addNotification('⚠️ Rider Rejected', 'We are re-assigning another rider for your order.', `order_rider_rejected_${orderId}`);
      } else if (status === 'picked-up' || status === 'picked_up') {
        setRiderAlert('📦 Rider has picked up the food and is on the way to the customer!');
        setTimeout(() => setRiderAlert(null), 8000);
        addNotification('📦 Order Picked Up', 'Rider has picked up the food.', `order_picked_up_${orderId}`);
      } else if (status === 'delivered') {
        addNotification('✅ Order Delivered', message || 'Your order was delivered successfully. Payment added to wallet.', `order_delivered_${orderId}`);
        setRiderAlert('✅ Order successfully delivered to the customer! Payment has been added to your wallet.');
        setTimeout(() => setRiderAlert(null), 10000);
        fetchAll(); // refresh wallet balance
        // B12: Rider cancelled
      } else if (status === 'rider_cancelled') {
        setRiderAlert('⚠️ Rider cancelled this order. Please check Orders tab to re-assign.');
        setTimeout(() => setRiderAlert(null), 12000);
        addNotification('⚠️ Rider Cancelled', message || 'Rider cancelled order. Action needed.', `order_rider_cancelled_${orderId}`);
        fetchAll();
        // B10: Delivery failed — chef action required
      } else if (status === 'delivery-failed') {
        setRiderAlert('❌ Delivery failed! Go to Orders tab to re-assign a rider or cancel the order.');
        setTimeout(() => setRiderAlert(null), 15000);
        addNotification('❌ Delivery Failed', message || 'Delivery failed. Action required.', `order_delivery_failed_${orderId}`);
        fetchAll();
      } else if (status === 'subscription_approved') {
        addNotification('💰 New Subscriber', message || 'A subscriber payment was confirmed.', `subscription_approved_${Date.now()}`);
        fetchAll();
      } else if (status === 'paused') {
        addNotification('🚫 Subscription Paused', message || 'A subscriber paused their subscription.', `subscription_paused_${Date.now()}`);
        fetchAll();
      } else if (status === 'active') {
        addNotification('✅ Subscription Resumed', message || 'A subscriber resumed their subscription.', `subscription_resumed_${Date.now()}`);
        fetchAll();
      } else if (status === 'cancelled') {
        addNotification('🚫 Order Cancelled', message || 'An order was cancelled.', `order_cancelled_${orderId}`);
        fetchAll();
      }
    });

    // B5/B6: Handle withdrawal approval/rejection updates from admin
    socket.on('withdrawal_update', ({ action, amount, newBalance, message }) => {
      if (action === 'approved') {
        toast.success(`✅ Withdrawal of PKR ${amount} approved!`);
        addNotification('✅ Withdrawal Approved', message || `PKR ${amount} withdrawal has been processed.`, `withdrawal_approved_${Date.now()}`);
      } else if (action === 'rejected') {
        toast.error(`❌ Withdrawal of PKR ${amount} was rejected. Amount refunded.`);
        addNotification('❌ Withdrawal Rejected', message || `PKR ${amount} refunded to your wallet.`, `withdrawal_rejected_${Date.now()}`);
      }
      // B6: Update wallet balance immediately without requiring re-login
      if (typeof newBalance === 'number') {
        setWalletData(prev => ({ ...prev, totalBalance: newBalance }));
      }
      // Clear any stale withdraw form errors so chef can re-submit immediately
      setWithdrawError('');
      setWithdrawSuccess('');
      fetchAll(); // also fetch fresh transactions list
    });

    // ── Admin approval / rejection in-app notification ──
    socket.on('account_status_update', ({ status, message }) => {
      if (status === 'approved') {
        addNotification('✅ Account Approved!', message || 'Your chef account has been approved by admin.', `account_status_approved_${Date.now()}`);
        toast.success(message || 'Your chef account is now approved! You can go online.');
      } else if (status === 'rejected') {
        addNotification('❌ Application Rejected', message || 'Your chef application was rejected. Please re-upload documents.', `account_status_rejected_${Date.now()}`);
        toast.error(message || 'Your chef application was rejected. Check your dashboard.');
      }
      fetchAll(); // refresh isVerified state in UI
    });

    // Rider live location — forwarded from socket.js rider_location_update
    socket.on('rider_location_update', ({ lat, lng, orderId }) => {
      setRiderLiveLocation({ lat, lng, orderId });
    });

    return () => {
      socket.disconnect();
    };
  }, [chefId, fetchAll, addNotification]);

  // ─── Persist notifications to localStorage ───
  useEffect(() => {
    if (chefId) {
      localStorage.setItem(`chef_notifications_${chefId}`, JSON.stringify(notifications));
    }
  }, [notifications, chefId]);

  // ─── Synchronize initial and fetched active orders to notifications ───
  useEffect(() => {
    if (!orders || orders.length === 0) return;
    orders.forEach(order => {
      const formattedTime = new Date(order.orderDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (order.status === 'pending') {
        const refId = `order_pending_${order._id}`;
        addNotification(
          '🍽️ New Order Received',
          `New order from ${order.user?.name || 'Customer'} (PKR ${order.totalAmount}).`,
          refId,
          formattedTime
        );
      } else if (order.status === 'delivery-failed') {
        const refId = `order_delivery_failed_${order._id}`;
        addNotification(
          '❌ Delivery Failed',
          `Delivery failed for ${order.user?.name || 'Customer'}'s order. Action required.`,
          refId,
          formattedTime
        );
      } else if (order.status === 'rider_cancelled') {
        const refId = `order_rider_cancelled_${order._id}`;
        addNotification(
          '⚠️ Rider Cancelled',
          `Rider cancelled for ${order.user?.name || 'Customer'}'s order. Action needed.`,
          refId,
          formattedTime
        );
      }
    });
  }, [orders, addNotification]);

  // ─── Resolve chef's kitchen coordinates (use stored GPS first, geocode as fallback) ──
  useEffect(() => {
    if (currentUser?.location?.lat && currentUser?.location?.lng) {
      // Chef has set their kitchen GPS — use it directly, no network call
      setChefOwnCoords(currentUser.location);
    } else {
      // Fallback: geocode text address
      const addr = currentUser?.address || currentUser?.city;
      if (!addr) return;
      geocodeAddress(addr).then(coords => {
        if (coords) setChefOwnCoords(coords);
      });
    }
  }, [currentUser?._id]);

  const updateStatus = async (orderId, status, reason = '') => {
    try {
      await API.patch(`/api/orders/${orderId}/status`, { status, cancellationReason: reason }, authH);
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status } : o));
      toast.success(`Order status updated to ${status}`);
    } catch (e) { toast.error('Error: ' + (e.response?.data?.message || e.message)); }
  };

  const toggleDish = async (dishId, cur) => {
    try {
      await API.patch(`/api/chef/dish/${dishId}/toggle`, { isAvailable: !cur }, authH);
      setMenuItems(prev => prev.map(d => d._id === dishId ? { ...d, isAvailable: !cur } : d));
      toast.success(`Dish availability toggled!`);
    } catch (e) { toast.error('Toggle failed'); }
  };

  const deleteDish = async (dishId) => {
    // B14: Use modal state instead of window.confirm
    setDeleteDishModal(null);
    try {
      await API.delete(`/api/chef/dish/${dishId}`, authH);
      setMenuItems(prev => prev.filter(d => d._id !== dishId));
      toast.success('Dish deleted successfully!');
    } catch (e) {
      toast.error('Delete failed: ' + (e.response?.data?.message || e.response?.data?.error || e.message));
    }
  };

  const handleClearNotifications = async () => {
    try {
      await API.delete('/api/support/notifications', authH);
      setNotifications([]);
      toast.success("Notifications cleared");
    } catch (e) {
      console.error("Failed to clear notifications", e);
      toast.error("Failed to clear notifications");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (onLogout) onLogout();
    navigate('/login');
  };

  const lockedEarnings = subscriptions
    .filter(s => s.paymentStatus === 'approved' && s.payoutStatus !== 'paid')
    .reduce((sum, s) => sum + Math.round((s.totalCost || 0) * 0.9), 0);

  const pending = orders.filter(o => o.status === 'pending').length;
  const delivered = orders.filter(o => o.status === 'delivered').length;
  const badge = (s) => ({ pending: 'bg-yellow-100 text-yellow-700', accepted: 'bg-orange-100 text-orange-700', preparing: 'bg-blue-100 text-blue-700', 'ready-for-pickup': 'bg-indigo-100 text-indigo-700', 'picked-up': 'bg-teal-100 text-teal-700', 'out-for-delivery': 'bg-purple-100 text-purple-700', delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700', 'delivery-failed': 'bg-red-200 text-red-800', 'rider_cancelled': 'bg-orange-100 text-orange-700' }[s] || 'bg-gray-100 text-gray-600');

  return (
    <div className="min-h-screen bg-[#F4F7F2] flex flex-col md:flex-row font-sans text-[#1A2316]">

      {/* B14: Delete Dish Confirm Modal */}
      {deleteDishModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2 text-red-600">Delete Dish?</h3>
            <p className="text-sm text-gray-600 font-bold mb-2">
              Are you sure you want to delete <span className="text-[#1A2316] font-black">"{deleteDishModal.name}"</span>?
            </p>
            <p className="text-xs text-gray-400 font-bold mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteDishModal(null)} className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all">
                Cancel
              </button>
              <button
                onClick={() => deleteDish(deleteDishModal.id)}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-red-600 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subscription Plan Modal */}
      {deletePlanModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2 text-red-600">Delete Plan?</h3>
            <p className="text-sm text-gray-600 font-bold mb-2">
              Are you sure you want to delete the subscription plan <span className="text-[#1A2316] font-black">"{deletePlanModal.title}"</span>?
            </p>
            <p className="text-xs text-gray-400 font-bold mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletePlanModal(null)} className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all">
                Cancel
              </button>
              <button
                onClick={() => handleDeletePlan(deletePlanModal.id)}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-red-600 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {rejectOrderModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2 text-red-600 font-sans">Reject Order?</h3>
            <p className="text-xs text-gray-500 font-bold mb-4 font-sans">
              Please enter a reason for rejecting this order.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)..."
              className="w-full border-2 border-gray-200 rounded-2xl p-3 text-sm font-bold outline-none focus:border-red-400 resize-none h-24 mb-4 font-sans"
            />
            <div className="flex gap-3 font-sans">
              <button
                onClick={() => { setRejectOrderModal(null); setRejectReason(''); }}
                className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateStatus(rejectOrderModal.orderId, 'cancelled', rejectReason || 'Chef rejected');
                  setRejectOrderModal(null);
                  setRejectReason('');
                }}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-red-600 transition-all"
              >
                Reject Order
              </button>
            </div>
          </div>
        </div>
      )}
      <aside className="w-full md:w-72 bg-[#1A2316] text-white p-6 flex flex-col md:sticky md:top-0 md:h-screen shadow-2xl z-50">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="bg-[#FBBF24] p-2.5 rounded-xl text-[#1A2316]"><ChefHat size={24} /></div>
          <h1 className="text-xl font-black tracking-tighter uppercase text-[#FBBF24]">HomePlates</h1>
        </div>
        <nav className="flex-1 space-y-1">
          {[['overview', 'Dashboard', LayoutDashboard], ['orders', 'Orders', Clock], ['menu', 'My Menu', ScrollText], ['recipes', 'Recipes', BookOpen], ['subscriptions', 'Subscriptions', Package], ['wallet', 'Wallet', Wallet], ['calculator', 'Profit Engine', Calculator], ['profile', 'Profile', User]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === id ? 'bg-[#FBBF24] text-[#1A2316]' : 'text-gray-400 hover:bg-white/5'}`}>
              <Icon size={18} /> {label}
              {id === 'orders' && pending > 0 && <span className="ml-auto bg-red-500 text-white text-[8px] w-5 h-5 rounded-full flex items-center justify-center">{pending}</span>}
            </button>
          ))}
          <div className="pt-4 mt-4 border-t border-white/10">
            <button onClick={() => navigate('/explore')} className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-[#FBBF24] border border-[#FBBF24]/20 hover:bg-[#FBBF24]/10 transition-all">
              <Search size={18} /> Explore
            </button>
          </div>
        </nav>
        <button onClick={handleLogout} className="mt-auto flex items-center gap-4 px-5 py-4 text-red-400 font-black uppercase text-[10px] tracking-widest hover:bg-red-500/10 rounded-2xl transition-all"><LogOut size={18} /> Logout</button>
      </aside>

      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {newOrderAlert && (
          <div className="mb-6 bg-orange-500 text-white px-6 py-4 rounded-2xl flex items-center justify-between shadow-lg animate-bounce">
            <div className="flex items-center gap-3">
              <Bell size={20} className="flex-shrink-0" />
              <span className="font-black text-sm uppercase">🍽️ New order received! Check your orders tab.</span>
            </div>
            <button onClick={() => { setNewOrderAlert(false); setActiveTab('orders'); }} className="bg-white text-orange-500 px-4 py-1.5 rounded-xl font-black text-[10px] uppercase">View</button>
          </div>
        )}
        {riderAlert && (
          <div className="mb-6 bg-blue-600 text-white px-6 py-4 rounded-2xl flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-lg">🚴</span>
              <span className="font-black text-sm">{riderAlert}</span>
            </div>
            <button onClick={() => setRiderAlert(null)} className="bg-white/20 px-3 py-1 rounded-xl font-black text-[10px] uppercase">✕</button>
          </div>
        )}
        <header className="flex justify-between items-center mb-10">
          <h2 className="text-3xl font-black italic uppercase">{activeTab}</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
              <span className={`text-[10px] font-black uppercase ${kitchenActive ? 'text-green-600' : 'text-red-500'}`}>
                Kitchen: {kitchenActive ? 'Online' : 'Offline'}
              </span>
              <button
                onClick={toggleKitchenStatus}
                className="transition-all flex items-center"
                title={kitchenActive ? "Go Offline" : "Go Online"}
              >
                {kitchenActive ? (
                  <ToggleRight size={28} className="text-green-500 cursor-pointer" />
                ) : (
                  <ToggleLeft size={28} className="text-gray-400 cursor-pointer" />
                )}
              </button>
            </div>
            <button onClick={fetchAll} className="p-2.5 bg-white rounded-2xl shadow-sm border border-gray-100" title="Refresh"><RefreshCw size={18} className="text-gray-400" /></button>

            {/* Notifications Bell */}
            <div className="relative">
              <button onClick={() => setShowNoti(!showNoti)} className="relative p-2.5 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center">
                <Bell size={22} className={notifications.length > 0 ? 'text-[#1A2316]' : 'text-gray-300'} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>

              {showNoti && (
                <div className="absolute right-0 mt-4 w-80 bg-white rounded-[28px] shadow-2xl border border-gray-100 overflow-hidden z-[100]">
                  <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-[#1A2316]">
                    <h5 className="text-white font-black uppercase text-[10px] tracking-widest">Alerts ({notifications.length})</h5>
                    <button onClick={handleClearNotifications} className="text-[#FBBF24] text-[8px] font-black uppercase underline">Clear All</button>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-50">
                    {notifications.length > 0 ? notifications.map(n => (
                      <div key={n.id} className="p-5 hover:bg-gray-50 transition-all text-left">
                        <div className="flex justify-between mb-1">
                          <span className="text-[10px] font-black uppercase italic text-[#1A2316]">{n.title}</span>
                          <span className="text-[8px] font-bold text-gray-400">{n.time}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium">{n.body}</p>
                      </div>
                    )) : (
                      <div className="p-10 text-center text-gray-300 font-black uppercase text-[10px]">No alerts yet</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 bg-white p-2 pr-5 rounded-full shadow-sm border border-gray-100">
              <div className="w-9 h-9 bg-[#1A2316] rounded-full flex items-center justify-center font-black text-[#FBBF24]">{(currentUser.name || 'C').charAt(0)}</div>
              <p className="text-[10px] font-black uppercase">{currentUser.name}</p>
            </div>
          </div>
        </header>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {!currentUser.isVerified && (
              currentUser.verificationStatus === 'rejected' ? (
                <div className="bg-red-50 border-2 border-red-200 p-6 rounded-[30px] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <XCircle size={24} className="text-red-500 flex-shrink-0" />
                    <div>
                      <p className="font-black uppercase text-red-700 text-sm tracking-wide">Verification Rejected</p>
                      <p className="text-red-600 text-xs font-bold mt-0.5">
                        Your account application has been rejected by Admin. Please update your profile/documents if needed and resubmit.
                      </p>
                      {currentUser.rejectionReason && (
                        <p className="text-red-800 text-xs font-black mt-2 bg-red-100/50 px-3 py-1.5 rounded-xl border border-red-200/40 w-fit uppercase tracking-wide">
                          Reason: {currentUser.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleResubmitVerification}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all flex-shrink-0"
                  >
                    Resubmit Verification Request
                  </button>
                </div>
              ) : (
                <div className="bg-yellow-50 border-2 border-yellow-200 p-5 rounded-3xl flex items-center gap-3">
                  <Info size={20} className="text-yellow-500 flex-shrink-0" />
                  <p className="text-sm font-bold text-yellow-700">Account <strong>pending admin verification</strong>. You can add dishes now — customers can see your menu after approval.</p>
                </div>
              )
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
              {[
                ['Wallet', `PKR ${(walletData.totalBalance || 0).toLocaleString()}`, TrendingUp, 'text-green-500'],
                ['Locked Sub Earnings', `PKR ${lockedEarnings.toLocaleString()}`, Wallet, 'text-purple-500'],
                ['Pending', pending, Clock, 'text-orange-500'],
                ['Rating', (currentUser.rating || 0).toFixed(1), Star, 'text-yellow-500'],
                ['Delivered', delivered, CheckCircle, 'text-blue-500']
              ].map(([l, v, Icon, c], i) => (
                <div key={i} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100"><Icon size={22} className={`${c} mb-3`} /><p className="text-gray-400 font-black text-[9px] uppercase">{l}</p><h3 className="text-2xl font-black">{v}</h3></div>
              ))}
            </div>
            {pending > 0 && (
              <div className="bg-white p-8 rounded-[30px] shadow-sm border-l-4 border-orange-400">
                <h4 className="font-black uppercase text-sm mb-4 text-orange-500">⚡ {pending} Pending Order{pending > 1 ? 's' : ''}</h4>
                {orders.filter(o => o.status === 'pending').slice(0, 3).map(o => (
                  <div key={o._id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                    <div><p className="font-black">{o.user?.name || 'Customer'}</p><p className="text-xs text-gray-400">{o.items?.length} items · PKR {o.totalAmount}</p></div>
                    <div className="flex gap-2">
                      <button onClick={() => updateStatus(o._id, 'accepted')} className="bg-green-500 text-white px-4 py-2 rounded-xl text-[10px] font-black">Accept</button>
                      <button onClick={() => setRejectOrderModal({ orderId: o._id })} className="bg-red-100 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* ── Rider Live Tracker (shown when a rider is en-route) ──────────── */}
            {riderLiveLocation && (() => {
              const trackedOrder = orders.find(o => o._id === riderLiveLocation.orderId);
              const isEnRoute = trackedOrder && ['ready-for-pickup', 'picked-up', 'out-for-delivery'].includes(trackedOrder.status);
              if (!isEnRoute) return null;
              return (
                <div className="bg-white p-6 rounded-[30px] border-l-4 border-[#FBBF24] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase text-[#FBBF24] tracking-widest">Live Rider Tracker</p>
                      <h4 className="font-black text-[#1A2316] text-base uppercase italic">
                        🏍️ {trackedOrder.rider?.name || 'Rider'} is on the move
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[9px] font-black text-emerald-600 uppercase">Live</span>
                    </div>
                  </div>
                  <LiveTrackingMap
                    riderLocation={riderLiveLocation}
                    chefLocation={chefOwnCoords}
                    customerLocation={null}
                    height="280px"
                    followRider={true}
                    showPolyline={true}
                  />
                  <p className="text-[9px] text-gray-400 font-bold uppercase text-center">
                    📡 Rider’s GPS is being shared in real-time via HomePlates Fleet
                  </p>
                </div>
              );
            })()}

            {loading ? <div className="text-center py-20 text-gray-400 font-black uppercase animate-pulse">Loading...</div>
              : orders.length === 0 ? <div className="bg-white p-16 rounded-[40px] flex flex-col items-center text-gray-300"><Clock size={40} className="mb-4 opacity-20" /><p className="font-black text-[10px] uppercase">No Orders Yet</p></div>
                : orders.map(o => (
                  <div key={o._id} className="bg-white p-7 rounded-[30px] shadow-sm border border-gray-100">
                    <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                      <div><p className="font-black text-lg">{o.user?.name || 'Customer'}</p><p className="text-xs text-gray-400">{o.user?.phone} · {o.deliveryAddress || 'No address'}</p><p className="text-xs text-gray-400">{new Date(o.orderDate).toLocaleString()}</p></div>
                      <div className="text-right"><span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${badge(o.status)}`}>{o.status}</span><p className="font-black text-xl mt-2">PKR {o.totalAmount}</p></div>
                    </div>
                    {o.isSubscriptionOrder && (
                      <div className="mb-2 bg-[#FBBF24]/10 text-[#1A2316] px-4 py-2.5 rounded-xl border border-[#FBBF24]/20 text-xs font-black uppercase tracking-wider flex items-center gap-2 w-fit">
                        📅 Daily Subscription Meal Ticket
                      </div>
                    )}
                    <div className="border-t border-gray-50 pt-3 mb-4 space-y-1">
                      {o.isSubscriptionOrder ? (
                        <p className="text-xs text-gray-500 font-bold">Please check subscription details to prepare the custom meal plan for today.</p>
                      ) : (
                        o.items?.map((item, i) => <div key={i} className="flex justify-between text-sm"><span className="text-gray-600 font-bold">{item.dishId?.name || 'Item'} ({item.portion || 'Full'}) × {item.quantity}</span><span className="font-black">PKR {item.price * item.quantity}</span></div>)
                      )}
                    </div>
                    {o.status === 'pending' && (
                      <div className="flex gap-3">
                        <button onClick={() => updateStatus(o._id, 'accepted')} className="flex-1 bg-green-500 text-white py-3 rounded-2xl font-black text-[10px] flex items-center justify-center gap-2">
                          <CheckSquare size={14} />Accept Order
                        </button>
                        <button onClick={() => setRejectOrderModal({ orderId: o._id })} className="flex-1 bg-red-50 text-red-600 py-3 rounded-2xl font-black text-[10px] flex items-center justify-center gap-2">
                          <XSquare size={14} />Reject
                        </button>
                      </div>
                    )}
                    {o.status === 'accepted' && (
                      <button onClick={() => updateStatus(o._id, 'preparing')} className="w-full bg-blue-500 text-white py-3 rounded-2xl font-black text-[10px] flex items-center justify-center gap-2">
                        🍳 Start Preparing Food
                      </button>
                    )}
                    {o.status === 'preparing' && (
                      <button onClick={() => updateStatus(o._id, 'ready-for-pickup')} className="w-full bg-[#FBBF24] text-[#1A2316] py-3 rounded-2xl font-black text-[10px] flex items-center justify-center gap-2 hover:scale-[1.01] transition-all">
                        📦 Request Rider for Pickup {o.isSubscriptionOrder ? '(Subscription)' : ''}
                      </button>
                    )}
                    {/* B10: Delivery Failed — Action Required */}
                    {o.status === 'delivery-failed' && (
                      <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-3">
                        <p className="text-red-700 font-black text-[10px] uppercase tracking-widest">⚠️ Delivery Failed — Action Required</p>
                        <p className="text-xs text-red-600 font-bold">
                          {o.failureReason ? `Reason: ${o.failureReason}` : 'Rider could not complete this delivery.'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem('token');
                                await fetch(`${window.API_URL}/api/orders/${o._id}/resolve-failure`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ action: 'reassign' })
                                });
                                toast.success('Order re-broadcast to available riders!');
                                fetchAll();
                              } catch (e) { toast.error('Error re-assigning'); }
                            }}
                            className="flex-1 py-2.5 bg-[#FBBF24] text-[#1A2316] rounded-xl font-black text-[9px] uppercase hover:opacity-90 transition-all"
                          >
                            🔄 Re-assign Rider
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem('token');
                                await fetch(`${window.API_URL}/api/orders/${o._id}/resolve-failure`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ action: 'cancel', cancellationReason: 'Cancelled after delivery failure.' })
                                });
                                toast.success('Order cancelled.');
                                fetchAll();
                              } catch (e) { toast.error('Error cancelling order'); }
                            }}
                            className="flex-1 py-2.5 bg-red-100 text-red-700 rounded-xl font-black text-[9px] uppercase hover:bg-red-200 transition-all"
                          >
                            ✕ Cancel Order
                          </button>
                        </div>
                      </div>
                    )}

                    {/* B12/B1: Rider Cancelled — Action Required */}
                    {o.status === 'rider_cancelled' && (
                      <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4 space-y-3">
                        <p className="text-orange-700 font-black text-[10px] uppercase tracking-widest">⚠️ Rider Cancelled After Pickup — Re-assign Needed</p>
                        <p className="text-xs text-orange-600 font-bold">The assigned rider cancelled this order. A penalty has been applied to the rider. Please re-assign to a new available rider or cancel the order.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem('token');
                                const res = await fetch(`${window.API_URL}/api/orders/${o._id}/reassign-after-cancel`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
                                });
                                if (res.ok) {
                                  toast.success('✅ Order re-broadcast! Available riders have been notified.');
                                  fetchAll();
                                } else {
                                  const err = await res.json();
                                  toast.error(err.message || 'Re-broadcast failed');
                                }
                              } catch (e) { toast.error('Error re-assigning order'); }
                            }}
                            className="flex-1 py-2.5 bg-[#FBBF24] text-[#1A2316] rounded-xl font-black text-[9px] uppercase hover:opacity-90 transition-all"
                          >
                            🔄 Find New Rider
                          </button>
                          <button
                            onClick={() => updateStatus(o._id, 'cancelled', 'Cancelled after rider refused to deliver.')}
                            className="flex-1 py-2.5 bg-red-100 text-red-700 rounded-xl font-black text-[9px] uppercase hover:bg-red-200 transition-all"
                          >
                            ✕ Cancel Order
                          </button>
                        </div>
                      </div>
                    )}

                    {/* B11: Stuck in ready-for-pickup (no rider assigned) — Re-broadcast */}
                    {o.status === 'ready-for-pickup' && !o.rider && (
                      <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 px-4 py-3 rounded-2xl">
                        <span className="text-indigo-600 font-black text-[10px] uppercase">⏳ Awaiting Rider — No rider found yet</span>
                        <button
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token');
                              await fetch(`${window.API_URL}/api/orders/${o._id}/rebroadcast`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
                              });
                              toast.success('Re-broadcast sent to available riders!');
                            } catch (e) { toast.error('Re-broadcast failed'); }
                          }}
                          className="text-[9px] font-black uppercase bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all ml-3"
                        >
                          📡 Re-broadcast
                        </button>
                      </div>
                    )}
                    {o.status === 'ready-for-pickup' && o.rider && (
                      <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 px-4 py-3 rounded-2xl">
                        <span className="text-indigo-600 font-black text-[10px] uppercase">🚴 Rider {o.rider.name} is heading to your kitchen</span>
                      </div>
                    )}
                    {o.status === 'picked-up' && (
                      <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 px-4 py-3 rounded-2xl">
                        <span className="text-teal-600 font-black text-[10px] uppercase">📦 Handed over to Rider</span>
                      </div>
                    )}
                    {o.status === 'out-for-delivery' && (
                      <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 px-4 py-3 rounded-2xl">
                        <span className="text-purple-600 font-black text-[10px] uppercase">🚴 Out for Delivery</span>
                      </div>
                    )}
                    {o.status === 'delivered' && (
                      <div className="flex items-center gap-3 bg-green-50 border border-green-200 px-4 py-3 rounded-2xl">
                        <span className="text-green-600 font-black text-[10px] uppercase">✅ Delivered by Rider</span>
                      </div>
                    )}
                  </div>
                ))}
          </div>
        )}

        {/* MENU */}
        {activeTab === 'menu' && (
          <div className="space-y-5">
            <div className="flex justify-end"><button onClick={() => navigate('/chef/add-dish')} className="bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center gap-2 hover:scale-105 transition-all"><Plus size={18} />Add New Dish</button></div>
            {loading ? <div className="text-center py-20 text-gray-400 font-black uppercase animate-pulse">Loading Menu...</div>
              : menuItems.length === 0 ? <button onClick={() => navigate('/chef/add-dish')} className="w-full border-4 border-dashed border-gray-200 p-16 rounded-[40px] flex flex-col items-center text-gray-300 hover:text-[#FBBF24] hover:border-[#FBBF24] transition-all"><Plus size={40} /><span className="font-black text-[10px] mt-4 uppercase">Add Your First Dish</span></button>
                : <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {menuItems.map(d => (
                    <div key={d._id} className={`bg-white rounded-[30px] overflow-hidden shadow-sm border-2 ${d.isAvailable ? 'border-gray-100' : 'border-red-100 opacity-70'}`}>
                      <div className="h-44 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                        {d.img ? <img src={`${window.API_URL}${d.img}`} alt={d.name} className="w-full h-full object-cover" /> : <ChefHat size={40} className="text-gray-200" />}
                        <span className={`absolute top-3 right-3 px-3 py-1 rounded-full text-[9px] font-black uppercase ${d.isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{d.isAvailable ? 'Live' : 'Hidden'}</span>
                      </div>
                      <div className="p-5">
                        <div className="flex justify-between items-start mb-1"><div><h4 className="font-black">{d.name}</h4><p className="text-[10px] text-gray-400 uppercase">{d.category}</p></div><p className="font-black text-lg">PKR {d.price}</p></div>
                        {d.description && <p className="text-xs text-gray-500 mt-2 mb-3 line-clamp-2">{d.description}</p>}
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => toggleDish(d._id, d.isAvailable)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-50 rounded-xl text-[9px] font-black uppercase hover:bg-gray-100 transition-all">
                            {d.isAvailable ? <ToggleRight size={12} className="text-green-500" /> : <ToggleLeft size={12} className="text-red-500" />}{d.isAvailable ? 'Hide' : 'Show'}
                          </button>
                          <button onClick={() => navigate(`/chef/edit-dish/${d._id}`)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-[#1A2316] text-[#FBBF24] rounded-xl text-[9px] font-black uppercase"><Edit3 size={12} />Edit</button>
                          <button onClick={() => setDeleteDishModal({ id: d._id, name: d.name })} className="py-2 px-3 bg-red-50 text-red-500 rounded-xl text-[9px] font-black uppercase hover:bg-red-100 transition-all"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>}
          </div>
        )}

        {/* SUBSCRIPTIONS */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            {/* Nested tabs */}
            <div className="flex gap-4 border-b border-gray-100 pb-3 mb-6">
              <button
                onClick={() => setSubTab('subscribers')}
                className={`pb-2 font-black uppercase text-[10px] tracking-wider transition-all relative ${subTab === 'subscribers' ? 'text-[#1A2316] border-b-2 border-[#FBBF24]' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Active Subscribers ({subscriptions.length})
              </button>
              <button
                onClick={() => setSubTab('plans')}
                className={`pb-2 font-black uppercase text-[10px] tracking-wider transition-all relative ${subTab === 'plans' ? 'text-[#1A2316] border-b-2 border-[#FBBF24]' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Manage Meal Plans ({subscriptionPlans.length})
              </button>
            </div>

            {subTab === 'subscribers' ? (
              <div className="space-y-6">
                <div className="flex gap-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase self-center mr-2">Status:</span>
                  {[
                    { key: 'active', label: `Active / Paused (${subscriptions.filter(s => s.status === 'active' || s.status === 'paused').length})` },
                    { key: 'expired', label: `Completed / Expired (${subscriptions.filter(s => s.status === 'expired').length})` },
                    { key: 'pending', label: `Pending Approval (${subscriptions.filter(s => s.status === 'pending').length})` }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setSubscribersFilter(tab.key)}
                      className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${subscribersFilter === tab.key ? 'bg-[#1A2316] text-[#FBBF24]' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {loading ? <div className="text-center py-20 text-gray-400 font-black animate-pulse">Loading...</div>
                  : filteredSubscribers().length === 0 ? <div className="bg-white p-16 rounded-[40px] flex flex-col items-center text-gray-300"><Package size={40} className="mb-4 opacity-20" /><p className="font-black text-[10px] uppercase">No Subscriptions Found</p></div>
                    : <div className="grid md:grid-cols-2 gap-5">
                      {filteredSubscribers().map(s => (
                        <div key={s._id} className="bg-white p-7 rounded-[30px] shadow-sm border border-gray-100">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="font-black text-base">{s.userId?.name || 'Customer'}</p>
                              <p className="text-xs text-gray-400">{s.userId?.phone || 'No Phone'}</p>
                              {s.userId?.address && <p className="text-xs text-gray-400">{s.userId.address}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-green-100 text-green-700">{s.planType}</span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${s.status === 'active' ? 'bg-green-100 text-green-700' :
                                  s.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                                    s.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                                      'bg-red-100 text-red-600'
                                }`}>{s.status}</span>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm border-t border-gray-50 pt-4">
                            {[
                              ['Meal Type', s.mealType],
                              ['Remaining Days', `${s.remainingDays} days`],
                              ['Revenue', `PKR ${s.totalCost}`],
                              ['Start Date', s.startDate ? new Date(s.startDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'],
                              ['End Date', s.endDate ? new Date(s.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'],
                              ['Payment Status', s.paymentStatus || 'pending'],
                              ['Chef Payout', s.payoutStatus === 'paid' ? 'Paid ✓' : s.payoutStatus === 'pending' ? 'Pending Approval' : 'None']
                            ].map(([l, v]) => (
                              <div key={l} className="flex justify-between"><span className="text-gray-400 font-bold">{l}:</span><span className="font-black text-right">{v}</span></div>
                            ))}
                          </div>

                          <div className="mt-4 border-t border-gray-50 pt-3">
                            <p className="text-[9px] font-black uppercase text-gray-400 mb-2">Delivery Schedule</p>
                            <div className="flex flex-wrap gap-1.5">
                              {s.selectedDays?.map(day => {
                                const isPaused = s.pausedDays?.includes(day);
                                return (
                                  <span
                                    key={day}
                                    className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase flex items-center gap-1 transition-all ${isPaused
                                        ? 'bg-red-50 text-red-600 border border-red-100 line-through'
                                        : 'bg-green-50 text-green-700 border border-green-200'
                                      }`}
                                  >
                                    <span className={`w-1 h-1 rounded-full ${isPaused ? 'bg-red-500' : 'bg-green-500'}`} />
                                    {day} {isPaused ? '(Paused)' : ''}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {(() => {
                            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            const todayName = daysOfWeek[new Date().getDay()];
                            const isTodayPaused = s.pausedDays?.includes(todayName);
                            const isTodaySelected = s.selectedDays?.includes(todayName);
                            if (isTodaySelected && isTodayPaused) {
                              return (
                                <div className="mt-3 bg-red-50 border border-red-200 p-3 rounded-2xl flex items-center gap-2 text-red-700">
                                  <span className="text-sm">⚠️</span>
                                  <p className="text-[9px] font-black uppercase tracking-wider">
                                    {todayName} is PAUSED: Today's food is NOT required to deliver.
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      ))}
                    </div>
                }
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setEditingPlan(null);
                      setPlanForm({
                        title: '',
                        description: '',
                        price: '',
                        duration: 'weekly',
                        mealType: 'Breakfast',
                        menu: [
                          { day: 'Monday', items: '' },
                          { day: 'Tuesday', items: '' },
                          { day: 'Wednesday', items: '' },
                          { day: 'Thursday', items: '' },
                          { day: 'Friday', items: '' },
                          { day: 'Saturday', items: '' },
                          { day: 'Sunday', items: '' },
                        ]
                      });
                      setShowPlanModal(true);
                    }}
                    className="bg-[#1A2316] text-[#FBBF24] px-6 py-3 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 hover:scale-105 transition-all"
                  >
                    <Plus size={16} /> Create Plan Package
                  </button>
                </div>

                {loading ? <div className="text-center py-20 text-gray-400 font-black animate-pulse">Loading plans...</div>
                  : subscriptionPlans.length === 0 ? (
                    <div className="bg-white p-16 rounded-[40px] flex flex-col items-center text-gray-300">
                      <Package size={40} className="mb-4 opacity-20" />
                      <p className="font-black text-[10px] uppercase">No Plans Uploaded Yet</p>
                      <p className="text-xs text-gray-400 mt-2 font-bold">Create breakfast, lunch, or dinner packages for users to subscribe.</p>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {subscriptionPlans.map(plan => (
                        <div key={plan._id} className="bg-white p-6 rounded-[30px] shadow-sm border border-gray-100 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{plan.duration}</span>
                              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{plan.mealType}</span>
                            </div>
                            <h4 className="font-black text-lg text-[#1A2316] mb-1">{plan.title}</h4>
                            <p className="text-xs text-gray-400 font-semibold mb-3">{plan.description}</p>

                            <div className="border-t border-gray-50 pt-3 mb-4 space-y-1">
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Weekly Menu Details</p>
                              {plan.menu?.map(m => (
                                <div key={m.day} className="flex justify-between text-xs mb-1">
                                  <span className="text-gray-500 font-bold">{m.day}:</span>
                                  <span className="font-semibold text-right max-w-[150px] truncate" title={m.items}>{m.items || 'None'}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="border-t border-gray-50 pt-4 flex justify-between items-center mt-4">
                            <span className="text-xl font-black text-[#1A2316]">PKR {plan.price}</span>
                            <div className="flex gap-2">
                              <button onClick={() => openEditPlan(plan)} className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"><Edit3 size={14} /></button>
                              <button onClick={() => setDeletePlanModal({ id: plan._id, title: plan.title })} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            )}

            {/* Modal for creating/editing plans */}
            {showPlanModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000] overflow-y-auto">
                <div className="bg-white rounded-[40px] p-8 max-w-2xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto my-8">
                  <button onClick={() => setShowPlanModal(false)} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200">✕</button>
                  <h3 className="text-2xl font-black italic uppercase text-[#1A2316] mb-6">
                    {editingPlan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
                  </h3>

                  <form onSubmit={handleSavePlan} className="space-y-5">
                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Plan Title *</label>
                        <input
                          type="text"
                          required
                          value={planForm.title}
                          onChange={e => setPlanForm({ ...planForm, title: e.target.value })}
                          placeholder="e.g. Premium Breakfast Package"
                          className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Package Price (PKR) *</label>
                        <input
                          type="number"
                          required
                          value={planForm.price}
                          onChange={e => setPlanForm({ ...planForm, price: e.target.value })}
                          placeholder="e.g. 4500"
                          className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Package Description *</label>
                      <textarea
                        required
                        value={planForm.description}
                        onChange={e => setPlanForm({ ...planForm, description: e.target.value })}
                        placeholder="Detail what is included in this package and delivery details..."
                        className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm h-20 resize-none border border-transparent focus:border-[#FBBF24] transition-all"
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Plan Duration *</label>
                        <select
                          value={planForm.duration}
                          onChange={e => setPlanForm({ ...planForm, duration: e.target.value })}
                          className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                        >
                          <option value="weekly">Weekly (7 Days)</option>
                          <option value="21days">3-Week Package (21 Days)</option>
                          <option value="monthly">Monthly (30 Days)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Meal Type *</label>
                        <select
                          value={planForm.mealType}
                          onChange={e => setPlanForm({ ...planForm, mealType: e.target.value })}
                          className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                        >
                          <option value="Breakfast">Breakfast</option>
                          <option value="Lunch">Lunch</option>
                          <option value="Dinner">Dinner</option>
                          <option value="All Meals">All Meals (Full Day Package)</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-3">Day-by-Day Menu Items</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        {planForm.menu.map((menuItem, idx) => (
                          <div key={menuItem.day} className="flex flex-col">
                            <label className="text-[9px] font-black text-gray-500 mb-1 ml-1">{menuItem.day}</label>
                            <input
                              type="text"
                              value={menuItem.items}
                              onChange={e => {
                                const newMenu = [...planForm.menu];
                                newMenu[idx].items = e.target.value;
                                setPlanForm({ ...planForm, menu: newMenu });
                              }}
                              placeholder="e.g. Omelette + Paratha + Chai"
                              className="w-full bg-gray-50 p-3 rounded-lg outline-none font-semibold text-xs border border-transparent focus:border-[#FBBF24] transition-all"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-[#1A2316] text-[#FBBF24] py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:opacity-90 active:scale-95 transition-all mt-4"
                    >
                      {editingPlan ? 'Update Package' : 'Publish Package'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WALLET */}
        {activeTab === 'wallet' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black uppercase italic">Wallet Console</h3>
              <button
                onClick={() => { setShowWithdrawModal(true); setWithdrawError(''); setWithdrawSuccess(''); }}
                className="bg-[#1A2316] text-[#FBBF24] px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-md"
              >
                Withdraw Money
              </button>
            </div>
            <div className="grid md:grid-cols-4 gap-5">
              {[
                ['Available Balance', walletData.totalBalance, 'text-green-400'],
                ['Locked Sub Earnings', lockedEarnings, 'text-purple-400'],
                ['Processing Payouts', walletData.pendingBalance, 'text-yellow-400'],
                ['Withdrawn Total', walletData.withdrawnTotal, 'text-gray-400']
              ].map(([l, v, c]) => (
                <div key={l} className="bg-[#1A2316] p-7 rounded-[30px] text-white">
                  <p className="text-[10px] font-black uppercase text-gray-400 mb-2">{l}</p>
                  <h3 className={`text-2xl font-black ${c}`}>PKR {(v || 0).toLocaleString()}</h3>
                </div>
              ))}
            </div>
            <div className="bg-white p-7 rounded-[30px] shadow-sm border border-gray-100">
              <h4 className="font-black uppercase text-sm mb-5">Transaction History</h4>
              {!walletData.transactions?.length ? <p className="text-gray-300 text-center py-8 font-black text-[10px] uppercase">No transactions yet</p>
                : walletData.transactions.map(tx => (
                  <div key={tx._id} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
                    <div><p className="font-black">{tx.type === 'credit' ? '✅ Earning' : '💸 Withdrawal'}</p><p className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleDateString()}</p></div>
                    <div className="text-right"><p className={`font-black text-lg ${tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>{tx.type === 'credit' ? '+' : '-'}PKR {tx.amount}</p><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${tx.status === 'approved' ? 'bg-green-100 text-green-700' : tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>{tx.status}</span></div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* PROFIT ENGINE */}
        {activeTab === 'calculator' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[50px] shadow-sm border border-gray-100 space-y-5">
              <h3 className="text-xl font-black italic uppercase">Profit Engine</h3>
              {[['ingredients', 'Ingredients Cost (PKR)'], ['utilities', 'Utilities (Gas/Electric)'], ['packaging', 'Packaging Cost']].map(([k, l]) => (
                <div key={k} className="bg-gray-50 p-5 rounded-[20px]"><label className="text-[9px] font-black uppercase text-gray-400 block mb-1">{l}</label><input type="number" value={calc[k]} onChange={e => setCalc({ ...calc, [k]: e.target.value })} className="w-full bg-transparent font-black text-2xl outline-none" /></div>
              ))}
              <div className="bg-[#1A2316] p-5 rounded-[20px] text-white">
                <div className="flex justify-between text-[9px] font-black uppercase text-[#FBBF24] mb-3"><span>Manual Adjustment</span><span>PKR {calc.manualAdjustment}</span></div>
                <div className="flex items-center gap-4"><button onClick={() => setCalc({ ...calc, manualAdjustment: Number(calc.manualAdjustment) - 20 })} className="p-3 bg-white/10 rounded-xl"><Minus size={14} /></button><div className="flex-1 h-1 bg-white/10 rounded-full" /><button onClick={() => setCalc({ ...calc, manualAdjustment: Number(calc.manualAdjustment) + 20 })} className="p-3 bg-white/10 rounded-xl"><Plus size={14} /></button></div>
              </div>
            </div>
            <div className="bg-[#1A2316] p-12 rounded-[50px] text-white flex flex-col justify-between border-b-[16px] border-[#FBBF24] shadow-2xl">
              <div><p className="text-[#FBBF24] font-black uppercase text-[10px] tracking-widest mb-8 italic underline">Financial Summary</p>
                <div className="space-y-3 opacity-70">
                  {[['Total Cost', `PKR ${baseCost}`], ['Profit (40%)', `PKR ${(baseCost * 0.4).toFixed(0)}`], ['Platform Fee (10%)', `PKR ${(finalPrice * 0.1).toFixed(0)}`]].map(([l, v]) => <div key={l} className="flex justify-between text-[10px] font-black uppercase"><span>{l}</span><span>{v}</span></div>)}
                </div>
              </div>
              <div className="mt-10"><p className="text-[11px] font-black uppercase text-gray-500 tracking-[0.4em] mb-2 italic">Suggested Price</p><h4 className="text-7xl font-black italic text-[#FBBF24] tracking-tighter">PKR {finalPrice.toFixed(0)}</h4></div>
            </div>
          </div>
        )}

        {/* RECIPES */}
        {activeTab === 'recipes' && (
          <RecipesTab chefId={chefId} token={token} />
        )}

        {/* PROFILE */}
        {activeTab === 'profile' && (
          <ProfileTab
            user={currentUser}
            chefId={chefId}
            token={token}
            onUpdateUser={(updated) => {
              setCurrentUser(updated);
              if (onUserUpdate) onUserUpdate(updated);
            }}
          />
        )}
        {/* WITHDRAW MODAL */}
        {showWithdrawModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setShowWithdrawModal(false)}></div>
            <div className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl p-10 z-[1001] animate-in zoom-in duration-300 text-left">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                ✕
              </button>

              <h3 className="text-2xl font-black text-[#1A2316] uppercase italic mb-2">Request Withdrawal<span className="text-[#FBBF24]">.</span></h3>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[2px] mb-6">Minimum Rs. 1000 withdrawal</p>

              <form onSubmit={handleWithdrawSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-4">Withdrawal Amount (PKR)</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-gray-50 p-5 rounded-3xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                    min="1000"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-4">Payment Method</label>
                  <select
                    value={withdrawMethod}
                    onChange={(e) => setWithdrawMethod(e.target.value)}
                    className="w-full bg-gray-50 p-5 rounded-3xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                  >
                    <option value="EasyPaisa">EasyPaisa</option>
                    <option value="JazzCash">JazzCash</option>
                    <option value="Bank Transfer">Bank Transfer (IBAN)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-4">Account Number / IBAN Details</label>
                  <input
                    type="text"
                    placeholder="e.g. 03XXXXXXXXX or PKXX..."
                    value={withdrawAccount}
                    onChange={(e) => setWithdrawAccount(e.target.value)}
                    className="w-full bg-gray-50 p-5 rounded-3xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                  />
                </div>

                {withdrawError && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold">
                    ⚠️ {withdrawError}
                  </div>
                )}

                {withdrawSuccess && (
                  <div className="bg-green-50 text-green-600 p-4 rounded-2xl text-xs font-bold">
                    🎉 {withdrawSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={withdrawing}
                  className="w-full py-5 bg-[#1A2316] text-[#FBBF24] rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {withdrawing ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Processing...
                    </>
                  ) : 'Submit Request'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const RecipesTab = ({ chefId, token }) => {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [recipeForm, setRecipeForm] = useState({
    name: '',
    time: '',
    difficulty: 'Easy',
    ingredients: '',
    steps: '',
    image: null
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteRecipeModal, setDeleteRecipeModal] = useState(null); // { id, name } or null

  const fetchRecipes = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/chef/recipes/chef/${chefId}`);
      setRecipes(res.data || []);
    } catch (err) {
      toast.error('Failed to load recipes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, [chefId]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRecipeForm({ ...recipeForm, image: file });
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAddRecipe = async (e) => {
    e.preventDefault();
    if (!recipeForm.name) {
      toast.error('Recipe name is required');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', recipeForm.name);
      formData.append('time', recipeForm.time || '30 mins');
      formData.append('difficulty', recipeForm.difficulty);

      // Parse ingredients and steps into JSON arrays
      const ingredientsArray = recipeForm.ingredients
        .split('\n')
        .map(i => i.trim())
        .filter(i => i.length > 0);
      const stepsArray = recipeForm.steps
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      formData.append('ingredients', JSON.stringify(ingredientsArray));
      formData.append('steps', JSON.stringify(stepsArray));

      if (recipeForm.image) {
        formData.append('image', recipeForm.image);
      }

      await API.post('/api/chef/recipes/add', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      toast.success('Recipe published successfully!');
      setShowModal(false);
      setRecipeForm({
        name: '',
        time: '',
        difficulty: 'Easy',
        ingredients: '',
        steps: '',
        image: null
      });
      setImagePreview(null);
      fetchRecipes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add recipe');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    try {
      const res = await API.delete(`/api/chef/recipes/${recipeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(res.data?.message || 'Recipe deleted successfully!');
      fetchRecipes();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to delete recipe');
    } finally {
      setDeleteRecipeModal(null);
    }
  };

  return (
    <div className="space-y-5 text-left">
      {/* Delete Recipe Confirm Modal */}
      {deleteRecipeModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2 text-red-600">Delete Recipe?</h3>
            <p className="text-sm text-gray-600 font-bold mb-2">
              Are you sure you want to delete <span className="text-[#1A2316] font-black">"{deleteRecipeModal.name}"</span>?
            </p>
            <p className="text-xs text-gray-400 font-bold mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteRecipeModal(null)} className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all">
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRecipe(deleteRecipeModal.id)}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-red-600 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black uppercase italic">Kitchen Recipes</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Share tips and ingredients of your famous dishes</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center gap-2 hover:scale-105 transition-all">
          <Plus size={18} />Add New Recipe
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400 font-black uppercase animate-pulse">Loading Recipes...</div>
      ) : recipes.length === 0 ? (
        <button onClick={() => setShowModal(true)} className="w-full border-4 border-dashed border-gray-200 p-16 rounded-[40px] flex flex-col items-center text-gray-300 hover:text-[#FBBF24] hover:border-[#FBBF24] transition-all">
          <Plus size={40} />
          <span className="font-black text-[10px] mt-4 uppercase">Publish Your First Recipe</span>
        </button>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {recipes.map(recipe => (
            <div key={recipe._id} className="bg-white rounded-[30px] overflow-hidden shadow-sm border border-gray-100 flex flex-col justify-between">
              <div>
                <div className="h-44 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                  {recipe.img ? (
                    <img src={`${window.API_URL}${recipe.img}`} alt={recipe.name} className="w-full h-full object-cover" />
                  ) : (
                    <BookOpen size={40} className="text-gray-200" />
                  )}
                  <span className="absolute top-3 right-3 px-3 py-1 rounded-full text-[9px] font-black uppercase bg-[#1A2316] text-[#FBBF24]">
                    {recipe.difficulty}
                  </span>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <h4 className="font-black text-[#1A2316] uppercase italic">{recipe.name}</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1">Prep: {recipe.time}</p>
                  </div>

                  {recipe.ingredients?.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Ingredients</p>
                      <div className="flex flex-wrap gap-1">
                        {recipe.ingredients.slice(0, 4).map((ing, i) => (
                          <span key={i} className="text-[9px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-bold">
                            {ing}
                          </span>
                        ))}
                        {recipe.ingredients.length > 4 && (
                          <span className="text-[9px] text-gray-400 font-bold ml-1">+{recipe.ingredients.length - 4} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 border-t border-gray-50 flex justify-end">
                <button onClick={() => setDeleteRecipeModal({ id: recipe._id, name: recipe.name })} className="py-2.5 px-4 bg-red-50 text-red-500 rounded-xl text-[9px] font-black uppercase hover:bg-red-100 transition-all flex items-center gap-1">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Recipe Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 z-[2001] p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
              <X size={20} />
            </button>
            <form onSubmit={handleAddRecipe} className="p-10 max-h-[85vh] overflow-y-auto custom-scrollbar space-y-6">
              <h3 className="text-2xl font-black uppercase italic text-[#1A2316] mb-8">Publish Recipe</h3>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Recipe Name *</label>
                  <input type="text" placeholder="e.g. Secret Garam Masala" value={recipeForm.name} onChange={e => setRecipeForm({ ...recipeForm, name: e.target.value })} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all" required />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Prep Time</label>
                  <input type="text" placeholder="e.g. 15 mins" value={recipeForm.time} onChange={e => setRecipeForm({ ...recipeForm, time: e.target.value })} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all" />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Difficulty</label>
                  <select value={recipeForm.difficulty} onChange={e => setRecipeForm({ ...recipeForm, difficulty: e.target.value })} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all">
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Recipe Image</label>
                  <input type="file" accept="image/*" onChange={handleImageChange} className="w-full bg-gray-50 p-3 rounded-xl outline-none font-bold text-xs border border-transparent focus:border-[#FBBF24] transition-all" />
                </div>
              </div>

              {imagePreview && (
                <div className="h-32 w-full rounded-2xl overflow-hidden border border-gray-100">
                  <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Ingredients (One per line)</label>
                  <textarea rows="5" placeholder="Basmati Rice&#10;Mint Leaves&#10;Yogurt" value={recipeForm.ingredients} onChange={e => setRecipeForm({ ...recipeForm, ingredients: e.target.value })} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all resize-none" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">Method / Steps (One per line)</label>
                  <textarea rows="5" placeholder="Boil rice up to 80%&#10;Layer meat and rice&#10;Dum for 15 mins" value={recipeForm.steps} onChange={e => setRecipeForm({ ...recipeForm, steps: e.target.value })} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all resize-none" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-5 bg-[#1A2316] text-[#FBBF24] rounded-2xl font-black uppercase italic tracking-widest hover:bg-[#253120] transition-all disabled:opacity-50 mt-6">
                {submitting ? 'Publishing...' : 'Publish Recipe'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const ProfileTab = ({ user, chefId, token, onUpdateUser }) => {
  // authH not needed here — save() uses token prop directly
  const [form, setForm] = useState({
    name: user.name || '',
    kitchenName: user.kitchenName || '',
    about: user.about || '',
    phone: user.phone || '',
    cnic: user.cnic || '',
    address: user.address || '',
    specialty: user.specialty || '',
    experience: user.experience || '',
    weeklyBreakfastPrice: user.weeklyBreakfastPrice || '',
    weeklyLunchPrice: user.weeklyLunchPrice || '',
    weeklyDinnerPrice: user.weeklyDinnerPrice || '',
    monthlyBreakfastPrice: user.monthlyBreakfastPrice || '',
    monthlyLunchPrice: user.monthlyLunchPrice || '',
    monthlyDinnerPrice: user.monthlyDinnerPrice || ''
  });

  // ── Kitchen GPS location ──────────────────────────────────────────────────
  const [kitchenLoc, setKitchenLoc] = useState(
    user.location?.lat ? user.location : null
  );
  const [settingLoc, setSettingLoc] = useState(false);

  const handleSetKitchenLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported by your browser.');
      return;
    }
    setSettingLoc(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        try {
          const formData = new FormData();
          formData.append('locationLat', lat);
          formData.append('locationLng', lng);
          // Let axios auto-set Content-Type with correct FormData boundary
          const res = await API.put(`/api/users/${chefId}`, formData, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setKitchenLoc({ lat, lng });
          if (onUpdateUser) onUpdateUser(res.data.user || { ...user, location: { lat, lng } });
          toast.success('📍 Kitchen location saved! Riders will see it on the map.');
        } catch (e) {
          toast.error('Failed to save location: ' + (e.response?.data?.message || e.message));
        } finally {
          setSettingLoc(false);
        }
      },
      (err) => {
        console.error('GPS error:', err);
        setSettingLoc(false);
        toast.error('Could not detect location. Please allow GPS access.');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(user.img || '');


  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const save = async () => {
    try {
      const formData = new FormData();
      Object.keys(form).forEach(key => {
        formData.append(key, form[key]);
      });
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const res = await API.put(`/api/users/${chefId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      const updatedUser = res.data.user || { ...user, ...form };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      if (onUpdateUser) onUpdateUser(updatedUser);
      toast.success('Profile updated successfully!');
    } catch (e) {
      toast.error('Error: ' + (e.response?.data?.message || e.message));
    }
  };

  return (
    <div className="max-w-3xl bg-white p-10 rounded-[50px] shadow-sm border border-gray-100 text-left">
      <div className="flex items-center gap-8 mb-10">
        <input type="file" id="profileImgInput" className="hidden" accept="image/*" onChange={handleImageChange} />
        <label htmlFor="profileImgInput" className="relative cursor-pointer group">
          <div className="w-28 h-28 bg-[#1A2316] rounded-[35px] flex items-center justify-center border-4 border-[#FBBF24] shadow-xl overflow-hidden relative">
            {imagePreview ? (
              <img src={imagePreview.startsWith('blob:') ? imagePreview : `${window.API_URL}${imagePreview}`} className="w-full h-full object-cover" alt="Profile" />
            ) : (
              <span className="text-5xl font-black text-[#FBBF24]">{(user.name || 'C').charAt(0)}</span>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
              <Camera size={20} className="text-white" />
            </div>
          </div>
        </label>
        <div>
          <h3 className="text-2xl font-black italic uppercase">{form.kitchenName || user.kitchenName || user.name}</h3>
          <p className="text-[10px] font-black text-gray-400 uppercase mt-2 tracking-widest">{user.isVerified ? '✅ Verified Chef' : '⏳ Pending Verification'}</p>
          <p className="text-sm text-gray-500 mt-1">{user.email}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {[
          ['name', 'Full Name', 'text'],
          ['kitchenName', 'Kitchen Name', 'text'],
          ['phone', 'Phone', 'text'],
          ['cnic', 'CNIC / License', 'text'],
          ['specialty', 'Specialty (e.g. Desi, BBQ)', 'text'],
          ['experience', 'Experience (e.g. 5 Years)', 'text'],
          ['about', 'About Kitchen', 'textarea'],
          ['address', 'Kitchen Address', 'text']
        ].map(([k, l, t]) => (
          <div key={k} className={k === 'address' || k === 'about' ? 'md:col-span-2' : ''}>
            <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">{l}</label>
            {t === 'textarea' ? (
              <textarea rows="3" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="w-full bg-gray-50 p-5 rounded-2xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all resize-none" />
            ) : (
              <input type={t} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="w-full bg-gray-50 p-5 rounded-2xl outline-none font-black text-sm border border-transparent focus:border-[#FBBF24] transition-all" />
            )}
          </div>
        ))}
      </div>

      {/* Subscription Pricing Section */}
      <div className="mt-10 pt-10 border-t border-gray-100">
        <h4 className="font-black uppercase text-xs text-[#1A2316] tracking-widest mb-6">Custom Subscription Pricing (PKR)</h4>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h5 className="font-black uppercase text-[10px] text-gray-400 tracking-wider mb-4">Weekly Pricing (7 Days Package)</h5>
            <div className="space-y-4">
              {[
                ['weeklyBreakfastPrice', 'Weekly Breakfast Price'],
                ['weeklyLunchPrice', 'Weekly Lunch Price'],
                ['weeklyDinnerPrice', 'Weekly Dinner Price']
              ].map(([k, l]) => (
                <div key={k}>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">{l}</label>
                  <input type="number" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all" placeholder="Default: 1000" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h5 className="font-black uppercase text-[10px] text-gray-400 tracking-wider mb-4">Monthly Pricing (30 Days Package)</h5>
            <div className="space-y-4">
              {[
                ['monthlyBreakfastPrice', 'Monthly Breakfast Price'],
                ['monthlyLunchPrice', 'Monthly Lunch Price'],
                ['monthlyDinnerPrice', 'Monthly Dinner Price']
              ].map(([k, l]) => (
                <div key={k}>
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 block mb-1">{l}</label>
                  <input type="number" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all" placeholder="Default: 3800" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>


      {/* ── Kitchen GPS Location ─────────────────────────────────────── */}
      <div className="mt-8 p-6 bg-gray-50 rounded-3xl border border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h4 className="font-black text-[#1A2316] text-xs uppercase tracking-widest mb-1">📍 Kitchen GPS Location</h4>
            {kitchenLoc ? (
              <p className="text-[10px] text-emerald-600 font-bold">
                ✅ Saved: {kitchenLoc.lat.toFixed(5)}, {kitchenLoc.lng.toFixed(5)}
              </p>
            ) : (
              <p className="text-[10px] text-orange-500 font-bold">
                ⚠️ Not set — riders cannot see your kitchen pin on the map
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSetKitchenLocation}
            disabled={settingLoc}
            className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${kitchenLoc
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                : 'bg-[#1A2316] text-[#FBBF24] hover:bg-[#253120]'
              }`}
          >
            {settingLoc ? 'Detecting...' : kitchenLoc ? '🔄 Update Location' : '📍 Set Kitchen Location'}
          </button>
        </div>
        <p className="text-[9px] text-gray-400 font-bold mt-3">
          Click once to save your current GPS as your kitchen address. Riders and customers will see this exact pin on the map — no geocoding needed.
        </p>
      </div>

      <button onClick={save} className="mt-8 w-full bg-[#1A2316] text-[#FBBF24] py-5 rounded-[25px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Save Profile</button>

    </div>
  );
};

export default ChefDashboard;

