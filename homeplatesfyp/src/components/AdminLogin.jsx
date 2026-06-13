import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Mail, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { toast } from '../utils/toast';

const AdminLogin = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if already logged in as admin
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (token && user && user.role === 'admin') {
      navigate('/admin/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await API.post('/api/auth/login', { email, password });
      if (data.user.role !== 'admin') { 
        toast.error('Access Denied: Admin only!'); 
        return; 
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Admin authorized successfully!');
      onLogin(data.user);
      navigate('/admin/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid credentials!');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#1A2316] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[50px] p-10 shadow-2xl">
        <div className="text-center mb-10">
          <div className="bg-[#FBBF24] w-20 h-20 rounded-[30px] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-yellow-500/20"><ShieldCheck size={40} className="text-[#1A2316]"/></div>
          <h2 className="text-3xl font-black italic uppercase text-[#1A2316]">Admin Entry<span className="text-[#FBBF24]">.</span></h2>
          <p className="text-gray-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">Restricted Access Area</p>
          <p className="text-[10px] text-gray-300 mt-3">Use: admin@homeplates.pk / admin123</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative"><Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18}/><input type="email" placeholder="Admin Email" className="w-full pl-14 pr-6 py-5 bg-gray-50 rounded-[25px] outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24] transition-all" onChange={e => setEmail(e.target.value)} required/></div>
          <div className="relative"><Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18}/><input type="password" placeholder="Security Key" className="w-full pl-14 pr-6 py-5 bg-gray-50 rounded-[25px] outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24] transition-all" onChange={e => setPassword(e.target.value)} required/></div>
          <button type="submit" disabled={loading} className="w-full py-5 bg-[#1A2316] text-[#FBBF24] rounded-[25px] font-black uppercase italic tracking-widest shadow-xl flex items-center justify-center gap-3 hover:scale-95 transition-all mt-6 disabled:opacity-50">
            {loading ? 'Authorizing...' : <><span>Authorize Access</span><ArrowRight size={18}/></>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;