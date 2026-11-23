export type GradeType = 'Grade A+' | 'Grade A' | 'Grade B' | 'Grade C' | 'DNA' | 'DNB' | 'DNC' | 'DND' | string;

export interface DeviceItem {
  id: string;
  model: string;
  storage: string;
  color: string;
  grade: GradeType;
  batteryHealth: number;
  imeiMasked: string;
  carrierStatus: string;
  icloudStatus: string;
  screenCondition: string;
  housingCondition: string;
  partNumber?: string;
  inventorySource?: string;
  itemDescription?: string;
  qty?: number;
}

export interface BidHistoryItem {
  id: string;
  bidderName: string;
  amountUsd: number;
  timestamp: string;
  isAutomatic?: boolean;
}

export interface AuctionLot {
  id: string;
  lotNumber: string;
  title: string;
  modelFamily: string;
  oemBrand?: string;
  quantity: number;
  incrementSize?: number;
  grade: GradeType;
  primaryStorage: string;
  colorHighlights: string[];
  batteryHealthRange: string;
  carrierStatus: string;
  imeiStatus: string;
  auctionHouse: string;
  location: string;
  startingBidUsd: number;
  currentBidUsd: number;
  reservePriceMet: boolean;
  estimatedBrazilRetailBrl: number;
  totalBidsCount: number;
  endTime: string;
  imageUrl: string;
  galleryImages: string[];
  description: string;
  diagnosticReport: {
    faceId: boolean;
    trueTone: boolean;
    camerasPassed: boolean;
    batteryTested: boolean;
    cleanEsn: boolean;
    mdmFree: boolean;
  };
  manifest: DeviceItem[];
  bidsHistory: BidHistoryItem[];
  originalListingUrl?: string;
  listingUrl?: string;
  sourceType?: 'VERIZON' | 'CARRIER' | 'CUSTOM' | 'DEFAULT' | 'STOCK_APPLE' | 'ASSURANT' | 'MARKETPLACE_1' | 'MARKETPLACE_2' | 'MARKETPLACE_3' | 'MACBOOKS';
}

export type UserAccessType = 'client' | 'admin_geral' | 'admin_credenciado';

export interface SystemUser {
  id?: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  whatsapp?: string;
  whatsappNotificationEnabled?: boolean;
  biddingLimitUsd: number;
  verifiedStatus: boolean;
  registeredDate: string;
  consultantName?: string;
  role?: 'client' | 'admin';
  userType?: UserAccessType;
  requestedUserType?: UserAccessType;
  approvalStatus?: 'APPROVED' | 'PENDING' | 'REJECTED';
}

export type OfferStatusType = 'Aceita' | 'Recusada' | 'Em Análise' | 'Contra-Oferta' | 'Vencendo' | 'Homologada / Arrematada' | 'Superada';

export interface AdminOffer {
  id: string;
  lotId: string;
  lotNumber: string;
  lotTitle: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientWhatsapp?: string;
  amountUsd: number;
  amountBrl: number;
  timestamp: string;
  status: OfferStatusType;
  counterOfferUsd?: number;
  adminNote?: string;
  updatedAt?: string;
  isAutoSniper?: boolean;
}
