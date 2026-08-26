import mediasoup from 'mediasoup';
import { MEDIASOUP_ANNOUNCED_IP } from '../config/env.js';
import { randomUUID } from 'crypto';
const transports = new Map();
const producers = new Map();
const consumers = new Map();
const rooms = new Map();

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
export const createWebRtcTransport = async (socketId,  roomId) => {
  if (!router) {
    throw new Error('Mediasoup router has not been created');
  }
const room = rooms.get(roomId);

if (!room) {
  throw new Error('Room not found');
}

if (room.broadcasterId !== socketId) {
  throw new Error(
    'Only the broadcaster can create a send transport'
  );
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
  roomId,
  type: 'send',
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
  rtpParameters,
  roomId

) => {
  const transportData = transports.get(transportId);

  if (!transportData) {
    throw new Error('Transport not found');
  }

if (transportData.roomId !== roomId) {
  throw new Error(
    'Transport does not belong to this room'
  );
}

  if (transportData.socketId !== socketId) {
    throw new Error('Transport does not belong to this client');
  }
	 const room = rooms.get(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  if (room.broadcasterId !== socketId) {
    throw new Error(
      'Only the broadcaster can create producers'
    );
  }


  const producer = await transportData.transport.produce({
    kind,
    rtpParameters,
  });



  producers.set(producer.id, {
    producer,
    socketId,
    transportId,
  roomId,
  });

	  room.producers.add(producer.id);

  console.log(
    `Producer created: ${producer.id} (${producer.kind})`
  );

  return producer;
};



export const createRecvTransport = async (socketId,  roomId) => {
  if (!router) {
    throw new Error('Mediasoup router has not been created');
  }

const room = rooms.get(roomId);

if (!room) {
  throw new Error('Room not found');
}

if (
  socketId !== room.broadcasterId &&
  !room.viewers.has(socketId)
) {
  throw new Error(
    'Client is not a member of this room'
  );
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
  roomId,
  type: 'recv',
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

export const getAllProducers = (roomId) => {
  return Array.from(producers.values())
    .filter(({ roomId: producerRoomId }) => {
      return producerRoomId === roomId;
    })
    .map(({ producer, socketId, roomId }) => ({
      id: producer.id,
      socketId,
      kind: producer.kind,
      roomId,
    }));
};


export const createConsumer = async (
  transportId,
  socketId,
  producerId,
  rtpCapabilities,
  roomId
) => {
  const transportData = transports.get(transportId);

  if (!transportData) {
    throw new Error(
      `Transport not found: ${transportId}`
    );
  }

  if (transportData.socketId !== socketId) {
    throw new Error(
      'Transport does not belong to this client'
    );
  }

  if (transportData.roomId !== roomId) {
    throw new Error(
      'Transport does not belong to this room'
    );
  }

  const room = rooms.get(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  // Make sure this client is actually inside the room
  const isBroadcaster =
    room.broadcasterId === socketId;

  const isViewer =
    room.viewers?.has(socketId);

  if (!isBroadcaster && !isViewer) {
    throw new Error(
      'Client is not a member of this room'
    );
  }

  // Make sure producer belongs to this room
  const producerData =
    producers.get(producerId);

  if (!producerData) {
    throw new Error(
      `Producer not found: ${producerId}`
    );
  }

  if (producerData.roomId !== roomId) {
    throw new Error(
      'Producer does not belong to this room'
    );
  }

  // Extra protection: producer must be registered
  // inside the room's producer set
  if (!room.producers.has(producerId)) {
    throw new Error(
      'Producer is not active in this room'
    );
  }

  console.log('Consume authorization passed:', {
    socketId,
    roomId,
    producerId,
  });

  if (
    !router.canConsume({
      producerId,
      rtpCapabilities,
    })
  ) {
    throw new Error(
      'Router cannot consume this producer'
    );
  }

  const consumer =
    await transportData.transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

  consumers.set(consumer.id, {
    consumer,
    socketId,
    producerId,
    roomId,
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

  


export const createRoom = (roomId, userId) => {
  if (!roomId) {
    throw new Error('roomId is required');
  }

  if (!userId) {
    throw new Error('userId is required');
  }

  if (rooms.has(roomId)) {
    throw new Error('Room already exists');
  }

  const room = {
    roomId,
    userId,

    // Socket that actually becomes the broadcaster
    broadcasterId: null,

    producers: new Set(),
    viewers: new Set(),

    createdAt: new Date(),
    status: 'live',
  };

  rooms.set(roomId, room);

  console.log(
    `Room created: ${roomId} for user ${userId}`
  );

  return room;
};


export const getRoom = (roomId) => {
  return rooms.get(roomId);
};


export const joinRoom = (roomId, socketId) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  if (room.status !== 'live') {
    throw new Error('Room is not live');
  }

  // First socket joining as broadcaster
  if (!room.broadcasterId) {
    room.broadcasterId = socketId;

    console.log(
      `Socket ${socketId} assigned as broadcaster for room ${roomId}`
    );

    return room;
  }

  // Broadcaster reconnecting
  if (room.broadcasterId === socketId) {
    return room;
  }

  // Otherwise viewer
  room.viewers.add(socketId);

  console.log(
    `Socket ${socketId} joined room ${roomId}`
  );

  return room;
};


export const leaveRoom = (roomId, socketId) => {
  const room = rooms.get(roomId);

  if (!room) {
    return null;
  }

  room.viewers.delete(socketId);

  console.log(
    `Socket ${socketId} left room ${roomId}`
  );

  return room;
};


export const getViewerCount = (roomId) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  return room.viewers.size;
};


export const getLiveRooms = () => {
  return Array.from(rooms.values()).map(
    (room) => ({
      roomId: room.roomId,
      userId: room.userId,
      broadcasterId: room.broadcasterId,
      producerCount: room.producers.size,
      viewerCount: room.viewers.size,
      status: room.status,
      createdAt: room.createdAt,
    })
  );
};


export const endRoom = (roomId, socketId) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  if (room.broadcasterId !== socketId) {
    throw new Error(
      'Only the broadcaster can end the room'
    );
  }

  const viewerIds = room.viewers
    ? Array.from(room.viewers)
    : [];

  // Close all producers
  for (const producerId of room.producers) {
    const producerData =
      producers.get(producerId);

    if (producerData) {
      try {
        producerData.producer.close();
      } catch (error) {
        console.error(
          `Failed to close producer ${producerId}:`,
          error
        );
      }

      producers.delete(producerId);
    }
  }

  room.status = 'ended';

  rooms.delete(roomId);

  console.log(
    `Room ended: ${roomId}`
  );

  return {
    roomId,
    viewerIds,
  };
};


export const cleanupSocket = (socketId) => {
  const removedProducers = [];
  const affectedRooms = [];
  const endedRooms = [];

  // --------------------------------
  // Remove socket from viewer lists
  // --------------------------------

  for (const [roomId, room] of rooms.entries()) {
    if (!room.viewers?.has(socketId)) {
      continue;
    }

    room.viewers.delete(socketId);

    affectedRooms.push({
      roomId,
      viewerCount: room.viewers.size,
    });

    console.log(
      `Viewer ${socketId} left room ${roomId}`
    );
  }

  // --------------------------------
  // Remove producers
  // --------------------------------

  for (
    const [producerId, producerData]
    of producers.entries()
  ) {
    if (producerData.socketId !== socketId) {
      continue;
    }

    try {
      producerData.producer.close();
    } catch (error) {
      console.error(
        `Failed to close producer ${producerId}:`,
        error
      );
    }

    removedProducers.push({
      id: producerId,
      socketId,
      kind: producerData.producer.kind,
      roomId: producerData.roomId,
    });

    // Remove producer from its room
    const room = rooms.get(
      producerData.roomId
    );

    if (room) {
      room.producers.delete(
        producerId
      );
    }

    producers.delete(
      producerId
    );

    console.log(
      `Producer removed: ${producerId}`
    );
  }

  // --------------------------------
  // Remove consumers
  // --------------------------------

  for (
    const [consumerId, consumerData]
    of consumers.entries()
  ) {
    if (consumerData.socketId !== socketId) {
      continue;
    }

    try {
      consumerData.consumer.close();
    } catch (error) {
      console.error(
        `Failed to close consumer ${consumerId}:`,
        error
      );
    }

    consumers.delete(
      consumerId
    );

    console.log(
      `Consumer removed: ${consumerId}`
    );
  }

  // --------------------------------
  // Remove transports
  // --------------------------------

  for (
    const [transportId, transportData]
    of transports.entries()
  ) {
    if (transportData.socketId !== socketId) {
      continue;
    }

    try {
      transportData.transport.close();
    } catch (error) {
      console.error(
        `Failed to close transport ${transportId}:`,
        error
      );
    }

    transports.delete(
      transportId
    );

    console.log(
      `Transport removed: ${transportId}`
    );
  }

  // --------------------------------
  // Broadcaster disconnected
  // --------------------------------

  for (const [roomId, room] of rooms.entries()) {
    if (room.broadcasterId !== socketId) {
      continue;
    }

    // Save viewers before deleting room
    const viewerIds = room.viewers
      ? Array.from(room.viewers)
      : [];

    endedRooms.push({
      roomId,
      viewerIds,
    });

    room.status = 'ended';

    rooms.delete(
      roomId
    );

    console.log(
      `Room automatically ended because broadcaster disconnected: ${roomId}`
    );
  }

  // --------------------------------
  // Final log
  // --------------------------------

  console.log(
    `Cleaned up mediasoup resources for socket: ${socketId}`
  );

  // --------------------------------
  // Return cleanup information
  // --------------------------------

  return {
    removedProducers,
    affectedRooms,
    endedRooms,
  };
};

export const removeRoomByBroadcaster = (socketId) => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.broadcasterId !== socketId) {
      continue;
    }

    console.log(
      `Broadcaster ${socketId} disconnected. Removing room ${roomId}`
    );

    // Close all producers belonging to this room
    for (const producerId of room.producers) {
      const producerData =
        producers.get(producerId);

      if (producerData) {
        try {
          producerData.producer.close();
        } catch (error) {
          console.error(
            `Failed to close producer ${producerId}:`,
            error
          );
        }

        producers.delete(producerId);
      }
    }

    rooms.delete(roomId);

    return {
      roomId,
      viewerIds: room.viewers
        ? Array.from(room.viewers)
        : [],
    };
  }

  return null;
};


export const registerBroadcaster = (
  roomId,
  socketId
) => {
  const room = rooms.get(roomId);

  if (!room) {
    throw new Error('Room not found');
  }

  if (
    room.broadcasterId &&
    room.broadcasterId !== socketId
  ) {
    throw new Error(
      'Room already has a broadcaster'
    );
  }

  room.broadcasterId = socketId;

  console.log(
    `Socket ${socketId} registered as broadcaster for room ${roomId}`
  );

  return room;
};
