import { AdminOffer, AuctionLot } from '../types/auction';
import { stripLotPrefix } from './deviceImages';
import {
  getMarketplaceNumber,
  isTMobileLot,
  isVerizonLot,
  mapVerizonGradeStrict,
  getLotMixSummary
} from './verizonUtils';
import { isAssurantLot, isProntaEntregaLot } from './assurantUtils';

export interface ResolvedOfferDateTime {
  date: string;
  time: string;
  fullLabel: string;
}

export function resolveOfferDateTime(offer: AdminOffer): ResolvedOfferDateTime {
  const formatFromDate = (d: Date): ResolvedOfferDateTime => {
    const date = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const time = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return { date, time, fullLabel: `${date} às ${time}` };
  };

  if (offer.createdAt) {
    const parsed = new Date(offer.createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return formatFromDate(parsed);
    }
  }

  const rawTs = String(offer.timestamp || '').trim();
  const brMatch = rawTs.match(/(\d{2}\/\d{2}\/\d{4})(?:[\s,às-]+(\d{2}:\d{2}(?::\d{2})?))?/i);
  if (brMatch) {
    const date = brMatch[1];
    const time = brMatch[2] || '-';
    return {
      date,
      time,
      fullLabel: time !== '-' ? `${date} às ${time}` : date
    };
  }

  if (rawTs && !/agora/i.test(rawTs)) {
    const isoParsed = new Date(rawTs);
    if (!Number.isNaN(isoParsed.getTime())) {
      return formatFromDate(isoParsed);
    }
  }

  const idEpochMatch = String(offer.id || '').match(/^off-(\d{12,14})/);
  if (idEpochMatch) {
    const epochMs = Number(idEpochMatch[1]);
    if (Number.isFinite(epochMs) && epochMs > 1_500_000_000_000) {
      return formatFromDate(new Date(epochMs));
    }
  }

  return {
    date: rawTs || 'Não informada',
    time: '-',
    fullLabel: rawTs || 'Não informado'
  };
}

export interface ResolvedOfferAuctionInfo {
  auctionHouse: string;
  badgeLabel: string;
  badgeClass: string;
}

export function resolveOfferAuctionInfo(offer: AdminOffer, lot?: AuctionLot): ResolvedOfferAuctionInfo {
  const sourceType = offer.sourceType || lot?.sourceType;
  const rawHouse = (offer.auctionHouse || lot?.auctionHouse || '').trim();
  const titleHint = `${offer.lotTitle || ''} ${offer.lotNumber || ''} ${rawHouse}`;

  if ((lot && isVerizonLot(lot)) || sourceType === 'VERIZON' || /verizon/i.test(titleHint)) {
    return {
      auctionHouse: rawHouse || 'Verizon Official Wholesale',
      badgeLabel: 'VERIZON',
      badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/35'
    };
  }

  if ((lot && isAssurantLot(lot)) || sourceType === 'ASSURANT' || /assurant/i.test(titleHint)) {
    return {
      auctionHouse: rawHouse || 'Assurant Wholesale',
      badgeLabel: 'ASSURANT',
      badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/35'
    };
  }

  if ((lot && isTMobileLot(lot)) || /t-mobile|tmobile|coppell/i.test(titleHint)) {
    return {
      auctionHouse: rawHouse || 'T-Mobile Coppell',
      badgeLabel: 'T-MOBILE',
      badgeClass: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/35'
    };
  }

  const mktFromLot = lot ? getMarketplaceNumber(lot) : null;
  const mktFromSource =
    sourceType === 'MARKETPLACE_1'
      ? 1
      : sourceType === 'MARKETPLACE_2'
      ? 2
      : sourceType === 'MARKETPLACE_3'
      ? 3
      : sourceType === 'MARKETPLACE_4'
      ? 4
      : null;
  const mktMatch = rawHouse.match(/marketplace\s*([1-4])/i);
  const mktNum = mktFromLot || mktFromSource || (mktMatch ? Number(mktMatch[1]) : null);
  if (mktNum) {
    return {
      auctionHouse: rawHouse || `Marketplace ${mktNum}`,
      badgeLabel: `MARKETPLACE ${mktNum}`,
      badgeClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/35'
    };
  }

  if (
    (lot && isProntaEntregaLot(lot)) ||
    sourceType === 'STOCK_APPLE' ||
    /pronta entrega|stock apple|stock hub/i.test(titleHint)
  ) {
    return {
      auctionHouse: rawHouse || 'Pronta Entrega / Stock Hub EUA',
      badgeLabel: 'PRONTA ENTREGA',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35'
    };
  }

  if (sourceType === 'MACBOOKS' || /macbook/i.test(rawHouse)) {
    return {
      auctionHouse: rawHouse || 'MacBooks Apple Silicon Hub',
      badgeLabel: 'MACBOOKS',
      badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/35'
    };
  }

  return {
    auctionHouse: rawHouse || 'Leilão Oficial EUA',
    badgeLabel: 'LEILÃO EUA',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35'
  };
}

export interface ResolvedOfferCharacteristics {
  lot?: AuctionLot;
  date: string;
  time: string;
  fullDateTimeLabel: string;
  auctionHouse: string;
  auctionBadgeLabel: string;
  auctionBadgeClass: string;
  location: string;
  modelFamily: string;
  lotTitleClean: string;
  mixSummaryText: string | null;
  quantity: number;
  lotTotalQuantity: number;
  isPartialLot: boolean;
  grade: string;
  storage: string;
  colorsText: string;
  carrierStatus: string;
  isDirectPurchase: boolean;
  amountUsd: number;
  amountBrl: number;
  unitPriceUsd: number;
}

export function resolveOfferCharacteristics(
  offer: AdminOffer,
  auctions: AuctionLot[],
  usdRate: number
): ResolvedOfferCharacteristics {
  const safeRate = usdRate > 0 ? usdRate : 5.75;
  const lot = auctions.find(a => a.id === offer.lotId || a.lotNumber === offer.lotNumber);
  const { date, time, fullLabel } = resolveOfferDateTime(offer);
  const auctionInfo = resolveOfferAuctionInfo(offer, lot);

  // Quantity resolution: explicit offer.quantity -> "(X de Y un.)" in lotTitle -> lot.quantity -> 1
  const titleQtyMatch = String(offer.lotTitle || '').match(/\((\d+)\s+de\s+(\d+)\s+un\.\)/i);
  const parsedQtyFromTitle = titleQtyMatch ? parseInt(titleQtyMatch[1], 10) : 0;
  const parsedTotalFromTitle = titleQtyMatch ? parseInt(titleQtyMatch[2], 10) : 0;

  const quantity =
    typeof offer.quantity === 'number' && offer.quantity > 0
      ? offer.quantity
      : parsedQtyFromTitle > 0
      ? parsedQtyFromTitle
      : lot?.quantity && lot.quantity > 0
      ? lot.quantity
      : 1;

  const lotTotalQuantity =
    typeof offer.lotTotalQuantity === 'number' && offer.lotTotalQuantity > 0
      ? offer.lotTotalQuantity
      : parsedTotalFromTitle > 0
      ? parsedTotalFromTitle
      : lot?.quantity && lot.quantity > 0
      ? lot.quantity
      : quantity;

  const isPartialLot = lotTotalQuantity > 0 && quantity < lotTotalQuantity;

  const rawCleanTitle = stripLotPrefix(
    String(offer.lotTitle || lot?.title || offer.lotNumber || '')
      .replace(/^\[COMPRA DIRETA\]\s*/i, '')
      .replace(/\s*\(\d+\s+de\s+\d+\s+un\.\)\s*$/i, '')
      .trim()
  );

  const modelFamily = (offer.modelFamily || lot?.modelFamily || rawCleanTitle || 'Modelo não especificado').trim();
  const isVerizon = Boolean((lot && isVerizonLot(lot)) || offer.sourceType === 'VERIZON' || /verizon/i.test(auctionInfo.badgeLabel));

  const rawGrade = offer.grade || lot?.grade || '';
  const grade = rawGrade ? (isVerizon ? mapVerizonGradeStrict(rawGrade) : rawGrade) : '-';

  const storage = (offer.primaryStorage || lot?.primaryStorage || '-').trim();
  const colors = offer.colorHighlights && offer.colorHighlights.length > 0
    ? offer.colorHighlights
    : lot?.colorHighlights || [];
  const colorsText = colors.length > 0 ? colors.join(', ') : '-';
  const carrierStatus = (offer.carrierStatus || lot?.carrierStatus || 'Unlocked').trim();
  const location = (offer.location || lot?.location || 'Miami / EUA').trim();

  let mixSummaryText: string | null = null;
  if (lot) {
    const mix = getLotMixSummary(lot);
    if (mix.hasMixedModels && mix.uniqueModels.length > 1) {
      const preview = mix.uniqueModels.slice(0, 3).join(', ');
      mixSummaryText =
        mix.uniqueModels.length > 3
          ? `${preview} (+${mix.uniqueModels.length - 3} modelos)`
          : preview;
    }
  }

  const isDirectPurchase = Boolean(
    offer.isDirectPurchase ||
      /\[COMPRA DIRETA\]/i.test(offer.lotTitle || '') ||
      (lot && isProntaEntregaLot(lot))
  );

  const amountUsd = Number(offer.amountUsd) || 0;
  const amountBrl = offer.amountBrl > 0 ? Number(offer.amountBrl) : Math.round(amountUsd * safeRate);
  const unitPriceUsd =
    typeof offer.unitPriceUsd === 'number' && offer.unitPriceUsd > 0
      ? offer.unitPriceUsd
      : quantity > 0 && amountUsd > 0
      ? Math.round((amountUsd / quantity) * 100) / 100
      : amountUsd;

  return {
    lot,
    date,
    time,
    fullDateTimeLabel: fullLabel,
    auctionHouse: auctionInfo.auctionHouse,
    auctionBadgeLabel: auctionInfo.badgeLabel,
    auctionBadgeClass: auctionInfo.badgeClass,
    location,
    modelFamily,
    lotTitleClean: rawCleanTitle,
    mixSummaryText,
    quantity,
    lotTotalQuantity,
    isPartialLot,
    grade,
    storage,
    colorsText,
    carrierStatus,
    isDirectPurchase,
    amountUsd,
    amountBrl,
    unitPriceUsd
  };
}
