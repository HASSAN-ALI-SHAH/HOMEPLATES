const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const mongoURI = 'mongodb+srv://fatimahilyas420:homeplates123@cluster0.fad8xs6.mongodb.net/HomePlates?retryWrites=true&w=majority';

async function run() {
  console.log(`Connecting to Atlas...`);
  await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
  console.log(`Connected to Atlas successfully!`);

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const SubscriptionPlan = mongoose.model('SubscriptionPlan', new mongoose.Schema({}, { strict: false }));

  const chefs = await User.find({ role: 'chef' });
  console.log('--- CHEFS ---');
  for (const chef of chefs) {
    const plansCount = await SubscriptionPlan.countDocuments({ chefId: chef._id });
    console.log(`ID: ${chef._id} | Name: ${chef.name} | Email: ${chef.email} | Status: ${chef.verificationStatus} | Verified: ${chef.isVerified} | Plans: ${plansCount}`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
