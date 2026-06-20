import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, Send, MessageSquare, Quote, User, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from '../utils/toast';

const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `http://localhost:5000${url}`;
};

const PlatformReviewPage = ({ currentUser }) => {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/reviews/platform");
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
      }
    } catch (err) {
      console.error("Error fetching platform reviews:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0 || !comment.trim()) {
      toast.error("Please add a rating and write a comment!");
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("Please login to submit a platform review.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("http://localhost:5000/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          rating,
          comment
        })
      });

      if (res.ok) {
        toast.success("Review submitted! Thank you for your feedback.");
        setComment("");
        setRating(0);
        await fetchReviews();
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to submit review");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error submitting review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFB] pt-24 pb-20 px-6 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER SECTION */}
        <header className="text-center mb-16">
          <motion.p 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="text-[#FBBF24] text-[12px] font-black uppercase tracking-[4px] mb-4"
          >
            Community Feedback
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-5xl font-black text-[#1A2316] uppercase italic tracking-tighter"
          >
            What people say about us<span className="text-[#FBBF24]">.</span>
          </motion.h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* LEFT: REVIEWS FEED (7 Columns) */}
          <div className="lg:col-span-7 space-y-8">
            <h3 className="text-sm font-black text-[#1A2316] uppercase tracking-widest flex items-center gap-3">
              <MessageSquare size={18} className="text-[#FBBF24]"/> Recent Experiences
            </h3>
            
            <div className="space-y-6 text-left">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border border-gray-100 shadow-sm">
                  <Loader2 size={36} className="animate-spin text-[#FBBF24] mb-3" />
                  <p className="font-black uppercase text-[9px] tracking-widest text-gray-400">Fetching reviews...</p>
                </div>
              ) : reviews.length > 0 ? (
                reviews.map((rev, index) => {
                  const reviewerName = rev.userId?.name || rev.name || "Anonymous";
                  const reviewerRole = rev.userId?.role || rev.role || "User";
                  const reviewDate = rev.createdAt ? new Date(rev.createdAt).toLocaleDateString('en-PK', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  }) : (rev.date || "Just now");
                  const reviewerAvatar = getImageUrl(rev.userId?.img || rev.userId?.avatar);

                  return (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      key={rev._id || rev.id || index} 
                      className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm hover:shadow-xl transition-all relative overflow-hidden group"
                    >
                      <Quote className="absolute -right-4 -top-4 w-24 h-24 text-gray-50 group-hover:text-[#FEF9ED] transition-colors" />
                      
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-[#1A2316] text-[#FBBF24] flex items-center justify-center font-bold shadow-lg overflow-hidden uppercase">
                              {reviewerAvatar ? (
                                <img src={reviewerAvatar} className="w-full h-full object-cover" alt="" />
                              ) : (
                                reviewerName.charAt(0)
                              )}
                            </div>
                            <div>
                              <h4 className="font-black text-[#1A2316] text-[12px] uppercase flex items-center gap-2">
                                {reviewerName} {reviewerRole === 'chef' && <CheckCircle size={12} className="text-blue-500"/>}
                              </h4>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">{reviewerRole} • {reviewDate}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} size={12} fill={i < rev.rating ? "#FBBF24" : "none"} stroke={i < rev.rating ? "#FBBF24" : "#D1D5DB"} />
                            ))}
                          </div>
                        </div>
                        <p className="text-gray-600 font-medium italic leading-relaxed text-sm">"{rev.comment}"</p>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="bg-white p-12 rounded-[40px] border border-gray-50 text-center text-gray-300 font-black uppercase text-[10px] tracking-widest">
                  No community feedback posted yet. Be the first one!
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: SUBMIT REVIEW FORM (5 Columns) */}
          <div className="lg:col-span-5">
            <div className="sticky top-32 bg-[#1A2316] rounded-[45px] p-10 shadow-2xl text-left">
              <h3 className="text-2xl font-black text-white uppercase italic mb-2">Write a Review<span className="text-[#FBBF24]">.</span></h3>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[2px] mb-8">Share your HomePlates story</p>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Star Selector */}
                <div className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/10">
                  <span className="text-[10px] font-black text-gray-400 uppercase">Rate your experience</span>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button 
                        key={star} type="button" 
                        onClick={() => setRating(star)} 
                        onMouseEnter={() => setHover(star)} 
                        onMouseLeave={() => setHover(0)}
                        className="transition-transform active:scale-90"
                      >
                        <Star size={28} fill={(hover || rating) >= star ? "#FBBF24" : "none"} stroke={(hover || rating) >= star ? "#FBBF24" : "#444"} strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                </div>

                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What do you think about our platform?"
                  className="w-full h-40 bg-white/5 border border-white/10 rounded-3xl p-6 text-white text-sm focus:outline-none focus:border-[#FBBF24]/50 transition-all resize-none font-medium"
                />

                <motion.button 
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="w-full py-5 bg-[#FBBF24] text-[#1A2316] rounded-2xl font-black text-[11px] uppercase tracking-[4px] shadow-lg flex items-center justify-center gap-3"
                >
                  Post Review <Send size={16}/>
                </motion.button>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PlatformReviewPage;