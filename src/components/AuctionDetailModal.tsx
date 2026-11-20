import React, { useState, useEffect } from 'react';
import { X, Gavel, MapPin, Download, CheckCircle2, Battery, Smartphone, AlertTriangle, Lock, Layers, ChevronDown } from 'lucide-react';
import { AuctionLot } from '../types/auction';
import { GRADE_EXPLANATIONS } from '../data/auctionsData';
import { isAssurantLot, getAssurantPreviousApprovedBid } from '../utils/assurantUtils';
import { stripLotPrefix } from '../utils/deviceImages';
import { isVerizonLot, mapVerizonGradeStrict, getLotMixSummary, parseBstockColorFromDesc } from '../utils/verizonUtils';

interface AuctionDetailModalProps {
  lot: AuctionLot | null;
  isOpen: boolean;
  onClose: () => void;
  onPlaceBid: (lotId: string, amountUsd: number) => void;
  onOpenSystem: () => void;
  currency: 'USD' | 'BRL';
  usdRate: number;
}

export const AuctionDetailModal: React.FC<AuctionDetailModalProps> = ({
  lot,
  isOpen,
  onClose,
  onPlaceBid,
  onOpenSystem,
  currency,
  usdRate
}) => {
  const verizon = isVerizonLot(lot);
  const defaultBidValue = lot
    ? verizon
      ? (lot.currentBidUsd > 0 ? lot.currentBidUsd : 0)
      : lot.currentBidUsd + 25
    : 0;

  const [bidValue, setBidValue] = useState<string>(defaultBidValue > 0 ? String(defaultBidValue) : '');
  const [bidStatus, setBidStatus] = useState<string | null>(null);
  const [bidError, setBidError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<string>(lot?.imageUrl || '');
  const [mixExpanded, setMixExpanded] = useState<boolean>(true);

  useEffect(() => {
    if (lot) {
      const isVz = isVerizonLot(lot);
      const nextVal = isVz ? (lot.currentBidUsd > 0 ? lot.currentBidUsd : '') : String(lot.currentBidUsd + 25);
      setBidValue(nextVal === '' ? '' : String(nextVal));
      setActiveImage(lot.imageUrl);
      setBidStatus(null);
      setBidError(null);
      setMixExpanded(true);
    }
  }, [lot?.id]);

  if (!isOpen || !lot) return null;

  const minBid = verizon ? 1 : lot.currentBidUsd + 25;
  const parsedBid = Number(bidValue);
  const mix = getLotMixSummary(lot);

  const displayLotGrade = verizon ? mapVerizonGradeStrict(lot.grade) : lot.grade;
  const gradeInfo = GRADE_EXPLANATIONS[displayLotGrade] || {
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    textColor: 'text-amber-300',
    label: displayLotGrade,
    description: ''
  };

  const handleBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBidError(null);
    if (!Number.isFinite(parsedBid) || parsedBid < minBid) {
      setBidError(
        verizon
          ? 'Informe um valor de oferta maior que $0 USD para enviar seu lance.'
          : `O lance mínimo precisa ser de $${minBid.toLocaleString()} USD.`
      );
      return;
    }
    onPlaceBid(lot.id, parsedBid);
    setBidStatus(
      verizon
        ? `Oferta de $${parsedBid.toLocaleString()} USD (${lot.quantity} un. fixas) enviada para ${lot.auctionHouse}!`
        : `Lance de $${parsedBid.toLocaleString()} USD enviado com sucesso para ${lot.auctionHouse}!`
    );
    setTimeout(() => setBidStatus(null), 4000);
  };

  const handleDownloadCsv = () => {
    const headers = ['Item', 'Qtd', 'Modelo', 'Armazenamento', 'Cor', 'Grade', 'Bateria %', 'IMEI Status', 'Operadora', 'Part #', 'Origem Estoque', 'Descricao'];
    const rows = lot.manifest.map((item, idx) => {
      const displayColor = item.itemDescription
        ? parseBstockColorFromDesc(item.itemDescription, item.color === 'Black' ? '' : item.color)
        : item.color;
      return [
        `#${idx + 1}`,
        item.qty || 1,
        `"${item.model}"`,
        item.storage,
        displayColor,
        verizon ? mapVerizonGradeStrict(item.grade || displayLotGrade) : item.grade,
        `${item.batteryHealth}%`,
        item.imeiMasked,
        item.carrierStatus,
        item.partNumber || '-',
        item.inventorySource || 'Carrier Return',
        `"${item.itemDescription || '-'}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `manifesto_lote_${lot.lotNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formattedCurrentPrice = currency === 'USD'
    ? `$ ${lot.currentBidUsd.toLocaleString()} USD`
    : `R$ ${(lot.currentBidUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

  const hasRetailEstimate = (lot.estimatedBrazilRetailBrl || 0) > 0;
  const formattedRetailPrice = currency === 'USD'
    ? `$ ${(lot.estimatedBrazilRetailBrl / usdRate).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD`
    : `R$ ${lot.estimatedBrazilRetailBrl.toLocaleString('pt-BR')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-amber-400 font-bold">
              {lot.lotNumber}
            </span>
            {verizon && (
              <span className="px-2.5 py-0.5 rounded bg-red-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                VERIZON
              </span>
            )}
            {(lot.sourceType === 'ASSURANT' || /assurant/i.test(lot.auctionHouse)) && (
              <span className="px-2.5 py-0.5 rounded bg-blue-600 text-white font-black text-[10px] tracking-wider uppercase shadow-md">
                ASSURANT
              </span>
            )}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
              <span>{lot.auctionHouse}</span>
              <span>·</span>
              <span className="flex items-center gap-1 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                {lot.location}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(lot.originalListingUrl || lot.listingUrl) && (
              <a
                href={lot.originalListingUrl || lot.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 rounded-lg text-xs font-semibold transition-colors"
                title="Abrir anúncio oficial do lote"
              >
                <span>Ver Anúncio Oficial ↗</span>
              </a>
            )}
            <button
              onClick={handleDownloadCsv}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
              title="Baixar lista completa de aparelhos em CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Manifesto (CSV)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          {bidStatus && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{bidStatus}</span>
            </div>
          )}

          {bidError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-medium">{bidError}</span>
            </div>
          )}

          {/* Top Split: Gallery & Purchase / Bid Module */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Gallery Column (5 cols) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-950 border border-slate-800 relative">
                <img
                  src={activeImage || lot.imageUrl}
                  alt={lot.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
                  }}
                />
                <div className="absolute top-3 left-3">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold border backdrop-blur-md ${gradeInfo.badgeColor}`}>
                    {displayLotGrade}
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 backdrop-blur-sm border border-slate-800/80 rounded-lg p-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 flex items-center gap-1">
                    {verizon && <Lock className="w-3 h-3 text-red-400" />}
                    <span>{verizon ? 'Quantidade Fixa (Lote Fechado):' : 'Quantidade no Lote:'}</span>
                  </span>
                  <span className="font-bold text-white font-mono">
                    {lot.quantity} {lot.quantity === 1 ? 'Aparelho' : 'Aparelhos'}
                  </span>
                </div>
              </div>

              {/* Thumbnails */}
              {lot.galleryImages && lot.galleryImages.length > 1 && (
                <div className="flex gap-2">
                  {lot.galleryImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImage(img)}
                      className={`w-16 h-12 rounded-lg overflow-hidden border transition-all ${
                        activeImage === img ? 'border-amber-400 scale-95' : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={img}
                        alt="Thumbnail"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/images/iphone_16_pro_max_grade_a_1793849011033.jpg';
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Diagnostic 30-points summary */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <span className="font-semibold text-slate-300 block">Laudo de Inspeção Técnica:</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Clean IMEI / ESN OK</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>iCloud / FMI OFF</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Face ID 100% Ativo</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>True Tone Original</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sem Bloqueio MDM</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Câmeras Testadas</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bidding & Spec Module (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
                  {stripLotPrefix(lot.title)}
                </h1>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                  {lot.description}
                </p>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 bg-slate-950/50 border border-slate-800 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Classificação / Grade</span>
                  <span className={`font-bold font-mono ${gradeInfo.textColor}`}>{lot.grade}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Saúde de Bateria</span>
                  <span className="font-semibold text-white font-mono flex items-center gap-1">
                    <Battery className="w-3.5 h-3.5 text-emerald-400" />
                    {lot.batteryHealthRange}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Armazenamento</span>
                  <span className="font-semibold text-white">{lot.primaryStorage}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Status Operadora</span>
                  <span className="font-semibold text-emerald-400">{lot.carrierStatus}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Casa de Leilão EUA</span>
                  <span className="font-semibold text-slate-200">{lot.auctionHouse}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Localização EUA</span>
                  <span className="font-semibold text-slate-200">{lot.location}</span>
                </div>
              </div>

              {/* Price & Bidding Form Box */}
              <div className="p-4 bg-gradient-to-br from-slate-950 to-slate-900 border border-amber-500/30 rounded-xl space-y-4">
                {verizon ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase font-semibold block">
                        {lot.currentBidUsd === 0 ? 'Modelo de Lance Verizon:' : 'Última Oferta Registrada:'}
                      </span>
                      {lot.currentBidUsd === 0 ? (
                        <>
                          <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight block">
                            Sem Preço Fixo
                          </span>
                          <span className="text-xs text-amber-300 font-semibold block">
                            O cliente escolhe o valor da oferta (em USD)
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                            {formattedCurrentPrice}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            {currency === 'USD' ? `≈ R$ ${(lot.currentBidUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : `≈ $ ${lot.currentBidUsd.toLocaleString()} USD`}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="text-right space-y-1">
                      <span className="px-2.5 py-1 rounded-lg bg-red-600/20 border border-red-500/40 text-red-200 font-bold text-[11px] inline-flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-red-400" />
                        <span>Qtd Fixa: {lot.quantity} {lot.quantity === 1 ? 'unidade' : 'unidades'}</span>
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        Lote fechado — sem escolha de quantidade
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase font-semibold block">
                        Lance Atual no Leilão:
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                        {formattedCurrentPrice}
                      </span>
                      <span className="text-[11px] text-slate-400 block font-mono">
                        {currency === 'USD' ? `≈ R$ ${(lot.currentBidUsd * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : `≈ $ ${lot.currentBidUsd.toLocaleString()} USD`}
                      </span>
                    </div>

                    {hasRetailEstimate && (
                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 block">Revenda Estimada Brasil:</span>
                        <span className="text-base font-bold text-white font-mono">
                          {formattedRetailPrice}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold block">
                          Margem Bruta Estimada: R$ {(lot.estimatedBrazilRetailBrl - (lot.currentBidUsd * usdRate)).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {verizon ? (
                  <div className="p-2.5 bg-red-950/30 border border-red-500/30 rounded-lg text-[11px] text-red-200 flex flex-wrap items-center justify-between gap-2">
                    <span>Regra Verizon: Escolha livremente o valor em USD para arrematar o lote completo.</span>
                    <span className="font-mono font-bold text-emerald-300">Sem mínimo obrigatório</span>
                  </div>
                ) : isAssurantLot(lot) ? (
                  <div className="p-2.5 bg-blue-950/40 border border-blue-500/30 rounded-lg text-xs flex items-center justify-between">
                    <span className="text-blue-200 font-semibold">Média lance aprovado arremate anterior:</span>
                    <span className="font-mono font-bold text-blue-300 text-sm">
                      ${getAssurantPreviousApprovedBid(lot).toLocaleString()} USD <span className="text-[10px] text-slate-400 font-normal">/ un.</span>
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 flex items-center justify-between font-medium px-1">
                    <span>Lance Mínimo Requerido:</span>
                    <span className="text-amber-400 font-mono font-bold">${minBid.toLocaleString()} USD</span>
                  </div>
                )}

                <form onSubmit={handleBidSubmit} className="pt-2 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-mono font-bold">$</span>
                      <input
                        type="number"
                        min={minBid}
                        step={verizon ? 'any' : '25'}
                        value={bidValue}
                        onChange={e => {
                          setBidError(null);
                          setBidValue(e.target.value);
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
                        placeholder={verizon ? 'Informe seu valor em USD (ex: 1200)' : `Mínimo $${minBid}`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-2 shadow-md shadow-amber-500/10 shrink-0"
                    >
                      <Gavel className="w-4 h-4" />
                      <span>{verizon ? 'Enviar Oferta Livre' : 'Dar Lance Agora'}</span>
                    </button>
                  </div>

                  {parsedBid > 0 && (
                    <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                      <span>Equivalente aproximado (PTAX):</span>
                      <span className="text-slate-200 font-semibold">
                        R$ {(parsedBid * usdRate).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        {lot.quantity > 1 ? ` (~$${Math.round(parsedBid / lot.quantity).toLocaleString()} / un.)` : ''}
                      </span>
                    </div>
                  )}

                  {/* Preset Bids */}
                  <div className="flex flex-wrap items-center gap-2">
                    {verizon ? (
                      <>
                        <span className="text-[11px] text-slate-400">Sugestões rápidas:</span>
                        {(lot.currentBidUsd > 0
                          ? [lot.currentBidUsd + 50, lot.currentBidUsd + 100, lot.currentBidUsd + 250]
                          : [500, 1000, 2500]
                        ).map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setBidValue(String(val))}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono text-slate-300"
                          >
                            ${val.toLocaleString()}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] text-slate-400">Sugestões:</span>
                        <button
                          type="button"
                          onClick={() => setBidValue(String(lot.currentBidUsd + 25))}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono text-slate-300"
                        >
                          + $25
                        </button>
                        <button
                          type="button"
                          onClick={() => setBidValue(String(lot.currentBidUsd + 50))}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono text-slate-300"
                        >
                          + $50
                        </button>
                        <button
                          type="button"
                          onClick={() => setBidValue(String(lot.currentBidUsd + 100))}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono text-slate-300"
                        >
                          + $100
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={onOpenSystem}
                      className="ml-auto text-amber-400 hover:text-amber-300 text-[11px] underline"
                    >
                      Configurar no Nosso Sistema ➔
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Expandable Mix Summary (Models, GBs & Colors) */}
          {mix.hasExpandableDetails && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setMixExpanded(prev => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-slate-900/70 hover:bg-slate-900 transition-colors text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-bold text-white text-xs">
                    Resumo do Lote Mesclado / Mix de Modelos ({mix.groupedItems.length} variações)
                  </span>
                  {mix.hasMixedModels && (
                    <span className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/35 text-purple-300 text-[10px] font-bold">
                      {mix.uniqueModels.length} Modelos
                    </span>
                  )}
                  {mix.hasMixedStorages && (
                    <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 text-[10px] font-bold">
                      {mix.uniqueStorages.length} GBs ({mix.uniqueStorages.join(', ')})
                    </span>
                  )}
                  {mix.hasMixedColors && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] font-bold">
                      {mix.uniqueColors.length} Cores
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-bold shrink-0">
                  <span>{mixExpanded ? 'Recolher' : 'Expandir'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${mixExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <div
                className={`grid transition-all duration-300 ease-out ${
                  mixExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="p-4 space-y-3 border-t border-slate-800/80">
                    {mix.uniqueColors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-semibold mr-1">Cores presentes:</span>
                        {mix.uniqueColors.map(col => (
                          <span key={col} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
                            ● {col}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                      {mix.groupedItems.map(entry => (
                        <div
                          key={entry.key}
                          className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-white block truncate">{entry.model}</span>
                            <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono font-semibold">
                                {entry.storage}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                                {entry.color}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-bold">
                                {entry.grade}
                              </span>
                            </div>
                          </div>
                          <span className="px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold text-xs shrink-0">
                            {entry.qty}x
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Device Manifest Table (Itemized breakdown) */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  Manifesto Técnico Item a Item ({lot.manifest.length} registros · {lot.quantity} aparelhos)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Detalhamento completo de modelos, capacidades, cores, grades e part numbers do lote.
                </p>
              </div>

              <button
                onClick={handleDownloadCsv}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/60 max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 text-[11px]">
                    <th className="py-2 px-3 font-semibold">#</th>
                    <th className="py-2 px-3 font-semibold">Qtd</th>
                    <th className="py-2 px-3 font-semibold">Modelo & Peça</th>
                    <th className="py-2 px-3 font-semibold">Armazenamento</th>
                    <th className="py-2 px-3 font-semibold">Cor</th>
                    <th className="py-2 px-3 font-semibold">Grade</th>
                    <th className="py-2 px-3 font-semibold">Part #</th>
                    <th className="py-2 px-3 font-semibold">Origem Estoque</th>
                    <th className="py-2 px-3 font-semibold">Bateria</th>
                    <th className="py-2 px-3 font-semibold">IMEI / Clean ESN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {lot.manifest.map((dev, idx) => {
                    const displayColor = dev.itemDescription
                      ? parseBstockColorFromDesc(dev.itemDescription, dev.color === 'Black' ? '' : dev.color)
                      : dev.color;
                    return (
                      <tr key={dev.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-300">{dev.qty || 1}x</td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-white block">{dev.model}</span>
                          {dev.itemDescription && (
                            <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[200px]" title={dev.itemDescription}>
                              {dev.itemDescription}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono">{dev.storage}</td>
                        <td className="py-2 px-3 text-slate-300">{displayColor}</td>
                        <td className="py-2 px-3">
                          {(() => {
                            const devGrade = verizon ? mapVerizonGradeStrict(dev.grade || displayLotGrade) : dev.grade;
                            return (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${GRADE_EXPLANATIONS[devGrade]?.badgeColor || ''}`}>
                                {devGrade}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400">{dev.partNumber || '-'}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                            {dev.inventorySource || 'Carrier Clean'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-400 font-semibold">{dev.batteryHealth}%</td>
                        <td className="py-2 px-3 font-mono text-slate-400">{dev.imeiMasked}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bid History Table */}
          <div className="space-y-2 pt-2">
            <h4 className="font-semibold text-white text-xs">
              Histórico Recente de Lances deste Lote:
            </h4>
            {lot.bidsHistory.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                Nenhuma oferta registrada ainda neste lote. Seja o primeiro a informar seu valor.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 border border-slate-800 rounded-xl bg-slate-950/40 overflow-hidden">
                {lot.bidsHistory.map(bh => (
                  <div key={bh.id} className="p-2.5 px-3.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200">{bh.bidderName}</span>
                      {bh.isAutomatic && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                          Sniper Auto
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500 text-[11px]">{bh.timestamp}</span>
                      <span className="font-mono font-bold text-white">${bh.amountUsd.toLocaleString()} USD</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Arrematações sujeitas a despacho aéreo express via Porto de Miami.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};

