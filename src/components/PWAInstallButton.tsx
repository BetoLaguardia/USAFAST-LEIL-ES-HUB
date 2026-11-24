import React, { useState } from 'react';
import { Download, Smartphone, X, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  compact?: boolean;
  fullWidth?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  fullWidth = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [guidePlatform, setGuidePlatform] = useState<'ios' | 'android' | null>(null);

  if (isInstalled) {
    return null;
  }

  const buttonBaseClass = fullWidth
    ? 'w-full justify-center px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors'
    : 'inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-colors whitespace-nowrap';

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={() => {
            void install();
          }}
          className={`${buttonBaseClass} bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm`}
          title="Instalar aplicativo USAFAST Hub na tela inicial"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{compact ? 'App' : 'Instalar App'}</span>
        </button>
      ) : isIOS ? (
        <button
          type="button"
          onClick={() => setGuidePlatform('ios')}
          className={`${buttonBaseClass} bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700`}
          title="Como instalar no iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{compact ? 'App' : 'Instalar no iOS'}</span>
        </button>
      ) : isAndroid ? (
        <button
          type="button"
          onClick={() => setGuidePlatform('android')}
          className={`${buttonBaseClass} bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40`}
          title="Como instalar o app no Android"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{compact ? 'App' : 'App Android'}</span>
        </button>
      ) : null}

      {guidePlatform && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setGuidePlatform(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {guidePlatform === 'ios' ? 'Instalar no iPhone / iPad' : 'Instalar App no Android'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGuidePlatform(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {guidePlatform === 'ios' ? (
              <ol className="space-y-2 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
                <li>
                  Toque no botão <strong className="text-white">Compartilhar</strong> na barra do Safari.
                </li>
                <li>
                  Role para baixo e toque em <strong className="text-white">Adicionar à Tela de Início</strong>.
                </li>
                <li>
                  Confirme em <strong className="text-amber-400">Adicionar</strong> para abrir em tela cheia.
                </li>
              </ol>
            ) : (
              <ol className="space-y-2 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
                <li>
                  Abra o site diretamente no <strong className="text-white">Google Chrome</strong> (fora de pré-visualizações em janela).
                </li>
                <li>
                  Toque no menu <strong className="text-white">⋮</strong> no canto superior direito do Chrome.
                </li>
                <li>
                  Selecione <strong className="text-emerald-400">Instalar aplicativo</strong> ou <strong className="text-white">Adicionar à tela inicial</strong>.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setGuidePlatform(null)}
              className="mt-5 w-full rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 py-2.5 text-xs font-bold transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-xl border border-amber-300">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Modo Offline — Exibindo dados em cache</span>
    </div>
  );
};
