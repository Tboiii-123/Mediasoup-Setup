import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const socket = io('https://213.136.86.178:3000');

let device;
let localStream;
let sendTransport;
let recvTransport;
const producerConsumers = new Map();
let roomId = null;
let isBroadcaster = false;
let isLive = false;


const goLiveButton = document.getElementById('goLive');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const requestRouterRtpCapabilities = () => {
  return new Promise((resolve, reject) => {
    socket.emit('getRouterRtpCapabilities', (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      resolve(response.routerRtpCapabilities);
    });
  });
};

socket.on('connect', async () => {
  console.log(
    'Connected to broadcasting server:',
    socket.id

	);
 try {
    const routerRtpCapabilities =
      await requestRouterRtpCapabilities();

    device = new mediasoupClient.Device();

    await device.load({
      routerRtpCapabilities,
    });

    console.log('Mediasoup device loaded');

    goLiveButton.disabled = false;

  await renderLiveRooms(); 

  } catch (error) {
    console.error(
      'Failed to initialize Mediasoup:',
      error
    );
  }
});


const renderLiveRooms = async () => {
  const liveRoomsList =
    document.getElementById('liveRoomsList');

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
      'Rooms received for UI:',
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
          Room: ${room.roomId}
        </p>

        <p>
          Producers: ${room.producerCount}
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

            console.log(
              `Joining room: ${room.roomId}`
            );

            await joinBroadcastRoom(
              room.roomId
            );

            console.log(
              `Successfully joined: ${room.roomId}`
            );

          } catch (error) {

            console.error(
              'Failed to join room:',
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

const endBroadcast = () => {
  return new Promise((resolve, reject) => {

    if (!roomId) {
      reject(
        new Error('No active room')
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
          !response.success
        ) {
          reject(
            new Error(
              response.error ||
              'Failed to end broadcast'
            )
          );

          return;
        }

        resolve(response);
      }
    );
  });
};

const getLocalMedia = async () => {
  try {
    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

    localVideo.srcObject = localStream;

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

const getLiveRooms = () => {

  return new Promise(
    (resolve, reject) => {

      socket.emit(
        'getLiveRooms',
        (response) => {

          if (
            !response.success
          ) {

            reject(
              new Error(
                response.error
              )
            );

            return;
          }

          console.log(
            'Live rooms:',
            response.rooms
          );

          resolve(
            response.rooms
          );
        }
      );
    }
  );
};






goLiveButton.addEventListener(
  'click',
  async () => {

    if (isLive) {

      try {

        await endBroadcast();

        console.log(
          'Broadcast ended'
        );

        isLive = false;
        isBroadcaster = false;

        goLiveButton.textContent =
          'Go Live';

        goLiveButton.disabled =
          false;

        if (localStream) {

          localStream
            .getTracks()
            .forEach(
              (track) => track.stop()
            );

          localStream = null;

          localVideo.srcObject =
            null;
        }

        if (sendTransport) {

          sendTransport.close();

          sendTransport = null;
        }

        roomId = null;

        console.log(
          'Broadcast cleanup complete'
        );

      } catch (error) {

        console.error(
          'Failed to end broadcast:',
          error
        );
      }

      return;
    }

    if (!device) {

      console.error(
        'Mediasoup device is not ready'
      );

      return;
    }

    // your existing Go Live code continues here...

    try {

 const response = await createBroadcastRoom();

await setupSendTransport();

console.log('Broadcast started');

goLiveButton.textContent = 'End Live';
isLive = true;

    } catch (error) {

      console.error(
        'Failed to start broadcast:',
        error
      );
    }
  }
);


const createSendTransport = () => {

  return new Promise(
    (resolve, reject) => {

      socket.emit(
        'createWebRtcTransport',
  	{
          roomId,
        },        (response) => {

          if (response.error) {
            reject(
              new Error(response.error)
            );

            return;
          }

          const transport =
            device.createSendTransport(
              response
            );

          resolve(transport);
        }
      );
    }
  );
};


const setupSendTransport = async () => {

  sendTransport =
    await createSendTransport();


  sendTransport.on(
    'connect',
    ({ dtlsParameters }, callback, errback) => {

      socket.emit(
        'connectTransport',
        {
          transportId:
            sendTransport.id,

          dtlsParameters,
        },

        (response) => {

          if (
            response.error ||
            response.success === false
          ) {

            errback(
              new Error(
                response.error ||
                'Failed to connect send transport'
              )
            );

            return;
          }

          console.log(
            'Send transport connected'
          );

          callback();
        }
      );
    }
  );


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
          transportId:sendTransport.id,
          kind,
          rtpParameters,
 	  roomId,
        },

        (response) => {

          if (response.error) {

            errback(
              new Error(
                response.error
              )
            );

            return;
          }

          console.log(
            `Producer created: ${response.id} (${kind})`
          );

          callback({
            id: response.id,
          });
        }
      );
    }
  );


  if (!localStream) {

    const mediaReady =
      await getLocalMedia();

    if (!mediaReady) {

      throw new Error(
        'Camera/microphone could not be accessed'
      );
    }
  }


  const videoTrack =
    localStream.getVideoTracks()[0];

  const audioTrack =
    localStream.getAudioTracks()[0];


  if (videoTrack) {

    await sendTransport.produce({
      track: videoTrack,
    });

    console.log(
      'Video producer created'
    );
  }


  if (audioTrack) {

    await sendTransport.produce({
      track: audioTrack,
    });

    console.log(
      'Audio producer created'
    );
  }
};


const testReceiveTransport = () => {

  return new Promise(
    (resolve, reject) => {

      socket.emit(
  'createRecvTransport',
  {
    roomId,
  },
        (response) => {

          if (response.error) {

            reject(
              new Error(
                response.error
              )
            );

            return;
          }

          console.log(
            'Receive transport data received:',
            response
          );


          recvTransport =
            device.createRecvTransport(
              response
            );


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

                  if (
                    response.error ||
                    response.success === false
                  ) {

                    errback(
                      new Error(
                        response.error ||
                        'Failed to connect receive transport'
                      )
                    );

                    return;
                  }

                  callback();

                  console.log(
                    'Receive transport connected'
                  );
                }
              );
            }
          );


          resolve(
            recvTransport
          );
        }
      );
    }
  );
};


 
const getActiveProducers = () => {
  return new Promise((resolve, reject) => {
    socket.emit(
      'getProducers',
      {
        roomId,
      },
      (response) => {
        if (response.error) {
          reject(
            new Error(response.error)
          );
          return;
        }

        console.log(
          'Active producers:',
          response.producers
        );

        resolve(response.producers);
      }
    );
  });
};

   


const consumeProducer = (
  producerId
) => {

  return new Promise(
    (resolve, reject) => {

      socket.emit(
        'consume',
        {
          transportId:
            recvTransport.id,

          producerId,

          rtpCapabilities:
            device.rtpCapabilities,
        },

        async (response) => {

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
                id: response.id,

                producerId:
                  response.producerId,

                kind:
                  response.kind,

                rtpParameters:
                  response.rtpParameters,
              });


            console.log(
              `Consumer created: ${consumer.id} (${consumer.kind})`
            );

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

                if (
                  resumeResponse.error ||
                  resumeResponse.success === false
                ) {

                  reject(
                    new Error(
                      resumeResponse.error ||
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
    }
  );
};


const consumeExistingProducers = async () => {

  try {

    const producers =
      await getActiveProducers();


    if (!producers.length) {

      console.log(
        'No active producers'
      );

      return;
    }


    const stream =
      new MediaStream();


    for (const producer of producers) {

  try {

    const consumer =
      await consumeProducer(
        producer.id
      );


        stream.addTrack(
          consumer.track
        );

        console.log(
          `Added ${consumer.kind} track to remote stream`
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

      remoteVideo.srcObject =
        stream;

      await remoteVideo.play();

      console.log(
        'Remote stream playing'
      );
    }

  } catch (error) {

    console.error(
      'Failed to consume producers:',
      error
    );
  }
};


socket.on(
  'newProducer',
  async (producer) => {
    console.log(
      'New producer:',
      producer
    );

    try {
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

      await remoteVideo.play();

      console.log(
        `Added new ${producer.kind} producer to remote stream`
      );

    } catch (error) {
      console.error(
        `Failed to consume new producer ${producer.id}:`,
        error
      );
    }
  }
);


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
      console.log(
        'No consumer found for producer:',
        producer.id
      );

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

    stream.removeTrack(
      consumer.track
    );

    consumer.track.stop();

    console.log(
      `Removed ${producer.kind} track from remote stream`
    );

    if (
      stream.getTracks().length === 0
    ) {
      remoteVideo.srcObject = null;

      console.log(
        'Remote stream ended'
      );
    }
  }
);


const initializeMediasoup = async () => {
  try {
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

    await testReceiveTransport();

  } catch (error) {
    console.error(
      'Failed to initialize Mediasoup:',
      error
    );

    throw error;
  }
};



    const createBroadcastRoom = () => {
  return new Promise((resolve, reject) => {
    socket.emit(
      'createRoom',
      {},
      (response) => {
        console.log(
          'Create room response:',
          response
        );

        if (!response.success) {
          reject(
            new Error(response.error)
          );
          return;
        }

        roomId = response.roomId;
        isBroadcaster = true;

        console.log(
          'Broadcast room created:',
          roomId
        );

        resolve(response);
      }
    );
  });
};


const joinBroadcastRoom = (requestedRoomId) => {
  return new Promise((resolve, reject) => {

    socket.emit(
      'joinRoom',
      {
        roomId: requestedRoomId,
      },

      async (response) => {

        console.log(
          'Join room response:',
          response
        );

        if (!response.success) {
          reject(
            new Error(response.error)
          );
          return;
        }

        roomId = response.roomId;

        isBroadcaster = false;

        try {

          await testReceiveTransport();

          await consumeExistingProducers();

          console.log(
            'Joined broadcast successfully'
          );

          resolve(response);

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

