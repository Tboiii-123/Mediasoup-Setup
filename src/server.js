import {
  createWorker,
  createRouter,
} from './services/mediasoup.js';
import express from 'express';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import { Server } from 'socket.io';
import { PORT, NODE_ENV } from './config/env.js';
import { setupSignaling } from './socket/signaling.js';

const app = express();

const httpsServer = https.createServer(
  {
    key: fs.readFileSync('./certs/localhost-key.pem'),
    cert: fs.readFileSync('./certs/localhost-cert.pem'),
  },
  app
);

const io = new Server(httpsServer, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Broadcasting server is running',
    environment: NODE_ENV,
  });
});

setupSignaling(io);

const startServer = async () => {
  await createWorker();
  await createRouter();

  httpsServer.listen(PORT, () => {
    console.log(`Broadcasting server running on port ${PORT}`);
  });
};

startServer();
