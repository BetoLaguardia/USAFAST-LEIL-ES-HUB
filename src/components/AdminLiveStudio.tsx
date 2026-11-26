import React, { useEffect, useRef, useState } from 'react';
import {
  Monitor,
  Video,
  Smartphone,
  Camera,
  Radio,
  Square,
  Mic,
  MicOff,
  RefreshCw,
  Users,
  AlertCircle,
  SwitchCamera,
  ExternalLink,
} from 'lucide-react';
import { SystemUser } from '../types/auction';
import { LIVE_MODE_LABELS, LiveCaptureMode } from '../types/live';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { LiveChatPanel } from './LiveChatPanel';

interface AdminLiveStudioProps {
  currentUser: SystemUser;
}

const CAPTURE_OPTIONS: {
  mode: LiveCaptureMode;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    mode: 'desktop_screen',
    label: 'Tela / Aba do PC + Áudio',
    description: 'Selecione a aba do navegador ou janela para transmitir ao vivo com áudio.',
    icon: Monitor,
  },
  {
    mode: 'desktop_webcam',
    label: 'Webcam + Microfone',
    description: 'Transmita vídeo e áudio pela webcam do computador.',
    icon: Video,
  },
  {
    mode: 'mobile_screen',
    label: 'Tela do Celular',
    description: 'Compartilhe a tela do aparelho móvel (navegadores compatíveis).',
    icon: Smartphone,
  },
  {
    mode: 'mobile_camera',
    label: 'Câmera do Celular',
    description: 'Use a câmera traseira ou frontal do celular com microfone.',
    icon: Camera,
  },
];

export const AdminLiveStudio: React.FC<AdminLiveStudioProps> = ({
  currentUser,
}) => {
  const {
    connectionState,
    connectionError,
    liveStatus,
    chatMessages,
    localStream,
    isBroadcasting,
    activeMode,
    setActiveMode,
    cameraFacing,
    isMicMuted,
    mediaError,
    setMediaError,
    isDisplayCaptureBlocked,
    isStartingMedia,
    startBroadcast,
    stopBroadcast,
    toggleCameraFacing,
    toggleMicMute,
    updateBroadcastTitle,
    sendChatMessage,
    deleteChatMessage,
    clearChat,
    reconnectRoom,
  } = useLiveRoom({ role: 'broadcaster', enabled: true });

  const [streamTitle, setStreamTitle] = useState('Leilão ao Vivo — USAFAST Hub');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = previewVideoRef.current;
    if (!videoEl) return;
    videoEl.srcObject = localStream;
    if (localStream) {
      videoEl.play().catch(() => {});
    }
  }, [localStream]);

  // Real elapsed timer derived from server startedAt timestamp while live
  useEffect(() => {
    if (!isBroadcasting || !liveStatus.startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const startMs = new Date(liveStatus.startedAt).getTime();
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    updateElapsed();
    const id = window.setInterval(updateElapsed, 1000);
    return () => clearInterval(id);
  }, [isBroadcasting, liveStatus.startedAt]);

  const formatElapsed = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const handleSelectMode = async (mode: LiveCaptureMode) => {
    setMediaError(null);
    setActiveMode(mode);
    if (isBroadcasting) {
      await startBroadcast(mode, streamTitle);
    }
  };

  const handleStartOrStop = async () => {
    if (isBroadcasting) {
      stopBroadcast();
    } else {
      await startBroadcast(activeMode, streamTitle);
    }
  };

  return (
    <div className="space-y-5">
      {/* Studio Top Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1 space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
            Título da Transmissão ao Vivo
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={streamTitle}
              maxLength={120}
              onChange={(e) => {
                setStreamTitle(e.target.value);
                if (isBroadcasting) {
                  updateBroadcastTitle(e.target.value);
                }
              }}
              placeholder="Ex: Leilão Verizon Ao Vivo — Lotes iPhone 15/16"
              className="flex-1 min-h-[40px] bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {liveStatus.viewerCount}
            </span>
            <span className="text-slate-600 dark:text-slate-400">espectadores</span>
          </div>

          {isBroadcasting && (
            <div className="px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <span className="font-mono tabular-nums font-bold text-rose-700 dark:text-rose-300">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={isStartingMedia}
            onClick={handleStartOrStop}
            className={`min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-colors flex items-center gap-2 disabled:opacity-50 ${
              isBroadcasting
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            {isStartingMedia ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Iniciando...</span>
              </>
            ) : isBroadcasting ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>Encerrar Transmissão</span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                <span>Iniciar Transmissão ao Vivo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Errors */}
      {(connectionError || mediaError) && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-800 dark:text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{mediaError || connectionError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDisplayCaptureBlocked && typeof window !== 'undefined' && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir em Nova Aba</span>
              </a>
            )}
            {connectionState !== 'connected' && (
              <button
                type="button"
                onClick={reconnectRoom}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconectar</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4 Capture Modes Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {CAPTURE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = activeMode === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => handleSelectMode(opt.mode)}
              className={`p-3.5 rounded-2xl border text-left transition-colors flex items-start gap-3 ${
                isSelected
                  ? 'bg-amber-500/10 border-amber-400/70 text-slate-900 dark:text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900/80'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-100 dark:bg-slate-950 text-amber-600 dark:text-amber-400 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-bold leading-snug">
                  {opt.label}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Studio Area: Preview Left + Live Chat Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-8 flex flex-col space-y-3">
          <div className="relative w-full aspect-video bg-black border border-slate-800 rounded-2xl overflow-hidden flex items-center justify-center">
            <video
              ref={previewVideoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-contain ${
                localStream ? 'block' : 'hidden'
              }`}
            />

            {!localStream && (
              <div className="px-6 py-10 text-center max-w-md space-y-2.5">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400">
                  <Radio className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  Pré-visualização da Transmissão
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Modo selecionado:{' '}
                  <strong className="text-amber-300">
                    {LIVE_MODE_LABELS[activeMode]}
                  </strong>
                  . Clique em <strong>Iniciar Transmissão ao Vivo</strong> para selecionar a aba, tela ou câmera e transmitir para todos os clientes conectados.
                </p>
              </div>
            )}

            {isBroadcasting && (
              <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/85 border border-rose-500/40 text-[11px] font-bold text-rose-400 uppercase">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <span>Transmitindo ao Vivo</span>
              </div>
            )}
          </div>

          {/* Active Broadcast Controls */}
          <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!localStream}
                onClick={toggleMicMute}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl border font-semibold transition-colors inline-flex items-center gap-1.5 disabled:opacity-40 ${
                  isMicMuted
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {isMicMuted ? (
                  <MicOff className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                ) : (
                  <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                )}
                <span>{isMicMuted ? 'Áudio Silenciado' : 'Áudio Ativo'}</span>
              </button>

              {isBroadcasting && (
                <button
                  type="button"
                  onClick={() => startBroadcast(activeMode, streamTitle)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-semibold transition-colors inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Trocar Aba / Fonte</span>
                </button>
              )}

              {activeMode === 'mobile_camera' && (
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-semibold transition-colors inline-flex items-center gap-1.5"
                >
                  <SwitchCamera className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>
                    {cameraFacing === 'environment'
                      ? 'Câmera Traseira'
                      : 'Câmera Frontal'}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-emerald-500'
                    : connectionState === 'error'
                    ? 'bg-rose-500'
                    : 'bg-amber-400'
                }`}
              />
              <span>
                {connectionState === 'connected'
                  ? 'Servidor ao vivo conectado'
                  : connectionState === 'reconnecting'
                  ? 'Reconectando ao servidor...'
                  : connectionState === 'error'
                  ? 'Falha na conexão ao vivo'
                  : 'Conectando ao servidor...'}
              </span>
              {connectionState !== 'connected' && (
                <button
                  type="button"
                  onClick={reconnectRoom}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-[11px] font-sans font-semibold transition-colors"
                >
                  Reconectar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Chat Moderator Panel */}
        <div className="lg:col-span-4 flex flex-col">
          <LiveChatPanel
            messages={chatMessages}
            onSendMessage={sendChatMessage}
            connectionState={connectionState}
            currentUserId={currentUser.id}
            isAdminModerator={true}
            onDeleteMessage={deleteChatMessage}
            onClearChat={clearChat}
          />
        </div>
      </div>
    </div>
  );
};
