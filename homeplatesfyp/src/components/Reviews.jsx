import React from 'react';
import { Star, Quote } from 'lucide-react';

const Reviews = () => {
  const feedback = [
    { name: "Ahmed R.", city: "Lahore", comment: "The Biryani was fantastic. Tastes exactly like home." },
    { name: "Sana K.", city: "Karachi", comment: "Clean packing and amazing taste. My kids loved it!" },
    { name: "Usman W.", city: "Islamabad", comment: "Proper organic food. Finally something healthy to order." }
  ];

  return (
    <div className="min-h-screen bg-[#F8FAF5] py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-5xl font-serif font-black text-center mb-16">Community Feedback</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {feedback.map((f, i) => (
            <div key={i} className="bg-white p-10 rounded-[40px] shadow-sm relative">
              <Quote className="text-green-50 absolute top-8 right-8" size={50}/>
              <div className="flex text-yellow-400 mb-6"><Star size={16} fill="currentColor"/> <Star size={16} fill="currentColor"/> <Star size={16} fill="currentColor"/> <Star size={16} fill="currentColor"/> <Star size={16} fill="currentColor"/></div>
              <p className="text-gray-600 italic mb-8">"{f.comment}"</p>
              <div>
                <p className="font-bold text-[#2D3A26] uppercase text-xs tracking-widest">{f.name}</p>
                <p className="text-gray-400 text-[10px] font-bold uppercase">{f.city}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reviews;