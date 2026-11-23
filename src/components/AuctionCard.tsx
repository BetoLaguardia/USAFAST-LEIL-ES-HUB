import React, { useState, useEffect } from 'react';
import { Gavel, Clock, MapPin, Battery, Smartphone, ShieldCheck, ArrowUpRight, Lock } from 'lucide-react';
import { AuctionLot } from '../types/auction';
import { GRADE_EXPLANATIONS } from '../data/auctionsData';
import { stripLotPrefix } from '../utils/deviceImages';
import { isVerizonLot, isTMobileLot, mapVerizonGradeStrict } from '../utils/verizonUtils';
import { isAssurantLot, getLotUnitPriceUsd, getLotIncrementSize } from '../utils/assurantUtils';
import { LotMixBadgesAndTrigger, LotMixExpandablePanel } from './LotMixExpandable';

interface AuctionCardProps {
  lot: AuctionLot;
  onSelectLot: (lot: AuctionLot) => void;
  onQuickBid: (lot: AuctionLot) => void;
  onCalculateLot: (lot: AuctionLot) => void;
  currency: 'USD' | 'BRL';
  usdRate: number;
}

const AuctionCardComponent: React.FC<AuctionCardProps> = ({
  lot,
  onSelectLot,
  onQuickBid,
  currency,
  usdRate
}) => {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false
  });
  const [mixExpanded, setMixExpanded] = useState(false);

  useEffect(() => {
    const calculateTime = () => {
      const difference = new Date(lot.endTime).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft(prev => prev.isExpired ? prev : { hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }
      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      setTimeLeft(prev => {
        if (prev.hours === hours && prev.minutes === minutes && prev.seconds === seconds && !prev.isExpired) {
          return prev;
        }
        return { hours, minutes, seconds, isExpired: false };
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [lot.endTime]);

  const verizon = isVerizonLot(lot);
  const tMobile = isTMobileLot(lot);
  const isAssurant = isAssurantLot(lot);
  const cleanGrade = verizon
    ? mapVerizonGradeStrict(lot.grade || 'DNC')
    : ((lot.grade || '').replace(/\(T\)/gi, '').trim() || 'Grade A');
  const cleanTitle = stripLotPrefix(lot.title);

  const gradeInfo = GRADE_EXPLANATIONS[cleanGrade] || GRADE_EXPLANATIONS[lot.grade] || GRADE_EXPLANATIONS[verizon ? 'DNC' : 'Grade A'];

  const unitPriceUsd = getLotUnitPriceUsd(lot);
  const incrementSize = getLotIncrementSize(lot);
  const displayPrimaryUsd = isAssurant ? unitPriceUsd : lot.currentBidUsd;

  const formattedCurrentPrice = currency === 'USD'
    ? `$ ${displayPrimaryUsd.toLocaleString()} USD`
    : `R$ ${(displayPrimaryUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

  const currentBidBrl = displayPrimaryUsd * usdRate;
  const hasRetailEstimate = (lot.estimatedBrazilRetailBrl || 0) > 0;
  const estimatedGrossProfitBrl = lot.estimatedBrazilRetailBrl - currentBidBrl;

  return (
    <div className="group bg-slate-900/90 border border-slate-800 hover:border-slate-700/90 rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:shadow-xl hover:shadow-black/50">
      {/* Top Image & Badge Container */}
      <div 
        className="relative aspect-[4/3] bg-slate-950 overflow-hidden cursor-pointer"
        onClick={() => onSelectLot(lot)}
      >
        <img
          src={lot.imageUrl}
          alt={lot.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/30 pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded text-xs font-bold border backdrop-blur-md shadow-sm ${gradeInfo.badgeColor}`}>
              {cleanGrade}
            </span>
            {verizon && (
              <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                VERIZON
              </span>
            )}
            {(lot.sourceType === 'ASSURANT' || /assurant/i.test(lot.auctionHouse)) && (
              <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                ASSURANT
              </span>
            )}
            {tMobile && (
              <span className="px-2 py-0.5 rounded bg-fuchsia-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                T-MOBILE
              </span>
            )}
          </div>

          <span className="px-2.5 py-1 rounded bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-200 text-[11px] font-mono flex items-center gap-1.5 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            {timeLeft.isExpired ? (
              <span className="text-rose-400 font-bold">Encerrado</span>
            ) : (
              <span>
                {String(timeLeft.hours).padStart(2, '0')}h {String(timeLeft.minutes).padStart(2, '0')}m {String(timeLeft.seconds).padStart(2, '0')}s
              </span>
            )}
          </span>
        </div>

        {/* Bottom overlay info */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-slate-300">
          <span className="font-mono text-[11px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 text-amber-300">
            {lot.lotNumber}
          </span>
          <span className="text-[11px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 text-slate-300 flex items-center gap-1">
            {verizon && <Lock className="w-3 h-3 text-red-400" />}
            <span>{lot.quantity} {lot.quantity === 1 ? 'Aparelho' : 'Aparelhos'}{verizon ? ' · Qtd Fixa' : ''}</span>
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          {/* US Auction Origin */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span className="truncate max-w-[180px]">{lot.auctionHouse}</span>
            <span className="flex items-center gap-1 text-slate-300 shrink-0">
              <MapPin className="w-3 h-3 text-amber-400" />
              {lot.location}
            </span>
          </div>

          {/* Title */}
          <h3 
            onClick={() => onSelectLot(lot)}
            className="text-base font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-2 cursor-pointer leading-snug"
          >
            {cleanTitle}
          </h3>

          {/* Key Specs Breakdown */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{lot.primaryStorage} · {lot.modelFamily}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Battery className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-mono text-emerald-400 font-semibold">{lot.batteryHealthRange}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate text-slate-400">Clean ESN / FMI OFF</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
              <span className="truncate text-emerald-400">Desbloqueado</span>
            </div>
          </div>

          {/* Mixed Models / GBs / Colors Badges & Expand Effect */}
          <LotMixBadgesAndTrigger
            lot={lot}
            isExpanded={mixExpanded}
            onToggle={(e) => {
              e.stopPropagation();
              setMixExpanded(prev => !prev);
            }}
            compact
          />
          <LotMixExpandablePanel
            lot={lot}
            isExpanded={mixExpanded}
            onSelectLot={onSelectLot}
          />
        </div>

        {/* Pricing & Bids Section */}
        <div className="pt-2 border-t border-slate-800/80 space-y-3">
          {verizon && lot.currentBidUsd === 0 ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <span className="text-[11px] text-slate-400 block">Valor do Lance (Verizon):</span>
                <span className="text-lg sm:text-xl font-black text-emerald-400 tracking-tight block">
                  Sem Preço Fixo
                </span>
                <span className="text-[11px] text-amber-300 font-semibold block">
                  Cliente escolhe o valor da oferta
                </span>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded bg-red-600/15 border border-red-500/30 text-[10px] font-bold text-red-300 inline-block mb-1">
                  Qtd Fixa: {lot.quantity} un.
                </span>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {lot.totalBidsCount} oferta(s)
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-end justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block">
                  {verizon
                    ? 'Última Oferta (Valor Livre):'
                    : isAssurant && lot.quantity > 1
                      ? 'Valor Unitário (Assurant):'
                      : lot.quantity > 1
                        ? 'Lance Atual (Total Lote):'
                        : 'Lance Atual:'}
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono tracking-tight block">
                  {formattedCurrentPrice}
                  {isAssurant && lot.quantity > 1 && (
                    <span className="text-xs font-normal text-slate-400"> / un.</span>
                  )}
                </span>
                {!isAssurant && lot.quantity > 1 && (
                  <span className="text-[11px] text-amber-300 font-mono block">
                    {`($ ${unitPriceUsd.toLocaleString()} USD / un.)`}
                  </span>
                )}
                {isAssurant && (
                  <span className="text-[11px] text-cyan-300 font-mono font-semibold block">
                    Incremento: {incrementSize} {incrementSize === 1 ? 'un.' : 'un.'}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-mono">
                  {currency === 'USD'
                    ? `≈ R$ ${currentBidBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}${isAssurant && lot.quantity > 1 ? ' / un.' : ''}`
                    : `≈ $ ${displayPrimaryUsd.toLocaleString()} USD${isAssurant && lot.quantity > 1 ? ' / un.' : ''}`}
                </span>
              </div>

              <div className="text-right">
                {verizon ? (
                  <span className="px-2 py-0.5 rounded bg-red-600/15 border border-red-500/30 text-[10px] font-bold text-red-300 inline-block mb-1">
                    Qtd Fixa: {lot.quantity} un.
                  </span>
                ) : hasRetailEstimate ? (
                  <>
                    <span className="text-[10px] text-slate-400 block">
                      {isAssurant && lot.quantity > 1 ? 'Lucro Bruto Est. (/ un.):' : 'Lucro Bruto Est.:'}
                    </span>
                    <span className="text-xs font-bold text-emerald-400 font-mono block">
                      + R$ {estimatedGrossProfitBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </span>
                  </>
                ) : null}
                <span className="text-[10px] text-slate-400 font-mono block">
                  {lot.totalBidsCount} lances dados
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => onSelectLot(lot)}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Ver Manifesto</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => onQuickBid(lot)}
              className="py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-amber-500/10"
            >
              <Gavel className="w-3.5 h-3.5" />
              <span>{verizon ? 'Escolher Valor' : 'Dar Lance'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AuctionCard = React.memo(AuctionCardComponent);
