import express from 'express';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import { Server } from 'socket.io';

import { PORT, NODE_ENV } from './config/env.js';
import { setupSignaling } from './socket/signaling.js';

import {
  createWorker,
  createRouter,
  createRoom,
} from './services/mediasoup.js';


const app = express();


// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());

app.use(express.json());


// ============================================
// HTTPS SERVER
// ============================================

const httpsServer = https.createServer(
  {
    key: fs.readFileSync(
      './certs/localhost-key.pem'
    ),

    cert: fs.readFileSync(
      './certs/localhost-cert.pem'
    ),
  },

  app
);


// ============================================
// SOCKET.IO
// ============================================

const io = new Server(
  httpsServer,
  {
    cors: {
      origin: '*',
    },
  }
);


// ============================================
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {

  res.json({
    success: true,
    message:
      'Broadcasting server is running',
    environment:
      NODE_ENV,
  });

});


// ============================================
// INTERNAL ROOM CREATION
// ============================================

app.post(
  '/internal/rooms',
  (req, res) => {

    try {

      const {
        roomId,
        userId,
      } = req.body;


      if (!roomId) {

        return res.status(400).json({
          success: false,
          error: 'roomId is required',
        });

      }


      if (!userId) {

        return res.status(400).json({
          success: false,
          error: 'userId is required',
        });

      }


      const room =
        createRoom(
          roomId,
          userId
        );


      return res.status(201).json({

        success: true,

        roomId:
          room.roomId,

        userId:
          room.userId,

        status:
          room.status,

        createdAt:
          room.createdAt,

      });

    } catch (error) {

      console.error(
        'Failed to create internal broadcast room:',
        error
      );


      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);


// ============================================
// SIGNALING
// ============================================

setupSignaling(io);


// ============================================
// START SERVER
// ============================================

const startServer = async () => {

  try {

    await createWorker();

    await createRouter();


    httpsServer.listen(
      PORT,
      () => {

        console.log(
          `Broadcasting server running on port ${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      'Failed to start broadcasting server:',
      error
    );

    process.exit(1);
  }

};


startServer();