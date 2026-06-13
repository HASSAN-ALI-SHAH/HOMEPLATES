import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GlobalToast = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const { message, type } = e.detail;
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type }]);

      // Auto dismiss after 4.5 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4500);
    };

    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed top-24 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 50, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
              className={`pointer-events-auto p-5 rounded-[24px] shadow-2xl flex items-start gap-4 border backdrop-blur-md transition-all ${
                isSuccess ? 'bg-[#1A2316]/95 border-emerald-500/30 text-white' :
                isError ? 'bg-red-950/95 border-red-500/30 text-white' :
                'bg-gray-900/95 border-gray-700 text-white'
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {isSuccess && <CheckCircle2 size={18} className="text-emerald-400" />}
                {isError && <XCircle size={18} className="text-red-400" />}
                {!isSuccess && !isError && <Info size={18} className="text-[#FBBF24]" />}
              </div>
              <div className="flex-grow min-w-0 text-left">
                <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                  isSuccess ? 'text-emerald-400' :
                  isError ? 'text-red-400' :
                  'text-[#FBBF24]'
                }`}>
                  {t.type} Notification
                </p>
                <p className="text-xs font-bold leading-relaxed text-gray-100">{t.message}</p>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-gray-500 hover:text-white transition-colors flex-shrink-0 mt-0.5"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default GlobalToast;
