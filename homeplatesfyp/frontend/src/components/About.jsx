import React from 'react';
import { ShieldCheck, Leaf, Heart, Users } from 'lucide-react';

const About = () => {
  return (
    <div className="min-h-screen bg-white py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-6xl font-serif font-black text-[#2D3A26] mb-8">Our Homemade Philosophy</h1>
        <p className="text-gray-500 text-lg leading-relaxed mb-16">
          HomePlates is more than just a food delivery app. We are a community-driven platform 
          connecting passionate home cooks with food lovers who crave the authentic taste of home.
        </p>
        <div className="grid md:grid-cols-2 gap-8 text-left">
          <div className="p-8 bg-[#F8FAF5] rounded-[40px] flex gap-4">
            <Leaf className="text-green-600 flex-shrink-0" size={32}/>
            <div>
              <h3 className="text-xl font-bold font-serif mb-2">Organic Only</h3>
              <p className="text-gray-400 text-sm">We strictly monitor that our chefs use premium, organic, and fresh ingredients.</p>
            </div>
          </div>
          <div className="p-8 bg-[#F8FAF5] rounded-[40px] flex gap-4">
            <ShieldCheck className="text-green-600 flex-shrink-0" size={32}/>
            <div>
              <h3 className="text-xl font-bold font-serif mb-2">Quality Assurance</h3>
              <p className="text-gray-400 text-sm">Every kitchen is personally inspected for hygiene and safety standards.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;