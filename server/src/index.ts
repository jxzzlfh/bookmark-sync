/**
 * Bookmark Sync Server
 * Main entry point
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { authRouter } from './routes/auth.js';
import { bookmarksRouter } from './routes/bookmarks.js';
import { setupWebSocket } from './websocket/index.js';
import { initDatabase } from './db/index.js';

const PORT = process.env.PORT || 3000;

async function main() {
  // Initialize database
  await initDatabase();
  console.log('Database initialized');

  // Create Express app
  const app = express();
  const server = createServer(app);

  // Middleware
  app.use(helmet());
  
  // CORS - 允许浏览器扩展和前端访问
  app.use(cors({
    origin: (origin, callback) => {
      // 允许无 origin（如浏览器扩展、curl）
      if (!origin) return callback(null, true);
      
      // 允许的域名列表
      const allowedOrigins = [
        'http://localhost:3001',
        'http://localhost:3000',
        'https://syn.xue.ee',
        'https://nav.xue.ee',
      ];
      
      // 允许 chrome-extension:// 和 moz-extension://
      if (origin.startsWith('chrome-extension://') || 
          origin.startsWith('moz-extension://') ||
          allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      callback(null, true); // 开发阶段允许所有，生产可收紧
    },
    credentials: true,
  }));
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/bookmarks', bookmarksRouter);

  // WebSocket server
  const wss = new WebSocketServer({ server, path: '/ws' });
  setupWebSocket(wss);

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

main().catch(console.error);
