import React, { useEffect, useRef, useState } from 'react';
import {
  Radio,
  Users,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  MonitorPlay,
  ArrowLeft,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import { SystemUser } from '../types/auction';
import { LIVE_MODE_LABELS } from '../types/live';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { LiveChatPanel } from '../components/LiveChatPanel';

interface LivePageProps {
  currentUser: SystemUser;
  onNavigateHome: () => void;
  onNavigateAuctions: () => void;
  onLogout: () => void;
}

export const LivePage: React.FC<LivePageProps> = ({
  currentUser,
  onNavigateHome,
  onNavigateAuctions,
  onLogout,
}) => {
  const {
    connectionState,
    connectionError,
    liveStatus,
    chatMessages,
    remoteStream,
    sendChatMessage,
    requestStreamReconnect,
  } = useLiveRoom({ role: 'viewer', enabled: true });

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [needsPlayInteraction, setNeedsPlayInteraction] = useState(false);

  // Attach incoming WebRTC remote stream to <video>
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (!remoteStream) {
      videoEl.srcObject = null;
      setNeedsPlayInteraction(false);
      return;
    }

    videoEl.srcObject = remoteStream;
    videoEl.muted = isMuted;
    videoEl.volume = volume;

    videoEl
      .play()
      .then(() => {
        setNeedsPlayInteraction(false);
      })
      .catch(() => {
        // Autoplay with audio may be blocked; retry muted and prompt user to unmute
        videoEl.muted = true;
        setIsMuted(true);
        videoEl.play().catch(() => setNeedsPlayInteraction(true));
      });
  }, [remoteStream]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.muted = isMuted;
    videoEl.volume = volume;
  }, [isMuted, volume]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = async () => {
    const container = stageContainerRef.current;
    if (!container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  const handleUnmuteClick = () => {
    const videoEl = videoRef.current;
    setIsMuted(false);
    if (videoEl) {
      videoEl.muted = false;
      videoEl.play().catch(() => {});
    }
    setNeedsPlayInteraction(false);
  };

  const hasVideo = Boolean(liveStatus.isLive && remoteStream);
  const modeLabel = liveStatus.mode
    ? LIVE_MODE_LABELS[liveStatus.mode]
    : 'Aguardando sinal';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Início</span>
            </button>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              Live de Leilões ao Vivo
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {liveStatus.title || 'Leilão ao Vivo — USAFAST Hub'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
            <Users className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              {liveStatus.viewerCount}
            </span>
            <span className="text-slate-600 dark:text-slate-400">assistindo</span>
          </div>

          <button
            type="button"
            onClick={onNavigateAuctions}
            className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-200/80 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Ver Lotes Ativos
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-rose-500/15 text-slate-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-800 hover:border-rose-500/30 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            title={`Conectado como ${currentUser.name || currentUser.email}`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Connection error alert if any */}
      {connectionError && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{connectionError}</span>
        </div>
      )}

      {/* Main Theater Grid: Video Left (2/3) + Live Chat Right (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Video Theater Column */}
        <div className="lg:col-span-8 flex flex-col space-y-3">
          <div
            ref={stageContainerRef}
            className="relative w-full aspect-video bg-black border border-slate-800 rounded-2xl overflow-hidden flex items-center justify-center"
          >
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted={isMuted}
              className={`w-full h-full object-contain ${
                hasVideo ? 'block' : 'hidden'
              }`}
            />

            {/* Top-left live status overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/85 border border-slate-800 text-[11px] font-bold">
              {liveStatus.isLive ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                  </span>
                  <span className="text-rose-400 tracking-wide uppercase">
                    Ao Vivo
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-slate-500 shrink-0" />
                  <span className="text-slate-300">Aguardando Transmissão</span>
                </>
              )}
            </div>

            {/* Unmute prompt overlay when stream has audio & player started muted */}
            {hasVideo && (isMuted || needsPlayInteraction) && (
              <button
                type="button"
                onClick={handleUnmuteClick}
                className="absolute bottom-14 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95"
              >
                <Volume2 className="w-4 h-4" />
                <span>Ativar Áudio da Transmissão</span>
              </button>
            )}

            {/* Standby / Waiting State when Admin Geral is not streaming */}
            {!hasVideo && (
              <div className="px-6 py-10 text-center max-w-md space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400">
                  <MonitorPlay className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    {liveStatus.isLive
                      ? 'Conectando ao sinal de vídeo...'
                      : 'Nenhuma transmissão ativa no momento'}
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {liveStatus.isLive
                      ? 'Recebendo a tela ao vivo do administrador. Caso demore, clique em reconectar abaixo.'
                      : 'Assim que o Admin Geral iniciar a transmissão ao vivo da tela ou câmera, o vídeo aparecerá automaticamente aqui.'}
                  </p>
                </div>
                {liveStatus.isLive && (
                  <button
                    type="button"
                    onClick={requestStreamReconnect}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reconectar Vídeo</span>
                  </button>
                )}
              </div>
            )}

            {/* Bottom Controls Bar over Video */}
            <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/70 transition-colors"
                  title={isMuted ? 'Ativar som' : 'Silenciar'}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setVolume(next);
                    if (next > 0 && isMuted) setIsMuted(false);
                  }}
                  aria-label="Volume"
                  className="w-20 sm:w-28 accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2">
                {liveStatus.isLive && (
                  <button
                    type="button"
                    onClick={requestStreamReconnect}
                    className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/70 transition-colors"
                    title="Atualizar conexão do vídeo"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/70 transition-colors"
                  title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Stream Metadata Strip */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
                <Radio
                  className={`w-4 h-4 ${
                    liveStatus.isLive ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 dark:text-white truncate">
                  {liveStatus.isLive
                    ? `Transmitido por ${liveStatus.broadcasterName || 'Admin Geral'}`
                    : `Logado como ${currentUser.name || currentUser.email}`}
                </div>
                <div className="text-slate-600 dark:text-slate-400 truncate">
                  Fonte: {modeLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 shrink-0 font-mono text-[11px]">
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
                  ? 'Sala conectada'
                  : connectionState === 'reconnecting'
                  ? 'Reconectando...'
                  : connectionState === 'error'
                  ? 'Erro de conexão'
                  : 'Conectando...'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Chat Column */}
        <div className="lg:col-span-4 flex flex-col">
          <LiveChatPanel
            messages={chatMessages}
            onSendMessage={sendChatMessage}
            connectionState={connectionState}
            currentUserId={currentUser.id}
          />
        </div>
      </div>
    </div>
  );
};
