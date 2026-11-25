import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Trash2, ShieldCheck } from 'lucide-react';
import { LiveChatMessage } from '../types/live';

interface LiveChatPanelProps {
  messages: LiveChatMessage[];
  onSendMessage: (text: string) => boolean;
  connectionState: 'connecting' | 'connected' | 'reconnecting' | 'error';
  currentUserId?: string;
  isAdminModerator?: boolean;
  onDeleteMessage?: (id: string) => void;
  onClearChat?: () => void;
}

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const LiveChatPanel: React.FC<LiveChatPanelProps> = ({
  messages,
  onSendMessage,
  connectionState,
  currentUserId,
  isAdminModerator = false,
  onDeleteMessage,
  onClearChat,
}) => {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    const sent = onSendMessage(clean);
    if (sent) {
      setDraft('');
    }
  };

  const isConnected = connectionState === 'connected';

  return (
    <aside className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden h-[440px] lg:h-full lg:min-h-[540px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-amber-400 shrink-0" />
          <h3 className="text-sm font-bold text-white truncate">
            Bate-papo ao Vivo
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            ({messages.length})
          </span>
        </div>

        {isAdminModerator && onClearChat && messages.length > 0 && (
          <button
            type="button"
            onClick={onClearChat}
            className="px-2.5 py-1.5 text-[11px] font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 border border-rose-500/25 rounded-lg transition-colors shrink-0"
          >
            Limpar chat
          </button>
        )}
      </div>

      {/* Messages Feed */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain p-3.5 space-y-2.5"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-slate-500 space-y-2">
            <MessageSquare className="w-7 h-7 text-slate-700" />
            <p className="text-xs leading-relaxed max-w-[240px]">
              Nenhuma mensagem ainda. Envie perguntas ou comentários sobre os lotes em exibição.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAdminMsg = msg.senderRole === 'admin_geral';
            const isSelf = Boolean(currentUserId && msg.senderId === currentUserId);

            return (
              <div
                key={msg.id}
                className={`group rounded-xl px-3 py-2 border text-xs transition-colors ${
                  isAdminMsg
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : isSelf
                    ? 'bg-slate-800/80 border-slate-700'
                    : 'bg-slate-950/70 border-slate-800/90'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isAdminMsg && (
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span
                      className={`font-bold truncate ${
                        isAdminMsg ? 'text-amber-300' : 'text-slate-200'
                      }`}
                    >
                      {msg.senderName}
                    </span>
                    {isAdminMsg && (
                      <span className="text-[10px] font-mono uppercase font-bold text-amber-400 shrink-0">
                        Admin
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono tabular-nums text-slate-500">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                    {isAdminModerator && onDeleteMessage && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        title="Remover mensagem"
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
                  {msg.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Message Input */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={draft}
          maxLength={500}
          disabled={!isConnected}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            isConnected
              ? 'Escreva sua mensagem no bate-papo...'
              : 'Conectando ao bate-papo...'
          }
          className="flex-1 min-h-[44px] bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isConnected || !draft.trim()}
          className="min-h-[44px] min-w-[44px] px-3.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shrink-0"
          title="Enviar mensagem"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </form>
    </aside>
  );
};
