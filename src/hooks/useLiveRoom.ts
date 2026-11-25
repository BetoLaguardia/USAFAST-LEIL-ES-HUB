import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { LiveCaptureMode, LiveChatMessage, LiveStreamStatus } from '../types/live';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const INITIAL_STATUS: LiveStreamStatus = {
  isLive: false,
  mode: null,
  title: 'Leilão ao Vivo — USAFAST Hub',
  startedAt: null,
  broadcasterName: null,
  viewerCount: 0,
};

export interface UseLiveRoomOptions {
  role: 'viewer' | 'broadcaster';
  enabled?: boolean;
}

export function useLiveRoom({ role, enabled = true }: UseLiveRoomOptions) {
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'error'
  >('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStreamStatus>(INITIAL_STATUS);
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);

  // Viewer media stream state
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Broadcaster local media stream & capture state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [activeMode, setActiveMode] = useState<LiveCaptureMode>('desktop_screen');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isStartingMedia, setIsStartingMedia] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);

  // Viewer WebRTC refs
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);
  const viewerRemoteStreamRef = useRef<MediaStream | null>(null);
  const viewerPendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  // Broadcaster WebRTC refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const isBroadcastingRef = useRef(false);
  const activeModeRef = useRef<LiveCaptureMode>('desktop_screen');
  const broadcasterTitleRef = useRef<string>('Leilão ao Vivo — USAFAST Hub');
  const broadcasterPcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const broadcasterPendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const cleanupViewerPc = useCallback(() => {
    if (viewerPcRef.current) {
      try {
        viewerPcRef.current.onicecandidate = null;
        viewerPcRef.current.ontrack = null;
        viewerPcRef.current.onconnectionstatechange = null;
        viewerPcRef.current.close();
      } catch {}
      viewerPcRef.current = null;
    }
    viewerPendingIceRef.current = [];
    viewerRemoteStreamRef.current = null;
    setRemoteStream(null);
  }, []);

  const closeBroadcasterPeer = useCallback((viewerId: string) => {
    const pc = broadcasterPcsRef.current.get(viewerId);
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {}
      broadcasterPcsRef.current.delete(viewerId);
    }
    broadcasterPendingIceRef.current.delete(viewerId);
  }, []);

  const cleanupAllBroadcasterPeers = useCallback(() => {
    for (const viewerId of Array.from(broadcasterPcsRef.current.keys())) {
      closeBroadcasterPeer(viewerId);
    }
  }, [closeBroadcasterPeer]);

  const stopLocalTracks = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.onended = null;
        track.stop();
      } catch {}
    });
  }, []);

  const stopBroadcast = useCallback(() => {
    isBroadcastingRef.current = false;
    setIsBroadcasting(false);
    cleanupAllBroadcasterPeers();
    stopLocalTracks(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    setIsMicMuted(false);
    sendWs({ type: 'broadcaster:stop' });
  }, [cleanupAllBroadcasterPeers, sendWs, stopLocalTracks]);

  const createOfferForViewer = useCallback(
    async (viewerId: string) => {
      const stream = localStreamRef.current;
      if (!stream || !isBroadcastingRef.current) return;

      closeBroadcasterPeer(viewerId);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      broadcasterPcsRef.current.set(viewerId, pc);

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWs({
            type: 'webrtc:ice',
            targetId: viewerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          closeBroadcasterPeer(viewerId);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendWs({
          type: 'webrtc:offer',
          targetId: viewerId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error('[Live] Falha ao criar oferta WebRTC:', err);
        closeBroadcasterPeer(viewerId);
      }
    },
    [closeBroadcasterPeer, sendWs]
  );

  const handleViewerOffer = useCallback(
    async (fromId: string, sdp: RTCSessionDescriptionInit) => {
      cleanupViewerPc();

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      viewerPcRef.current = pc;

      const mediaStream = new MediaStream();
      viewerRemoteStreamRef.current = mediaStream;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((t) => {
            if (!mediaStream.getTracks().some((existing) => existing.id === t.id)) {
              mediaStream.addTrack(t);
            }
          });
        } else if (event.track) {
          if (!mediaStream.getTracks().some((existing) => existing.id === event.track.id)) {
            mediaStream.addTrack(event.track);
          }
        }
        setRemoteStream(new MediaStream(mediaStream.getTracks()));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWs({
            type: 'webrtc:ice',
            targetId: fromId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          sendWs({ type: 'viewer:request-offer' });
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const candidate of viewerPendingIceRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
        viewerPendingIceRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWs({
          type: 'webrtc:answer',
          targetId: fromId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error('[Live] Erro ao responder oferta WebRTC:', err);
      }
    },
    [cleanupViewerPc, sendWs]
  );

  // Merge incoming chat message idempotently by id
  const appendUniqueMessage = useCallback((incoming: LiveChatMessage) => {
    setChatMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      return [...prev, incoming].slice(-200);
    });
  }, []);

  // Connect & maintain WebSocket lifecycle
  useEffect(() => {
    if (!enabled) return;
    unmountedRef.current = false;
    let attempt = 0;

    const connect = async () => {
      if (unmountedRef.current) return;

      if (!supabase) {
        setConnectionState('error');
        setConnectionError('Autenticação indisponível no momento.');
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setConnectionState('error');
        setConnectionError('Sessão expirada. Faça login novamente.');
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;

      setConnectionState(attempt === 0 ? 'connecting' : 'reconnecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnectionError(null);
        ws.send(
          JSON.stringify({
            type: 'auth',
            token,
            joinAs: role === 'viewer' ? 'viewer' : 'broadcaster',
          })
        );

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20_000);
      };

      ws.onmessage = async (event) => {
        let msg: any;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
          case 'live:init': {
            setConnectionState('connected');
            setConnectionError(null);
            if (msg.status) setLiveStatus(msg.status);
            if (Array.isArray(msg.chatHistory)) {
              const uniqueMap = new Map<string, LiveChatMessage>();
              for (const m of msg.chatHistory) {
                if (m?.id) uniqueMap.set(m.id, m);
              }
              setChatMessages(Array.from(uniqueMap.values()).slice(-200));
            }
            if (
              role === 'broadcaster' &&
              isBroadcastingRef.current &&
              localStreamRef.current
            ) {
              ws.send(
                JSON.stringify({
                  type: 'broadcaster:start',
                  mode: activeModeRef.current,
                  title: broadcasterTitleRef.current,
                })
              );
            }
            break;
          }
          case 'auth:error': {
            setConnectionState('error');
            setConnectionError(msg.error || 'Acesso negado à sala ao vivo.');
            break;
          }
          case 'live:status': {
            if (msg.status) setLiveStatus(msg.status);
            break;
          }
          case 'live:ended': {
            if (msg.status) setLiveStatus(msg.status);
            if (role === 'viewer') {
              cleanupViewerPc();
            }
            break;
          }
          case 'live:superseded': {
            if (role === 'broadcaster') {
              isBroadcastingRef.current = false;
              setIsBroadcasting(false);
              cleanupAllBroadcasterPeers();
              stopLocalTracks(localStreamRef.current);
              localStreamRef.current = null;
              setLocalStream(null);
              setMediaError(msg.reason || 'Outra sessão assumiu a transmissão.');
            }
            break;
          }
          case 'live:existing-viewers': {
            if (role === 'broadcaster' && Array.isArray(msg.viewers)) {
              for (const v of msg.viewers) {
                if (v?.viewerId) {
                  await createOfferForViewer(v.viewerId);
                }
              }
            }
            break;
          }
          case 'viewer:joined': {
            if (role === 'broadcaster' && msg.viewerId) {
              await createOfferForViewer(msg.viewerId);
            }
            break;
          }
          case 'viewer:left': {
            if (role === 'broadcaster' && msg.viewerId) {
              closeBroadcasterPeer(msg.viewerId);
            }
            break;
          }
          case 'webrtc:offer': {
            if (role === 'viewer' && msg.fromId && msg.sdp) {
              await handleViewerOffer(msg.fromId, msg.sdp);
            }
            break;
          }
          case 'webrtc:answer': {
            if (role === 'broadcaster' && msg.fromId && msg.sdp) {
              const pc = broadcasterPcsRef.current.get(msg.fromId);
              if (pc) {
                await pc
                  .setRemoteDescription(new RTCSessionDescription(msg.sdp))
                  .catch(() => {});
                const queued = broadcasterPendingIceRef.current.get(msg.fromId) || [];
                for (const candidate of queued) {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
                }
                broadcasterPendingIceRef.current.delete(msg.fromId);
              }
            }
            break;
          }
          case 'webrtc:ice': {
            if (!msg.fromId || !msg.candidate) break;
            if (role === 'viewer') {
              const pc = viewerPcRef.current;
              if (pc && pc.remoteDescription) {
                await pc
                  .addIceCandidate(new RTCIceCandidate(msg.candidate))
                  .catch(() => {});
              } else {
                viewerPendingIceRef.current.push(msg.candidate);
              }
            } else if (role === 'broadcaster') {
              const pc = broadcasterPcsRef.current.get(msg.fromId);
              if (pc && pc.remoteDescription) {
                await pc
                  .addIceCandidate(new RTCIceCandidate(msg.candidate))
                  .catch(() => {});
              } else {
                const existing = broadcasterPendingIceRef.current.get(msg.fromId) || [];
                existing.push(msg.candidate);
                broadcasterPendingIceRef.current.set(msg.fromId, existing);
              }
            }
            break;
          }
          case 'chat:message': {
            if (msg.message) appendUniqueMessage(msg.message);
            break;
          }
          case 'chat:deleted': {
            if (msg.messageId) {
              setChatMessages((prev) => prev.filter((m) => m.id !== msg.messageId));
            }
            break;
          }
          case 'chat:cleared': {
            setChatMessages([]);
            break;
          }
          default:
            break;
        }
      };

      ws.onclose = (ev) => {
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (unmountedRef.current || ev.code === 4001) return;

        attempt += 1;
        setConnectionState('reconnecting');
        const delayMs = Math.min(1000 * Math.pow(1.5, attempt), 8000);
        reconnectTimerRef.current = window.setTimeout(connect, delayMs);
      };

      ws.onerror = () => {
        // Error is followed by onclose which schedules reconnect
      };
    };

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        try {
          if (role === 'broadcaster' && isBroadcastingRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'broadcaster:stop' }));
          }
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      cleanupViewerPc();
      cleanupAllBroadcasterPeers();
      stopLocalTracks(localStreamRef.current);
      localStreamRef.current = null;
    };
  }, [
    appendUniqueMessage,
    cleanupAllBroadcasterPeers,
    cleanupViewerPc,
    closeBroadcasterPeer,
    createOfferForViewer,
    enabled,
    handleViewerOffer,
    role,
    stopLocalTracks,
  ]);

  const acquireStreamForMode = useCallback(
    async (
      mode: LiveCaptureMode,
      facing: 'environment' | 'user'
    ): Promise<MediaStream> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        throw new Error(
          'Seu navegador não permite captura de mídia nesta conexão. Utilize HTTPS ou navegador atualizado.'
        );
      }

      if (mode === 'desktop_screen') {
        if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
          throw new Error(
            'Compartilhamento de tela não suportado neste navegador.'
          );
        }
        try {
          return await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (err: any) {
          if (err?.name === 'NotAllowedError') {
            throw new Error('Permissão de compartilhamento de tela cancelada.');
          }
          // Fallback to video-only screen share if audio capture fails
          return await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (mode === 'desktop_webcam') {
        if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
          throw new Error('Acesso à webcam não suportado neste navegador.');
        }
        return await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      if (mode === 'mobile_screen') {
        if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
          throw new Error(
            'Este navegador móvel não suporta captura da tela do celular (comum no iOS Safari). Use o modo "Câmera do Celular + Microfone" ou Chrome no Android.'
          );
        }
        try {
          return await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } catch (err: any) {
          if (err?.name === 'NotAllowedError') {
            throw new Error('Captura da tela do celular cancelada.');
          }
          try {
            return await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: false,
            });
          } catch {
            throw new Error(
              'Não foi possível capturar a tela deste celular. Utilize o modo Câmera do Celular.'
            );
          }
        }
      }

      // mobile_camera
      if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Acesso à câmera do celular não suportado.');
      }
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    },
    []
  );

  const replaceOrRenegotiateStream = useCallback(
    async (newStream: MediaStream) => {
      const newVideoTrack = newStream.getVideoTracks()[0] || null;
      const newAudioTrack = newStream.getAudioTracks()[0] || null;

      for (const [viewerId, pc] of broadcasterPcsRef.current.entries()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        const audioSender = senders.find((s) => s.track?.kind === 'audio');

        let needsRenegotiation = false;

        if (videoSender && newVideoTrack) {
          await videoSender.replaceTrack(newVideoTrack);
        } else if (newVideoTrack && !videoSender) {
          pc.addTrack(newVideoTrack, newStream);
          needsRenegotiation = true;
        }

        if (audioSender && newAudioTrack) {
          await audioSender.replaceTrack(newAudioTrack);
        } else if (audioSender && !newAudioTrack) {
          await audioSender.replaceTrack(null);
        } else if (newAudioTrack && !audioSender) {
          pc.addTrack(newAudioTrack, newStream);
          needsRenegotiation = true;
        }

        if (needsRenegotiation) {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendWs({
              type: 'webrtc:offer',
              targetId: viewerId,
              sdp: pc.localDescription,
            });
          } catch {}
        }
      }
    },
    [sendWs]
  );

  const startBroadcast = useCallback(
    async (mode: LiveCaptureMode, title?: string, facingOverride?: 'environment' | 'user') => {
      if (role !== 'broadcaster') return false;
      setMediaError(null);
      setIsStartingMedia(true);

      const effectiveFacing = facingOverride ?? cameraFacing;

      try {
        const stream = await acquireStreamForMode(mode, effectiveFacing);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            // Stop cleanly if the user clicks browser's native "Stop sharing" control
            if (isBroadcastingRef.current && localStreamRef.current === stream) {
              stopBroadcast();
            }
          };
        }

        const previousStream = localStreamRef.current;
        localStreamRef.current = stream;
        setLocalStream(stream);
        setActiveMode(mode);
        activeModeRef.current = mode;
        setIsMicMuted(false);

        if (title && title.trim()) {
          broadcasterTitleRef.current = title.trim();
        }

        if (isBroadcastingRef.current) {
          await replaceOrRenegotiateStream(stream);
          stopLocalTracks(previousStream);
          sendWs({
            type: 'broadcaster:update',
            mode,
            title: broadcasterTitleRef.current,
          });
        } else {
          stopLocalTracks(previousStream);
          isBroadcastingRef.current = true;
          setIsBroadcasting(true);
          sendWs({
            type: 'broadcaster:start',
            mode,
            title: broadcasterTitleRef.current,
          });
        }

        setIsStartingMedia(false);
        return true;
      } catch (err: any) {
        setIsStartingMedia(false);
        const msg =
          err?.message ||
          (err?.name === 'NotAllowedError'
            ? 'Permissão de câmera, microfone ou tela negada pelo navegador.'
            : 'Não foi possível iniciar a captura de mídia.');
        setMediaError(msg);
        return false;
      }
    },
    [
      acquireStreamForMode,
      cameraFacing,
      replaceOrRenegotiateStream,
      role,
      sendWs,
      stopBroadcast,
      stopLocalTracks,
    ]
  );

  const toggleCameraFacing = useCallback(async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (isBroadcastingRef.current && activeModeRef.current === 'mobile_camera') {
      await startBroadcast('mobile_camera', broadcasterTitleRef.current, nextFacing);
    }
  }, [cameraFacing, startBroadcast]);

  const toggleMicMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !isMicMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMicMuted(nextMuted);
  }, [isMicMuted]);

  const updateBroadcastTitle = useCallback(
    (title: string) => {
      broadcasterTitleRef.current = title.trim() || 'Leilão ao Vivo — USAFAST Hub';
      if (isBroadcastingRef.current) {
        sendWs({
          type: 'broadcaster:update',
          title: broadcasterTitleRef.current,
        });
      }
    },
    [sendWs]
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return false;
      return sendWs({ type: 'chat:send', text: clean });
    },
    [sendWs]
  );

  const deleteChatMessage = useCallback(
    (messageId: string) => {
      return sendWs({ type: 'chat:delete', messageId });
    },
    [sendWs]
  );

  const clearChat = useCallback(() => {
    return sendWs({ type: 'chat:clear' });
  }, [sendWs]);

  const requestStreamReconnect = useCallback(() => {
    cleanupViewerPc();
    sendWs({ type: 'viewer:request-offer' });
  }, [cleanupViewerPc, sendWs]);

  return {
    connectionState,
    connectionError,
    liveStatus,
    chatMessages,
    remoteStream,
    localStream,
    isBroadcasting,
    activeMode,
    setActiveMode,
    cameraFacing,
    isMicMuted,
    mediaError,
    setMediaError,
    isStartingMedia,
    startBroadcast,
    stopBroadcast,
    toggleCameraFacing,
    toggleMicMute,
    updateBroadcastTitle,
    sendChatMessage,
    deleteChatMessage,
    clearChat,
    requestStreamReconnect,
  };
}
