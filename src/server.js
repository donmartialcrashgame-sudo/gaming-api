import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'gaming-api',
    websocket: 'ready'
  });
});

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({
    event: 'connection.ready',
    message: 'WebSocket connection established'
  }));
});

const port = Number(process.env.PORT || 3000);

server.listen(port, () => {
  console.log(`Gaming API listening on port ${port}`);
});
