import { createWebRtcTransport,connectTransport,

createProducer,  getRouter,  createRecvTransport,  
resumeConsumer,  cleanupSocket,
createConsumer,  getProducersBySocket,  getAllProducers,
createRoom, getRoom,  joinRoom,getLiveRooms,   endRoom,

 } from '../services/mediasoup.js';

export const setupSignaling = (io) => {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

   socket.on(
  'createWebRtcTransport',
  async ({ roomId } = {}, callback) => {
    try {
      if (!roomId) {
        callback({
          error: 'roomId is required',
        });

        return;
      }

      const transport =
        await createWebRtcTransport(
          socket.id,
          roomId
        );

      callback({
        id: transport.id,
        iceParameters:
          transport.iceParameters,
        iceCandidates:
          transport.iceCandidates,
        dtlsParameters:
          transport.dtlsParameters,
      });

    } catch (error) {
      console.error(
        'Failed to create WebRTC transport:',
        error
      );

      callback({
        error: error.message,
      });
    }
  }
);


socket.on('createRoom', (_, callback) => {
  try {
    const room = createRoom(socket.id);

    socket.join(`broadcast:${room.roomId}`);

    callback({
      success: true,
      roomId: room.roomId,
      broadcasterId: room.broadcasterId,
      status: room.status,
      createdAt: room.createdAt,
      viewerCount: room.viewers.size,
    });

  } catch (error) {
    console.error(
      'Failed to create room:',
      error
    );

    callback({
      success: false,
      error: error.message,
    });
  }
});


socket.on('joinRoom', ({ roomId }, callback) => {
  try {
    const room = joinRoom(
      roomId,
      socket.id
    );

    socket.join(`broadcast:${roomId}`);

    callback({
      success: true,
      roomId,
      broadcasterId: room.broadcasterId,
      viewerCount: room.viewers.size,
      status: room.status,
    });

    socket.to(`broadcast:${roomId}`).emit(
      'viewerCountUpdated',
      {
        roomId,
        viewerCount: room.viewers.size,
      }
    );

  } catch (error) {
    console.error(
      'Failed to join room:',
      error
    );

    callback({
      success: false,
      error: error.message,
    });
  }
});




socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
  try {
    await connectTransport(transportId, dtlsParameters);

    callback({
      success: true,
    });
  } catch (error) {
    console.error('Failed to connect WebRTC transport:', error);

    callback({
      success: false,
      error: error.message,
    });
  }
});

socket.on(
  'produce',
  async ({ transportId, kind, rtpParameters, roomId }, callback) => {
    try {
      const producer = await createProducer(
        transportId,
        socket.id,
        kind,
        rtpParameters,
 	roomId

      );

      callback({
        id: producer.id,
      });

      socket.broadcast.emit('newProducer', {
        id: producer.id,
        socketId: socket.id,
        kind: producer.kind,
      });
    } catch (error) {
      console.error('Failed to create producer:', error);

      callback({
        error: error.message,
      });
    }
  }
);



socket.on('getRouterRtpCapabilities', (callback) => {
  try {
    const router = getRouter();

    callback({
      routerRtpCapabilities: router.rtpCapabilities,
    });
  } catch (error) {
    console.error(
      'Failed to get router RTP capabilities:',
      error
    );

    callback({
      error: error.message,
    });
  }
});


socket.on(
  'createRecvTransport',
  async ({ roomId } = {}, callback) => {
    try {
      if (!roomId) {
        callback({
          error: 'roomId is required',
        });

        return;
      }

      const transport =
        await createRecvTransport(
          socket.id,
          roomId
        );

      callback({
        id: transport.id,
        iceParameters:
          transport.iceParameters,
        iceCandidates:
          transport.iceCandidates,
        dtlsParameters:
          transport.dtlsParameters,
      });

    } catch (error) {
      console.error(
        'Failed to create receive transport:',
        error
      );

      callback({
        error: error.message,
      });
    }
  }
);

     


socket.on(
  'consume',
  async (
    { transportId, producerId, rtpCapabilities },
    callback
  ) => {
    try {
      const consumer = await createConsumer(
        transportId,
        socket.id,
        producerId,
        rtpCapabilities
      );

      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });

    } catch (error) {
      console.error('Failed to create consumer:', error);

      callback({
        error: error.message,
      });
    }
  }
);



socket.on(
  'getProducers',
  (data, callback) => {
    try {
      const { roomId } = data || {};

      if (typeof callback !== 'function') {
        console.error(
          'getProducers callback is missing'
        );
        return;
      }

      if (!roomId) {
        callback({
          error: 'roomId is required',
        });
        return;
      }

      const producers =
        getAllProducers(roomId);

      console.log(
        `Found ${producers.length} producers for room ${roomId}`
      );

      callback({
        producers,
      });

    } catch (error) {
      console.error(
        'Failed to get producers:',
        error
      );

      if (typeof callback === 'function') {
        callback({
          error: error.message,
        });
      }
    }
  }
);   


socket.on(
  'resumeConsumer',
  async ({ consumerId }, callback) => {
    try {
      await resumeConsumer(
        consumerId,
        socket.id
      );

      callback({
        success: true,
      });
    } catch (error) {
      console.error(
        'Failed to resume consumer:',
        error
      );

      callback({
        success: false,
        error: error.message,
      });
    }
  }
);

socket.on(
  'getLiveRooms',
  (callback) => {

    try {

      const rooms =
        getLiveRooms();

      callback({
        success: true,
        rooms,
      });

    } catch (error) {

      console.error(
        'Failed to get live rooms:',
        error
      );

      callback({
        success: false,
        error: error.message,
      });
    }
  }
);

socket.on(
  'endRoom',
  ({ roomId }, callback) => {
    try {
      const result = endRoom(
        roomId,
        socket.id
      );

      callback({
        success: true,
        roomId,
      });

      io.to(`broadcast:${roomId}`).emit(
        'roomEnded',
        {
          roomId,
        }
      );

      socket.leave(
        `broadcast:${roomId}`
      );

    } catch (error) {
      console.error(
        'Failed to end room:',
        error
      );

      callback({
        success: false,
        error: error.message,
      });
    }
  }
);




  socket.on('disconnect', () => {
  console.log(
    `Client disconnected: ${socket.id}`
  );

  const cleanup =
    cleanupSocket(socket.id);

  // Notify rooms about producer removal
  for (const producer of cleanup.removedProducers) {
    io.to(`broadcast:${producer.roomId}`).emit(
      'producerClosed',
      {
        id: producer.id,
        socketId: producer.socketId,
        kind: producer.kind,
      }
    );
  }

  // Notify viewers when viewer count changes
  for (const room of cleanup.removedViewerRooms) {
    io.to(`broadcast:${room.roomId}`).emit(
      'viewerCountUpdated',
      {
        roomId: room.roomId,
        viewerCount: room.viewerCount,
      }
    );
  }

  // Broadcaster disconnected
  for (const room of cleanup.endedRooms) {
    io.to(`broadcast:${room.roomId}`).emit(
      'roomEnded',
      {
        roomId: room.roomId,
      }
    );
  }
});


  });
};
