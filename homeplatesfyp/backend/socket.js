const User = require('./models/User');
let io;

module.exports = {
  init: (server) => {
    const { Server } = require('socket.io');
    io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }
    });

    io.on('connection', (socket) => {
      console.log(`🔌 Socket Connected: ${socket.id}`);
      
      // Chef joins their personal room
      socket.on('join_chef_room', (chefId) => {
        console.log(`Chef joined room: chef_${chefId}`);
        socket.join(`chef_${chefId}`);
      });

      // Customer joins their personal notification room
      socket.on('join_user_room', (userId) => {
        console.log(`User joined room: user_${userId}`);
        socket.join(`user_${userId}`);
      });

      // Rider joins their personal room
      socket.on('join_rider_room', async (riderId) => {
        console.log(`Rider joined room: rider_${riderId}`);
        socket.join(`rider_${riderId}`);
        socket.join(riderId); // direct riderId room
        
        try {
          const rider = await User.findById(riderId);
          if (rider && rider.verificationStatus === 'verified') {
            socket.join('riders_online');
            console.log(`Rider ${riderId} joined riders_online broadcast room`);
            if (rider.city) {
              // Leave any old city rooms to avoid cross-city notifications
              const rooms = Array.from(socket.rooms);
              for (const room of rooms) {
                if (room.startsWith('riders_') && room !== 'riders_online') {
                  socket.leave(room);
                }
              }
              const cityRoom = `riders_${rider.city.toLowerCase()}`;
              socket.join(cityRoom);
              console.log(`Rider ${riderId} joined city room: ${cityRoom}`);
            }
          } else {
            console.log(`Rider ${riderId} is NOT verified. Blocked from broadcast rooms.`);
          }
        } catch (e) {
          console.error("Error joining rooms for rider:", e);
        }
      });

      // Rider goes online
      socket.on('go_online', async (riderId) => {
        try {
          const rider = await User.findById(riderId);
          if (!rider || rider.verificationStatus !== 'verified') {
            console.log(`Block unverified/offline rider ${riderId} from going online`);
            return;
          }
          console.log(`Rider ${riderId} went ONLINE`);
          socket.join('riders_online');
          if (rider.city) {
            // Leave any old city rooms to avoid cross-city notifications
            const rooms = Array.from(socket.rooms);
            for (const room of rooms) {
              if (room.startsWith('riders_') && room !== 'riders_online') {
                socket.leave(room);
              }
            }
            const cityRoom = `riders_${rider.city.toLowerCase()}`;
            socket.join(cityRoom);
            console.log(`Rider ${riderId} went ONLINE for city room: ${cityRoom}`);
          }
        } catch (e) {
          console.error("Error going online for rider:", e);
        }
      });

      // Rider goes offline
      socket.on('go_offline', async (riderId) => {
        console.log(`Rider ${riderId} went OFFLINE`);
        socket.leave('riders_online');
        try {
          const rider = await User.findById(riderId);
          if (rider && rider.city) {
            const cityRoom = `riders_${rider.city.toLowerCase()}`;
            socket.leave(cityRoom);
            console.log(`Rider ${riderId} went OFFLINE for city room: ${cityRoom}`);
          }
        } catch (e) {
          console.error("Error going offline for rider:", e);
        }
      });

      // Customer or Rider joins order tracking room
      socket.on('track_order', (orderId) => {
        console.log(`Tracking joined for order: order_${orderId}`);
        socket.join(`order_${orderId}`);
      });

      // Chef joins order room during pickup leg to see rider moving toward kitchen
      socket.on('join_order_room', (orderId) => {
        console.log(`Chef joined order room: order_${orderId}`);
        socket.join(`order_${orderId}`);
      });

      // Chef leaves order room once food is picked up (no longer needs tracking)
      socket.on('leave_order_room', (orderId) => {
        console.log(`Chef left order room: order_${orderId}`);
        socket.leave(`order_${orderId}`);
      });

      // Admin joins admin room
      socket.on('join_admin_room', () => {
        console.log(`Admin joined admin room`);
        socket.join('admin_room');
      });
      
      // Rider broadcasts live location — forwarded to order-room (customer) AND chef room
      socket.on('update_location', ({ orderId, lat, lng, chefId }) => {
        console.log(`Rider live location update for order_${orderId}: [${lat}, ${lng}]`);
        // Notify customer tracking page
        io.to(`order_${orderId}`).emit('location_update', { lat, lng, orderId });
        // Notify chef dashboard in real-time
        if (chefId) {
          io.to(`chef_${chefId}`).emit('rider_location_update', { lat, lng, orderId });
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Socket Disconnected: ${socket.id}`);
      });
    });

    return io;
  },
  getIo: () => {
    if (!io) {
      // Return a dummy object if not initialized yet to prevent crashes
      return {
        to: () => ({
          emit: () => {}
        })
      };
    }
    return io;
  }
};
