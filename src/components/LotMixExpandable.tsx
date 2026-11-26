import React from 'react';
import { ChevronDown, Layers, Palette, HardDrive, Smartphone, ShieldCheck } from 'lucide-react';
import { AuctionLot } from '../types/auction';
import { getLotMixSummary, isVerizonLot } from '../utils/verizonUtils';

interface LotMixBadgesProps {
  lot: AuctionLot;
  isExpanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
  compact?: boolean;
}

export const LotMixBadgesAndTrigger: React.FC<LotMixBadgesProps> = ({
  lot,
  isExpanded,
  onToggle,
  compact = false
}) => {
  const mix = getLotMixSummary(lot);
  if (!mix.hasExpandableDetails) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {mix.hasMixedModels && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/35 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
          <Smartphone className="w-2.5 h-2.5" />
          Mix {mix.uniqueModels.length} Modelos
        </span>
      )}
      {mix.hasMixedStorages && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold">
          <HardDrive className="w-2.5 h-2.5" />
          {mix.uniqueStorages.length} Capacidades
        </span>
      )}
      {mix.hasMixedColors && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
          <Palette className="w-2.5 h-2.5" />
          {mix.uniqueColors.length} Cores
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all duration-200 ${
          isExpanded
            ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm shadow-amber-400/20'
            : 'bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
        }`}
      >
        <Layers className="w-3 h-3 shrink-0" />
        <span>
          {compact
            ? isExpanded
              ? 'Recolher Mix'
              : `Expandir Mix (${mix.groupedItems.length})`
            : isExpanded
              ? 'Ocultar Detalhes do Mix'
              : `Ver Modelos, GBs & Cores (${mix.groupedItems.length})`}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
};

interface LotMixExpandablePanelProps {
  lot: AuctionLot;
  isExpanded: boolean;
  onSelectLot?: (lot: AuctionLot) => void;
}

export const LotMixExpandablePanel: React.FC<LotMixExpandablePanelProps> = ({
  lot,
  isExpanded,
  onSelectLot
}) => {
  const mix = getLotMixSummary(lot);
  if (!mix.hasExpandableDetails) return null;

  const verizon = isVerizonLot(lot);

  return (
    <div
      className={`grid transition-all duration-300 ease-out ${
        isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2.5' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
      }`}
    >
      <div className="overflow-hidden">
        <div className="p-3 rounded-xl bg-slate-100/95 dark:bg-slate-950/90 border border-slate-200/90 dark:border-slate-800/90 space-y-2.5 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800/80 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
              <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Composição Detalhada do Lote ({lot.quantity} un. fixas)</span>
              {verizon && (
                <span className="px-1.5 py-0.5 rounded bg-red-600/20 border border-red-500/40 text-red-700 dark:text-red-300 text-[9px] font-bold uppercase">
                  Lote Fechado Verizon
                </span>
              )}
            </div>
            {onSelectLot && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLot(lot);
                }}
                className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
              >
                Ver Manifesto Completo ↗
              </button>
            )}
          </div>

          {/* Color & Storage quick pills */}
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {mix.uniqueStorages.map(cap => (
              <span key={cap} className="px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 font-mono font-semibold">
                {cap}
              </span>
            ))}
            {mix.uniqueColors.map(color => (
              <span key={color} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium">
                ● {color}
              </span>
            ))}
          </div>

          {/* Breakdown Grid */}
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/50">
            {mix.groupedItems.map((entry) => (
              <div
                key={entry.key}
                className="px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] hover:bg-slate-200/50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-mono font-bold shrink-0">
                    {entry.qty}x
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white truncate">{entry.model}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-mono font-semibold">
                    {entry.storage}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700/80">
                    {entry.color}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold">
                    {entry.grade}
                  </span>
                  {entry.partNumbers.length > 0 && (
                    <span className="hidden sm:inline font-mono text-[10px] text-slate-600 dark:text-slate-400">
                      #{entry.partNumbers[0]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {verizon
                ? 'Quantidade fixa do lote fechado (sem fracionamento). Informe o valor desejado em USD.'
                : 'Composição auditada por modelo, capacidade e cor.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
