import type { IncomingMessage, Server as HttpServer } from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessTokenForLive } from './authService.ts';

export type LiveCaptureMode =
  | 'desktop_screen'
  | 'desktop_webcam'
  | 'mobile_screen'
  | 'mobile_camera';

export interface LiveStreamStatus {
  isLive: boolean;
  mode: LiveCaptureMode | null;
  title: string;
  startedAt: string | null;
  broadcasterName: string | null;
  viewerCount: number;
}

export interface LiveChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'admin_geral' | 'client';
  text: string;
  createdAt: string;
}

interface LiveClientConnection {
  connectionId: string;
  ws: WebSocket;
  authenticated: boolean;
  isAlive: boolean;
  userId: string;
  userName: string;
  isAdminGeral: boolean;
  role: 'admin' | 'client';
  isBroadcasting: boolean;
  joinedAsViewer: boolean;
}

const VALID_MODES = new Set<LiveCaptureMode>([
  'desktop_screen',
  'desktop_webcam',
  'mobile_screen',
  'mobile_camera',
]);

const MAX_CHAT_HISTORY = 200;
const MAX_CHAT_TEXT_LENGTH = 500;
const DEFAULT_LIVE_TITLE = 'Leilão ao Vivo — USAFAST Hub';

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function isOriginAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // Non-browser / Node test clients

  try {
    const parsedOrigin = new URL(origin);
    const originHost = parsedOrigin.host.toLowerCase();
    const originHostname = parsedOrigin.hostname.toLowerCase();
    const requestHost = String(
      req.headers['x-forwarded-host'] || req.headers.host || ''
    )
      .split(',')[0]
      .trim()
      .toLowerCase();

    if (requestHost && originHost === requestHost) {
      return true;
    }

    if (originHostname === 'localhost' || originHostname === '127.0.0.1') {
      return true;
    }

    // Cloud Run / AI Studio preview & deployed URLs behind reverse proxy
    if (
      parsedOrigin.protocol === 'https:' &&
      originHostname.endsWith('.run.app')
    ) {
      return true;
    }

    const appUrl = process.env.APP_URL;
    if (appUrl) {
      try {
        if (new URL(appUrl).host.toLowerCase() === originHost) {
          return true;
        }
      } catch {}
    }

    return false;
  } catch {
    return false;
  }
}

export function attachLiveWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  const clients = new Map<string, LiveClientConnection>();
  let activeBroadcasterConnId: string | null = null;

  const liveState: {
    isLive: boolean;
    mode: LiveCaptureMode | null;
    title: string;
    startedAt: string | null;
    broadcasterName: string | null;
  } = {
    isLive: false,
    mode: null,
    title: DEFAULT_LIVE_TITLE,
    startedAt: null,
    broadcasterName: null,
  };

  let chatHistory: LiveChatMessage[] = [];

  function getViewerCount(): number {
    let count = 0;
    for (const c of clients.values()) {
      if (c.authenticated && c.joinedAsViewer && !c.isBroadcasting) {
        count += 1;
      }
    }
    return count;
  }

  function buildStatusPayload(): LiveStreamStatus {
    return {
      isLive: liveState.isLive,
      mode: liveState.mode,
      title: liveState.title,
      startedAt: liveState.startedAt,
      broadcasterName: liveState.broadcasterName,
      viewerCount: getViewerCount(),
    };
  }

  function broadcastToAuthenticated(payload: Record<string, unknown>) {
    for (const c of clients.values()) {
      if (c.authenticated) {
        safeSend(c.ws, payload);
      }
    }
  }

  function broadcastStatus() {
    broadcastToAuthenticated({
      type: 'live:status',
      status: buildStatusPayload(),
    });
  }

  function stopActiveBroadcast(reason?: string) {
    if (!liveState.isLive && !activeBroadcasterConnId) return;

    const prevBroadcaster = activeBroadcasterConnId
      ? clients.get(activeBroadcasterConnId)
      : undefined;
    if (prevBroadcaster) {
      prevBroadcaster.isBroadcasting = false;
    }

    activeBroadcasterConnId = null;
    liveState.isLive = false;
    liveState.mode = null;
    liveState.startedAt = null;
    liveState.broadcasterName = null;

    broadcastToAuthenticated({
      type: 'live:ended',
      reason: reason || 'Transmissão encerrada pelo administrador.',
      status: buildStatusPayload(),
    });
  }

  const heartbeatInterval = setInterval(() => {
    for (const [connId, client] of clients.entries()) {
      if (!client.isAlive) {
        clients.delete(connId);
        try {
          client.ws.terminate();
        } catch {}
        if (activeBroadcasterConnId === connId) {
          stopActiveBroadcast('A conexão do transmissor foi interrompida.');
        } else if (client.joinedAsViewer) {
          broadcastStatus();
        }
        continue;
      }
      client.isAlive = false;
      try {
        client.ws.ping();
      } catch {}
    }
  }, 25_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const rawUrl = req.url || '/';
    let pathname = '/';
    try {
      pathname = new URL(rawUrl, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== '/ws/live') {
      return;
    }

    if (!isOriginAllowed(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const connectionId = crypto.randomUUID();
    const client: LiveClientConnection = {
      connectionId,
      ws,
      authenticated: false,
      isAlive: true,
      userId: '',
      userName: '',
      isAdminGeral: false,
      role: 'client',
      isBroadcasting: false,
      joinedAsViewer: false,
    };

    clients.set(connectionId, client);

    const authTimeout = setTimeout(() => {
      if (!client.authenticated) {
        safeSend(ws, {
          type: 'auth:error',
          error: 'Tempo limite de autenticação esgotado.',
        });
        ws.close(4001, 'Auth timeout');
      }
    }, 10_000);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        safeSend(ws, { type: 'error', error: 'Mensagem inválida.' });
        return;
      }

      if (!msg || typeof msg.type !== 'string') {
        return;
      }

      if (msg.type === 'ping') {
        safeSend(ws, { type: 'pong' });
        return;
      }

      // 1. Authenticate WebSocket connection using verified Supabase session token
      if (msg.type === 'auth') {
        clearTimeout(authTimeout);
        const token = String(msg.token || '');
        const authRes = await verifyAccessTokenForLive(token);

        if (!authRes.ok || !authRes.userId) {
          safeSend(ws, {
            type: 'auth:error',
            error: authRes.error || 'Falha na autenticação da sala ao vivo.',
          });
          ws.close(4001, 'Unauthorized');
          return;
        }

        client.authenticated = true;
        client.userId = authRes.userId;
        client.userName = authRes.userName || 'Arrematante';
        client.role = authRes.role || 'client';
        client.isAdminGeral = Boolean(authRes.isAdminGeral);

        if (msg.joinAs === 'viewer') {
          client.joinedAsViewer = true;
        }

        safeSend(ws, {
          type: 'live:init',
          connectionId,
          user: {
            id: client.userId,
            name: client.userName,
            role: client.role,
            isAdminGeral: client.isAdminGeral,
          },
          status: buildStatusPayload(),
          chatHistory,
        });

        if (client.joinedAsViewer) {
          broadcastStatus();
          if (liveState.isLive && activeBroadcasterConnId) {
            const broadcaster = clients.get(activeBroadcasterConnId);
            if (broadcaster) {
              safeSend(broadcaster.ws, {
                type: 'viewer:joined',
                viewerId: connectionId,
                viewerName: client.userName,
              });
            }
          }
        }
        return;
      }

      if (!client.authenticated) {
        safeSend(ws, {
          type: 'auth:error',
          error: 'Autenticação necessária antes de enviar comandos.',
        });
        return;
      }

      // 2. Viewer explicitly joins / requests stream offer
      if (msg.type === 'viewer:join' || msg.type === 'viewer:request-offer') {
        if (!client.joinedAsViewer) {
          client.joinedAsViewer = true;
          broadcastStatus();
        }
        if (liveState.isLive && activeBroadcasterConnId) {
          const broadcaster = clients.get(activeBroadcasterConnId);
          if (broadcaster && broadcaster.connectionId !== connectionId) {
            safeSend(broadcaster.ws, {
              type: 'viewer:joined',
              viewerId: connectionId,
              viewerName: client.userName,
            });
          }
        }
        return;
      }

      // 3. Admin Geral starts broadcast
      if (msg.type === 'broadcaster:start') {
        if (!client.isAdminGeral) {
          safeSend(ws, {
            type: 'error',
            error: 'Apenas o Admin Geral pode transmitir ao vivo.',
          });
          return;
        }

        const requestedMode = String(msg.mode || 'desktop_screen') as LiveCaptureMode;
        const mode: LiveCaptureMode = VALID_MODES.has(requestedMode)
          ? requestedMode
          : 'desktop_screen';
        const title = String(msg.title || DEFAULT_LIVE_TITLE)
          .trim()
          .slice(0, 120) || DEFAULT_LIVE_TITLE;

        // If another admin socket was previously broadcasting, stop that prior session cleanly
        if (
          activeBroadcasterConnId &&
          activeBroadcasterConnId !== connectionId
        ) {
          const oldBroadcaster = clients.get(activeBroadcasterConnId);
          if (oldBroadcaster) {
            oldBroadcaster.isBroadcasting = false;
            safeSend(oldBroadcaster.ws, {
              type: 'live:superseded',
              reason: 'Outra sessão do Admin Geral assumiu a transmissão.',
            });
          }
        }

        activeBroadcasterConnId = connectionId;
        client.isBroadcasting = true;
        client.joinedAsViewer = false;

        liveState.isLive = true;
        liveState.mode = mode;
        liveState.title = title;
        liveState.startedAt = new Date().toISOString();
        liveState.broadcasterName = client.userName || 'Admin Geral';

        broadcastStatus();

        // Notify broadcaster of all viewers currently waiting in the room
        const waitingViewers = Array.from(clients.values())
          .filter(
            (c) =>
              c.authenticated &&
              c.joinedAsViewer &&
              c.connectionId !== connectionId
          )
          .map((c) => ({
            viewerId: c.connectionId,
            viewerName: c.userName,
          }));

        if (waitingViewers.length > 0) {
          safeSend(client.ws, {
            type: 'live:existing-viewers',
            viewers: waitingViewers,
          });
        }
        return;
      }

      // 4. Admin Geral updates mode or title mid-stream
      if (msg.type === 'broadcaster:update') {
        if (!client.isAdminGeral || activeBroadcasterConnId !== connectionId) {
          return;
        }
        if (typeof msg.mode === 'string' && VALID_MODES.has(msg.mode as LiveCaptureMode)) {
          liveState.mode = msg.mode as LiveCaptureMode;
        }
        if (typeof msg.title === 'string') {
          const cleanTitle = msg.title.trim().slice(0, 120);
          if (cleanTitle) liveState.title = cleanTitle;
        }
        broadcastStatus();
        return;
      }

      // 5. Admin Geral stops broadcast
      if (msg.type === 'broadcaster:stop') {
        if (!client.isAdminGeral) return;
        if (activeBroadcasterConnId === connectionId || !activeBroadcasterConnId) {
          stopActiveBroadcast('Transmissão encerrada pelo administrador.');
        }
        return;
      }

      // 6. WebRTC Signaling Relay (offer -> viewer, answer -> broadcaster, ice -> peer)
      if (msg.type === 'webrtc:offer') {
        if (!client.isAdminGeral || activeBroadcasterConnId !== connectionId) {
          return;
        }
        const targetId = String(msg.targetId || '');
        const target = clients.get(targetId);
        if (target && target.authenticated) {
          safeSend(target.ws, {
            type: 'webrtc:offer',
            fromId: connectionId,
            sdp: msg.sdp,
          });
        }
        return;
      }

      if (msg.type === 'webrtc:answer') {
        const targetId = String(msg.targetId || '');
        if (!activeBroadcasterConnId || targetId !== activeBroadcasterConnId) {
          return;
        }
        const broadcaster = clients.get(activeBroadcasterConnId);
        if (broadcaster && broadcaster.authenticated) {
          safeSend(broadcaster.ws, {
            type: 'webrtc:answer',
            fromId: connectionId,
            sdp: msg.sdp,
          });
        }
        return;
      }

      if (msg.type === 'webrtc:ice') {
        const targetId = String(msg.targetId || '');
        const target = clients.get(targetId);
        if (!target || !target.authenticated || !msg.candidate) return;

        const isFromActiveBroadcaster =
          client.isAdminGeral && activeBroadcasterConnId === connectionId;
        const isToActiveBroadcaster =
          Boolean(activeBroadcasterConnId) && targetId === activeBroadcasterConnId;

        if (!isFromActiveBroadcaster && !isToActiveBroadcaster) {
          return;
        }

        safeSend(target.ws, {
          type: 'webrtc:ice',
          fromId: connectionId,
          candidate: msg.candidate,
        });
        return;
      }

      // 7. Real-time Chat (Bate-papo ao Vivo)
      if (msg.type === 'chat:send') {
        const rawText = String(msg.text || '')
          .replace(/[\r\n\t]+/g, ' ')
          .trim();

        if (!rawText) return;
        const text = rawText.slice(0, MAX_CHAT_TEXT_LENGTH);

        const chatMessage: LiveChatMessage = {
          id: crypto.randomUUID(),
          senderId: client.userId,
          senderName: client.userName,
          senderRole: client.isAdminGeral ? 'admin_geral' : 'client',
          text,
          createdAt: new Date().toISOString(),
        };

        chatHistory = [...chatHistory, chatMessage].slice(-MAX_CHAT_HISTORY);
        broadcastToAuthenticated({
          type: 'chat:message',
          message: chatMessage,
        });
        return;
      }

      if (msg.type === 'chat:delete') {
        if (!client.isAdminGeral) return;
        const messageId = String(msg.messageId || '');
        if (!messageId) return;
        chatHistory = chatHistory.filter((m) => m.id !== messageId);
        broadcastToAuthenticated({
          type: 'chat:deleted',
          messageId,
        });
        return;
      }

      if (msg.type === 'chat:clear') {
        if (!client.isAdminGeral) return;
        chatHistory = [];
        broadcastToAuthenticated({
          type: 'chat:cleared',
        });
        return;
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      clients.delete(connectionId);

      if (activeBroadcasterConnId === connectionId) {
        stopActiveBroadcast('A transmissão foi encerrada.');
      } else if (client.authenticated && client.joinedAsViewer) {
        broadcastStatus();
        if (activeBroadcasterConnId) {
          const broadcaster = clients.get(activeBroadcasterConnId);
          if (broadcaster) {
            safeSend(broadcaster.ws, {
              type: 'viewer:left',
              viewerId: connectionId,
            });
          }
        }
      }
    });
  });

  return {
    getStatus: buildStatusPayload,
  };
}
