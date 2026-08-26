import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const socket = io('https://213.136.86.178:3000');

let device = null;
let localStream = null;

let sendTransport = null;
let recvTransport = null;

const producerConsumers = new Map();

let roomId = null;
let isBroadcaster = false;
let isLive = false;


// ============================================
// DOM ELEMENTS
// ============================================

const goLiveButton = document.getElementById('goLive');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const liveRoomsList = document.getElementById('liveRoomsList');


// ============================================
// SOCKET CONNECTION
// ============================================

socket.on('connect', async () => {
  console.log(
    'Connected to broadcasting server:',
    socket.id
  );

  try {
    await initializeMediasoup();

    goLiveButton.disabled = false;

    await renderLiveRooms();

    console.log('Client initialization complete');

  } catch (error) {
    console.error(
      'Failed to initialize client:',
      error
    );
  }
});


// ============================================
// GET ROUTER RTP CAPABILITIES
// ============================================

const requestRouterRtpCapabilities = () => {

  return new Promise((resolve, reject) => {

    socket.emit(
      'getRouterRtpCapabilities',
      (response) => {

        if (!response) {
          reject(
            new Error(
              'No response from server'
            )
          );

          return;
        }

        if (response.error) {
          reject(
            new Error(response.error)
          );

          return;
        }

        resolve(
          response.routerRtpCapabilities
        );
      }
    );
  });
};


// ============================================
// INITIALIZE MEDIASOUP
// ============================================

const initializeMediasoup = async () => {

  const routerRtpCapabilities =
    await requestRouterRtpCapabilities();

  device =
    new mediasoupClient.Device();

  await device.load({
    routerRtpCapabilities,
  });

  console.log(
    'Mediasoup device loaded'
  );
};


// ============================================
// GET LIVE ROOMS
// ============================================

const getLiveRooms = () => {

  return new Promise((resolve, reject) => {

    socket.emit(
      'getLiveRooms',
      (response) => {

        console.log(
          'Live rooms response:',
          response
        );

        if (!response) {
          reject(
            new Error(
              'No response from server'
            )
          );

          return;
        }

        if (!response.success) {
          reject(
            new Error(
              response.error ||
              'Failed to get live rooms'
            )
          );

          return;
        }

        resolve(
          response.rooms || []
        );
      }
    );
  });
};


// ============================================
// RENDER LIVE ROOMS
// ============================================

const renderLiveRooms = async () => {

  if (!liveRoomsList) {
    console.error(
      'liveRoomsList element not found'
    );

    return;
  }

  try {

    const rooms =
      await getLiveRooms();

    console.log(
      'Rooms received:',
      rooms
    );

    liveRoomsList.innerHTML = '';

    if (!rooms.length) {

      liveRoomsList.innerHTML =
        '<p>No live broadcasts right now.</p>';

      return;
    }

    for (const room of rooms) {

      const roomCard =
        document.createElement('div');

      roomCard.innerHTML = `
        <h3>🔴 Live Broadcast</h3>

        <p>
          Room:
          ${room.roomId}
        </p>

        <p>
          Viewers:
          ${room.viewerCount}
        </p>

        <p>
          Producers:
          ${room.producerCount}
        </p>

        <button>
          Join Live
        </button>

        <hr>
      `;

      const joinButton =
        roomCard.querySelector('button');

      joinButton.addEventListener(
        'click',
        async () => {

          try {

            await joinBroadcastRoom(
              room.roomId
            );

          } catch (error) {

            console.error(
              'Failed to join broadcast:',
              error
            );
          }
        }
      );

      liveRoomsList.appendChild(
        roomCard
      );
    }

  } catch (error) {

    console.error(
      'Failed to render live rooms:',
      error
    );

    liveRoomsList.innerHTML =
      '<p>Failed to load live broadcasts.</p>';
  }
};


// ============================================
// GET LOCAL CAMERA + MICROPHONE
// ============================================

const getLocalMedia = async () => {

  try {

    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

    localVideo.srcObject =
      localStream;

    console.log(
      'Camera and microphone ready'
    );

    return true;

  } catch (error) {

    console.error(
      'Failed to access camera/microphone:',
      error
    );

    return false;
  }
};


// ============================================
// CREATE SEND TRANSPORT
// ============================================

const createSendTransport = () => {

  return new Promise((resolve, reject) => {

    if (!roomId) {

      reject(
        new Error(
          'No room selected'
        )
      );

      return;
    }

    socket.emit(
      'createWebRtcTransport',
      {
        roomId,
      },
      (response) => {

        console.log(
          'Send transport response:',
          response
        );

        if (!response) {

          reject(
            new Error(
              'No response from server'
            )
          );

          return;
        }

        if (response.error) {

          reject(
            new Error(
              response.error
            )
          );

          return;
        }

        const transport =
          device.createSendTransport(
            response
          );

        resolve(
          transport
        );
      }
    );
  });
};


// ============================================
// SETUP SEND TRANSPORT
// ============================================

const setupSendTransport = async () => {

  sendTransport =
    await createSendTransport();


  // ------------------------------------------
  // CONNECT SEND TRANSPORT
  // ------------------------------------------

  sendTransport.on(
    'connect',
    (
      { dtlsParameters },
      callback,
      errback
    ) => {

      socket.emit(
        'connectTransport',
        {
          transportId:
            sendTransport.id,

          dtlsParameters,
        },
        (response) => {

          console.log(
            'Send transport connect response:',
            response
          );

          if (
            !response ||
            response.error ||
            response.success === false
          ) {

            errback(
              new Error(
                response?.error ||
                'Failed to connect send transport'
              )
            );

            return;
          }

          callback();

        }
      );
    }
  );


  // ------------------------------------------
  // PRODUCE
  // ------------------------------------------

  sendTransport.on(
    'produce',
    (
      { kind, rtpParameters },
      callback,
      errback
    ) => {

      socket.emit(
        'produce',
        {
          transportId:
            sendTransport.id,

          kind,

          rtpParameters,

          roomId,
        },
        (response) => {

          console.log(
            'Produce response:',
            response
          );

          if (
            !response ||
            response.error
          ) {

            errback(
              new Error(
                response?.error ||
                'Failed to create producer'
              )
            );

            return;
          }

          callback({
            id: response.id,
          });
        }
      );
    }
  );


  // ------------------------------------------
  // GET CAMERA
  // ------------------------------------------

  if (!localStream) {

    const mediaReady =
      await getLocalMedia();

    if (!mediaReady) {

      throw new Error(
        'Camera/microphone could not be accessed'
      );
    }
  }


  // ------------------------------------------
  // PRODUCE VIDEO
  // ------------------------------------------

  const videoTrack =
    localStream.getVideoTracks()[0];

  if (videoTrack) {

    await sendTransport.produce({
      track: videoTrack,
    });

    console.log(
      'Video producer created'
    );
  }


  // ------------------------------------------
  // PRODUCE AUDIO
  // ------------------------------------------

  const audioTrack =
    localStream.getAudioTracks()[0];

  if (audioTrack) {

    await sendTransport.produce({
      track: audioTrack,
    });

    console.log(
      'Audio producer created'
    );
  }
};


// ============================================
// CREATE RECEIVE TRANSPORT
// ============================================

const createReceiveTransport = () => {

  return new Promise((resolve, reject) => {

    if (!roomId) {

      reject(
        new Error(
          'No room selected'
        )
      );

      return;
    }

    socket.emit(
      'createRecvTransport',
      {
        roomId,
      },
      (response) => {

        console.log(
          'Receive transport response:',
          response
        );

        if (!response) {

          reject(
            new Error(
              'No response from server'
            )
          );

          return;
        }

        if (response.error) {

          reject(
            new Error(
              response.error
            )
          );

          return;
        }

        const transport =
          device.createRecvTransport(
            response
          );

        resolve(
          transport
        );
      }
    );
  });
};


// ============================================
// SETUP RECEIVE TRANSPORT
// ============================================

const setupReceiveTransport = async () => {

  recvTransport =
    await createReceiveTransport();


  recvTransport.on(
    'connect',
    (
      { dtlsParameters },
      callback,
      errback
    ) => {

      socket.emit(
        'connectTransport',
        {
          transportId:
            recvTransport.id,

          dtlsParameters,
        },
        (response) => {

          console.log(
            'Receive transport connect response:',
            response
          );

          if (
            !response ||
            response.error ||
            response.success === false
          ) {

            errback(
              new Error(
                response?.error ||
                'Failed to connect receive transport'
              )
            );

            return;
          }

          callback();

        }
      );
    }
  );

  console.log(
    'Receive transport ready'
  );
};


// ============================================
// GET ACTIVE PRODUCERS
// ============================================

const getActiveProducers = () => {

  return new Promise((resolve, reject) => {

    if (!roomId) {

      reject(
        new Error(
          'No room selected'
        )
      );

      return;
    }

    socket.emit(
      'getProducers',
      {
        roomId,
      },
      (response) => {

        console.log(
          'Active producers response:',
          response
        );

        if (!response) {

          reject(
            new Error(
              'No response from server'
            )
          );

          return;
        }

        if (response.error) {

          reject(
            new Error(
              response.error
            )
          );

          return;
        }

        resolve(
          response.producers || []
        );
      }
    );
  });
};


// ============================================
// CONSUME PRODUCER
// ============================================

const consumeProducer = (
  producerId
) => {

  return new Promise((resolve, reject) => {

    if (!recvTransport) {

      reject(
        new Error(
          'Receive transport is not ready'
        )
      );

      return;
    }

    if (!roomId) {

      reject(
        new Error(
          'No room selected'
        )
      );

      return;
    }

    socket.emit(
      'consume',
      {
        transportId:
          recvTransport.id,

        producerId,

        rtpCapabilities:
          device.rtpCapabilities,

        // IMPORTANT
        roomId,
      },
      async (response) => {

        console.log(
          'Consume response:',
          response
        );

        if (!response) {

          reject(
            new Error(
              'No response from server'
            )
          );

          return;
        }

        if (response.error) {

          reject(
            new Error(
              response.error
            )
          );

          return;
        }

        try {

          const consumer =
            await recvTransport.consume({
              id:
                response.id,

              producerId:
                response.producerId,

              kind:
                response.kind,

              rtpParameters:
                response.rtpParameters,
            });


          producerConsumers.set(
            producerId,
            consumer
          );


          socket.emit(
            'resumeConsumer',
            {
              consumerId:
                consumer.id,
            },
            (resumeResponse) => {

              console.log(
                'Resume response:',
                resumeResponse
              );

              if (
                !resumeResponse ||
                resumeResponse.error ||
                resumeResponse.success === false
              ) {

                try {
                  consumer.close();
                } catch {}

                producerConsumers.delete(
                  producerId
                );

                reject(
                  new Error(
                    resumeResponse?.error ||
                    'Failed to resume consumer'
                  )
                );

                return;
              }

              resolve(
                consumer
              );
            }
          );

        } catch (error) {

          reject(error);
        }
      }
    );
  });
};


// ============================================
// CONSUME EXISTING PRODUCERS
// ============================================

const consumeExistingProducers = async () => {

  try {

    const producers =
      await getActiveProducers();

    console.log(
      `Found ${producers.length} producers`
    );

    if (!producers.length) {

      console.log(
        'No active producers'
      );

      return;
    }


    let stream =
      remoteVideo.srcObject;

    if (!stream) {

      stream =
        new MediaStream();

      remoteVideo.srcObject =
        stream;
    }


    for (const producer of producers) {

      try {

        if (
          producerConsumers.has(
            producer.id
          )
        ) {
          continue;
        }

        const consumer =
          await consumeProducer(
            producer.id
          );

        stream.addTrack(
          consumer.track
        );

        console.log(
          `Added ${consumer.kind} track`
        );

      } catch (error) {

        console.error(
          `Failed to consume producer ${producer.id}:`,
          error
        );
      }
    }


    if (
      stream.getTracks().length > 0
    ) {

      try {

        await remoteVideo.play();

      } catch (error) {

        console.log(
          'Browser requires user interaction to play video'
        );
      }

      console.log(
        'Remote stream ready'
      );
    }

  } catch (error) {

    console.error(
      'Failed to consume existing producers:',
      error
    );
  }
};


// ============================================
// NEW PRODUCER
// ============================================

socket.on(
  'newProducer',
  async (producer) => {

    console.log(
      'New producer:',
      producer
    );

    // Ignore our own producers
    if (
      producer.socketId === socket.id
    ) {
      return;
    }

    // Make sure this event belongs to our room
    if (
      producer.roomId !== roomId
    ) {
      return;
    }

    try {

      if (
        !recvTransport
      ) {

        console.log(
          'Receive transport is not ready yet'
        );

        return;
      }

      const consumer =
        await consumeProducer(
          producer.id
        );


      let stream =
        remoteVideo.srcObject;

      if (!stream) {

        stream =
          new MediaStream();

        remoteVideo.srcObject =
          stream;
      }


      stream.addTrack(
        consumer.track
      );


      try {

        await remoteVideo.play();

      } catch (error) {

        console.log(
          'Browser requires user interaction to play video'
        );
      }


      console.log(
        `Added new ${producer.kind} producer`
      );

    } catch (error) {

      console.error(
        `Failed to consume new producer ${producer.id}:`,
        error
      );
    }
  }
);


// ============================================
// PRODUCER CLOSED
// ============================================

socket.on(
  'producerClosed',
  (producer) => {

    console.log(
      'Producer closed:',
      producer
    );

    const consumer =
      producerConsumers.get(
        producer.id
      );

    if (!consumer) {

      return;
    }

    try {

      consumer.close();

    } catch (error) {

      console.error(
        'Failed to close consumer:',
        error
      );
    }

    producerConsumers.delete(
      producer.id
    );


    const stream =
      remoteVideo.srcObject;

    if (!stream) {

      return;
    }


    const track =
      consumer.track;

    if (track) {

      stream.removeTrack(
        track
      );

      try {
        track.stop();
      } catch {}
    }


    if (
      stream.getTracks().length === 0
    ) {

      remoteVideo.srcObject =
        null;

    }
  }
);


// ============================================
// JOIN BROADCAST ROOM
// ============================================

const joinBroadcastRoom = (
  requestedRoomId
) => {

  return new Promise((resolve, reject) => {

    socket.emit(
      'joinRoom',
      {
        roomId:
          requestedRoomId,
      },
      async (response) => {

        console.log(
          'Join room response:',
          response
        );

        if (
          !response ||
          !response.success
        ) {

          reject(
            new Error(
              response?.error ||
              'Failed to join room'
            )
          );

          return;
        }


        roomId =
          response.roomId;

        isBroadcaster = false;


        try {

          await setupReceiveTransport();

          await consumeExistingProducers();

          console.log(
            'Joined broadcast successfully'
          );

          resolve(
            response
          );

        } catch (error) {

          console.error(
            'Failed to setup viewer:',
            error
          );

          reject(error);
        }
      }
    );
  });
};


// ============================================
// START BROADCAST
// ============================================

const startBroadcast = async (
  requestedRoomId
) => {

  return new Promise((resolve, reject) => {

    socket.emit(
      'startBroadcast',
      {
        roomId:
          requestedRoomId,
      },
      async (response) => {

        console.log(
          'Start broadcast response:',
          response
        );

        if (
          !response ||
          !response.success
        ) {

          reject(
            new Error(
              response?.error ||
              'Failed to start broadcast'
            )
          );

          return;
        }


        roomId =
          response.roomId;

        isBroadcaster = true;


        try {

          await setupSendTransport();

          isLive = true;

          goLiveButton.textContent =
            'End Live';

          console.log(
            'Broadcast started successfully'
          );

          resolve(
            response
          );

        } catch (error) {

          console.error(
            'Failed to setup broadcaster:',
            error
          );

          reject(error);
        }
      }
    );
  });
};


// ============================================
// END BROADCAST
// ============================================

const endBroadcast = () => {

  return new Promise((resolve, reject) => {

    if (!roomId) {

      reject(
        new Error(
          'No active room'
        )
      );

      return;
    }

    socket.emit(
      'endRoom',
      {
        roomId,
      },
      (response) => {

        console.log(
          'End room response:',
          response
        );

        if (
          !response ||
          !response.success
        ) {

          reject(
            new Error(
              response?.error ||
              'Failed to end broadcast'
            )
          );

          return;
        }

        resolve(
          response
        );
      }
    );
  });
};


// ============================================
// CLEANUP BROADCAST
// ============================================

const cleanupBroadcast = () => {

  isLive = false;
  isBroadcaster = false;


  if (localStream) {

    localStream
      .getTracks()
      .forEach(
        (track) => track.stop()
      );

    localStream = null;
  }


  localVideo.srcObject =
    null;


  if (sendTransport) {

    try {
      sendTransport.close();
    } catch {}

    sendTransport = null;
  }


  roomId = null;


  goLiveButton.textContent =
    'Go Live';


  console.log(
    'Broadcast cleanup complete'
  );
};


// ============================================
// GO LIVE BUTTON
// ============================================
// ============================================
// GO LIVE BUTTON
// ============================================

goLiveButton.addEventListener(
  'click',
  async () => {

    // ----------------------------------------
    // END LIVE
    // ----------------------------------------

    if (isLive) {

      try {

        await endBroadcast();

        console.log(
          'Broadcast ended'
        );

        cleanupBroadcast();

        await renderLiveRooms();

      } catch (error) {

        console.error(
          'Failed to end broadcast:',
          error
        );
      }

      return;
    }


    // ----------------------------------------
    // MEDIASOUP READY
    // ----------------------------------------

    if (!device) {

      console.error(
        'Mediasoup device is not ready'
      );

      return;
    }


    // ----------------------------------------
    // START LIVE BROADCAST
    // ----------------------------------------

    try {

      // 1. Create the live broadcast
      //    through your MAIN API

      const live =
        await startLiveBroadcast({
          title:
            'My First Live Broadcast',

          category:
            'News',
        });


      console.log(
        'Live broadcast created:',
        live
      );


      // 2. Get the room ID created
      //    by the MAIN API

      const broadcastRoomId =
        live.room_id;


      console.log(
        'Broadcast room ID:',
        broadcastRoomId
      );


      // 3. Start the mediasoup
      //    broadcast using that room

      await startBroadcast(
        broadcastRoomId
      );


      console.log(
        'Now LIVE in room:',
        roomId
      );


    } catch (error) {

      console.error(
        'Failed to start broadcast:',
        error
      );

    }

  }
);



// ============================================
// ROOM ENDED
// ============================================

socket.on(
  'roomEnded',
  ({ roomId: endedRoomId }) => {

    console.log(
      'Room ended:',
      endedRoomId
    );

    if (
      endedRoomId !== roomId
    ) {
      return;
    }


    if (!isBroadcaster) {

      remoteVideo.srcObject =
        null;

      recvTransport = null;

      roomId = null;

      console.log(
        'Viewer stream ended'
      );
    }


    renderLiveRooms();
  }
);


// ============================================
// VIEWER COUNT UPDATED
// ============================================

socket.on(
  'viewerCountUpdated',
  ({ roomId: updatedRoomId, viewerCount }) => {

    console.log(
      `Room ${updatedRoomId} viewer count:`,
      viewerCount
    );

    renderLiveRooms();
  }
);




// ============================================
// DISCONNECT
// ============================================

socket.on(
  'disconnect',
  () => {

    console.log(
      'Disconnected from broadcasting server'
    );
  }
);






const startLiveBroadcast = async ({
  title,
  category,
  lat,
  lng,
}) => {

  const token =
    localStorage.getItem('accessToken');

  const response =
    await fetch(
      'http://localhost:5000/api/live/start',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'Authorization':
            `Bearer ${token}`,
        },

        body: JSON.stringify({
          title,
          category,
          lat,
          lng,
        }),
      }
    );

  const data =
    await response.json();

  console.log(
    'Live API response:',
    data
  );

  if (!response.ok) {

    throw new Error(
      data.message ||
      'Failed to start live broadcast'
    );
  }

  return data;
};