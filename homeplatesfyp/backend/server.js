const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const http = require('http');
const socketHelper = require('./socket');
require('dotenv').config();

const app = express();

// Middlewares
app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001"
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith("http://localhost:")) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/HomePlates')
  .then(() => {
    console.log("✅ MongoDB Connected Successfully!");
    
    // Auto-migrate: populate city on Menu items from chefId User if missing
    const runMigration = async () => {
      try {
        const Menu = require('./models/Menu');
        const User = require('./models/User');
        const menusWithoutCity = await Menu.find({ city: { $exists: false } });
        if (menusWithoutCity.length > 0) {
          console.log(`🔄 Migrating ${menusWithoutCity.length} menu items to add city...`);
          for (let menu of menusWithoutCity) {
            const chef = await User.findById(menu.chefId);
            if (chef && chef.city) {
              menu.city = chef.city;
              await menu.save();
            }
          }
          console.log("✅ Menu migration completed!");
        }
      } catch (err) {
        console.error("❌ Error migrating menu cities:", err);
      }
    };
    runMigration();
  })
  .catch((err) => console.error("❌ Database connection error:", err));

// --- CREATE HTTP SERVER & INITIALIZE SOCKET.IO ---
const server = http.createServer(app);
const io = socketHelper.init(server);

// --- SUBSCRIPTION CRON JOB ---
const Subscription = require("./models/Subscription");
const Order = require("./models/Order");
const User = require("./models/User");
const sendEmail = require("./utils/mailer");

cron.schedule('0 0 * * *', async () => {
    console.log("🔄 Running Daily Subscription Cron Job (Midnight PKT)...");
    try {
        const today = new Date();
        const dayName = today.toLocaleDateString("en-US", { weekday: "long" }); // e.g. "Monday"
        const activeSubs = await Subscription.find({ status: "active", isPaused: false });

        for (const sub of activeSubs) {
            let skipDecrement = false;
            if (sub.selectedDays.includes(dayName)) {
                if (!sub.pausedDays?.includes(dayName)) {
                    // Calculate daily share cost
                    const dailyCost = sub.totalCost / sub.selectedDays.length;

                    // Auto-create order ticket
                    const newOrder = new Order({
                        user: sub.userId,
                        chef: sub.chefId,
                        items: [], // Subscription ticket items
                        totalAmount: dailyCost,
                        isSubscriptionOrder: true,
                        subscriptionId: sub._id,
                        status: "pending"
                    });
                    await newOrder.save();

                    // Send email notification to customer
                    try {
                        const customer = await User.findById(sub.userId);
                        if (customer && customer.email) {
                            const emailHtml = `
                              <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                                <h2 style="color: #1A2316;">Daily Subscription Meal Dispatched!</h2>
                                <p>Hello ${customer.name},</p>
                                <p>Your daily subscription meal ticket (Order ID: <strong>${newOrder._id}</strong>) has been generated for today.</p>
                                <p>Our chef is preparing your fresh meal!</p>
                                <p>Regards,<br/>HomePlates Team</p>
                              </div>
                            `;
                            await sendEmail(customer.email, `Daily Subscription Order Generated — #${newOrder._id}`, emailHtml);
                        }
                    } catch (emailErr) {
                        console.error("Failed to send daily subscription email to customer:", emailErr.message);
                    }

                    // Emit Socket Notification to Chef
                    io.to(`chef_${sub.chefId}`).emit("new_order_notification", {
                        orderId: newOrder._id,
                        status: "pending",
                        message: "New daily subscription meal ticket generated!"
                    });
                } else {
                    // Today is a scheduled delivery day but is paused by user
                    skipDecrement = true;
                    // Extend subscription end date by 1 day
                    if (sub.endDate) {
                        sub.endDate = new Date(sub.endDate.getTime() + 24 * 60 * 60 * 1000);
                    }
                }
            }

            if (!skipDecrement) {
                // Decrement remaining days & expire if needed
                sub.remainingDays -= 1;
                if (sub.remainingDays <= 0) {
                    sub.status = "expired";
                    sub.payoutStatus = "pending"; // Chef can get paid now after admin verification
                }
            }
            await sub.save();
        }

        // Send renewal notification 48hrs before expiry (remainingDays = 2)
        const expiringSubs = await Subscription.find({ status: "active", remainingDays: 2 })
            .populate('userId', 'name email');
        
        for (const sub of expiringSubs) {
            if (sub.userId && sub.userId.email) {
                const emailHtml = `
                    <h2>Meal Plan Expiring Soon</h2>
                    <p>Dear ${sub.userId.name},</p>
                    <p>Your subscription is expiring in 2 days. Please renew it to ensure uninterrupted service.</p>
                    <p>Regards,<br/>HomePlates Team</p>
                `;
                await sendEmail(sub.userId.email, "Your Meal Plan Expires Soon", emailHtml);
            }
        }
    } catch (err) {
        console.error("❌ Subscription Cron Error:", err.message);
    }
}, { timezone: "Asia/Karachi" });

// --- IMPORT ALL ROUTES ---
const authRoutes        = require("./routes/authRoutes");
const chefRoutes        = require("./routes/chefRoutes");
const adminRoutes       = require("./routes/adminRoutes");
const orderRoutes       = require("./routes/orderRoutes");
const subscriptionRoutes= require("./routes/subscriptionRoutes");
const userRoutes        = require("./routes/userRouts");
const dishRoutes        = require("./routes/dishRoutes");
const menuRoutes        = require("./routes/menuRoutes");
const reviewRoutes      = require("./routes/reviewRoutes");
const cartRoutes        = require("./routes/cartRoutes");
const walletRoutes      = require("./routes/walletRoutes");
const supportRoutes     = require("./routes/supportRoutes");

// --- MOUNT ALL ROUTES ---
app.use("/api/auth",          authRoutes);
app.use("/api/chef",          chefRoutes);
app.use("/api/chefs",         chefRoutes); // AllChefs.jsx uses /api/chefs
app.use("/api/admin",         adminRoutes);
app.use("/api/orders",        orderRoutes(io));
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/subscription",  subscriptionRoutes);
app.use("/api/user",          userRoutes); // UserProfile.jsx uses /api/user/profile/:id
app.use("/api/users",         userRoutes);
app.use("/api/dishes",        dishRoutes);
app.use("/api/all-dishes",    dishRoutes); // ExploreFood.jsx uses /api/all-dishes
app.use("/api/menu",          menuRoutes);
app.use("/api/reviews",       reviewRoutes);
app.use("/api/cart",          cartRoutes);
app.use("/api/wallet",        walletRoutes);
app.use("/api/support",       supportRoutes);
app.use("/uploads",           express.static("uploads"));

// --- SERVER START ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));