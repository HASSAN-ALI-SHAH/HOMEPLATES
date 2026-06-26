import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bike, Bell, LayoutDashboard, Clock, DollarSign, LogOut,
  Info, CheckCircle, User, Navigation, Check,
  Package, RefreshCw, MapPin, TrendingUp, Phone,
  ChefHat, X, Zap, AlertCircle, ShoppingBag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import API from '../api';
import { toast } from '../utils/toast';
import LiveTrackingMap from './LiveTrackingMap';
import { geocodeAddress } from '../utils/geocode';

const RiderDashboard = ({ user: propUser, onLogout, onUserUpdate }) => {
  const navigate = useNavigate();
  const currentUser = propUser || JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const riderId = currentUser._id;
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  const [activeTab, setActiveTab] = useState('overview');
  const [showNoti, setShowNoti] = useState(false);
  const [isOnline, setIsOnline] = useState(currentUser.verificationStatus === 'verified');
  const [loading, setLoading] = useState(true);

  const [notifications, setNotifications] = useState([]);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [walletData, setWalletData] = useState({ totalBalance: 0, pendingBalance: 0, transactions: [] });
  const [withdrawRequests, setWithdrawRequests] = useState([]);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  // New order alert modal state
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const [acceptingOrder, setAcceptingOrder] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // B7: Confirm modals for destructive actions
  const [cancelModal, setCancelModal] = useState(false);
  const [failModal, setFailModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [actionReason, setActionReason] = useState('');

  // B1: Check suspension on mount
  const isSuspended = currentUser.isActive === false;

  // ─── Live tracking state ────────────────────────────────────────────────────
  const [riderCoords,    setRiderCoords]    = useState(null); // own GPS position
  const [chefCoords,     setChefCoords]     = useState(null); // geocoded pickup
  const [customerCoords, setCustomerCoords] = useState(null); // geocoded dropoff
  const [geoError,       setGeoError]       = useState('');

  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const [profile, setProfile] = useState({
    name: currentUser.name || '',
    phone: currentUser.phone || '',
    vehicle: currentUser.vehicle || '',
    zone: currentUser.zone || '',
    email: currentUser.email || '',
    city: currentUser.city || 'Lahore'
  });
  const [editProfile, setEditProfile] = useState({ ...profile });
  const [savingProfile, setSavingProfile] = useState(false);

  const socketRef = useRef(null);
  const alertSoundRef = useRef(null);

  // ─── DATA FETCHING ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!riderId) return;
    setLoading(true);
    try {
      const [availRes, activeRes, walletRes, withdrawalsRes, notisRes] = await Promise.allSettled([
        API.get('/api/orders/rider/available', authH),
        API.get(`/api/orders/rider/active/${riderId}`),
        API.get(`/api/wallet/${riderId}`, authH),
        API.get('/api/wallet/rider/withdrawals', authH),
        API.get('/api/support/notifications', authH)
      ]);

      if (availRes.status === 'fulfilled') setAvailableOrders(availRes.value.data || []);
      if (activeRes.status === 'fulfilled') setActiveOrder(activeRes.value.data || null);
      if (walletRes.status === 'fulfilled') setWalletData(walletRes.value.data);
      if (withdrawalsRes.status === 'fulfilled') setWithdrawRequests(withdrawalsRes.value.data || []);
      if (notisRes.status === 'fulfilled') {
        const dbNotis = notisRes.value.data || [];
        const mapped = dbNotis.map(item => ({
          id: item._id,
          title: item.title || 'Alert',
          body: item.message,
          time: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setNotifications(mapped);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  const handleRequestWithdrawal = async (e) => {
    e.preventDefault();
    const amountNum = Number(withdrawAmount);
    if (!amountNum || isNaN(amountNum) || amountNum < 1000) {
      toast.error('Minimum withdrawal request is Rs. 1,000');
      return;
    }
    if (amountNum > walletData.totalBalance) {
      toast.error('Withdrawal amount cannot exceed your current wallet balance.');
      return;
    }
    
    // Check if there is already an active request open
    const hasPendingOrApproved = withdrawRequests.some(r => ['pending', 'approved'].includes(r.status));
    if (hasPendingOrApproved) {
      toast.error('You already have a pending or approved withdrawal request open.');
      return;
    }

    setWithdrawing(true);
    try {
      await API.post('/api/wallet/rider/withdraw', { amount: amountNum }, authH);
      toast.success('Withdrawal request submitted successfully! Admin will review it shortly.');
      setWithdrawAmount('');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit withdrawal request.');
    } finally {
      setWithdrawing(false);
    }
  };

  // ─── SOCKET.IO SETUP ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!riderId) return;

    fetchData();

    const socket = io(window.API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    // Join room immediately (buffered until connection is ready)
    socket.emit('join_rider_room', riderId);

    socket.on('connect', () => {
      socket.emit('join_rider_room', riderId);
      if (isOnlineRef.current) {
        socket.emit('go_online', riderId);
      }
    });

    // 🚴 New order available for delivery — show full alert modal
    socket.on('new_delivery_available', ({ order, message }) => {
      if (!isOnlineRef.current) return;
      addNotification('🍽️ New Delivery Available!', message || 'A new order is ready for pickup!');
      setNewOrderAlert(order);
      // Refresh available orders list
      fetchData();
    });

    // Another rider took an order — refresh our available list
    socket.on('order_taken', ({ orderId }) => {
      setAvailableOrders(prev => prev.filter(o => o._id !== orderId));
      // Also dismiss alert if it's for the same order
      setNewOrderAlert(prev => prev?._id === orderId ? null : prev);
    });

    // Order status changed (e.g. order cancelled while rider is heading, or rider_cancelled penalty)
    socket.on('order_status_changed', ({ orderId, status, message }) => {
      if (status === 'cancelled') {
        addNotification('⚠️ Order Cancelled', 'The order you accepted was cancelled.');
        setActiveOrder(null);
        fetchData();
      } else if (status === 'rider_cancelled') {
        // B1: Show penalty deduction notification to the rider
        if (message) {
          toast.error(message);
          addNotification('💸 Wallet Penalty Applied', message);
        }
        setActiveOrder(null);
        fetchData();
      }
    });

    // FIX #6: Chef cancelled the order — notify the user (rider also sees this)
    socket.on('order_cancelled_by_chef', ({ orderId, message }) => {
      addNotification('⚠️ Order Rejected by Chef', message || 'The chef rejected this order.');
      setActiveOrder(prev => prev?._id === orderId ? null : prev);
      fetchData();
    });

    // Delivery complete confirmation
    socket.on('delivery_complete', ({ earning, message }) => {
      addNotification('💰 Delivery Complete!', message || `PKR ${earning} added to your wallet.`);
      fetchData();
    });

    // Rider verification update event
    socket.on('verificationUpdate', ({ status, rejectionReason }) => {
      const updatedUser = { ...currentUser, verificationStatus: status, rejectionReason };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      if (onUserUpdate) onUserUpdate(updatedUser);
      if (status === 'verified') {
        toast.success("Your account has been verified. You can now go online and accept orders.");
        setIsOnline(true);
        fetchData();
      } else if (status === 'rejected') {
        toast.error(`Your verification request was rejected: ${rejectionReason || 'No reason specified'}`);
        setIsOnline(false);
      }
      addNotification(
        status === 'verified' ? '✅ Verified' : '❌ Verification Rejected',
        status === 'verified' ? "Your account has been verified by the administrator." : `Reason: ${rejectionReason || 'None'}`
      );
    });

    // Rider withdrawal status update event
    socket.on('withdrawalStatusUpdate', ({ requestId, status, proofImage }) => {
      addNotification(
        status === 'paid' ? '💰 Withdrawal Paid!' : `💸 Withdrawal status: ${status}`,
        status === 'paid' 
          ? `Your withdrawal request has been paid. View proof in your dashboard.`
          : `Withdrawal request status updated to: ${status}`
      );
      if (status === 'paid') {
        toast.success("Your withdrawal request has been paid!");
      } else if (status === 'rejected') {
        toast.error("Your withdrawal request has been rejected.");
      }
      fetchData(); // reload balance & list
    });

    return () => {
      socket.disconnect();
    };
  }, [riderId, fetchData, currentUser?.city]);

  // Sync online duty status with socket
  useEffect(() => {
    if (socketRef.current) {
      if (isOnline) {
        socketRef.current.emit('go_online', riderId);
      } else {
        socketRef.current.emit('go_offline', riderId);
        setNewOrderAlert(null);
      }
    }
  }, [isOnline, riderId]);

  // ─── Geolocation: broadcast live position while order is in transit ──────────
  useEffect(() => {
    const transitStatuses = ['ready-for-pickup', 'picked-up', 'out-for-delivery'];
    if (!activeOrder || !transitStatuses.includes(activeOrder.status)) return;
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setGeoError('');
    const watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        setRiderCoords({ lat, lng });
        socketRef.current?.emit('update_location', {
          orderId: activeOrder._id,
          lat,
          lng,
          chefId: activeOrder.chef?._id,
        });
      },
      (err) => {
        console.error('Geolocation error:', err);
        setGeoError('Location access denied — enable GPS in browser settings to broadcast your position.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeOrder?.status, activeOrder?._id]);

  // ─── Resolve chef/customer coords from stored order fields (instant, no geocoding) ──
  useEffect(() => {
    if (!activeOrder) {
      setChefCoords(null);
      setCustomerCoords(null);
      return;
    }

    // Chef pickup pin — use stored pickupLocation first (set at order-placement from chef.location)
    if (activeOrder.pickupLocation?.lat && activeOrder.pickupLocation?.lng) {
      setChefCoords(activeOrder.pickupLocation);
    } else if (activeOrder.chef?.location?.lat && activeOrder.chef?.location?.lng) {
      setChefCoords(activeOrder.chef.location);
    } else {
      // Fallback: geocode only if no stored coords
      const chefAddr = activeOrder.chef?.address || activeOrder.chef?.city;
      if (chefAddr) {
        geocodeAddress(chefAddr).then(c => { if (c) setChefCoords(c); });
      }
    }

    // Customer drop-off pin — use stored deliveryLocation first
    if (activeOrder.deliveryLocation?.lat && activeOrder.deliveryLocation?.lng) {
      setCustomerCoords(activeOrder.deliveryLocation);
    } else if (activeOrder.deliveryAddress) {
      // Fallback: geocode from text address
      geocodeAddress(activeOrder.deliveryAddress).then(c => { if (c) setCustomerCoords(c); });
    }
  }, [activeOrder?._id]);


  // ─── ORDER ACTIONS ──────────────────────────────────────────────────────────
  const acceptOrder = async (order) => {
    if (!isOnline) {
      toast.error('You are currently Offline. Please go Online to accept orders.');
      return;
    }
    if (activeOrder) {
      toast.error('You already have an active delivery. Complete it first.');
      return;
    }
    setAcceptingOrder(true);
    try {
      await API.patch(`/api/orders/${order._id}/accept`, { riderId });
      addNotification('✅ Order Accepted!', `Heading to ${order.chef?.name} for pickup.`);
      setNewOrderAlert(null);
      await fetchData();
      setActiveTab('lifecycle');
    } catch (e) {
      toast.error('Error accepting order: ' + (e.response?.data?.message || e.message));
    } finally {
      setAcceptingOrder(false);
    }
  };

  const ignoreOrder = async (order) => {
    try {
      await API.patch(`/api/orders/${order._id}/ignore`, {}, authH);
      addNotification('🚫 Request Ignored', 'You ignored the delivery request.');
      setNewOrderAlert(null);
      await fetchData();
    } catch (e) {
      toast.error('Error ignoring order: ' + (e.response?.data?.message || e.message));
    }
  };

  const STATUS_FLOW = {
    'ready-for-pickup': 'picked-up',
    'picked-up': 'out-for-delivery',
    'out-for-delivery': 'delivered',
  };

  const STATUS_LABELS = {
    'ready-for-pickup': 'Accepted — Ready for Pickup',
    'picked-up': 'Picked Up — In Transit',
    'out-for-delivery': 'Out for Delivery to Customer',
    'delivered': 'Delivered ✓',
  };

  const advanceOrderStatus = async (currentStatus) => {
    if (updatingStatus) return;
    if (!activeOrder) return;
    const nextStatus = STATUS_FLOW[currentStatus];
    if (!nextStatus) return;

    setUpdatingStatus(true);
    try {
      await API.patch(`/api/orders/${activeOrder._id}/status`, { status: nextStatus, riderId }, authH);
      if (nextStatus === 'delivered') {
        addNotification('🎉 Delivery Complete!', `PKR ${activeOrder.deliveryCharges || 150} added to your wallet.`);
        setActiveOrder(null);
        await fetchData();
        setActiveTab('earnings');
      } else {
        setActiveOrder(prev => ({ ...prev, status: nextStatus }));
        addNotification('📍 Status Updated', `Order is now: ${STATUS_LABELS[nextStatus]}`);
      }
    } catch (e) {
      toast.error('Error updating status: ' + (e.response?.data?.message || e.message));
    } finally {
      setUpdatingStatus(false);
    }
  };

  // B7: Rider rejects order — uses modal instead of window.confirm
  const rejectOrder = async () => {
    if (!activeOrder) return;
    setRejectModal(false);
    setUpdatingStatus(true);
    try {
      await API.patch(`/api/orders/${activeOrder._id}/reject`, { riderId });
      addNotification('❌ Order Rejected', 'You have rejected the order. It will be reassigned.');
      setActiveOrder(null);
      await fetchData();
      setActiveTab('available');
    } catch (e) {
      toast.error('Error rejecting order: ' + (e.response?.data?.message || e.message));
    } finally {
      setUpdatingStatus(false);
    }
  };

  // B7: Cancel delivery — uses modal
  const cancelDelivery = async () => {
    if (!activeOrder || !actionReason.trim()) return;
    setCancelModal(false);
    setUpdatingStatus(true);
    try {
      await API.patch(`/api/orders/${activeOrder._id}/status`, {
        status: 'rider_cancelled', cancellationReason: actionReason, riderId
      }, authH);
      addNotification('❌ Delivery Cancelled', 'You cancelled the delivery. Chef has been notified.');
      setActiveOrder(null);
      setActionReason('');
      await fetchData();
      setActiveTab('available');
    } catch (e) {
      toast.error('Error cancelling: ' + (e.response?.data?.message || e.message));
    } finally {
      setUpdatingStatus(false);
    }
  };

  // B7/B8: Mark delivery as failed — uses modal
  const markDeliveryFailed = async () => {
    if (!activeOrder || !actionReason.trim()) return;
    setFailModal(false);
    setUpdatingStatus(true);
    try {
      await API.patch(`/api/orders/${activeOrder._id}/status`, {
        status: 'delivery-failed', failureReason: actionReason, riderId
      }, authH);
      addNotification('⚠️ Delivery Failed', 'Order marked as delivery failed. Chef has been notified.');
      setActiveOrder(null);
      setActionReason('');
      await fetchData();
      setActiveTab('available');
    } catch (e) {
      toast.error('Error updating status: ' + (e.response?.data?.message || e.message));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const addNotification = (title, body) => {
    setNotifications(prev => [
      { id: Date.now(), title, body, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 19) // keep last 20
    ]);
  };

  // ─── PROFILE UPDATE ─────────────────────────────────────────────────────────
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await API.put(`/api/users/${riderId}`, {
        name: editProfile.name,
        phone: editProfile.phone,
        vehicle: editProfile.vehicle,
        zone: editProfile.zone,
        city: editProfile.city,
      }, authH);
      const updated = res.data.user;
      const updatedUser = { ...currentUser, ...updated };
      setProfile({ name: updated.name || '', phone: updated.phone || '', vehicle: updated.vehicle || '', zone: updated.zone || '', email: updated.email || '', city: updated.city || 'Lahore' });
      localStorage.setItem('user', JSON.stringify(updatedUser));
      toast.success('Profile updated successfully!');
      if (onUserUpdate) onUserUpdate(updatedUser);
    } catch (e) {
      toast.error('Error: ' + (e.response?.data?.message || e.message));
    } finally {
      setSavingProfile(false);
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
    if (socketRef.current) socketRef.current.disconnect();
    localStorage.clear();
    if (onLogout) onLogout();
    navigate('/login');
  };

  // ─── COMPUTED STATS ──────────────────────────────────────────────────────────
  const todayEarnings = (walletData.transactions || [])
    .filter(tx => tx.type === 'credit' && new Date(tx.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalDeliveries = (walletData.transactions || []).filter(tx => tx.type === 'credit').length;
  const STATUS_STEPS = ['ready-for-pickup', 'picked-up', 'out-for-delivery', 'delivered'];

  const unreadNoti = notifications.length;

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F4F7F2] flex flex-col md:flex-row font-sans text-[#1A2316]">

      {/* B1: Suspended Account Banner — blocks entire UI */}
      {isSuspended && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] p-10 max-w-md w-full text-center shadow-2xl border-4 border-red-500">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={40} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-black uppercase italic text-red-600 mb-3">Account Suspended</h2>
            <p className="text-gray-600 font-bold text-sm leading-relaxed mb-6">
              Your rider account has been suspended by HomePlates administration.
              You cannot accept or complete deliveries until your account is reinstated.
            </p>
            <div className="bg-red-50 p-4 rounded-2xl mb-6">
              <p className="text-[10px] font-black uppercase text-red-700 tracking-wider">
                Contact Support
              </p>
              <p className="text-sm text-red-600 font-bold mt-1">support@homeplates.pk</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full bg-red-500 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* B7: Reject Order Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2">Reject Order?</h3>
            <p className="text-xs text-gray-500 font-bold mb-6">This order will be re-assigned to another available rider. Are you sure?</p>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(false)} className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase">Cancel</button>
              <button onClick={rejectOrder} disabled={updatingStatus} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-red-600 transition-all disabled:opacity-50">
                {updatingStatus ? 'Processing...' : 'Yes, Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B7/B1: Cancel Delivery Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2 text-red-600">Cancel Delivery?</h3>
            <p className="text-xs text-gray-500 font-bold mb-4">The chef and customer will be notified. Please provide a reason.</p>

            {/* B1: Penalty warning when already picked up */}
            {activeOrder && ['picked-up', 'out-for-delivery'].includes(activeOrder.status) && (
              <div className="mb-4 bg-red-50 border-2 border-red-200 rounded-2xl p-4">
                <p className="text-red-700 font-black text-[10px] uppercase tracking-widest mb-1">⚠️ Penalty Warning</p>
                <p className="text-xs text-red-600 font-bold">
                  You have already picked up this order. Cancelling now will result in a financial penalty deducted from your wallet equal to the order amount (PKR {activeOrder.items?.reduce((s, i) => s + i.price * i.quantity, 0)?.toLocaleString() || '0'}).
                </p>
              </div>
            )}

            <textarea
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Reason for cancellation (required)..."
              className="w-full border-2 border-gray-200 rounded-2xl p-3 text-sm font-bold outline-none focus:border-red-400 resize-none h-24 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setCancelModal(false); setActionReason(''); }} className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase">Back</button>
              <button onClick={cancelDelivery} disabled={!actionReason.trim() || updatingStatus} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-red-600 transition-all disabled:opacity-50">
                {updatingStatus ? 'Processing...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B7: Delivery Failed Modal */}
      {failModal && (
        <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[35px] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-lg uppercase italic mb-2">Mark as Failed?</h3>
            <p className="text-xs text-gray-500 font-bold mb-4">The chef and customer will be notified. Please describe what happened.</p>
            <textarea
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Reason for delivery failure (required)..."
              className="w-full border-2 border-gray-200 rounded-2xl p-3 text-sm font-bold outline-none focus:border-orange-400 resize-none h-24 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setFailModal(false); setActionReason(''); }} className="flex-1 py-3 bg-gray-100 rounded-2xl font-black text-[10px] uppercase">Back</button>
              <button onClick={markDeliveryFailed} disabled={!actionReason.trim() || updatingStatus} className="flex-1 py-3 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-orange-600 transition-all disabled:opacity-50">
                {updatingStatus ? 'Processing...' : 'Confirm Failed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          🚨 NEW ORDER ALERT MODAL
      ══════════════════════════════════════════ */}
      {newOrderAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNewOrderAlert(null)} />

          {/* Modal */}
          <div className="relative bg-[#1A2316] rounded-[40px] overflow-hidden shadow-2xl w-full max-w-md border border-[#FBBF24]/20">
            {/* Animated top bar */}
            <div className="h-1.5 bg-gradient-to-r from-[#FBBF24] to-orange-400 animate-pulse" />

            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-[#FBBF24] p-3 rounded-2xl">
                  <Zap size={22} className="text-[#1A2316]" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-400">New Delivery Request</p>
                  <h3 className="text-white font-black text-lg uppercase italic tracking-tight">Order Available!</h3>
                </div>
              </div>
              <button onClick={() => setNewOrderAlert(null)} className="p-2 text-gray-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Chef / Pickup Info */}
            <div className="mx-8 bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#FBBF24] mb-3">📍 Pickup from Chef</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#FBBF24]/20 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {newOrderAlert.chef?.img ? (
                    <img src={`${window.API_URL}${newOrderAlert.chef.img}`} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <ChefHat size={22} className="text-[#FBBF24]" />
                  )}
                </div>
                <div>
                  <p className="text-white font-black text-base">{newOrderAlert.chef?.kitchenName || newOrderAlert.chef?.name || 'Chef'}</p>
                  <p className="text-gray-400 text-xs font-bold mt-0.5">{newOrderAlert.chef?.specialty}</p>
                  {newOrderAlert.chef?.address && (
                    <p className="text-gray-500 text-[10px] font-bold mt-0.5 flex items-center gap-1">
                      <MapPin size={10} /> {newOrderAlert.chef.address}
                    </p>
                  )}
                  {newOrderAlert.chef?.phone && (
                    <a href={`tel:${newOrderAlert.chef.phone}`} className="text-[#FBBF24] text-[10px] font-black mt-0.5 block">
                      📞 {newOrderAlert.chef.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Customer / Delivery Info */}
            <div className="mx-8 bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-3">🏠 Deliver to Customer</p>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-400/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <User size={22} className="text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-base">{newOrderAlert.user?.name || 'Customer'}</p>
                  {newOrderAlert.user?.phone && (
                    <a href={`tel:${newOrderAlert.user.phone}`} className="text-green-400 text-[10px] font-black mt-0.5 block">
                      📞 {newOrderAlert.user.phone}
                    </a>
                  )}
                  <p className="text-gray-400 text-[10px] font-bold mt-1 leading-relaxed">
                    <MapPin size={9} className="inline mr-1 text-[#FBBF24]" />
                    {newOrderAlert.deliveryAddress || 'No address provided'}
                  </p>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="mx-8 bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
              {newOrderAlert.isSubscriptionOrder ? (
                <div className="text-xs text-yellow-400 font-bold uppercase tracking-wider text-center py-2">
                  📅 Daily Subscription Meal Package
                </div>
              ) : (
                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                  {newOrderAlert.items?.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-300 font-bold truncate">
                        {item.dishId?.name || 'Item'} ({item.portion || 'Full'}) × {item.quantity}
                      </span>
                      <span className="text-white font-black flex-shrink-0 ml-2">
                        PKR {item.price * item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delivery Fee + Actions */}
            <div className="px-8 pb-8">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Your Delivery Earning</p>
                  <p className="text-3xl font-black text-[#FBBF24] italic">PKR {newOrderAlert.deliveryCharges || 150}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Order Value</p>
                  <p className="text-lg font-black text-gray-300">PKR {newOrderAlert.totalAmount}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => acceptOrder(newOrderAlert)}
                  disabled={acceptingOrder || !!activeOrder}
                  className="flex-1 bg-[#FBBF24] text-[#1A2316] py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-[#FBBF24]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {acceptingOrder ? 'Accepting...' : activeOrder ? 'Finish Active Order First' : '✓ Accept & Deliver'}
                </button>
                <button
                  onClick={() => ignoreOrder(newOrderAlert)}
                  className="px-6 bg-white/10 text-gray-400 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-white/20 transition-all"
                >
                  Ignore
                </button>
              </div>

              {activeOrder && (
                <p className="text-red-400 text-[9px] font-black uppercase text-center mt-3 tracking-widest">
                  ⚠️ You have an active delivery — complete it first
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════ */}
      <aside className="w-full md:w-72 bg-[#1A2316] text-white p-6 flex flex-col md:sticky md:top-0 md:h-screen shadow-2xl z-50">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="bg-[#FBBF24] p-2.5 rounded-xl text-[#1A2316]"><Bike size={24} /></div>
          <h1 className="text-xl font-black tracking-tighter uppercase text-[#FBBF24]">HomePlates</h1>
        </div>

        <nav className="flex-1 space-y-1">
          {[
            { id: 'overview',   label: 'Rider Station',    icon: LayoutDashboard },
            { id: 'available',  label: 'Available Orders',  icon: Package },
            { id: 'lifecycle',  label: 'Status Console',    icon: Clock },
            { id: 'earnings',   label: 'Earnings',          icon: DollarSign },
            { id: 'profile',    label: 'Rider Profile',     icon: User },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === item.id ? 'bg-[#FBBF24] text-[#1A2316] shadow-xl' : 'text-gray-400 hover:bg-white/5'}`}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === 'available' && availableOrders.length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[8px] w-5 h-5 rounded-full flex items-center justify-center font-black animate-pulse">
                  {availableOrders.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Duty Toggle */}
        <div className="mt-4 p-3 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between px-4 mb-6">
          <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Duty Status</span>
          <button
            onClick={() => {
              if (currentUser.verificationStatus !== 'verified') {
                toast.error("Your account is pending admin verification. You'll be notified once approved.");
                return;
              }
              setIsOnline(!isOnline);
            }}
            className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isOnline ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
          >
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>

        <button onClick={handleLogout} className="flex items-center gap-4 px-5 py-4 text-red-400 font-black uppercase text-[10px] tracking-widest hover:bg-red-500/10 rounded-2xl transition-all">
          <LogOut size={18} /> Logout
        </button>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">

        {/* Header */}
        <header className="flex justify-between items-center mb-10">
          <h2 className="text-3xl font-black italic uppercase tracking-tighter">
            {activeTab.replace('_', ' ')}
          </h2>

          <div className="flex items-center gap-4">
            <button onClick={fetchData} className="p-2.5 bg-white rounded-2xl shadow-sm border border-gray-100" title="Refresh">
              <RefreshCw size={18} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Notifications Bell */}
            <div className="relative">
              <button onClick={() => setShowNoti(!showNoti)} className="relative p-2.5 bg-white rounded-2xl shadow-sm border border-gray-100">
                <Bell size={22} className={unreadNoti > 0 ? 'text-[#1A2316]' : 'text-gray-300'} />
                {unreadNoti > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                    {unreadNoti > 9 ? '9+' : unreadNoti}
                  </span>
                )}
              </button>

              {showNoti && (
                <div className="absolute right-0 mt-4 w-80 bg-white rounded-[28px] shadow-2xl border border-gray-100 overflow-hidden z-[100]">
                  <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-[#1A2316]">
                    <h5 className="text-white font-black uppercase text-[10px] tracking-widest">Alerts ({unreadNoti})</h5>
                    <button onClick={handleClearNotifications} className="text-[#FBBF24] text-[8px] font-black uppercase underline">Clear All</button>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-50">
                    {notifications.length > 0 ? notifications.map(n => (
                      <div key={n.id} className="p-5 hover:bg-gray-50 transition-all">
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

            {/* Avatar */}
            <div className="flex items-center gap-4 bg-white p-2 pr-6 rounded-full shadow-sm border border-gray-100">
              <div className="w-10 h-10 bg-[#1A2316] rounded-full flex items-center justify-center font-black italic text-[#FBBF24] border-2 border-[#FBBF24]">
                {profile.name ? profile.name.charAt(0).toUpperCase() : <User size={16} />}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest">{profile.name || 'Rider'}</p>
            </div>
          </div>
        </header>

        {/* Verification Status Banners */}
        {currentUser.verificationStatus === 'pending' && (
          <div className="mb-8 bg-amber-50 border-2 border-amber-200 rounded-[30px] p-6 text-left flex items-start gap-4 shadow-sm">
            <div className="bg-amber-500 p-2.5 rounded-2xl text-white mt-0.5"><Info size={20} /></div>
            <div>
              <h4 className="font-black uppercase text-xs tracking-wider text-amber-700">Verification Pending</h4>
              <p className="text-xs text-amber-600 font-bold mt-1">
                Your rider profile is currently being reviewed by the HomePlates administration. You will receive an in-app and email alert as soon as your account is verified.
              </p>
            </div>
          </div>
        )}

        {currentUser.verificationStatus === 'rejected' && (
          <div className="mb-8 bg-red-50 border-2 border-red-200 rounded-[30px] p-6 text-left flex items-start gap-4 shadow-sm">
            <div className="bg-red-500 p-2.5 rounded-2xl text-white mt-0.5"><X size={20} /></div>
            <div>
              <h4 className="font-black uppercase text-xs tracking-wider text-red-700">Verification Rejected</h4>
              <p className="text-xs text-red-600 font-bold mt-1">
                Reason: <strong>{currentUser.rejectionReason || 'Document details mismatch'}</strong>.
              </p>
              <p className="text-xs text-red-500 font-bold mt-2">
                Please go to the <strong>Rider Profile</strong> tab to update your operational credentials and re-submit for review.
              </p>
            </div>
          </div>
        )}

        {/* ══ TAB: OVERVIEW ══ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Active order alert banner */}
            {activeOrder && (
              <div
                onClick={() => setActiveTab('lifecycle')}
                className="bg-[#1A2316] p-6 rounded-[30px] text-white flex items-center gap-5 shadow-xl border-l-[8px] border-[#FBBF24] cursor-pointer hover:border-l-[10px] transition-all"
              >
                <div className="bg-[#FBBF24] p-3 rounded-2xl text-[#1A2316] flex-shrink-0 animate-pulse"><Bike size={24} /></div>
                <div className="flex-1">
                  <p className="text-[#FBBF24] font-black uppercase text-xs tracking-widest">⚡ Active Delivery In Progress</p>
                  <p className="text-gray-300 text-sm font-bold mt-1">
                    {activeOrder.chef?.name} → {activeOrder.user?.name} · <span className="uppercase text-[10px] text-[#FBBF24]">{activeOrder.status?.replace(/[-_]/g, ' ')}</span>
                  </p>
                </div>
                <span className="text-[#FBBF24] font-black text-[10px] uppercase">Open →</span>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: "Today's Earnings", val: `PKR ${todayEarnings}`, icon: DollarSign, color: 'text-green-500' },
                { label: 'Active Task',       val: activeOrder ? '1 Active' : 'None',  icon: Clock,      color: 'text-orange-500' },
                { label: 'Wallet Balance',    val: `PKR ${(walletData.totalBalance || 0).toLocaleString()}`, icon: TrendingUp, color: 'text-[#FBBF24]' },
                { label: 'Total Deliveries',  val: totalDeliveries, icon: CheckCircle,  color: 'text-blue-500' }
              ].map((s, i) => (
                <div key={i} className="bg-white p-8 rounded-[35px] shadow-sm border border-gray-100">
                  <s.icon className={`${s.color} mb-4`} size={24} />
                  <p className="text-gray-400 font-black text-[9px] uppercase">{s.label}</p>
                  <h3 className="text-xl font-black italic mt-1">{s.val}</h3>
                </div>
              ))}
            </div>

            {/* Available orders quick view */}
            {isOnline && availableOrders.length > 0 && !activeOrder && (
              <div
                onClick={() => setActiveTab('available')}
                className="bg-orange-50 border-2 border-orange-200 p-6 rounded-[30px] flex items-center justify-between cursor-pointer hover:bg-orange-100 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-orange-500 p-3 rounded-2xl">
                    <Package size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="font-black text-orange-700 uppercase text-sm">
                      {availableOrders.length} Order{availableOrders.length > 1 ? 's' : ''} Ready for Pickup!
                    </p>
                    <p className="text-orange-600 text-xs font-bold mt-0.5">Tap to view and accept</p>
                  </div>
                </div>
                <span className="text-orange-500 font-black text-[10px] uppercase">View →</span>
              </div>
            )}

            {/* No active delivery placeholder */}
            {!activeOrder && (!isOnline || availableOrders.length === 0) && (
              <div className="bg-white p-12 rounded-[40px] border border-gray-100 text-center">
                <Navigation size={40} className="mx-auto text-gray-200 mb-4" />
                {!isOnline ? (
                  <>
                    <p className="text-red-500 font-black uppercase text-[10px] tracking-widest mb-2">Duty Offline</p>
                    <p className="text-gray-400 text-xs font-bold">Switch Duty Status to ONLINE in the sidebar to begin receiving orders.</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-300 font-black uppercase text-[10px] tracking-widest mb-2">Standby — No Orders Yet</p>
                    <p className="text-gray-400 text-xs font-bold">You'll receive a real-time alert as soon as a chef marks food ready.</p>
                    <button onClick={fetchData} className="mt-6 bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all">
                      Refresh Orders
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: AVAILABLE ORDERS ══ */}
        {activeTab === 'available' && (
          <div className="space-y-6">
            {!isOnline ? (
              <div className="bg-white p-16 rounded-[40px] border border-gray-100 flex flex-col items-center text-center text-gray-300">
                <Navigation size={48} className="mb-4 opacity-20 text-red-500" />
                <p className="font-black text-[10px] uppercase text-red-500">You are Offline</p>
                <p className="text-[9px] text-gray-400 mt-2 font-bold max-w-sm">Please toggle your Duty Status to ONLINE to scan and accept order requests.</p>
              </div>
            ) : loading ? (
              <div className="text-center py-20 text-gray-400 font-black uppercase animate-pulse">Scanning for orders...</div>
            ) : availableOrders.length === 0 ? (
              <div className="bg-white p-16 rounded-[40px] border border-gray-100 flex flex-col items-center text-center text-gray-300">
                <Package size={48} className="mb-4 opacity-20" />
                <p className="font-black text-[10px] uppercase">No Available Orders Right Now</p>
                <p className="text-[9px] text-gray-400 mt-2 font-bold">You'll be alerted automatically when a chef marks food ready for pickup.</p>
                <button onClick={fetchData} className="mt-6 text-[#FBBF24] font-black text-[10px] uppercase underline tracking-widest">Refresh</button>
              </div>
            ) : availableOrders.map(order => (
              <div key={order._id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
                {/* Chef info */}
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#FBBF24]/10 rounded-2xl flex items-center justify-center overflow-hidden">
                      {order.chef?.img ? (
                        <img src={`${window.API_URL}${order.chef.img}`} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <ChefHat size={22} className="text-[#FBBF24]" />
                      )}
                    </div>
                    <div>
                      <p className="font-black text-lg text-[#1A2316]">{order.chef?.kitchenName || order.chef?.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{order.chef?.specialty} · {order.chef?.address || 'Kitchen'}</p>
                      {order.chef?.phone && (
                        <a href={`tel:${order.chef.phone}`} className="text-[#FBBF24] text-[10px] font-black mt-0.5 block">
                          📞 {order.chef.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="bg-[#FBBF24] text-[#1A2316] text-[9px] font-black uppercase px-3 py-1 rounded-full">Ready for Pickup</span>
                </div>

                {/* Customer delivery info */}
                <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                  <p className="text-[9px] font-black uppercase text-gray-400 mb-2">🏠 Delivery Destination</p>
                  <div className="flex items-start gap-3">
                    <User size={14} className="text-[#1A2316] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-black text-sm text-[#1A2316]">{order.user?.name}</p>
                      {order.user?.phone && (
                        <a href={`tel:${order.user.phone}`} className="text-[#FBBF24] text-[10px] font-black block mt-0.5">
                          📞 {order.user.phone}
                        </a>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{order.deliveryAddress}</p>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="border-t border-gray-50 pt-4 mb-4 space-y-1.5">
                  {order.isSubscriptionOrder ? (
                    <div className="text-xs text-[#1A2316] font-black uppercase bg-[#FBBF24]/10 p-3 rounded-xl border border-[#FBBF24]/20 text-center">
                      📅 Daily Subscription Meal Package
                    </div>
                  ) : (
                    order.items?.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600 font-bold">{item.dishId?.name || 'Item'} ({item.portion || 'Full'}) × {item.quantity}</span>
                        <span className="font-black text-[#1A2316]">PKR {order.price * item.quantity || item.price * item.quantity}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                  <div>
                    <p className="text-[9px] font-black uppercase text-gray-400">Your Delivery Fee</p>
                    <p className="text-2xl font-black text-emerald-600">PKR {order.deliveryCharges || 150}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => ignoreOrder(order)}
                      className="px-5 py-4 bg-red-50 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-all"
                    >
                      Ignore
                    </button>
                    <button
                      onClick={() => acceptOrder(order)}
                      disabled={!!activeOrder || acceptingOrder}
                      className="bg-[#1A2316] text-[#FBBF24] px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#253220] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {activeOrder ? 'Finish Active Order First' : 'Accept & Deliver'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TAB: STATUS LIFECYCLE ══ */}
        {activeTab === 'lifecycle' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {activeOrder ? (
              <>
                {/* Full Delivery Info Card */}
                <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
                  <h4 className="font-black uppercase text-xs text-gray-400 tracking-widest mb-5">📦 Active Delivery Details</h4>

                  <div className="grid md:grid-cols-2 gap-5">
                    {/* Pickup */}
                    <div className="bg-[#1A2316] p-5 rounded-2xl text-left">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#FBBF24] mb-3">📍 Pickup — Chef</p>
                      <div className="flex items-center gap-3 mb-2">
                        {activeOrder.chef?.img && (
                          <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/20">
                            <img src={`${window.API_URL}${activeOrder.chef.img}`} className="w-full h-full object-cover" alt="" />
                          </div>
                        )}
                        <p className="text-white font-black">{activeOrder.chef?.kitchenName || activeOrder.chef?.name}</p>
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">{activeOrder.chef?.specialty}</p>
                      <p className="text-gray-500 text-xs mt-1">{activeOrder.chef?.address || 'Chef Kitchen'}</p>
                      {activeOrder.chef?.phone && (
                        <a href={`tel:${activeOrder.chef.phone}`} className="text-[#FBBF24] text-[10px] font-black mt-2 flex items-center gap-1">
                          <Phone size={10} /> {activeOrder.chef.phone}
                        </a>
                      )}
                      {chefCoords && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${chefCoords.lat},${chefCoords.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#FBBF24] text-[10px] font-black mt-2 flex items-center gap-1 hover:underline"
                        >
                          🗺️ Navigate to Kitchen
                        </a>
                      )}
                    </div>

                    {/* Dropoff */}
                    <div className="bg-green-50 border border-green-100 p-5 rounded-2xl">
                      <p className="text-[9px] font-black uppercase tracking-widest text-green-600 mb-3">🏠 Dropoff — Customer</p>
                      <p className="text-[#1A2316] font-black">{activeOrder.user?.name}</p>
                      {activeOrder.user?.phone && (
                        <a href={`tel:${activeOrder.user.phone}`} className="text-green-600 text-[10px] font-black mt-1 flex items-center gap-1">
                          <Phone size={10} /> {activeOrder.user.phone}
                        </a>
                      )}
                      <p className="text-gray-500 text-xs mt-1 leading-relaxed">{activeOrder.deliveryAddress}</p>
                      {customerCoords && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${customerCoords.lat},${customerCoords.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 text-[10px] font-black mt-2 flex items-center gap-1 hover:underline"
                        >
                          🗺️ Navigate to Customer
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Order items */}
                  <div className="mt-5 border-t border-gray-50 pt-4">
                    <p className="text-[9px] font-black uppercase text-gray-400 mb-3">Order Items</p>
                    <div className="space-y-1.5">
                      {activeOrder.isSubscriptionOrder ? (
                        <div className="text-xs text-[#1A2316] font-black uppercase bg-[#FBBF24]/10 p-3 rounded-xl border border-[#FBBF24]/20 text-center">
                          📅 Daily Subscription Meal Package
                        </div>
                      ) : (
                        activeOrder.items?.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-600 font-bold">{item.dishId?.name || 'Item'} ({item.portion || 'Full'}) × {item.quantity}</span>
                            <span className="font-black">PKR {item.price * item.quantity}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex justify-between mt-3 pt-3 border-t border-dashed border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase">Your Earning</span>
                      <span className="text-emerald-600 font-black text-lg">PKR {activeOrder.deliveryCharges || 150}</span>
                    </div>
                  </div>
                </div>

                {/* ── Live Route Map ─────────────────────────────────────────── */}
                {(chefCoords || customerCoords) && (
                  <div className="bg-white p-6 rounded-[40px] border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-black uppercase text-xs text-gray-400 tracking-widest mb-1">📍 Delivery Route Map</h4>
                        {riderCoords ? (
                          <p className="text-[10px] text-emerald-600 font-black uppercase flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse inline-block"/>
                            Broadcasting live location to customer
                          </p>
                        ) : (
                          <p className="text-[10px] text-orange-500 font-black uppercase">⏳ Acquiring GPS signal...</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(chefCoords || customerCoords) && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=${riderCoords ? `${riderCoords.lat},${riderCoords.lng}` : ''}&destination=${customerCoords ? `${customerCoords.lat},${customerCoords.lng}` : `${chefCoords?.lat},${chefCoords?.lng}`}&waypoints=${(chefCoords && customerCoords) ? `${chefCoords.lat},${chefCoords.lng}` : ''}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-[#1A2316] text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl border border-[#FBBF24] transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            🗺️ Navigate in Google Maps
                          </a>
                        )}
                        {geoError && (
                          <span className="text-red-500 text-[9px] font-black uppercase bg-red-50 px-3 py-1.5 rounded-xl border border-red-100">GPS Off</span>
                        )}
                      </div>
                    </div>

                    <LiveTrackingMap
                      riderLocation={riderCoords}
                      chefLocation={chefCoords}
                      customerLocation={customerCoords}
                      phase={['picked-up', 'out-for-delivery'].includes(activeOrder?.status) ? 'delivery' : 'pickup'}
                      height="340px"
                      followRider={false}
                    />

                    {geoError && (
                      <p className="text-[9px] text-red-500 font-bold text-center mt-3 bg-red-50 py-2 px-4 rounded-xl">{geoError}</p>
                    )}

                    {/* Quick info badges */}
                    <div className="flex gap-3 mt-4 flex-wrap">
                      {chefCoords && (
                        <div className="flex items-center gap-1.5 bg-[#FEF9ED] border border-[#FBBF24]/20 px-3 py-2 rounded-xl">
                          <span className="w-2.5 h-2.5 bg-[#FBBF24] rounded-full"/>
                          <span className="text-[9px] font-black text-[#1A2316] uppercase tracking-wider">Pickup — Chef Kitchen</span>
                        </div>
                      )}
                      {customerCoords && (
                        <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"/>
                          <span className="text-[9px] font-black text-green-700 uppercase tracking-wider">Dropoff — Customer</span>
                        </div>
                      )}
                      {riderCoords && (
                        <div className="flex items-center gap-1.5 bg-[#1A2316] px-3 py-2 rounded-xl">
                          <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"/>
                          <span className="text-[9px] font-black text-[#FBBF24] uppercase tracking-wider">You (Live)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Status Stepper */}
                <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
                  <div className="text-center pb-5 border-b border-gray-50 mb-6">
                    <h4 className="font-black italic uppercase text-xl">Delivery Progress</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">Advance each phase to update the customer</p>
                  </div>

                  <div className="space-y-4">
                    {[
                      { key: 'ready-for-pickup', num: '01', label: 'Order Accepted — Ready for Pickup',   action: 'Confirm Pickup from Kitchen →' },
                      { key: 'picked-up',        num: '02', label: 'Items Picked Up & In Transit',        action: 'Start Delivery to Customer →' },
                      { key: 'out-for-delivery', num: '03', label: 'Out for Delivery',                     action: '✓ Mark as Delivered' },
                      { key: 'delivered',        num: '04', label: 'Package Safely Handed Over — Complete!', action: '' },
                    ].map((step) => {
                      const currentIdx  = STATUS_STEPS.indexOf(activeOrder.status);
                      const stepIdx     = STATUS_STEPS.indexOf(step.key);
                      const isCurrent   = activeOrder.status === step.key;
                      const isCompleted = stepIdx < currentIdx;

                      return (
                        <div
                          key={step.key}
                          className={`p-6 rounded-3xl border transition-all flex items-center justify-between ${
                            isCurrent   ? 'bg-[#1A2316] text-white border-[#1A2316] shadow-xl scale-[1.02]'
                          : isCompleted ? 'bg-slate-50 border-gray-100 text-gray-400'
                          :               'bg-white border-gray-100 text-slate-700'}`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`font-mono text-sm font-black ${isCurrent ? 'text-[#FBBF24]' : 'text-gray-300'}`}>{step.num}</span>
                            <p className={`text-xs font-black uppercase tracking-wider ${isCurrent ? 'text-white' : ''}`}>{step.label}</p>
                          </div>
                          <div>
                            {isCompleted && <Check size={16} className="text-emerald-500" />}
                            {isCurrent && step.key !== 'delivered' && (
                              <button
                                onClick={() => advanceOrderStatus(step.key)}
                                disabled={updatingStatus}
                                className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl hover:opacity-90 transition-all ${
                                  step.key === 'on_the_way'
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-[#FBBF24] text-[#1A2316]'
                                } disabled:opacity-50`}
                              >
                                {updatingStatus ? 'Updating...' : step.action}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* B7: Reject Order button — modal instead of confirm */}
                  {activeOrder.status === 'ready-for-pickup' && (
                    <div className="mt-6 pt-6 border-t border-gray-50">
                      <button
                        onClick={() => setRejectModal(true)}
                        disabled={updatingStatus}
                        className="w-full bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-all disabled:opacity-50"
                      >
                        ❌ Reject Order — Reassign to Another Rider
                      </button>
                      <p className="text-[9px] text-gray-400 font-bold text-center mt-2">Only use if you cannot fulfill this delivery.</p>
                    </div>
                  )}

                  {/* B7: Cancel Delivery & Delivery Failed — modal instead of prompt */}
                  {(activeOrder.status === 'picked-up' || activeOrder.status === 'out-for-delivery') && (
                    <div className="mt-6 pt-6 border-t border-gray-50 flex gap-3">
                      <button
                        onClick={() => { setActionReason(''); setCancelModal(true); }}
                        disabled={updatingStatus}
                        className="flex-1 bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-all disabled:opacity-50"
                      >
                        Cancel Delivery
                      </button>
                      <button
                        onClick={() => { setActionReason(''); setFailModal(true); }}
                        disabled={updatingStatus}
                        className="flex-1 bg-orange-50 text-orange-600 border-2 border-orange-100 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-100 transition-all disabled:opacity-50"
                      >
                        Delivery Failed
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white p-16 rounded-[50px] border border-gray-100 text-center">
                <Navigation size={40} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-300 font-black uppercase text-[10px] tracking-widest">No Active Delivery</p>
                <button onClick={() => setActiveTab('available')} className="mt-6 text-[#FBBF24] underline font-black text-[10px] uppercase">
                  View Available Orders
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: EARNINGS ══ */}
        {activeTab === 'earnings' && (
          <div className="space-y-8">
            <div className="bg-[#1A2316] p-10 rounded-[50px] text-white flex flex-col md:flex-row justify-between items-start md:items-center border-b-[12px] border-[#FBBF24] shadow-2xl">
              <div>
                <p className="text-[#FBBF24] font-black uppercase text-[10px] tracking-widest italic">Ledger Engine</p>
                <p className="text-xs text-gray-400 max-w-sm mt-2">Delivery fares are automatically processed after each successful delivery.</p>
              </div>
              <div className="mt-6 md:mt-0 text-left md:text-right">
                <p className="text-[11px] font-black uppercase text-gray-500 tracking-[0.2em] italic">Total Wallet Balance</p>
                <h4 className="text-5xl font-black italic text-[#FBBF24] tracking-tighter mt-1">
                  PKR {(walletData.totalBalance || 0).toLocaleString()}
                </h4>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                ["Today's Earnings", `PKR ${todayEarnings}`, 'text-green-400'],
                ['Total Deliveries', totalDeliveries, 'text-[#FBBF24]'],
                ['Pending Balance',  `PKR ${(walletData.pendingBalance || 0).toLocaleString()}`, 'text-yellow-400'],
              ].map(([l, v, c]) => (
                <div key={l} className="bg-white p-7 rounded-[30px] shadow-sm border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-400 mb-2">{l}</p>
                  <h3 className={`text-2xl font-black italic ${c}`}>{v}</h3>
                </div>
              ))}
            </div>

            {/* Request Withdrawal Form */}
            <div className="bg-white p-8 rounded-[35px] shadow-sm border border-gray-100 grid md:grid-cols-2 gap-8 text-left">
              <div>
                <h4 className="font-black uppercase text-sm mb-3">Request Payout</h4>
                <p className="text-xs text-gray-400 font-bold mb-6">Withdraw your hard-earned balance directly. Processing takes up to 24 hours.</p>
                
                <form onSubmit={handleRequestWithdrawal} className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-4 block mb-1">Withdrawal Amount (PKR)</label>
                    <input
                      type="number"
                      required
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                      placeholder="e.g. 1500 (Minimum 1000)"
                      className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={withdrawing || walletData.totalBalance < 1000}
                    className="w-full bg-[#1A2316] text-[#FBBF24] py-4 rounded-2xl font-black uppercase text-[10px] tracking-wider transition-all disabled:opacity-50"
                  >
                    {withdrawing ? 'Submitting...' : 'Request Payout'}
                  </button>
                </form>
              </div>

              <div className="flex flex-col justify-center bg-gray-50 rounded-[30px] p-6 text-center border border-gray-100">
                <DollarSign size={36} className="text-[#FBBF24] mx-auto mb-2" />
                <h5 className="font-black uppercase text-xs text-[#1A2316]">Payout Guidelines</h5>
                <ul className="text-[10px] text-gray-500 font-bold mt-2 space-y-1 text-left list-disc list-inside">
                  <li>Minimum payout limit is Rs. 1,000.</li>
                  <li>Earnings deduct from wallet balance ONLY when paid.</li>
                  <li>You must have zero other active pending/approved requests.</li>
                </ul>
              </div>
            </div>

            {/* Withdrawal Requests Log */}
            <div className="bg-white p-7 rounded-[30px] shadow-sm border border-gray-100 text-left">
              <h4 className="font-black uppercase text-sm mb-5">Withdrawal Requests Log</h4>
              {!withdrawRequests.length ? (
                <p className="text-gray-300 text-center py-10 font-black text-[10px] uppercase">No withdrawal requests submitted yet.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {withdrawRequests.map(req => (
                    <div key={req._id} className="flex justify-between items-center py-4">
                      <div>
                        <p className="font-black">💸 Request for PKR {req.amount}</p>
                        <p className="text-xs text-gray-400">{new Date(req.requestedAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        {req.adminNote && <p className="text-xs text-red-500 mt-1 font-semibold">Admin note: "{req.adminNote}"</p>}
                        {req.proofImage && (
                          <a 
                            href={`${window.API_URL}${req.proofImage}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#FBBF24] text-[10px] font-black underline mt-1.5 block hover:text-amber-600"
                          >
                            🖼️ View Proof of Payment
                          </a>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                        req.status === 'paid' ? 'bg-green-100 text-green-700' :
                        req.status === 'approved' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                        req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{req.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-7 rounded-[30px] shadow-sm border border-gray-100">
              <h4 className="font-black uppercase text-sm mb-5">Transaction History</h4>
              {!walletData.transactions?.length ? (
                <p className="text-gray-300 text-center py-10 font-black text-[10px] uppercase">No transactions yet — complete a delivery to earn!</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {walletData.transactions.map(tx => (
                    <div key={tx._id} className="flex justify-between items-center py-4">
                      <div>
                        <p className="font-black">✅ Delivery Earning</p>
                        <p className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <p className="font-black text-lg text-green-600">+PKR {tx.amount}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TAB: PROFILE ══ */}
        {activeTab === 'profile' && (
          <div className="max-w-4xl bg-white p-10 rounded-[50px] shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row gap-10 items-center mb-10">
              <div className="w-32 h-32 bg-[#1A2316] rounded-[40px] border-4 border-[#FBBF24] overflow-hidden shadow-xl flex items-center justify-center">
                <span className="text-5xl font-black text-[#FBBF24]">{(profile.name || 'R').charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h3 className="text-2xl font-black italic uppercase">{profile.name || 'Rider Name'}</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase mt-3 tracking-[0.3em] italic underline decoration-[#FBBF24] decoration-2 underline-offset-8">
                  Verified Logistics Fleet Agent
                </p>
                <p className="text-sm text-gray-500 mt-2">{profile.email}</p>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate} className="grid md:grid-cols-2 gap-8">
              {[
                { key: 'name',    label: 'Full Name',         placeholder: 'Your full name' },
                { key: 'phone',   label: 'Phone Number',      placeholder: '03XX-XXXXXXX' },
                { key: 'vehicle', label: 'Vehicle Type',      placeholder: 'e.g. Honda CD 70, Motorcycle' },
                { key: 'zone',    label: 'Operational Zone',  placeholder: 'e.g. Johar Town, Lahore' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-5 block">{label}</label>
                  <input
                    type="text"
                    value={editProfile[key] || ''}
                    onChange={(e) => setEditProfile({ ...editProfile, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full bg-gray-50 p-5 rounded-3xl outline-none font-black text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                  />
                </div>
              ))}
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-gray-400 ml-5 block">Assigned City</label>
                <select
                  value={editProfile.city || 'Lahore'}
                  onChange={(e) => setEditProfile({ ...editProfile, city: e.target.value })}
                  className="w-full bg-gray-50 p-5 rounded-3xl outline-none font-black text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                >
                  <option value="Lahore">Lahore</option>
                  <option value="Karachi">Karachi</option>
                  <option value="Islamabad">Islamabad</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="mt-4 w-full bg-[#1A2316] text-[#FBBF24] py-6 rounded-[30px] font-black uppercase tracking-[0.2em] shadow-xl italic text-xs active:scale-95 transition-all disabled:opacity-60"
                >
                  {savingProfile ? 'Saving...' : 'Update Credentials'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};

export default RiderDashboard;