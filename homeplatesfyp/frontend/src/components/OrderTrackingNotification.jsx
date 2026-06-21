import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Truck, X, ChevronRight, ChefHat, Bike, PackageCheck, Clock } from 'lucide-react';

// Status label + icon map
const STATUS_META = {
  pending:            { label: 'Order Placed',        icon: Clock,        color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
  accepted:           { label: 'Order Confirmed',    icon: Clock,        color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
  preparing:          { label: 'Being Prepared',      icon: ChefHat,      color: 'text-blue-400',   bg: 'bg-blue-400/20' },
  'ready-for-pickup': { label: 'Ready for Pickup',   icon: ChefHat,      color: 'text-blue-400',   bg: 'bg-blue-400/20' },
  'picked-up':        { label: 'Picked Up',           icon: Bike,         color: 'text-purple-400', bg: 'bg-purple-400/20' },
  'out-for-delivery': { label: 'Out for Delivery',   icon: Bike,         color: 'text-purple-400', bg: 'bg-purple-400/20' },
  delivered:          { label: 'Delivered ✓',         icon: PackageCheck, color: 'text-green-400',  bg: 'bg-green-400/20' },
  cancelled:          { label: 'Cancelled',            icon: X,            color: 'text-red-400',    bg: 'bg-red-400/20' },
};

const ACTIVE_STATUSES = ['pending', 'accepted', 'preparing', 'ready-for-pickup', 'picked-up', 'out-for-delivery'];

const OrderTrackingNotification = ({ currentUser }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [activeOrders, setActiveOrders] = useState([]);
  const [dismissed, setDismissed]       = useState({}); // orderId → true
  const [expanded, setExpanded]         = useState(false);
  const [pulse, setPulse]               = useState(false);
  const pollRef = useRef(null);

  // ─── Hide on dashboard pages ──────────────────────────────────────────────
  const isHiddenPage =
    location.pathname.startsWith('/chef') ||
    location.pathname.startsWith('/rider') ||
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/track');

  // ─── Load dismissed from sessionStorage ──────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dismissedOrders') || '{}');
      setDismissed(saved);
    } catch {}
  }, []);

  // ─── Fetch active orders for current user ────────────────────────────────
  const fetchActiveOrders = useCallback(async () => {
    if (!currentUser?._id) return;

    // For admin: query by userId (admin placed orders as user role or admin role)
    // For regular user: same endpoint
    const endpoint = `${window.API_URL}/api/orders/my-orders/${currentUser._id}`;
    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const orders = Array.isArray(data) ? data : [];
      const active = orders.filter(o => ACTIVE_STATUSES.includes(o.status));

      // Trigger pulse animation when new orders appear
      setActiveOrders(prev => {
        if (prev.length < active.length) setPulse(true);
        return active;
      });
    } catch (err) {
      console.error('Order notification poll error:', err);
    }
  }, [currentUser]);

  // ─── Start polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?._id || isHiddenPage) return;

    fetchActiveOrders();
    pollRef.current = setInterval(fetchActiveOrders, 15000);
    return () => clearInterval(pollRef.current);
  }, [currentUser, isHiddenPage, fetchActiveOrders]);

  // ─── Reset pulse ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (pulse) {
      const t = setTimeout(() => setPulse(false), 2000);
      return () => clearTimeout(t);
    }
  }, [pulse]);

  // ─── Dismiss one order ────────────────────────────────────────────────────
  const dismissOrder = (orderId, e) => {
    e.stopPropagation();
    const next = { ...dismissed, [orderId]: true };
    setDismissed(next);
    sessionStorage.setItem('dismissedOrders', JSON.stringify(next));
  };

  // ─── Visible orders (not dismissed) ─────────────────────────────────────
  const visible = activeOrders.filter(o => !dismissed[o._id]);
  if (isHiddenPage || visible.length === 0) return null;

  const primary = visible[0];
  const meta    = STATUS_META[primary.status] || STATUS_META.pending;
  const StatusIcon = meta.icon;

  return (
    <>
      {/* ── BACKDROP for expanded panel ── */}
      {expanded && (
        <div
          className="fixed inset-0 z-[998] bg-black/20 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* ── MAIN NOTIFICATION BAR ── */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] w-full max-w-lg px-4 transition-all duration-300`}>

        {/* Expanded panel: all active orders */}
        {expanded && visible.length > 1 && (
          <div className="mb-3 bg-[#1A2316] rounded-[28px] overflow-hidden shadow-2xl border border-white/10">
            <div className="px-5 py-3 border-b border-white/10">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-400">
                All Active Orders ({visible.length})
              </p>
            </div>
            <div className="divide-y divide-white/5 max-h-56 overflow-y-auto">
              {visible.slice(1).map(order => {
                const m = STATUS_META[order.status] || STATUS_META.pending;
                const Icon = m.icon;
                return (
                  <div
                    key={order._id}
                    onClick={() => navigate(`/track/${order._id}`)}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 cursor-pointer transition-all group"
                  >
                    <div className={`p-2 rounded-xl ${m.bg}`}>
                      <Icon size={14} className={m.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-white truncate">
                        {order.chef?.name || 'Home Chef'}
                      </p>
                      <p className={`text-[10px] font-bold uppercase ${m.color}`}>{m.label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-gray-400 uppercase">
                        Rs. {order.totalAmount}
                      </span>
                      <ChevronRight size={14} className="text-gray-500 group-hover:text-[#FBBF24] transition-colors" />
                      <button
                        onClick={(e) => dismissOrder(order._id, e)}
                        className="p-1 hover:bg-white/10 rounded-lg transition-all"
                      >
                        <X size={12} className="text-gray-500 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary pill */}
        <div
          className={`relative bg-[#1A2316] rounded-[30px] shadow-2xl border border-white/10 overflow-hidden cursor-pointer
            ${pulse ? 'ring-2 ring-[#FBBF24] ring-offset-2 ring-offset-transparent' : ''}
            transition-all duration-300 hover:shadow-[#FBBF24]/10 hover:border-[#FBBF24]/30`}
          onClick={() => navigate(`/track/${primary._id}`)}
        >
          {/* Animated progress bar at top */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-[#FBBF24] to-orange-400 rounded-full transition-all duration-1000"
              style={{
                width: primary.status === 'pending' ? '25%'
                     : primary.status === 'preparing' ? '60%'
                     : primary.status === 'out-for-delivery' ? '85%'
                     : '100%'
              }}
            />
          </div>

          <div className="flex items-center gap-4 px-5 py-4">
            {/* Pulsing icon */}
            <div className={`relative flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${meta.bg}`}>
              <StatusIcon size={18} className={meta.color} />
              {ACTIVE_STATUSES.includes(primary.status) && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#FBBF24] border-2 border-[#1A2316] animate-pulse" />
              )}
            </div>

            {/* Text info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black text-white uppercase tracking-wide truncate">
                  {primary.chef?.name || 'Home Chef'}
                </p>
                <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase flex-shrink-0 ${meta.bg} ${meta.color}`}>
                  {meta.label}
                </span>
              </div>
              <p className="text-[9px] text-gray-400 font-bold mt-0.5">
                Rs. {primary.totalAmount} · Tap to track
                {visible.length > 1 && (
                  <span className="text-[#FBBF24]"> +{visible.length - 1} more</span>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Expand toggle if multiple */}
              {visible.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                  className="p-2 bg-white/10 rounded-xl hover:bg-[#FBBF24]/20 transition-all text-[9px] font-black text-[#FBBF24]"
                >
                  {expanded ? '▲' : '▼'}
                </button>
              )}

              {/* Track button */}
              <div className="flex items-center gap-1 bg-[#FBBF24] text-[#1A2316] px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-wide">
                <Truck size={12} />
                Track
              </div>

              {/* Dismiss */}
              <button
                onClick={e => dismissOrder(primary._id, e)}
                className="p-2 bg-white/5 rounded-xl hover:bg-red-500/20 hover:text-red-400 transition-all text-gray-500"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderTrackingNotification;
