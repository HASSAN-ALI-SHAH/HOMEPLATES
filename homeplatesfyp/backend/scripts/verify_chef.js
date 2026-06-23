const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const mongoURI = 'mongodb+srv://fatimahilyas420:homeplates123@cluster0.fad8xs6.mongodb.net/HomePlates?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(mongoURI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  const res = await User.updateOne(
    { email: 'chef_rejected@homeplates.pk' },
    { $set: { verificationStatus: 'verified', isVerified: true } }
  );
  console.log('Update result:', res);
  await mongoose.disconnect();
}

run().catch(console.error);
