import mediasoup from 'mediasoup';
import { MEDIASOUP_ANNOUNCED_IP } from '../config/env.js';

const transports = new Map();
const producers = new Map();
const consumers = new Map();

let worker;
let router;

export const createWorker = async () => {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  });

  worker.on('died', () => {
    console.error('Mediasoup worker died');

    setTimeout(() => {
      process.exit(1);
    }, 2000);
  });

  console.log(`Mediasoup worker created: ${worker.pid}`);

  return worker;
};

export const createRouter = async () => {
  if (!worker) {
    throw new Error('Mediasoup worker has not been created');
  }

  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
      },
    ],
  });

  console.log('Mediasoup router created');

  return router;
};

export const getWorker = () => {
  if (!worker) {
    throw new Error('Mediasoup worker has not been created');
  }

  return worker;
};

export const getRouter = () => {
  if (!router) {
    throw new Error('Mediasoup router has not been created');
  }

  return router;
};
export const createWebRtcTransport = async (socketId) => {
  if (!router) {
    throw new Error('Mediasoup router has not been created');
  }

  const transport = await router.createWebRtcTransport({
    listenInfos: [
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: MEDIASOUP_ANNOUNCED_IP,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  transports.set(transport.id, {
    transport,
    socketId,
  });

  console.log(`WebRTC transport created: ${transport.id}`);

  return transport;
};

export const connectTransport = async (transportId, dtlsParameters) => {
  const transportData = transports.get(transportId);

  if (!transportData) {
    throw new Error('Transport not found');
  }

  await transportData.transport.connect({
    dtlsParameters,
  });

  console.log(`WebRTC transport connected: ${transportId}`);

  return transportData.transport;
};

export const createProducer = async (
  transportId,
  socketId,
  kind,
  rtpParameters
) => {
  const transportData = transports.get(transportId);

  if (!transportData) {
    throw new Error('Transport not found');
  }

  if (transportData.socketId !== socketId) {
    throw new Error('Transport does not belong to this client');
  }

  const producer = await transportData.transport.produce({
    kind,
    rtpParameters,
  });

  producers.set(producer.id, {
    producer,
    socketId,
    transportId,
  });

  console.log(
    `Producer created: ${producer.id} (${producer.kind})`
  );

  return producer;
};



export const createRecvTransport = async (socketId) => {
  if (!router) {
    throw new Error('Mediasoup router has not been created');
  }

  const transport = await router.createWebRtcTransport({
    listenInfos: [
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: MEDIASOUP_ANNOUNCED_IP,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  transports.set(transport.id, {
    transport,
    socketId,
  });

  console.log(`Receive transport created: ${transport.id}`);

  return transport;
};


export const getProducer = (producerId) => {
  const producerData = producers.get(producerId);

  if (!producerData) {
    throw new Error(`Producer not found: ${producerId}`);
  }

  return producerData.producer;
};


export const getProducersBySocket = (socketId) => {
  const result = [];

  for (const [producerId, data] of producers.entries()) {
    if (data.socketId === socketId) {
      result.push(data.producer);
    }
  }

  return result;
};

export const getAllProducers = () => {
  return Array.from(producers.values()).map(
    ({ producer, socketId }) => ({
      id: producer.id,
      socketId,
      kind: producer.kind,
    })
  );
};

export const createConsumer = async (
  transportId,
  socketId,
  producerId,
  rtpCapabilities
) => {
  const transportData = transports.get(transportId);

  if (!transportData) {
    throw new Error(`Transport not found: ${transportId}`);
  }

  if (transportData.socketId !== socketId) {
    throw new Error('Transport does not belong to this client');
  }


console.log('Consume request:', {
  producerId,
  rtpCapabilities,
});

console.log(
  'Router can consume:',
  router.canConsume({
    producerId,
    rtpCapabilities,
  })
);


  if (!router.canConsume({
    producerId,
    rtpCapabilities,
  })) {
    throw new Error('Router cannot consume this producer');
  }

  const consumer = await transportData.transport.consume({
    producerId,
    rtpCapabilities,
    paused: true,
  });

  consumers.set(consumer.id, {
    consumer,
    socketId,
    producerId,
  });

  console.log(
    `Consumer created: ${consumer.id} for producer ${producerId}`
  );

  return consumer;
};

export const resumeConsumer = async (
  consumerId,
  socketId
) => {
  const consumerData = consumers.get(consumerId);

  if (!consumerData) {
    throw new Error('Consumer not found');
  }

  if (consumerData.socketId !== socketId) {
    throw new Error('Consumer does not belong to this client');
  }

  await consumerData.consumer.resume();

  console.log(
    `Consumer resumed: ${consumerId}`
  );
};

export const cleanupSocket = (socketId) => {
  // Close and remove consumers
  for (const [consumerId, consumerData] of consumers.entries()) {
    if (consumerData.socketId === socketId) {
      try {
        consumerData.consumer.close();
      } catch (error) {
        console.error(
          `Failed to close consumer ${consumerId}:`,
          error
        );
      }

      consumers.delete(consumerId);

      console.log(
        `Consumer removed: ${consumerId}`
      );
    }
  }

  // Close and remove producers
  for (const [producerId, producerData] of producers.entries()) {
    if (producerData.socketId === socketId) {
      try {
        producerData.producer.close();
      } catch (error) {
        console.error(
          `Failed to close producer ${producerId}:`,
          error
        );
      }

      producers.delete(producerId);

      console.log(
        `Producer removed: ${producerId}`
      );
    }
  }

  // Close and remove transports
  for (const [transportId, transportData] of transports.entries()) {
    if (transportData.socketId === socketId) {
      try {
        transportData.transport.close();
      } catch (error) {
        console.error(
          `Failed to close transport ${transportId}:`,
          error
        );
      }

      transports.delete(transportId);

      console.log(
        `Transport removed: ${transportId}`
      );
    }
  }

  console.log(
    `Cleaned up mediasoup resources for socket: ${socketId}`
  );
};
