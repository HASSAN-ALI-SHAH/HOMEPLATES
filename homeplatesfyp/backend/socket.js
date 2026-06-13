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

      // Rider joins their personal room
      socket.on('join_rider_room', (riderId) => {
        console.log(`Rider joined room: rider_${riderId}`);
        socket.join(`rider_${riderId}`);
        // Also join the broadcast room so rider gets notified of ALL new available orders by default
        socket.join('riders_online');
        console.log(`Rider ${riderId} joined riders_online broadcast room`);
      });

      // Rider goes online
      socket.on('go_online', (riderId) => {
        console.log(`Rider ${riderId} went ONLINE`);
        socket.join('riders_online');
      });

      // Rider goes offline
      socket.on('go_offline', (riderId) => {
        console.log(`Rider ${riderId} went OFFLINE`);
        socket.leave('riders_online');
      });

      // Customer or Rider joins order tracking room
      socket.on('track_order', (orderId) => {
        console.log(`Tracking joined for order: order_${orderId}`);
        socket.join(`order_${orderId}`);
      });

      // Admin joins admin room
      socket.on('join_admin_room', () => {
        console.log(`Admin joined admin room`);
        socket.join('admin_room');
      });
      
      // Rider broadcasts live location
      socket.on('update_location', ({ orderId, lat, lng }) => {
        console.log(`Rider live location update for order_${orderId}: [${lat}, ${lng}]`);
        io.to(`order_${orderId}`).emit('location_update', { lat, lng });
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
