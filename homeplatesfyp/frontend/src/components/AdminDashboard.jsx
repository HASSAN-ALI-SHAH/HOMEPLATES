import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, ShoppingBag, CheckCircle, XCircle, 
  BarChart3, ShieldCheck, TrendingUp, ShieldAlert, LogOut, 
  Activity, Gavel, UserMinus, UserCheck, CreditCard,
  Loader2, HelpCircle, MessageSquare, Clock, RefreshCw, Sparkles, Package, Bell, Bike
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { io } from 'socket.io-client';
import { toast } from '../utils/toast';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('analytics');
  const [subTab, setSubTab] = useState('payments'); // 'payments' or 'payouts'
  const [loading, setLoading] = useState(true);
  
  // --- STATE FOR API RECORDS ---
  const [users, setUsers] = useState([]);
  const [pendingChefs, setPendingChefs] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingPayouts, setPendingPayouts] = useState([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [dailyDeliveries, setDailyDeliveries] = useState([]);
  const [riderMonitoring, setRiderMonitoring] = useState([]);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [settings, setSettings] = useState({ platformFee: 10, minimumWithdrawal: 1000, deliveryRadius: 15 });
  const [stats, setStats] = useState({ totalUsers: 0, totalChefs: 0, totalOrders: 0, totalRevenue: 0, activeSubscriptions: 0, revenueByDay: [], topChefs: [] });
  const [notifications, setNotifications] = useState([]);
  const [showNoti, setShowNoti] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [supportFilter, setSupportFilter] = useState('open');
  const [replyText, setReplyText] = useState({});
  const [ticketSubmitting, setTicketSubmitting] = useState({});
  const [riderVerifiedFilter, setRiderVerifiedFilter] = useState('all'); // B2: 'all' | 'verified' | 'unverified'

  const addNotification = useCallback((title, body) => {
    setNotifications(prev => [
      { id: Date.now(), title, body, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 19)
    ]);
  }, []);

  const token = localStorage.getItem('token');
  const authH = { headers: { Authorization: `Bearer ${token}` } };

  // --- FETCH ALL RECORDS FROM BACKEND ---
  const fetchAllAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, pendingChefsRes, usersRes, withdrawalsRes, settingsRes, pendingPaymentsRes, pendingPayoutsRes, activeSubsRes, dailyDeliveriesRes, ridersRes, supportRes] = await Promise.allSettled([
        API.get('/api/admin/analytics', authH),
        API.get('/api/admin/chefs/pending', authH),
        API.get('/api/admin/users', authH),
        API.get('/api/admin/withdrawals?status=pending', authH),
        API.get('/api/admin/settings'),
        API.get('/api/subscriptions/admin/pending', authH),
        API.get('/api/subscriptions/admin/payouts', authH),
        API.get('/api/admin/subscriptions/active', authH),
        API.get('/api/admin/daily-deliveries', authH),
        API.get('/api/admin/riders', authH),
        API.get('/api/admin/support', authH),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (pendingChefsRes.status === 'fulfilled') setPendingChefs(pendingChefsRes.value.data);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data.users || []);
      if (withdrawalsRes.status === 'fulfilled') setWithdrawals(withdrawalsRes.value.data);
      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data);
      if (pendingPaymentsRes.status === 'fulfilled') setPendingPayments(pendingPaymentsRes.value.data);
      if (pendingPayoutsRes.status === 'fulfilled') setPendingPayouts(pendingPayoutsRes.value.data);
      if (activeSubsRes.status === 'fulfilled') setActiveSubscriptions(activeSubsRes.value.data || []);
      if (dailyDeliveriesRes.status === 'fulfilled') setDailyDeliveries(dailyDeliveriesRes.value.data || []);
      if (ridersRes.status === 'fulfilled') setRiderMonitoring(ridersRes.value.data || []);
      if (supportRes.status === 'fulfilled') setTickets(supportRes.value.data || []);
    } catch (e) {
      console.error("Error fetching admin data:", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigate('/admin-entry');
      return;
    }
    fetchAllAdminData();
  }, [fetchAllAdminData, token]);

  // Connect to Socket.io and join admin room
  useEffect(() => {
    if (!token) return;

    const socket = io(window.API_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('join_admin_room');
    });

    socket.on('new_subscription', ({ message }) => {
      addNotification('🔔 Subscription Request', message);
      fetchAllAdminData();
      toast.info(`New Subscription: ${message}`);
    });

    socket.on('new_withdrawal_request', ({ message }) => {
      addNotification('💸 Payout Request', message);
      fetchAllAdminData();
      toast.info(`Payout Request: ${message}`);
    });

    socket.on('delivery_update', ({ message }) => {
      addNotification('🍽️ Daily Delivery', message);
      fetchAllAdminData();
      toast.info(`Daily Delivery: ${message}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, fetchAllAdminData, addNotification]);

  // --- CHEF VERIFICATION ACTIONS ---
  const handleVerifyChef = async (chefId, action) => {
    const reason = action === 'reject' ? (prompt('Reason for rejection:') || 'Documents not verified') : '';
    if (action === 'reject' && !reason) return;

    try {
      await API.put(`/api/admin/verify-chef/${chefId}`, { action, reason }, authH);
      toast.success(`Chef ${action === 'approve' ? 'Approved' : 'Rejected'} successfully!`);
      // Update UI lists
      setPendingChefs(prev => prev.filter(c => c._id !== chefId));
      fetchAllAdminData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification update failed.');
    }
  };

  // --- USER STATUS (BLOCK / ACTIVATE) ---
  const handleToggleUserStatus = async (userId, currentStatus) => {
    const action = currentStatus ? 'suspend' : 'unblock';
    try {
      await API.patch(`/api/admin/users/${userId}/status`, { action }, authH);
      toast.success(`User status updated to ${action === 'unblock' ? 'Active' : 'Suspended'}`);
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, isActive: !currentStatus } : u));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status toggle failed.');
    }
  };

  // --- PROCESS WITHDRAWALS ---
  const handleWithdrawal = async (txId, action) => {
    try {
      await API.patch(`/api/admin/withdrawals/${txId}`, { action }, authH);
      toast.success(`Withdrawal request has been ${action === 'approve' ? 'Approved' : 'Rejected'}.`);
      setWithdrawals(prev => prev.filter(w => w._id !== txId));
      fetchAllAdminData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Withdrawal processing failed.');
    }
  };

  // --- SAVE SYSTEM SETTINGS ---
  const handleSaveSettings = async () => {
    try {
      await API.put('/api/admin/settings', settings, authH);
      toast.success('Platform settings saved successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Settings update failed.');
    }
  };

  // --- VERIFY SUBSCRIPTION PAYMENTS ---
  const handleVerifyPayment = async (subId, action) => {
    try {
      await API.patch(`/api/subscriptions/${subId}/verify-payment`, { action }, authH);
      toast.success(`Subscription payment ${action}d successfully!`);
      fetchAllAdminData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed.');
    }
  };

  // --- APPROVE CHEF SUBSCRIPTION PAYOUTS ---
  const handleApprovePayout = async (subId) => {
    try {
      await API.patch(`/api/subscriptions/${subId}/approve-payout`, {}, authH);
      toast.success('Chef payout approved and wallet credited successfully!');
      fetchAllAdminData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payout approval failed.');
    }
  };

  // --- HELP & SUPPORT ACTIONS ---
  const handleReplyTicket = async (ticketId) => {
    const reply = replyText[ticketId];
    if (!reply || !reply.trim()) {
      toast.error("Reply message cannot be empty!");
      return;
    }
    setTicketSubmitting(prev => ({ ...prev, [ticketId]: true }));
    try {
      await API.patch(`/api/admin/support/${ticketId}`, { adminReply: reply, status: 'resolved' }, authH);
      toast.success("Reply sent & ticket marked as resolved successfully!");
      setReplyText(prev => ({ ...prev, [ticketId]: '' }));
      fetchAllAdminData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit reply.");
    } finally {
      setTicketSubmitting(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleResolveTicket = async (ticketId) => {
    try {
      await API.patch(`/api/admin/support/${ticketId}`, { status: 'resolved' }, authH);
      toast.success("Ticket marked as resolved!");
      fetchAllAdminData();
    } catch (err) {
      toast.error("Failed to update ticket status.");
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    if (!window.confirm("Are you sure you want to delete this ticket?")) return;
    try {
      await API.delete(`/api/admin/support/${ticketId}`, authH);
      toast.success("Ticket deleted successfully!");
      fetchAllAdminData();
    } catch (err) {
      toast.error("Failed to delete ticket.");
    }
  };

  const handleLogout = () => {
    // Only clear auth credentials — do not clear other data like cart
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/admin-entry');
  };

  // Liability calculations
  const totalLiability = withdrawals.reduce((sum, w) => sum + w.amount, 0);

  return (
    <div className="min-h-screen bg-[#FDFDFB] flex flex-col md:flex-row font-sans text-[#1A2316] antialiased">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-full md:w-72 bg-[#1A2316] text-white p-8 flex flex-col md:sticky md:top-0 md:h-screen shadow-2xl z-50 text-left">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-[#FBBF24] p-2.5 rounded-2xl shadow-lg">
            <ShieldCheck className="text-[#1A2316]" size={28} />
          </div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase text-[#FBBF24]">Admin HQ</h1>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { id: 'analytics', label: 'System Analytics', icon: BarChart3 },
            { id: 'approvals', label: 'Chef Approvals', icon: UserCheck },
            { id: 'subscriptions', label: 'Subscription Manager', icon: Package },
            { id: 'governance', label: 'Governance', icon: Gavel },
            { id: 'management', label: 'User Database', icon: Users },
            { id: 'riders', label: 'Rider Monitoring', icon: Bike },
            { id: 'withdrawals', label: 'Withdraw Requests', icon: CreditCard },
            { id: 'support', label: 'Help & Support', icon: HelpCircle },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-6 py-4 rounded-[22px] font-black uppercase text-[10px] tracking-[0.2em] transition-all duration-300 ${activeTab === item.id ? 'bg-[#FBBF24] text-[#1A2316] shadow-xl' : 'hover:bg-white/5 text-gray-400'}`}
            >
              <div className="flex items-center gap-4">
                <item.icon size={18} /> {item.label}
              </div>
              {item.id === 'approvals' && pendingChefs.length > 0 && (
                <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-mono font-bold">{pendingChefs.length}</span>
              )}
              {item.id === 'withdrawals' && withdrawals.length > 0 && (
                <span className="bg-orange-500 text-white text-[9px] px-2 py-0.5 rounded-full font-mono font-bold">{withdrawals.length}</span>
              )}
              {item.id === 'subscriptions' && (pendingPayments.length + pendingPayouts.length) > 0 && (
                <span className="bg-[#FBBF24] text-[#1A2316] text-[9px] px-2 py-0.5 rounded-full font-mono font-bold">{pendingPayments.length + pendingPayouts.length}</span>
              )}
              {item.id === 'support' && tickets.filter(t => t.status === 'open' || t.status === 'in-progress').length > 0 && (
                <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-mono font-bold">
                  {tickets.filter(t => t.status === 'open' || t.status === 'in-progress').length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10 flex flex-col gap-3">
          <button 
            onClick={fetchAllAdminData} 
            className="w-full flex items-center gap-4 px-6 py-3 rounded-[22px] font-black uppercase text-[10px] tracking-[0.2em] text-[#FBBF24] hover:bg-white/5 transition-all"
          >
            <RefreshCw size={16} /> Sync Database
          </button>
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center gap-4 px-6 py-4 rounded-[22px] font-black uppercase text-[10px] tracking-[0.2em] text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
          >
            <LogOut size={18} /> Exit Dashboard
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT WINDOW --- */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto text-left">
        <header className="mb-12 flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-black italic uppercase leading-none tracking-tighter">
              {activeTab.replace('_', ' ')}<span className="text-[#FBBF24]">.</span>
            </h2>
            <p className="text-gray-400 font-bold text-[10px] uppercase tracking-[0.4em] mt-2 italic">
              HomePlates Management Console
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={fetchAllAdminData} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl hover:scale-105 transition-all">
              <RefreshCw size={18} className="text-gray-400" />
            </button>

            {/* Notifications Bell */}
            <div className="relative">
              <button onClick={() => setShowNoti(!showNoti)} className="relative p-3 bg-gray-50 border border-gray-100 rounded-2xl hover:scale-105 transition-all flex items-center justify-center">
                <Bell size={18} className={notifications.length > 0 ? 'text-[#1A2316]' : 'text-gray-400'} />
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
                    <button onClick={() => setNotifications([])} className="text-[#FBBF24] text-[8px] font-black uppercase underline">Clear All</button>
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
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-96">
            <Loader2 className="animate-spin text-[#FBBF24]" size={48} />
            <p className="mt-4 font-black uppercase italic text-xs tracking-widest text-gray-400 animate-pulse">Streaming live records...</p>
          </div>
        ) : (
          <>
            {/* 1. SYSTEM ANALYTICS COMPONENT */}
            {activeTab === 'analytics' && (
              <div className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between h-44">
                    <Activity className="text-green-500" size={24} />
                    <div>
                      <p className="text-3xl font-black italic tracking-tighter">{stats.totalUsers}</p>
                      <p className="text-[9px] font-black uppercase text-gray-400 mt-1">Verified Customers</p>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between h-44">
                    <Users className="text-orange-500" size={24} />
                    <div>
                      <p className="text-3xl font-black italic tracking-tighter">{stats.totalChefs}</p>
                      <p className="text-[9px] font-black uppercase text-gray-400 mt-1">Active Partner Chefs</p>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between h-44">
                    <ShoppingBag className="text-blue-500" size={24} />
                    <div>
                      <p className="text-3xl font-black italic tracking-tighter">{stats.totalOrders}</p>
                      <p className="text-[9px] font-black uppercase text-gray-400 mt-1">Total Placed Orders</p>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between h-44">
                    <TrendingUp className="text-[#FBBF24]" size={24} />
                    <div>
                      <p className="text-3xl font-black italic tracking-tighter">PKR {stats.totalRevenue.toLocaleString()}</p>
                      <p className="text-[9px] font-black uppercase text-gray-400 mt-1">Platform Processing Gross</p>
                    </div>
                  </div>
                </div>

                {/* Top performing chefs */}
                <div className="bg-white p-10 rounded-[45px] border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-black uppercase italic mb-6">Top Earnings Kitchens</h3>
                  {stats.topChefs.length === 0 ? (
                    <p className="text-xs text-gray-400 font-bold uppercase italic text-center py-6">Waiting for completed order streams...</p>
                  ) : (
                    <div className="space-y-4">
                      {stats.topChefs.map((chef, idx) => (
                        <div key={idx} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="font-black text-sm uppercase text-[#1A2316]">{chef.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold">{chef.orders} orders processed</p>
                          </div>
                          <p className="font-black text-[#1A2316]">PKR {chef.earnings.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. CHEF VERIFICATIONS APPROVALS */}
            {activeTab === 'approvals' && (
              <div className="space-y-6">
                <div className="bg-[#1A2316] p-8 rounded-[35px] text-white flex items-center gap-4 border-l-[8px] border-[#FBBF24]">
                  <Sparkles size={24} className="text-[#FBBF24]" />
                  <p className="text-xs font-bold text-gray-300">Pending partner chef verification requests. Approved chefs will receive access to add menu items and start cooking.</p>
                </div>

                {pendingChefs.length === 0 ? (
                  <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300">
                    <UserCheck size={48} className="opacity-20 mb-4" />
                    <p className="font-black uppercase text-xs tracking-widest text-gray-400">All Registration Tasks Cleared!</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    {pendingChefs.map(chef => (
                      <div key={chef._id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex gap-4 items-center mb-6">
                            <div className="w-16 h-16 rounded-[20px] bg-[#1A2316] flex items-center justify-center font-black text-[#FBBF24] text-xl overflow-hidden border-2 border-[#FBBF24]">
                              {chef.img ? (
                                <img src={`${window.API_URL}${chef.img}`} className="w-full h-full object-cover" alt="" />
                              ) : (
                                (chef.name || 'C').charAt(0)
                              )}
                            </div>
                            <div>
                              <h4 className="font-black text-lg text-[#1A2316] uppercase">{chef.kitchenName || chef.name}</h4>
                              <p className="text-xs text-gray-400">Chef: {chef.name}</p>
                              <p className="text-[10px] text-gray-400">{chef.email} · {chef.phone}</p>
                            </div>
                          </div>
                          <div className="space-y-2 py-4 border-t border-b border-gray-50 text-xs text-left">
                            <div className="flex justify-between"><span className="text-gray-400 font-bold">Kitchen Specialty:</span><span className="font-black text-[#1A2316]">{chef.specialty || 'Not specified'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400 font-bold">Document Number:</span><span className="font-mono font-black text-gray-600">{chef.cnic || 'None provided'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400 font-bold">City:</span><span className="font-black text-[#1A2316] uppercase text-xs">{chef.city || 'Lahore'}</span></div>
                            {chef.about && (
                              <div className="flex justify-between flex-col mt-2 pt-2 border-t border-gray-100">
                                <span className="text-gray-400 font-bold">About Kitchen:</span>
                                <p className="text-xs text-gray-500 italic mt-1 font-medium">"{chef.about}"</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                          <button onClick={() => handleVerifyChef(chef._id, 'approve')} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-2xl font-black uppercase text-[10px] tracking-wider transition-all">Approve Chef</button>
                          <button onClick={() => handleVerifyChef(chef._id, 'reject')} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-3 rounded-2xl font-black uppercase text-[10px] tracking-wider transition-all">Reject Request</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. GOVERNANCE SETTINGS */}
            {activeTab === 'governance' && (
              <div className="grid lg:grid-cols-2 gap-8">
                <div className="bg-[#1A2316] p-10 rounded-[55px] text-white flex flex-col justify-between shadow-2xl">
                  <div>
                    <h3 className="text-xl font-black italic uppercase text-[#FBBF24] mb-8">System Parametrics</h3>
                    <div className="space-y-4">
                      <div className="p-6 bg-white/5 rounded-3xl border border-white/10 flex justify-between items-center">
                        <span className="font-black italic text-sm">Platform Fee Percentage</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            value={settings.platformFee} 
                            onChange={(e) => setSettings({...settings, platformFee: Number(e.target.value)})}
                            className="w-16 bg-[#FBBF24] text-[#1A2316] p-2 rounded-xl text-center font-black outline-none" 
                          />
                          <span className="font-black text-[#FBBF24]">%</span>
                        </div>
                      </div>
                      <div className="p-6 bg-white/5 rounded-3xl border border-white/10 flex justify-between items-center">
                        <span className="font-black italic text-sm">Minimum Payout Limit</span>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-400">Rs.</span>
                          <input 
                            type="number" 
                            value={settings.minimumWithdrawal} 
                            onChange={(e) => setSettings({...settings, minimumWithdrawal: Number(e.target.value)})}
                            className="w-24 bg-[#FBBF24] text-[#1A2316] p-2 rounded-xl text-center font-black outline-none" 
                          />
                        </div>
                      </div>
                      <div className="p-6 bg-white/5 rounded-3xl border border-white/10 flex justify-between items-center">
                        <span className="font-black italic text-sm">Delivery Radius Threshold</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            value={settings.deliveryRadius} 
                            onChange={(e) => setSettings({...settings, deliveryRadius: Number(e.target.value)})}
                            className="w-16 bg-[#FBBF24] text-[#1A2316] p-2 rounded-xl text-center font-black outline-none" 
                          />
                          <span className="font-black text-[#FBBF24]">KM</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={handleSaveSettings} className="mt-10 bg-[#FBBF24] text-[#1A2316] py-5 rounded-[25px] font-black uppercase italic tracking-widest hover:scale-95 transition-all">Save Adjustments</button>
                </div>
                <div className="bg-white p-10 rounded-[55px] border border-gray-100 flex flex-col justify-center text-center">
                  <ShieldAlert size={40} className="text-[#FBBF24] mx-auto mb-4" />
                  <h4 className="font-black uppercase text-sm mb-2">Platform Guard Active</h4>
                  <p className="text-xs text-gray-400 font-bold px-6">Modifications made to platform parameters apply immediately to all active order margins and wallet payouts.</p>
                </div>
              </div>
            )}

            {/* 4. USER DATABASE */}
            {activeTab === 'management' && (
              <div className="bg-white rounded-[45px] border border-gray-100 overflow-hidden shadow-sm">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-black italic uppercase">Master Directory</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Configure partner and customer accounts status</p>
                  </div>
                </div>

                {users.length === 0 ? (
                  <div className="text-center py-20">
                    <Users size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-400 text-xs font-black uppercase">No records found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto p-6">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                          <th className="p-4">Name</th>
                          <th className="p-4">Email</th>
                          <th className="p-4">Role</th>
                          <th className="p-4">Verification Status</th>
                          <th className="p-4 text-right">Access Controls</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-bold">
                        {users.map(u => (
                          <tr key={u._id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-all">
                            <td className="p-4 font-black text-[#1A2316]">{u.name}</td>
                            <td className="p-4 font-mono text-xs text-gray-500">{u.email}</td>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase ${
                                u.role === 'chef' ? 'bg-orange-50 text-orange-700' : u.role === 'rider' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'
                              }`}>{u.role}</span>
                            </td>
                            <td className="p-4">
                              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${
                                u.isVerified ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                              }`}>{u.isVerified ? 'Verified' : 'Unverified'}</span>
                            </td>
                            <td className="p-4 text-right">
                              {u.role !== 'admin' && (
                                <button 
                                  onClick={() => handleToggleUserStatus(u._id, u.isActive)}
                                  className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-xl border ${
                                    u.isActive ? 'border-red-200 text-red-600 bg-red-50/20' : 'border-green-200 text-green-600 bg-green-50/20'
                                  }`}
                                >
                                  {u.isActive ? 'Suspend' : 'Activate'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Rider Monitoring tab */}
            {activeTab === 'riders' && (
              <div className="space-y-6">
                <div className="bg-[#1A2316] p-8 rounded-[35px] text-white flex items-center gap-4 border-l-[8px] border-[#FBBF24]">
                  <Bike size={24} className="text-[#FBBF24]" />
                  <p className="text-xs font-bold text-gray-300">Logistics and Delivery Rider Fleet Monitoring. View rider status, city location, active/accepted deliveries, ignored requests, and chronological status change logs.</p>
                </div>

                {/* B2: Verified filter tabs */}
                <div className="flex gap-3">
                  {[{ label: 'All Riders', value: 'all' }, { label: 'Verified', value: 'verified' }, { label: 'Unverified', value: 'unverified' }].map(f => (
                    <button
                      key={f.value}
                      onClick={() => setRiderVerifiedFilter(f.value)}
                      className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                        riderVerifiedFilter === f.value
                          ? 'bg-[#1A2316] text-[#FBBF24] shadow-md'
                          : 'bg-white border border-gray-100 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* B2: Filter by verified status */}
                {riderMonitoring.filter(log => {
                  if (riderVerifiedFilter === 'verified') return log.rider.isVerified === true;
                  if (riderVerifiedFilter === 'unverified') return log.rider.isVerified !== true;
                  return true;
                }).length === 0 ? (
                  <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300">
                    <Bike size={48} className="opacity-20 mb-4" />
                    <p className="font-black uppercase text-xs tracking-widest text-gray-400">
                      {riderMonitoring.length === 0 ? 'No riders registered in system yet' : 'No riders match this filter'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {riderMonitoring.filter(log => {
                    if (riderVerifiedFilter === 'verified') return log.rider.isVerified === true;
                    if (riderVerifiedFilter === 'unverified') return log.rider.isVerified !== true;
                    return true;
                  }).map(log => {
                      const rider = log.rider;
                      return (
                        <div key={rider._id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6 text-left">
                          {/* Top Section: Rider Details */}
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-100 pb-5 gap-4">
                            <div className="flex gap-4 items-center">
                              <div className="w-16 h-16 rounded-[20px] bg-[#1A2316] flex items-center justify-center font-black text-[#FBBF24] text-xl overflow-hidden border-2 border-[#FBBF24]">
                                <Bike size={28} />
                              </div>
                              <div>
                                <h4 className="font-black text-lg text-[#1A2316] uppercase">{rider.name}</h4>
                                <p className="text-xs text-gray-400">Email: {rider.email} · Phone: {rider.phone}</p>
                                <p className="text-[10px] text-gray-400 mt-1">Vehicle: <strong className="text-gray-600">{rider.vehicle}</strong></p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">City: {rider.city}</span>
                              <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${rider.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {rider.isActive ? 'Active Duty' : 'Suspended'}
                              </span>
                            </div>
                          </div>

                          {/* Stats cards for rider */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-[#F4F7F2] p-5 rounded-2xl border border-gray-50">
                              <p className="text-[9px] font-black uppercase text-gray-400">Currently Assigned (Active)</p>
                              <p className="text-2xl font-black text-[#1A2316] mt-1">{log.assignedOrders.length} Order(s)</p>
                            </div>
                            <div className="bg-[#FEF9ED] p-5 rounded-2xl border border-gray-50">
                              <p className="text-[9px] font-black uppercase text-gray-400">Total Accepted Deliveries</p>
                              <p className="text-2xl font-black text-[#1A2316] mt-1">{log.acceptedOrders.length} Order(s)</p>
                            </div>
                            <div className="bg-red-50/50 p-5 rounded-2xl border border-gray-50">
                              <p className="text-[9px] font-black uppercase text-gray-400">Ignored Requests</p>
                              <p className="text-2xl font-black text-red-600 mt-1">{log.ignoredOrders.length} Time(s)</p>
                            </div>
                          </div>

                          {/* Lists: Active Orders, Ignored Requests, History Log */}
                          <div className="space-y-4">
                            {/* Assigned Orders Details */}
                            {log.assignedOrders.length > 0 && (
                              <div className="border border-gray-100 rounded-2xl p-5">
                                <h5 className="font-black text-xs uppercase tracking-widest text-[#1A2316] mb-3">📍 Active Assignment Details</h5>
                                <div className="space-y-2">
                                  {log.assignedOrders.map(order => (
                                    <div key={order._id} className="flex justify-between items-center text-xs py-2 border-b border-gray-50 last:border-0">
                                      <div>
                                        <p className="font-bold text-gray-700">Order ID: #{order._id.toString().slice(-6)} ({order.status})</p>
                                        <p className="text-[10px] text-gray-400">Chef: {order.chef?.kitchenName || order.chef?.name} → Customer: {order.user?.name}</p>
                                      </div>
                                      <span className="font-mono font-bold text-gray-500">PKR {order.totalAmount}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Ignored Requests Details */}
                            {log.ignoredOrders.length > 0 && (
                              <div className="border border-gray-100 rounded-2xl p-5 bg-red-50/10">
                                <h5 className="font-black text-xs uppercase tracking-widest text-red-700 mb-3">🚫 Ignored Orders List</h5>
                                <div className="max-h-36 overflow-y-auto space-y-2">
                                  {log.ignoredOrders.map(order => (
                                    <div key={order._id} className="flex justify-between items-center text-xs py-2 border-b border-gray-50 last:border-0">
                                      <div>
                                        <p className="font-bold text-gray-700">Order ID: #{order._id.toString().slice(-6)}</p>
                                        <p className="text-[10px] text-gray-400">Chef: {order.chef?.kitchenName || order.chef?.name} → Customer: {order.user?.name}</p>
                                      </div>
                                      <span className="text-gray-400 text-[10px]">{new Date(order.updatedAt).toLocaleDateString('en-PK')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Delivery Status History Log */}
                            <div className="border border-gray-100 rounded-2xl p-5 bg-slate-50/50">
                              <h5 className="font-black text-xs uppercase tracking-widest text-slate-700 mb-3">📜 Delivery Status History</h5>
                              {log.historyLog.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No status change history recorded yet.</p>
                              ) : (
                                <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                                  {log.historyLog.map((hist, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-xs py-3">
                                      <div>
                                        <p className="font-bold text-gray-700">Marked Order #{hist.orderId.toString().slice(-6)} as <strong className="text-[#1A2316] uppercase">{hist.status}</strong></p>
                                        <p className="text-[10px] text-gray-400">From Chef {hist.chefName} to Customer {hist.customerName}</p>
                                      </div>
                                      <span className="text-gray-400 text-[10px]">{new Date(hist.timestamp).toLocaleString('en-PK')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 5. WITHDRAW PAYMENTS */}
            {activeTab === 'withdrawals' && (
              <div className="space-y-6">
                <div className="bg-[#1A2316] p-12 rounded-[55px] text-white text-center">
                  <p className="text-[#FBBF24] font-black uppercase text-[10px] tracking-widest mb-2">Outstanding Liability Balance</p>
                  <h3 className="text-6xl font-black italic tracking-tighter">PKR {totalLiability.toLocaleString()}</h3>
                </div>

                {withdrawals.length === 0 ? (
                  <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300 shadow-sm">
                    <CreditCard size={48} className="opacity-20 mb-4" />
                    <p className="font-black uppercase text-xs text-gray-400 tracking-widest">Withdrawal processing log: clear</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {withdrawals.map((req) => (
                      <div key={req._id} className="bg-white p-8 rounded-[35px] border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                        <div>
                          <p className="font-black text-lg uppercase text-[#1A2316]">{req.chefId?.name || 'Chef'}</p>
                          <p className="text-xs text-gray-400">{req.chefId?.email || 'Email'}</p>
                          <div className="mt-3 flex gap-4 text-xs font-bold text-gray-500 uppercase">
                            <span>Method: <strong className="text-[#1A2316]">{req.paymentMethod}</strong></span>
                            <span>Details: <strong className="text-[#1A2316]">{req.accountDetails}</strong></span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-xl font-black mr-4 text-[#1A2316]">PKR {req.amount}</p>
                          <button onClick={() => handleWithdrawal(req._id, 'approve')} className="p-3 bg-green-50 text-green-600 rounded-2xl hover:scale-105 transition-all" title="Approve Request">
                            <CheckCircle size={20} />
                          </button>
                          <button onClick={() => handleWithdrawal(req._id, 'reject')} className="p-3 bg-red-50 text-red-500 rounded-2xl hover:scale-105 transition-all" title="Reject Request">
                            <XCircle size={20} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 6. SUBSCRIPTION MANAGER */}
            {activeTab === 'subscriptions' && (
              <div className="space-y-8">
                {/* Nested tabs */}
                <div className="flex flex-wrap gap-4 border-b border-gray-100 pb-3 mb-6">
                  {[
                    { key: 'payments', label: `Awaiting Approvals (${pendingPayments.length})` },
                    { key: 'payouts', label: `Pending Chef Payouts (${pendingPayouts.length})` },
                    { key: 'active', label: `Active Subscriptions (${activeSubscriptions.length})` },
                    { key: 'deliveries', label: `Daily Deliveries (${dailyDeliveries.length})` }
                  ].map((tab) => (
                    <button 
                      key={tab.key}
                      onClick={() => setSubTab(tab.key)} 
                      className={`pb-2 font-black uppercase text-[10px] tracking-wider transition-all relative ${subTab === tab.key ? 'text-[#1A2316] border-b-2 border-[#FBBF24]' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {subTab === 'payments' && (
                  <div>
                    {pendingPayments.length === 0 ? (
                      <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300">
                        <CheckCircle size={48} className="opacity-20 mb-4" />
                        <p className="font-black uppercase text-xs tracking-widest text-gray-400">All payment verifications cleared!</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-6">
                        {pendingPayments.map(sub => (
                          <div key={sub._id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between text-left">
                            <div>
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <h4 className="font-black text-lg text-[#1A2316] uppercase">{sub.userId?.name || 'Customer'}</h4>
                                  <p className="text-xs text-gray-400">to Chef: <strong className="text-gray-700">{sub.chefId?.name || 'Chef'}</strong></p>
                                  <p className="text-xs text-gray-400">{sub.userId?.email} · {sub.userId?.phone}</p>
                                </div>
                                <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-yellow-100 text-yellow-700">Pending Approval</span>
                              </div>

                              <div className="space-y-2 py-4 border-t border-b border-gray-50 text-sm">
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Meal Type:</span><span className="font-black text-[#1A2316]">{sub.mealType}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Plan Type:</span><span className="font-black text-[#1A2316] uppercase text-xs">{sub.planType}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Selected Days:</span><span className="font-black text-[#1A2316] text-xs">{sub.selectedDays?.join(', ')}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Total Cost:</span><span className="font-black text-[#1A2316]">PKR {sub.totalCost}</span></div>
                              </div>

                              {sub.paymentScreenshot ? (
                                <div className="mt-4">
                                  <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Payment Screenshot (Click to Zoom)</p>
                                  <div 
                                    className="relative h-40 w-full rounded-2xl overflow-hidden border border-gray-100 cursor-zoom-in"
                                    onClick={() => setSelectedScreenshot(`${window.API_URL}${sub.paymentScreenshot}`)}
                                  >
                                    <img 
                                      src={`${window.API_URL}${sub.paymentScreenshot}`} 
                                      alt="Payment Proof" 
                                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-black text-center">
                                  ⚠️ No screenshot uploaded
                                </div>
                              )}
                            </div>

                            <div className="flex gap-3 mt-6">
                              <button 
                                onClick={() => handleVerifyPayment(sub._id, 'approve')} 
                                className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-2xl font-black uppercase text-[10px] tracking-wider transition-all"
                              >
                                Approve Payment
                              </button>
                              <button 
                                onClick={() => handleVerifyPayment(sub._id, 'reject')} 
                                className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-3 rounded-2xl font-black uppercase text-[10px] tracking-wider transition-all"
                              >
                                Reject Payment
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subTab === 'payouts' && (
                  <div>
                    {pendingPayouts.length === 0 ? (
                      <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300">
                        <CheckCircle size={48} className="opacity-20 mb-4" />
                        <p className="font-black uppercase text-xs tracking-widest text-gray-400">All completed subscription payouts cleared!</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-6">
                        {pendingPayouts.map(sub => {
                          const chefPlatformFee = Math.round(sub.totalCost * (settings.platformFee / 100));
                          const payoutAmount = sub.totalCost - chefPlatformFee;

                          return (
                            <div key={sub._id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between text-left">
                              <div>
                                <div className="flex justify-between items-start mb-4">
                                  <div>
                                    <h4 className="font-black text-lg text-[#1A2316] uppercase">{sub.chefId?.name || 'Chef'}</h4>
                                    <p className="text-xs text-gray-400">Chef Wallet Balance: <strong className="text-gray-700">PKR {sub.chefId?.wallet || 0}</strong></p>
                                    <p className="text-xs text-gray-400">Customer: <strong className="text-gray-700">{sub.userId?.name}</strong> ({sub.userId?.phone})</p>
                                  </div>
                                  <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-red-100 text-red-700">Awaiting Payout</span>
                                </div>

                                <div className="space-y-2 py-4 border-t border-b border-gray-50 text-sm">
                                  <div className="flex justify-between"><span className="text-gray-400 font-bold">Total Subscription Cost:</span><span className="font-black text-[#1A2316]">PKR {sub.totalCost}</span></div>
                                  <div className="flex justify-between text-red-600"><span className="font-bold">Platform Fee ({settings.platformFee}%):</span><span className="font-black">- PKR {chefPlatformFee}</span></div>
                                  <div className="flex justify-between text-green-600 border-t border-dashed border-gray-100 pt-2"><span className="font-bold">Net Payout to Chef:</span><span className="font-black text-lg">PKR {payoutAmount}</span></div>
                                </div>
                              </div>

                              <button 
                                onClick={() => handleApprovePayout(sub._id)} 
                                className="w-full bg-[#1A2316] text-[#FBBF24] hover:bg-[#253120] py-4 rounded-2xl font-black uppercase text-[10px] tracking-wider transition-all mt-6"
                              >
                                Approve & Credit Chef Wallet
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {subTab === 'active' && (
                  <div>
                    {activeSubscriptions.length === 0 ? (
                      <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300 animate-fade-in">
                        <Package size={48} className="opacity-20 mb-4" />
                        <p className="font-black uppercase text-xs tracking-widest text-gray-400">No active subscriptions at the moment</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-6 text-left">
                        {activeSubscriptions.map(sub => (
                          <div key={sub._id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <h4 className="font-black text-lg text-[#1A2316] uppercase">{sub.userId?.name || 'Customer'}</h4>
                                  <p className="text-xs text-gray-400">to Chef: <strong className="text-gray-700">{sub.chefId?.name || 'Chef'}</strong></p>
                                  <p className="text-xs text-gray-400">{sub.userId?.email} · {sub.userId?.phone}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                                  sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>{sub.status}</span>
                              </div>

                              <div className="space-y-2 py-4 border-t border-gray-50 text-sm">
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Meal Type:</span><span className="font-black text-[#1A2316]">{sub.mealType}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Plan Type:</span><span className="font-black text-[#1A2316] uppercase text-xs">{sub.planType}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Selected Days:</span><span className="font-black text-[#1A2316] text-xs">{sub.selectedDays?.join(', ')}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Remaining Days:</span><span className="font-black text-orange-600">{sub.remainingDays} Days</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">Start Date:</span><span className="font-black text-[#1A2316] text-xs">{sub.startDate ? new Date(sub.startDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 font-bold">End Date:</span><span className="font-black text-[#1A2316] text-xs">{sub.endDate ? new Date(sub.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span></div>
                                <div className="flex justify-between border-t border-dashed border-gray-100 pt-2"><span className="text-gray-400 font-bold">Total Cost:</span><span className="font-black text-lg text-green-600">PKR {sub.totalCost}</span></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subTab === 'deliveries' && (
                  <div>
                    {dailyDeliveries.length === 0 ? (
                      <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300">
                        <Activity size={48} className="opacity-20 mb-4" />
                        <p className="font-black uppercase text-xs tracking-widest text-gray-400">No daily deliveries recorded yet</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-[40px] border border-gray-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto p-6">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                                <th className="p-4">Customer</th>
                                <th className="p-4">Chef Source</th>
                                <th className="p-4">Rider</th>
                                <th className="p-4">Total Amount</th>
                                <th className="p-4">Delivery Address</th>
                                <th className="p-4">Date / Time</th>
                                <th className="p-4 text-right">Delivery Status</th>
                              </tr>
                            </thead>
                            <tbody className="text-sm font-bold">
                              {dailyDeliveries.map(dev => (
                                <tr key={dev._id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-all">
                                  <td className="p-4">
                                    <p className="font-black text-[#1A2316]">{dev.user?.name || 'Customer'}</p>
                                    <p className="text-[10px] text-gray-400 font-bold">{dev.user?.phone}</p>
                                  </td>
                                  <td className="p-4 text-xs font-black text-gray-600 uppercase">{dev.chef?.name || 'Chef'}</td>
                                  <td className="p-4 text-xs font-black text-gray-600 uppercase">{dev.rider?.name || 'Unassigned'}</td>
                                  <td className="p-4 font-mono text-xs">PKR {dev.totalAmount}</td>
                                  <td className="p-4 text-xs text-gray-500 font-medium max-w-[150px] truncate" title={dev.deliveryAddress}>{dev.deliveryAddress}</td>
                                  <td className="p-4 text-xs text-gray-400">{new Date(dev.orderDate).toLocaleString('en-PK')}</td>
                                  <td className="p-4 text-right">
                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                                      dev.status === 'delivered' ? 'bg-green-100 text-green-700' :
                                      dev.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                                      'bg-yellow-100 text-yellow-700 animate-pulse'
                                    }`}>{dev.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 7. HELP & SUPPORT PANEL */}
            {activeTab === 'support' && (
              <div className="space-y-6">
                <div className="bg-[#1A2316] p-8 rounded-[35px] text-white flex items-center gap-4 border-l-[8px] border-[#FBBF24]">
                  <HelpCircle size={24} className="text-[#FBBF24]" />
                  <p className="text-xs font-bold text-gray-300">
                    Help & Support Query Desk. View user questions, send email responses to users, mark tickets as resolved, or clean up ticket history.
                  </p>
                </div>

                <div className="flex gap-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase self-center mr-2">Filter Status:</span>
                  {[
                    { key: 'open', label: `Open / In Progress (${tickets.filter(t => t.status === 'open' || t.status === 'in-progress').length})` },
                    { key: 'resolved', label: `Resolved (${tickets.filter(t => t.status === 'resolved').length})` },
                    { key: 'all', label: `All Tickets (${tickets.length})` }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setSupportFilter(tab.key)}
                      className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${supportFilter === tab.key ? 'bg-[#1A2316] text-[#FBBF24]' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {tickets.filter(ticket => {
                  if (supportFilter === 'open') return ticket.status === 'open' || ticket.status === 'in-progress';
                  if (supportFilter === 'resolved') return ticket.status === 'resolved';
                  return true;
                }).length === 0 ? (
                  <div className="bg-white p-20 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center text-gray-300">
                    <MessageSquare size={48} className="opacity-20 mb-4" />
                    <p className="font-black uppercase text-xs tracking-widest text-gray-400">No support tickets found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {tickets.filter(ticket => {
                      if (supportFilter === 'open') return ticket.status === 'open' || ticket.status === 'in-progress';
                      if (supportFilter === 'resolved') return ticket.status === 'resolved';
                      return true;
                    }).map(ticket => (
                      <div key={ticket._id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6 text-left">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-50 pb-5 gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-lg text-[#1A2316] uppercase">{ticket.name}</h4>
                              {ticket.userId && (
                                <span className="bg-[#1A2316]/5 text-[#1A2316] text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Registered User</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 font-bold mt-1">Email: {ticket.email}</p>
                            <p className="text-[10px] text-gray-400 font-bold">Inquiry Date: {new Date(ticket.createdAt).toLocaleString('en-PK')}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                              ticket.status === 'open' ? 'bg-red-50 text-red-600' :
                              ticket.status === 'in-progress' ? 'bg-yellow-50 text-yellow-700' :
                              'bg-green-50 text-green-700'
                            }`}>
                              {ticket.status}
                            </span>
                            {ticket.status !== 'resolved' && (
                              <button
                                onClick={() => handleResolveTicket(ticket._id)}
                                className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-green-500 text-white hover:bg-green-600 transition-colors"
                              >
                                Resolve
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteTicket(ticket._id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title="Delete Ticket"
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        </div>

                        <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-50/80">
                          <p className="text-[9px] font-black uppercase text-gray-400 mb-2">Subject: {ticket.subject}</p>
                          <p className="text-sm text-gray-700 font-medium whitespace-pre-wrap">{ticket.message}</p>
                        </div>

                        {ticket.adminReply ? (
                          <div className="bg-[#1A2316]/5 p-5 rounded-2xl border border-[#1A2316]/10">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-[9px] font-black uppercase text-[#1A2316]">Admin Reply</p>
                              {ticket.repliedAt && (
                                <p className="text-[8px] text-gray-400 font-bold">{new Date(ticket.repliedAt).toLocaleString('en-PK')}</p>
                              )}
                            </div>
                            <p className="text-sm text-[#1A2316] font-bold">{ticket.adminReply}</p>
                          </div>
                        ) : (
                          <div className="space-y-3 pt-2">
                            <label className="text-[9px] font-black uppercase text-gray-400 block mb-1">Reply to User (Will email them response and resolve ticket)</label>
                            <textarea
                              rows="3"
                              value={replyText[ticket._id] || ''}
                              onChange={(e) => setReplyText(prev => ({ ...prev, [ticket._id]: e.target.value }))}
                              className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm h-24 resize-none border border-transparent focus:border-[#FBBF24] transition-all"
                              placeholder="Type response to send user..."
                            />
                            <button
                              disabled={ticketSubmitting[ticket._id] || !(replyText[ticket._id] || '').trim()}
                              onClick={() => handleReplyTicket(ticket._id)}
                              className="bg-[#1A2316] text-[#FBBF24] px-6 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#253220] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              {ticketSubmitting[ticket._id] ? 'Sending...' : 'Send Response & Mark Resolved'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox screenshot modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedScreenshot(null)}>
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col justify-center items-center">
            <button onClick={() => setSelectedScreenshot(null)} className="absolute -top-12 right-0 text-white font-black text-xl hover:text-[#FBBF24]">Close ✕</button>
            <img src={selectedScreenshot} className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" alt="Zoomed Screenshot" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;