import { createWebRtcTransport,connectTransport,
createProducer,  getRouter,  createRecvTransport,  resumeConsumer,  cleanupSocket,

createConsumer,  getProducersBySocket,  getAllProducers,
createRoom, getRoom,  joinRoom,getLiveRooms,   endRoom,

 } from '../services/mediasoup.js';

export const setupSignaling = (io) => {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('createWebRtcTransport', async (_, callback) => {
      try {
     const transport = await createWebRtcTransport(socket.id);

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });

      } catch (error) {
        console.error('Failed to create WebRTC transport:', error);

        callback({
          error: error.message,
        });
      }
    });

socket.on('createRoom', ({ roomId }, callback) => {
  try {
    createRoom(roomId, socket.id);

    callback({
      success: true,
      roomId,
    });
  } catch (error) {
    console.error('Failed to create room:', error);

    callback({
      success: false,
      error: error.message,
    });
  }
});

socket.on('joinRoom', ({ roomId }, callback) => {
  try {
    const room = joinRoom(roomId, socket.id);

    callback({
      success: true,
      roomId,
      broadcasterId: room.broadcasterId,
    });
  } catch (error) {
    console.error('Failed to join room:', error);

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



socket.on('createRecvTransport', async (_, callback) => {
  try {
    const transport = await createRecvTransport(socket.id);

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
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
});

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

      endRoom(
        roomId,
        socket.id
      );

      callback({
        success: true,
      });

      // Tell everyone else that the room ended
      socket.broadcast.emit(
        'roomEnded',
        {
          roomId,
        }
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
  console.log(`Client disconnected: ${socket.id}`);

  const removedProducers =
    cleanupSocket(socket.id);

  for (const producer of removedProducers) {
    socket.broadcast.emit('producerClosed', {
      id: producer.id,
      socketId: producer.socketId,
      kind: producer.kind,
    });
  }
});


  });
};
