import React, { useState } from 'react';

export default function RiderDashboard({ 
  riderProfile, 
  currentOrderRequest, 
  activeDelivery, 
  earningsSummary,
  onAcceptOrder,
  onRejectOrder,
  onUpdateStatus,
  onRequestPayout,
  onLogout 
}) {
  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-6 py-4 shadow-sm border-b border-amber-100">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xl tracking-wider">
            HP
          </div>
          <span className="text-xl font-bold text-stone-900">
            HomePlates <span className="text-amber-500 font-medium text-sm border border-amber-400 px-2 py-0.5 rounded-full ml-1">Rider Portal</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="font-semibold text-sm text-stone-900">{riderProfile?.name}</p>
            <p className="text-xs text-stone-500">ID: {riderProfile?.id}</p>
          </div>
          <button 
            onClick={onLogout}
            className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-red-50 hover:text-red-600 transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Profile & Earnings Tracking */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-100">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-amber-700 text-2xl font-bold">
                {riderProfile?.name?.charAt(0)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">{riderProfile?.name}</h2>
                <p className="text-sm text-stone-500">{riderProfile?.phone}</p>
                <span className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${riderProfile?.isOnline ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-600'}`}>
                  {riderProfile?.isOnline ? '● Online & Active' : '○ Offline'}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-2 gap-2 text-xs text-stone-500">
              <div>Vehicle: <span className="font-semibold text-stone-700 block">{riderProfile?.vehicleNumber}</span></div>
              <div>Rating: <span className="font-semibold text-stone-700 block">⭐ {riderProfile?.rating}</span></div>
            </div>
          </div>

          {/* Earning Tracking & Wallet Payout Request */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-100 bg-gradient-to-br from-white to-amber-50/30">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 mb-4">Earning Tracking</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white p-4 rounded-xl border border-stone-100">
                <p className="text-xs text-stone-500">Today's Earnings</p>
                <p className="text-2xl font-black text-stone-900">Rs. {earningsSummary?.todayTotal}</p>
                <p className="text-[10px] text-green-600 mt-1">✓ {earningsSummary?.tripsCompleted} trips completed</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-stone-100">
                <p className="text-xs text-stone-500">Wallet Balance</p>
                <p className="text-2xl font-black text-amber-600">Rs. {earningsSummary?.walletBalance}</p>
              </div>
            </div>
            
            <button
              onClick={onRequestPayout}
              disabled={!earningsSummary?.walletBalance || earningsSummary.walletBalance <= 0}
              className="w-full bg-amber-500 text-stone-950 font-bold py-3 px-4 rounded-xl shadow-md shadow-amber-500/20 hover:bg-amber-400 active:scale-[0.99] transition disabled:opacity-50 disabled:pointer-events-none"
            >
              Wallet Payout Request
            </button>
          </div>
        </div>

        {/* MIDDLE & RIGHT COLUMN: Active Orders & Requests */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Use Case: View Order Request (Incoming/New Request Modal or Alert) */}
          {currentOrderRequest && (
            <div className="rounded-2xl bg-amber-50 p-6 border-2 border-amber-400 animate-pulse-slow">
              <div className="flex justify-between items-start">
                <div>
                  <span className="bg-amber-200 text-amber-900 text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">
                    New Order Request Details
                  </span>
                  <h3 className="text-xl font-black text-stone-900 mt-2">Order #{currentOrderRequest.id}</h3>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-500">Est. Payout</p>
                  <p className="text-lg font-bold text-amber-600">Rs. {currentOrderRequest.payout}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 bg-white p-4 rounded-xl border border-amber-100">
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-amber-600">Pick up Kitchen</p>
                  <p className="text-sm font-semibold text-stone-800">{currentOrderRequest.pickupAddress}</p>
                </div>
                <div className="border-t border-dashed border-stone-200 pt-2">
                  <p className="text-xs uppercase font-bold tracking-wider text-stone-500">Drop off Customer</p>
                  <p className="text-sm font-semibold text-stone-800">{currentOrderRequest.dropoffAddress}</p>
                </div>
              </div>

              {/* Use Case: Accept/Reject Request */}
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={() => onRejectOrder(currentOrderRequest.id)}
                  className="flex-1 bg-stone-200 text-stone-700 font-bold py-3 rounded-xl hover:bg-stone-300 transition"
                >
                  Reject Request
                </button>
                <button
                  onClick={() => onAcceptOrder(currentOrderRequest.id)}
                  className="flex-1 bg-stone-950 text-white font-bold py-3 rounded-xl hover:bg-stone-900 transition shadow-lg shadow-stone-950/20"
                >
                  Accept & Start
                </button>
              </div>
            </div>
          )}

          {/* Active Job Dashboard Panel */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-100">
            <h3 className="text-base font-bold text-stone-900 mb-4">Active Delivery Workflow</h3>
            
            {activeDelivery ? (
              <div className="space-y-6">
                {/* Active Order Details */}
                <div className="flex justify-between items-center bg-stone-50 p-4 rounded-xl">
                  <div>
                    <p className="text-xs text-stone-500">Currently Delivering</p>
                    <p className="font-bold text-stone-900">Order #{activeDelivery.id}</p>
                  </div>
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
                    Status: {activeDelivery.status}
                  </span>
                </div>

                {/* Use Case: Live Navigation (Placeholder Integration Window) */}
                <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                  <div className="bg-stone-800 px-4 py-2 text-xs font-mono text-stone-300 flex justify-between items-center">
                    <span>🗺️ Live Navigation View</span>
                    <span className="text-green-400 animate-ping text-[8px]">●</span>
                  </div>
                  <div className="h-48 flex flex-col items-center justify-center text-center p-4 bg-amber-50/50">
                    <p className="text-sm font-bold text-stone-700">Routing navigation map system...</p>
                    <p className="text-xs text-stone-500 mt-1 max-w-xs">
                      From: {activeDelivery.pickupAddress} <br />
                      To: {activeDelivery.dropoffAddress}
                    </p>
                  </div>
                </div>

                {/* Use Case: Order-Status Update */}
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Update Order Status</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => onUpdateStatus(activeDelivery.id, 'Arrived at Kitchen')}
                      disabled={activeDelivery.status === 'Arrived at Kitchen' || activeDelivery.status === 'Food Picked Up'}
                      className={`py-2.5 px-2 rounded-lg text-xs font-bold border transition ${activeDelivery.status === 'Arrived at Kitchen' ? 'bg-amber-550 border-amber-500 text-amber-700 bg-amber-50' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}
                    >
                      Arrived at Kitchen
                    </button>
                    <button
                      onClick={() => onUpdateStatus(activeDelivery.id, 'Food Picked Up')}
                      disabled={activeDelivery.status === 'Food Picked Up'}
                      className={`py-2.5 px-2 rounded-lg text-xs font-bold border transition ${activeDelivery.status === 'Food Picked Up' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}
                    >
                      Food Picked Up
                    </button>
                    <button
                      onClick={() => onUpdateStatus(activeDelivery.id, 'Delivered')}
                      className="py-2.5 px-2 rounded-lg text-xs font-bold bg-green-600 text-white border border-green-600 hover:bg-green-700 transition shadow-sm"
                    >
                      Mark Delivered
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-stone-200 rounded-xl">
                <p className="text-stone-400 text-sm">No active tasks at the moment.</p>
                <p className="text-xs text-stone-400 mt-1">New incoming requests will pop up automatically above.</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}