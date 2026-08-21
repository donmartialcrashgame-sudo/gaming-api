import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { CrashEngine } from './engines/crash/CrashEngine.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const crashEngine = new CrashEngine();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'gaming-api',
    websocket: 'ready'
  });
});

app.get('/api/v1/crash/current', (_req, res) => {
  res.json({
    success: true,
    data: crashEngine.getCurrentRound()
  });
});

app.get('/api/v1/crash/rounds', (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);

  res.json({
    success: true,
    data: crashEngine.getRounds(limit)
  });
});

app.get('/api/v1/crash/rounds/:roundId', (req, res) => {
  const round = crashEngine.getRound(req.params.roundId);

  if (!round) {
    return res.status(404).json({
      success: false,
      error: 'round_not_found'
    });
  }

  return res.json({
    success: true,
    data: round
  });
});

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({
    event: 'connection.ready',
    message: 'WebSocket connection established'
  }));

  socket.send(JSON.stringify({
    event: 'crash.current',
    data: crashEngine.getCurrentRound()
  }));
});

crashEngine.on('event', (payload) => {
  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
});

const port = Number(process.env.PORT || 3000);

server.listen(port, () => {
  console.log(`Gaming API listening on port ${port}`);
  crashEngine.start();
});
