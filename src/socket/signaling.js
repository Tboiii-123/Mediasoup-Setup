import { createWebRtcTransport,connectTransport,
createProducer,  getRouter,  createRecvTransport,  resumeConsumer,  cleanupSocket,

createConsumer,  getProducersBySocket,  getAllProducers, } from '../services/mediasoup.js';

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
  async ({ transportId, kind, rtpParameters }, callback) => {
    try {
      const producer = await createProducer(
        transportId,
        socket.id,
        kind,
        rtpParameters
      );

      callback({
        id: producer.id,
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

socket.on('getProducers', (callback) => {
  try {
    const producers = getAllProducers();

    callback({
      producers,
    });
  } catch (error) {
    console.error('Failed to get producers:', error);

    callback({
      error: error.message,
    });
  }
});

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


    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
  cleanupSocket(socket.id);
    });
  });
};
