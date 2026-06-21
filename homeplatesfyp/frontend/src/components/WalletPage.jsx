import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Wallet, TrendingUp, ArrowUpRight, 
  ArrowDownLeft, History, DollarSign, CreditCard,
  Plus, ExternalLink, X, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WalletPage = () => {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // --- Wallet States ---
  const [balance, setBalance] = useState(0);
  const [pendingClearance, setPendingClearance] = useState(0);
  const [withdrawnTotal, setWithdrawnTotal] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Modal & Withdraw States ---
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('EasyPaisa');
  const [accountDetails, setAccountDetails] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchWalletData = async () => {
    if (!currentUser._id) return;
    setLoading(true);
    try {
      const res = await fetch(`${window.API_URL}/api/wallet/${currentUser._id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.totalBalance || 0);
        setPendingClearance(data.pendingBalance || 0);
        setWithdrawnTotal(data.withdrawnTotal || 0);
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Error fetching wallet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, [currentUser._id]);

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const withdrawAmt = Number(amount);
    if (!amount || isNaN(withdrawAmt) || withdrawAmt <= 0) {
      setErrorMsg('Please enter a valid amount.');
      return;
    }
    if (withdrawAmt < 1000) {
      setErrorMsg('Minimum withdrawal amount is Rs. 1000.');
      return;
    }
    if (withdrawAmt > balance) {
      setErrorMsg('Insufficient balance.');
      return;
    }
    if (!accountDetails.trim()) {
      setErrorMsg('Please enter your account details (e.g. Account number / Phone number).');
      return;
    }

    setWithdrawing(true);
    try {
      const res = await fetch(window.API_URL + '/api/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chefId: currentUser._id,
          amount: withdrawAmt,
          paymentMethod,
          accountDetails
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Withdrawal request submitted successfully! Pending approval.');
        setAmount('');
        setAccountDetails('');
        // Refresh wallet statistics
        await fetchWalletData();
        setTimeout(() => {
          setShowModal(false);
          setSuccessMsg('');
        }, 2500);
      } else {
        setErrorMsg(data.message || 'Withdrawal failed. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-[#FBBF24] mx-auto mb-4" />
          <p className="font-black uppercase text-[10px] tracking-widest text-gray-400">Loading Wallet details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-6 lg:p-12 font-sans overflow-x-hidden text-left">
      
      {/* --- TOP BAR --- */}
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-10">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-4 bg-white rounded-[25px] shadow-sm hover:scale-110 transition-all border border-gray-100">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-[#1A2316] uppercase italic tracking-tighter">Chef <span className="text-[#FBBF24]">Wallet.</span></h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[3px]">Manage your earnings</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-8">
        
        {/* --- LEFT: MAIN BALANCE CARD --- */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="bg-[#1A2316] p-10 rounded-[55px] shadow-2xl relative overflow-hidden text-white">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#FBBF24] opacity-10 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
                  <Wallet className="text-[#FBBF24]" size={28} />
                </div>
                <span className="bg-white/5 border border-white/10 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-gray-300">Total Balance</span>
              </div>
              
              <p className="text-[11px] font-black text-[#FBBF24] uppercase tracking-[4px] mb-2">Available for Withdrawal</p>
              <h2 className="text-7xl font-black italic tracking-tighter mb-10">
                <span className="text-2xl not-italic mr-2">Rs.</span>{balance.toLocaleString()}
              </h2>

              <button 
                onClick={() => { setShowModal(true); setErrorMsg(''); setSuccessMsg(''); }}
                className="w-full py-5 bg-[#FBBF24] text-[#1A2316] rounded-[25px] font-black uppercase text-[12px] tracking-[4px] shadow-xl hover:scale-[1.02] transition-all"
              >
                Withdraw Money
              </button>
            </div>
          </div>

          {/* Pending Clearance Card */}
          <div className="bg-white p-8 rounded-[45px] shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center">
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pending Clearance</p>
                <h4 className="text-2xl font-black text-[#1A2316]">Rs. {pendingClearance.toLocaleString()}</h4>
              </div>
            </div>
            <div className="h-10 w-[1px] bg-gray-100"></div>
            <p className="text-[9px] font-bold text-gray-400 w-24 leading-tight italic">Expected in next 24-48 hours</p>
          </div>

          {/* Total Withdrawn Card */}
          <div className="bg-white p-8 rounded-[45px] shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center">
                <ArrowUpRight size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Withdrawn</p>
                <h4 className="text-2xl font-black text-[#1A2316]">Rs. {withdrawnTotal.toLocaleString()}</h4>
              </div>
            </div>
          </div>
        </div>

        {/* --- RIGHT: TRANSACTION HISTORY --- */}
        <div className="col-span-12 lg:col-span-7">
          <div className="bg-white p-10 rounded-[55px] shadow-sm border border-gray-100 h-full">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl font-black text-[#1A2316] uppercase italic tracking-tighter flex items-center gap-3">
                <History className="text-[#FBBF24]" /> Recent Activity
              </h3>
            </div>

            <div className="space-y-6">
              {transactions.slice(0, 10).map((tx) => (
                <div key={tx._id} className="flex items-center justify-between p-6 bg-gray-50 rounded-[35px] hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-gray-100">
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      tx.type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {tx.type === 'credit' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div>
                      <h4 className="font-black text-[#1A2316] text-sm uppercase tracking-tight">
                        {tx.type === 'credit' ? 'Order Earning' : 'Withdrawal Request'}
                      </h4>
                      <p className="text-[10px] font-bold text-gray-400">
                        {new Date(tx.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {tx.paymentMethod && (
                        <p className="text-[9px] text-gray-400 font-medium">via {tx.paymentMethod}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <h5 className={`font-black text-lg ${
                      tx.type === 'credit' ? 'text-green-600' : 'text-[#1A2316]'
                    }`}>
                      {tx.type === 'credit' ? '+' : '-'} Rs. {tx.amount.toLocaleString()}
                    </h5>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${
                      tx.status === 'pending' ? 'text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full' :
                      tx.status === 'approved' ? 'text-green-600 bg-green-50 px-2 py-0.5 rounded-full' :
                      'text-red-600 bg-red-50 px-2 py-0.5 rounded-full'
                    }`}>{tx.status}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty State */}
            {transactions.length === 0 && (
              <div className="py-20 text-center">
                 <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <DollarSign size={30} className="text-gray-200" />
                 </div>
                 <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">No transactions yet</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* --- STATS SECTION --- */}
      <footer className="max-w-7xl mx-auto mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex items-center gap-6">
              <div className="bg-[#1A2316] text-[#FBBF24] p-4 rounded-2xl"><TrendingUp size={24}/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Completed Deliveries / Sales</p>
                <h4 className="text-xl font-black text-[#1A2316]">
                  {transactions.filter(tx => tx.type === 'credit').length}
                </h4>
              </div>
          </div>
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex items-center gap-6">
              <div className="bg-[#1A2316] text-[#FBBF24] p-4 rounded-2xl"><Plus size={24}/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Withdrawal Count</p>
                <h4 className="text-xl font-black text-[#1A2316]">
                  {transactions.filter(tx => tx.type === 'debit').length}
                </h4>
              </div>
          </div>
      </footer>

      {/* --- WITHDRAW MODAL --- */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl p-10 z-[1001] animate-in zoom-in duration-300">
            <button 
              onClick={() => setShowModal(false)} 
              className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
            >
              <X size={20} />
            </button>
            
            <h3 className="text-2xl font-black text-[#1A2316] uppercase italic mb-2">Request Withdrawal<span className="text-[#FBBF24]">.</span></h3>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[2px] mb-6">Minimum Rs. 1000 withdrawal</p>

            <form onSubmit={handleWithdrawSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-gray-400 ml-4">Withdrawal Amount (PKR)</label>
                <input 
                  type="number"
                  placeholder="e.g. 5000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-50 p-5 rounded-3xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                  min="1000"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-gray-400 ml-4">Payment Method</label>
                <select 
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
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
                  value={accountDetails}
                  onChange={(e) => setAccountDetails(e.target.value)}
                  className="w-full bg-gray-50 p-5 rounded-3xl outline-none font-bold text-sm border border-transparent focus:border-[#FBBF24] transition-all"
                />
              </div>

              {errorMsg && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold">
                  ⚠️ {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="bg-green-50 text-green-600 p-4 rounded-2xl text-xs font-bold">
                  🎉 {successMsg}
                </div>
              )}

              <button 
                type="submit"
                disabled={withdrawing}
                className="w-full py-5 bg-[#1A2316] text-[#FBBF24] rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {withdrawing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Processing...
                  </>
                ) : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletPage;