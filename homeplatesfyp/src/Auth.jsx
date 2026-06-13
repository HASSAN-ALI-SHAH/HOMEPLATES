import React, { useState, useEffect } from 'react';
import { ChefHat, Eye, EyeOff, ArrowRight, Bike, KeyRound, RefreshCw, X, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from './api';
import { toast } from './utils/toast';

const Auth = ({ onLogin, isModal = false, currentUser }) => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState('user');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState('auth'); // 'auth' or 'otp'
  const [otpCode, setOtpCode] = useState('');
  
  // Custom Alert state
  const [alertInfo, setAlertInfo] = useState(null); // { type: 'success' | 'error' | 'dev', msg: '', devOtp?: '' }

  useEffect(() => {
    if (isModal) return;
    if (currentUser) {
      if (currentUser.role === 'chef') {
        navigate('/chef/dashboard');
      } else if (currentUser.role === 'rider') {
        navigate('/rider/dashboard');
      } else if (currentUser.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/explore');
      }
    }
  }, [isModal, navigate, currentUser]);

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', cnic: '', city: '', password: '', confirmPassword: ''
  });

  const showAlert = (msg, type = 'success', devOtp = '') => {
    if (type === 'dev') {
      setAlertInfo({ msg, type, devOtp });
    } else {
      if (type === 'success') {
        toast.success(msg);
      } else if (type === 'error') {
        toast.error(msg);
      }
    }
  };

  const handleInput = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setFormData(prev => ({ ...prev, cnic: '', phone: '' }));
  };

  // --- SUBMIT SIGNUP/LOGIN FORM ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAlertInfo(null);

    try {
      if (isLogin) {
        // LOGIN
        const response = await API.post('/api/auth/login', { 
          email: formData.email, 
          password: formData.password 
        });
        
        const { token, user: loggedUser } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(loggedUser));
        
        showAlert("Login Successful! Welcome to HomePlates.", "success");
        setTimeout(() => {
          onLogin(loggedUser);
        }, 1500);
      } else {
        // SIGNUP
        if (formData.password !== formData.confirmPassword) {
          showAlert("Passwords do not match!", "error");
          setIsSubmitting(false);
          return;
        }

        const res = await API.post('/api/auth/signup', {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          cnic: formData.cnic,
          city: formData.city,
          password: formData.password,
          role
        });

        if (res.data.devOtp) {
          showAlert("Account created! Verify your email using the development code below.", "dev", res.data.devOtp);
        } else {
          showAlert("Verification OTP has been sent to your email!", "success");
        }
        setStep('otp'); // Switch to OTP step
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Something went wrong!";
      
      // If backend says email is not verified, redirect to OTP verification screen
      if (err.response?.data?.requiresOtp) {
        if (err.response.data.devOtp) {
          showAlert("Verification required. Use the OTP code shown below.", "dev", err.response.data.devOtp);
        } else {
          showAlert(errorMsg, "error");
        }
        setStep('otp');
      } else {
        showAlert(errorMsg, "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- VERIFY OTP ---
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await API.post('/api/auth/verify-otp', {
        email: formData.email,
        otp: otpCode
      });

      const { token, user: loggedUser } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(loggedUser));

      showAlert("Email verified and login successful!", "success");
      setTimeout(() => {
        onLogin(loggedUser);
      }, 1500);
    } catch (err) {
      showAlert(err.response?.data?.message || "Invalid OTP code!", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- RESEND OTP ---
  const handleResendOtp = async () => {
    try {
      const res = await API.post('/api/auth/resend-otp', { email: formData.email });
      if (res.data.devOtp) {
        showAlert("New OTP generated for testing.", "dev", res.data.devOtp);
      } else {
        showAlert("A new OTP code has been sent to your email!", "success");
      }
    } catch (err) {
      showAlert(err.response?.data?.message || "Failed to resend OTP.", "error");
    }
  };

  const RoleButtons = () => (
    <div className="flex bg-gray-100 p-1 rounded-xl w-fit my-4">
      {['user', 'chef', 'rider'].map((r) => (
        <button key={r} type="button" onClick={() => handleRoleChange(r)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase ${role === r ? 'bg-white text-[#1A2316] shadow-sm' : 'text-gray-400'}`}>
          {r}
        </button>
      ))}
    </div>
  );

  // --- OTP VERIFICATION CARD ---
  const OtpForm = () => (
    <div className="w-full flex flex-col justify-center">
      <h1 className="text-3xl font-black text-[#1A2316] italic uppercase mb-2">Verify Email<span className="text-[#FBBF24]">.</span></h1>
      <p className="text-xs text-gray-500 font-bold mb-6">Enter the 6-digit OTP code sent to <span className="text-[#1A2316] underline">{formData.email}</span></p>
      
      <form onSubmit={handleVerifyOtp} className="space-y-4">
        <div className="relative">
          <input 
            type="text" 
            placeholder="Enter 6-digit OTP" 
            maxLength="6"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            className="w-full px-5 py-4 bg-gray-50 rounded-2xl outline-none font-bold text-base tracking-[0.3em] text-center border-2 border-transparent focus:border-[#FBBF24]/20 transition-all shadow-sm" 
            required 
          />
          <KeyRound size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        <button type="submit" disabled={isSubmitting} className="w-full bg-[#1A2316] text-[#FBBF24] py-5 rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-[#253120] transition-all flex items-center justify-center gap-3">
          {isSubmitting ? "Verifying..." : <>Verify OTP <ArrowRight size={18}/></>}
        </button>

        <div className="flex justify-between items-center pt-2">
          <button type="button" onClick={handleResendOtp} className="text-xs font-black uppercase text-gray-400 hover:text-[#1A2316] transition-all flex items-center gap-1">
            <RefreshCw size={12}/> Resend Code
          </button>
          <button type="button" onClick={() => { setStep('auth'); setAlertInfo(null); }} className="text-xs font-black uppercase text-gray-400 hover:text-[#1A2316] hover:underline transition-all">
            Back to Auth
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className={`${isModal ? 'h-auto' : 'h-screen'} w-full bg-[#F3F4F6] flex items-center justify-center overflow-hidden font-sans p-2 relative`}>
      
      {/* PROFESSIONAL POPUP NOTIFICATION MODAL */}
      {alertInfo && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[3000] w-full max-w-md p-5 bg-white rounded-[32px] shadow-2xl border border-gray-100/80 animate-in slide-in duration-300">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl ${alertInfo.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
              <AlertCircle size={20} />
            </div>
            <div className="flex-1">
              <h4 className="font-black uppercase text-[10px] tracking-widest text-[#1A2316] mb-1">
                {alertInfo.type === 'error' ? 'Security Alert' : alertInfo.type === 'dev' ? 'Developer Box' : 'System Message'}
              </h4>
              <p className="text-xs text-gray-500 font-bold">{alertInfo.msg}</p>
              
              {alertInfo.devOtp && (
                <div className="mt-3 p-4 bg-yellow-50/70 border border-yellow-200/50 rounded-2xl text-center">
                  <span className="text-[8px] font-black uppercase text-yellow-700 tracking-wider block mb-1">Verification OTP Code</span>
                  <span className="text-3xl font-black text-[#1A2316] tracking-[0.25em]">{alertInfo.devOtp}</span>
                  <span className="text-[8px] text-gray-400 font-semibold block mt-2">Enter this code to complete validation</span>
                </div>
              )}
            </div>
            <button onClick={() => setAlertInfo(null)} className="p-1.5 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-black">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className={`w-full max-w-5xl ${isModal ? 'h-[80vh]' : 'h-[85vh]'} bg-white rounded-[50px] shadow-2xl flex relative overflow-hidden`}>
        
        {/* --- MOVING BLACK PANEL --- */}
        <div className={`absolute top-0 w-1/2 h-full bg-[#1A2316] z-50 transition-all duration-[800ms] ease-[cubic-bezier(0.7,0,0.2,1)] flex flex-col justify-center items-center text-white p-12 text-center ${isLogin ? 'left-0 rounded-r-[80px]' : 'left-1/2 rounded-l-[80px]'}`}>
          <div className="relative z-10">
            <h2 className="text-4xl font-black italic uppercase mb-4 leading-tight">
              {step === 'otp' ? "Verify \nEmail!" : isLogin ? "Hello \nFriend!" : "Welcome \nBack!"}
            </h2>
            {step !== 'otp' && (
              <button type="button" onClick={() => { setIsLogin(!isLogin); handleRoleChange('user'); setAlertInfo(null); }} className="px-12 py-4 border-2 border-[#FBBF24] text-[#FBBF24] rounded-full font-black uppercase text-[10px] tracking-widest hover:bg-[#FBBF24] hover:text-[#1A2316] transition-all">
                {isLogin ? "Create Account" : "Login Instead"}
              </button>
            )}
          </div>
          {role === 'rider' ? <Bike size={300} className="absolute opacity-[0.03] -bottom-10 -right-10 rotate-12 text-[#FBBF24]" /> : <ChefHat size={300} className="absolute opacity-[0.03] -bottom-10 -right-10 rotate-12 text-[#FBBF24]" />}
        </div>

        {/* --- LEFT HAND SIDE PANEL --- */}
        <div className={`w-1/2 h-full flex flex-col justify-center px-12 lg:px-20 transition-all duration-700 ${!isLogin ? 'opacity-100 translate-x-0 z-20' : 'opacity-0 translate-x-[20%] z-10'}`}>
          {step === 'otp' ? (
            !isLogin && <OtpForm />
          ) : (
            <>
              <h1 className="text-4xl font-black text-[#1A2316] italic uppercase mb-2">Signup<span className="text-[#FBBF24]">.</span></h1>
              <RoleButtons />
              <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto max-h-[50vh] pr-2 custom-scrollbar">
                <input type="text" name="name" placeholder="Full Name" onChange={handleInput} className="w-full px-5 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20" required={!isLogin} />
                <input type="email" name="email" placeholder="Email" onChange={handleInput} className="w-full px-5 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20" required />
                <input type="text" name="phone" placeholder="Mobile Number" onChange={handleInput} className="w-full px-5 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20" required={!isLogin} />
                {(role === 'chef' || role === 'rider') && <input type="text" name="cnic" placeholder="CNIC/License" onChange={handleInput} className="w-full px-5 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20" required />}
                {role === 'chef' && (
                  <select 
                    name="city" 
                    onChange={handleInput} 
                    className="w-full px-5 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20" 
                    required
                  >
                    <option value="">Select City *</option>
                    <option value="Lahore">Lahore</option>
                    <option value="Karachi">Karachi</option>
                    <option value="Islamabad">Islamabad</option>
                  </select>
                )}
                
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} name="password" placeholder="Password" onChange={handleInput} className="w-full px-5 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                </div>
                <div className="relative">
                  <input type={showConfirmPassword ? "text" : "password"} name="confirmPassword" placeholder="Confirm Password" onChange={handleInput} className="w-full px-5 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20" required={!isLogin} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">{showConfirmPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full bg-[#1A2316] text-[#FBBF24] py-4 rounded-xl font-black uppercase italic tracking-widest mt-4">
                  {isSubmitting ? "Creating..." : "Create Account"}
                </button>
              </form>
            </>
          )}
        </div>

        {/* --- RIGHT HAND SIDE PANEL --- */}
        <div className={`w-1/2 h-full flex flex-col justify-center px-12 lg:px-20 transition-all duration-700 ml-auto ${isLogin ? 'opacity-100 translate-x-0 z-20' : 'opacity-0 translate-x-[20%] z-10'}`}>
          {step === 'otp' ? (
            isLogin && <OtpForm />
          ) : (
            <>
              <h1 className="text-4xl font-black text-[#1A2316] italic uppercase mb-2">Login<span className="text-[#FBBF24]">.</span></h1>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="email" name="email" placeholder="Email Address" onChange={handleInput} className="w-full px-5 py-4 bg-gray-50 rounded-2xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20 transition-all shadow-sm" required />
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} name="password" placeholder="Password" onChange={handleInput} className="w-full px-5 py-4 bg-gray-50 rounded-2xl outline-none font-bold text-sm border-2 border-transparent focus:border-[#FBBF24]/20 transition-all shadow-sm" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full bg-[#1A2316] text-[#FBBF24] py-5 rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-[#253120] transition-all flex items-center justify-center gap-3">
                  {isSubmitting ? "Authenticating..." : <>Sign In <ArrowRight size={18}/></>}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #FBBF24; border-radius: 10px; }
        @keyframes slide-in {
          from { transform: translate(-50%, -30px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        .animate-in { animation: 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default Auth;