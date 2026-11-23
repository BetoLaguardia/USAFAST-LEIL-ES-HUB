import { AuctionLot, GradeType } from '../types/auction';

export const VERIZON_GRADES: GradeType[] = ['DNA', 'DNB', 'DNC', 'DND'];

export const isVerizonLot = (lot?: Partial<AuctionLot> | null): boolean => {
  if (!lot) return false;
  return (
    lot.sourceType === 'VERIZON' ||
    /verizon/i.test(lot.auctionHouse || '') ||
    /verizon/i.test(lot.carrierStatus || '')
  );
};

export const isTMobileLot = (lot?: Partial<AuctionLot> | null): boolean => {
  if (!lot) return false;
  return (
    /t-?mobile/i.test(lot.auctionHouse || '') ||
    /t-?mobile/i.test(lot.carrierStatus || '') ||
    (lot.sourceType === 'CARRIER' && /coppell|t-?mobile/i.test(`${lot.auctionHouse || ''} ${lot.location || ''}`))
  );
};

export const mapVerizonGradeStrict = (raw: string): GradeType => {
  const g = String(raw || '').trim().toUpperCase();
  if (!g) return 'DNC';
  if (/(?:^|[\s(,;/])(?:DND|GRADE\s*D|D\+?(?:\(T\))?)(?=$|[\s),;/])/i.test(g)) {
    return 'DND';
  }
  if (/(?:^|[\s(,;/])(?:DNC|GRADE\s*C|C\+?(?:\(T\))?)(?=$|[\s),;/])/i.test(g)) {
    return 'DNC';
  }
  if (/(?:^|[\s(,;/])(?:DNB|A\/B|GRADE\s*B|B\+?(?:\(T\))?)(?=$|[\s),;/])/i.test(g)) {
    return 'DNB';
  }
  if (/(?:^|[\s(,;/])(?:DNA|GRADE\s*A|A\+?(?:\(T\))?|MINT|NEW)(?=$|[\s),;/])/i.test(g)) {
    return 'DNA';
  }
  return 'DNC';
};

export const sanitizeVerizonTitle = (title: string): string => {
  if (!title) return '';
  return title
    .replace(/Grade\s+A\+\(T\)|Grade\s+A\(T\)|Grade\s+A\+|Grade\s+A(?=$|[\s,\-)/])/gi, 'DNA')
    .replace(/Grade\s+B\+\(T\)|Grade\s+B\(T\)|Grade\s+B\+|Grade\s+B(?=$|[\s,\-)/])/gi, 'DNB')
    .replace(/Grade\s+C\+\(T\)|Grade\s+C\(T\)|Grade\s+C\+|Grade\s+C(?=$|[\s,\-)/])/gi, 'DNC')
    .replace(/Grade\s+D\+\(T\)|Grade\s+D\(T\)|Grade\s+D\+|Grade\s+D(?=$|[\s,\-)/])/gi, 'DND')
    .replace(/Grade\s+(DNA|DNB|DNC|DND)/gi, '$1')
    .replace(/\bA\+\(T\)|\bA\(T\)/gi, 'DNA')
    .replace(/\bB\+\(T\)|\bB\(T\)/gi, 'DNB')
    .replace(/\bC\+\(T\)|\bC\(T\)/gi, 'DNC')
    .replace(/\bD\+\(T\)|\bD\(T\)/gi, 'DND')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export const sanitizeVerizonDescription = (desc: string): string => {
  if (!desc) return '';
  return desc
    .replace(/Grade\s+A\+\(T\)|Grade\s+A\(T\)|Grade\s+A\+|Grade\s+A(?=$|[\s,\-)./])/gi, 'DNA')
    .replace(/Grade\s+B\+\(T\)|Grade\s+B\(T\)|Grade\s+B\+|Grade\s+B(?=$|[\s,\-)./])/gi, 'DNB')
    .replace(/Grade\s+C\+\(T\)|Grade\s+C\(T\)|Grade\s+C\+|Grade\s+C(?=$|[\s,\-)./])/gi, 'DNC')
    .replace(/Grade\s+D\+\(T\)|Grade\s+D\(T\)|Grade\s+D\+|Grade\s+D(?=$|[\s,\-)./])/gi, 'DND')
    .replace(/Grade\s+(DNA|DNB|DNC|DND)/gi, '$1')
    .replace(/\bA\+\(T\)|\bA\(T\)/gi, 'DNA')
    .replace(/\bB\+\(T\)|\bB\(T\)/gi, 'DNB')
    .replace(/\bC\+\(T\)|\bC\(T\)/gi, 'DNC')
    .replace(/\bD\+\(T\)|\bD\(T\)/gi, 'DND')
    .replace(/\s*\(\s*[ABCD]\+?(?:\(T\))?\s*\)/gi, '')
    .replace(/Condi[çc][ãa]o\s+A\+/gi, 'Condição DNA')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export const normalizeVerizonLot = (lot: AuctionLot): AuctionLot => {
  if (!isVerizonLot(lot)) return lot;
  const normalizedGrade = mapVerizonGradeStrict(lot.grade);
  const normalizedManifest = Array.isArray(lot.manifest)
    ? lot.manifest.map(item => ({
        ...item,
        grade: mapVerizonGradeStrict(item.grade || normalizedGrade)
      }))
    : [];

  return {
    ...lot,
    sourceType: lot.sourceType || 'VERIZON',
    grade: normalizedGrade,
    title: sanitizeVerizonTitle(lot.title),
    description: sanitizeVerizonDescription(lot.description),
    manifest: normalizedManifest
  };
};

const BSTOCK_COLOR_MAP: Record<string, string> = {
  BLK: 'Black',
  JBK: 'Jet Black',
  WHT: 'White',
  NAT: 'Natural Titanium',
  BLU: 'Blue',
  BL: 'Blue',
  NVY: 'Navy Blue',
  SLV: 'Silver',
  SGY: 'Space Gray',
  GPH: 'Graphite',
  GRY: 'Gray',
  GLD: 'Gold',
  RGD: 'Rose Gold',
  PNK: 'Pink',
  PUR: 'Purple',
  VIO: 'Violet',
  LVD: 'Lavender',
  GRN: 'Green',
  MNT: 'Mint',
  RED: 'Red',
  ORA: 'Orange',
  CRM: 'Cream',
  YEL: 'Yellow',
  BRZ: 'Bronze',
  BUR: 'Burgundy',
  COR: 'Coral',
  STL: 'Starlight',
  MDN: 'Midnight',
  SIL: 'Silver',
  DST: 'Desert Titanium',
  TI: 'Titanium'
};

export const parseBstockColorFromDesc = (desc: string, explicitColor?: string): string => {
  const cleanExplicit = String(explicitColor || '').trim();
  if (cleanExplicit && !/^[-_]+$/.test(cleanExplicit)) {
    return BSTOCK_COLOR_MAP[cleanExplicit.toUpperCase()] || cleanExplicit;
  }

  const text = String(desc || '').trim();
  if (!text) return 'Misto / Padrão';

  const parts = text.toUpperCase().split(/[\s/\-_]+/).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const token = parts[i];
    if (BSTOCK_COLOR_MAP[token]) {
      return BSTOCK_COLOR_MAP[token];
    }
  }

  return 'Misto / Padrão';
};

export interface MixBreakdownEntry {
  key: string;
  model: string;
  storage: string;
  color: string;
  grade: string;
  qty: number;
  partNumbers: string[];
  sources: string[];
}

export interface LotMixSummary {
  groupedItems: MixBreakdownEntry[];
  uniqueModels: string[];
  uniqueStorages: string[];
  uniqueColors: string[];
  uniqueGrades: string[];
  hasMixedModels: boolean;
  hasMixedStorages: boolean;
  hasMixedColors: boolean;
  hasExpandableDetails: boolean;
  totalManifestQty: number;
}

export const getLotMixSummary = (lot?: Partial<AuctionLot> | null): LotMixSummary => {
  const manifest = Array.isArray(lot?.manifest) ? lot.manifest : [];
  const verizon = isVerizonLot(lot);
  const map = new Map<string, MixBreakdownEntry>();
  const modelsSet = new Set<string>();
  const storagesSet = new Set<string>();
  const colorsSet = new Set<string>();
  const gradesSet = new Set<string>();
  let totalManifestQty = 0;

  manifest.forEach((item) => {
    const model = String(item.model || lot?.modelFamily || 'Smartphone').trim();
    const storage = String(item.storage || lot?.primaryStorage || '-').trim();
    const rawColor = String(item.color || '').trim();
    const parsedFromDesc = item.itemDescription
      ? parseBstockColorFromDesc(item.itemDescription, rawColor === 'Black' ? '' : rawColor)
      : '';
    const color =
      rawColor && rawColor !== 'Black'
        ? rawColor
        : rawColor === 'Black'
          ? (parsedFromDesc && parsedFromDesc !== 'Misto / Padrão' ? parsedFromDesc : 'Black')
          : parsedFromDesc || 'Padrão';
    const rawGrade = String(item.grade || lot?.grade || '-').trim();
    const grade = verizon ? mapVerizonGradeStrict(rawGrade) : rawGrade;
    const qty = Math.max(1, Number(item.qty) || 1);

    if (model) modelsSet.add(model);
    if (storage && storage !== '-') storagesSet.add(storage);
    if (color && color !== 'Misto / Padrão' && color !== 'Padrão') colorsSet.add(color);
    if (grade && grade !== '-') gradesSet.add(grade);

    totalManifestQty += qty;

    const key = `${model}||${storage}||${color}||${grade}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += qty;
      if (item.partNumber && !existing.partNumbers.includes(item.partNumber)) {
        existing.partNumbers.push(item.partNumber);
      }
      if (item.inventorySource && !existing.sources.includes(item.inventorySource)) {
        existing.sources.push(item.inventorySource);
      }
    } else {
      map.set(key, {
        key,
        model,
        storage,
        color,
        grade,
        qty,
        partNumbers: item.partNumber ? [item.partNumber] : [],
        sources: item.inventorySource ? [item.inventorySource] : []
      });
    }
  });

  // Fallback to lot-level metadata if manifest is empty
  if (modelsSet.size === 0 && lot?.modelFamily) {
    modelsSet.add(lot.modelFamily);
  }
  if (storagesSet.size === 0 && lot?.primaryStorage) {
    lot.primaryStorage.split('/').map(s => s.trim()).filter(Boolean).forEach(s => storagesSet.add(s));
  }
  if (colorsSet.size === 0 && Array.isArray(lot?.colorHighlights)) {
    lot.colorHighlights.map(c => c.trim()).filter(Boolean).forEach(c => colorsSet.add(c));
  }

  const groupedItems = Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  const uniqueModels = Array.from(modelsSet);
  const uniqueStorages = Array.from(storagesSet);
  const uniqueColors = Array.from(colorsSet);
  const uniqueGrades = Array.from(gradesSet);

  const hasMixedModels = uniqueModels.length > 1;
  const hasMixedStorages = uniqueStorages.length > 1;
  const hasMixedColors = uniqueColors.length > 1;
  const hasExpandableDetails =
    groupedItems.length > 1 || hasMixedModels || hasMixedStorages || hasMixedColors;

  return {
    groupedItems,
    uniqueModels,
    uniqueStorages,
    uniqueColors,
    uniqueGrades,
    hasMixedModels,
    hasMixedStorages,
    hasMixedColors,
    hasExpandableDetails,
    totalManifestQty
  };
};
