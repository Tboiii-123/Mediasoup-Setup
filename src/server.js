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

    environment: NODE_ENV,
  });
});


// ============================================
// SOCKET.IO SIGNALING
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