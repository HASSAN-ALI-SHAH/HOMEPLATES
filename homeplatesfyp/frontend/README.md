# HomePlates 🍳🛵
> **Lahore's Premium Home-Kitchen Food Network**

HomePlates is a full-stack web platform built to connect foodies in Lahore with talented home chefs, offering fresh, hygienic home-cooked meals delivered by a dedicated logistics network. The system supports four user roles: Customers, Home Chefs, Riders, and Administrators.

---

## 🚀 Technology Stack

### Frontend (User Interface)
* **React 19** – Single Page Application architecture.
* **Tailwind CSS & PostCSS** – Premium, modern styling system with clean responsive layouts.
* **Framer Motion** – Fluid animations and micro-interactions.
* **Lucide React** – Clean and consistent iconography.
* **React Router DOM v7** – Dynamic routing & navigation guard rails.
* **React Leaflet & Leaflet** – Interactive map simulation layers.

### Backend (REST API & Server)
* **Node.js & Express** – High-performance RESTful API endpoints.
* **MongoDB & Mongoose** – NoSQL database schemas with ODM relationships.
* **Multer** – Secure multipart/form-data handler for image uploads.
* **Node Cron** – Automatic background task scheduler (e.g., subscription lifecycle management).

---

## 👥 Core Features by User Role

### 1. Customers 🍲
* **Explore Food Node**: Search, filter, and view local dishes and verified chefs near them.
* **Dynamic Basket System**: Add home-cooked masterpieces to cart with automated delivery and platform fee calculations.
* **Live Order Tracking**: Interactive steps to see order status changes (Pending, Preparing, Out for Delivery, Delivered).
* **Reviews Platform**: Rate and review meal experiences.

### 2. Home Chefs 👩‍🍳
* **Insight Dashboard**: Monitor lifetime revenue, average star rating, active batches, and total served orders.
* **Menu Management**: Publish new dishes, upload photos, and set prep times.
* **Profit Engine (Calculator)**: Input raw materials, utilities, and packaging costs to automatically suggest the most profitable retail price.
* **Subscription Planner**: Create recurring meal plan models for loyal customers.

### 3. Riders (Logistics Fleet) 🛵
* **Terminal Status**: Toggle "Online/Offline" duty status.
* **Shipment Manifest**: View assigned order pickups, customer destinations, and calculated payout fares.
* **Control Console**: Step-by-step pipeline updates (Arrived, Picked Up, Transit, Closed).
* **GPS Telemetry Simulation**: Interactive route visualization layer.

### 4. Platform Administrators 🛡️
* **Chef Verification**: Approve home kitchens before they can list public dishes.
* **Order & Rider Allocation**: Central dashboard to oversee transactions and logistics performance.

---

## 📂 Repository Structure

```filepath
fatima project/
├── homeplatesfyp/              # Main project directory
│   ├── backend/                # Express Server API
│   │   ├── config/             # DB Connection settings
│   │   ├── models/             # Mongoose Schemas (User, Dish, Menu, Order, etc.)
│   │   ├── routes/             # REST Endpoints (auth, chef, admin, order, subscription)
│   │   ├── Uploads/            # Uploaded dish images storage directory
│   │   ├── server.js           # Server starter file
│   │   └── package.json        # Backend dependencies & scripts
│   ├── public/                 # Static assets and index.html
│   ├── src/                    # React Frontend Codebase
│   │   ├── components/         # Sub-interfaces (Dashboards, Explore, Cart, etc.)
│   │   ├── App.jsx             # Main routing hub and modal controller
│   │   ├── Auth.jsx            # Signin / Signup panel
│   │   ├── api.js              # Axios base setup
│   │   └── index.jsx           # React mounting target
│   ├── tailwind.config.js      # CSS configuration file
│   └── package.json            # React dependencies & scripts
└── README.md                   # Project Overview
```

---

## 🛠️ Getting Started & Installation

### Prerequisites
* [Node.js](https://nodejs.org/) (version 18.x or above recommended)
* [MongoDB Community Server](https://www.mongodb.com/try/download/community) (running locally on port `27017`) or a MongoDB Atlas URI.

---

### Step 1: Run the Backend Server
1. Navigate into the backend directory:
   ```bash
   cd backend
   ```
2. Install backend dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables. Create a `.env` file in the `backend/` folder:
   ```env
   PORT=5000
   MONGO_URI=mongodb://127.0.0.1:27017/HomePlates
   ```
4. Start the server:
   ```bash
   npm start
   ```
   *The console should print: `✅ MongoDB Connected Successfully!` and `🚀 Server running on port 5000`.*

---

### Step 2: Run the Frontend React Application
1. Open a new terminal window and navigate to the main project directory:
   ```bash
   cd ..
   ```
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Launch the development server:
   ```bash
   npm start
   ```
4. Open your browser to [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🛡️ Production & Security Checklist
Before taking this platform live, complete these professional optimizations:
1. **Frontend-Backend Integration**: Connect the signup/login mock inside `src/Auth.jsx` to live Axios fetch endpoints, and save the active token in localStorage or an HttpOnly cookie.
2. **Implement JWT Authorization**: Secure the admin verification routes and chef dashboards with authorization token verification middlewares.
3. **Environment Management**: Replace hardcoded `http://localhost:5000` strings with frontend-level environment variables (e.g. `REACT_APP_API_URL`).
4. **Deploy Case Alignment**: Ensure directory names (e.g. `Uploads` vs `uploads`) match exact casing to avoid image 404 errors on Linux server deployments.
5. **Cart Syncing**: Move cart state up to a context provider to enable dynamic basket edits across pages.
