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
  getRoom,
  endRoom
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
app.post(
  '/internal/rooms/:roomId/end',
  async (req, res) => {

    try {

      const {
        roomId
      } = req.params;

      const room =
        getRoom(roomId);

      if (!room) {
        return res.status(404).json({
          success: false,
          error: 'Room not found',
        });
      }

      const broadcasterId =
        room.broadcasterId;

      await endRoom(
        roomId,
        broadcasterId
      );

      return res.status(200).json({
        success: true,
        roomId,
      });

    } catch (error) {

      console.error(
        'Failed to end runtime room:',
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

app.post(
  "/internal/rooms/:roomId/comment",
  (req, res) => {

    try {

      const { roomId } =
        req.params;

      const { comment } =
        req.body;

      // --------------------------------
      // Validate
      // --------------------------------

      if (!roomId) {

        return res.status(400).json({
          error:
            "roomId is required",
        });

      }

      if (  !comment ||
        typeof comment !== "object"
      ) {

        return res.status(400).json({
          error:
            "comment is required",
        });

      }
      // --------------------------------
      // Check room
      // --------------------------------

      const room =
        getRoom(roomId);

      if (!room) {

        return res.status(404).json({
          error:
            "Room not found",
        });

      }

      // --------------------------------
      // Broadcast
      // --------------------------------

      io.to( `broadcast:${roomId}`).emit(
        "newComment", comment
      );

      // --------------------------------
      // Response
      // --------------------------------
      return res.json({
        success: true,
        comment,

      });

    } catch (error) {

      console.error(
        "Failed to broadcast comment:",
        error
      );

      return res.status(500).json({

        error:
          "Failed to broadcast comment",

      });

    }
  }
);


app.post(
  "/internal/rooms/:roomId/reaction",
  (req, res) => {

    try {
      const { roomId } = req.params;

      const { reaction } =   req.body;

      // --------------------------------
      // Validate
      // --------------------------------

      if (!roomId) {

        return res.status(400).json({
          error:
            "roomId is required",
        });

      }

      if ( !reaction ||typeof reaction !== "object" ) {
        return res.status(400).json({
          error:
            "reaction is required",
        });

      }

      // --------------------------------
      // Check room
      // --------------------------------

      const room =
        getRoom(roomId);

      if (!room) {

        return res.status(404).json({
          error:
            "Room not found",
        });
      }


      // --------------------------------
      // Broadcast
      // --------------------------------

      io.to( `broadcast:${roomId}`).emit(
        "newReaction", reaction
      );


      // --------------------------------
      // Response
      // --------------------------------

      return res.json({

        success: true,
        reaction,

      });

    } catch (error) {

      console.error(
        "Failed to broadcast reaction:",
        error
      );

      return res.status(500).json({

        error:
          "Failed to broadcast reaction",

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