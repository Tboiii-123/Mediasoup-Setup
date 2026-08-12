import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const socket = io('https://213.136.86.178:3000');

let device;
let localStream;
let sendTransport;
let recvTransport;

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

    await testReceiveTransport();

    await consumeExistingProducers();

  } catch (error) {
    console.error(
      'Failed to initialize Mediasoup:',
      error
    );
  }
});


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


goLiveButton.addEventListener(
  'click',
  async () => {

    if (!device) {
      console.error(
        'Mediasoup device is not ready'
      );

      return;
    }

    try {

      await setupSendTransport();

      console.log(
        'Send transport ready'
      );

    } catch (error) {

      console.error(
        'Failed to setup send transport:',
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
        null,
        (response) => {

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
          transportId:
            sendTransport.id,

          kind,

          rtpParameters,
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
        null,
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

  return new Promise(
    (resolve, reject) => {

      socket.emit(
        'getProducers',
        (response) => {

          if (response.error) {

            console.error(
              'Failed to get producers:',
              response.error
            );

            reject(
              new Error(
                response.error
              )
            );

            return;
          }

          console.log(
            'Active producers:',
            response.producers
          );

          resolve(
            response.producers
          );
        }
      );
    }
  );
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
          `Failed to consume producer ${producerId}:`,
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
