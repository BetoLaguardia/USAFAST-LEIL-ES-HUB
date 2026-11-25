export type LiveCaptureMode =
  | 'desktop_screen'
  | 'desktop_webcam'
  | 'mobile_screen'
  | 'mobile_camera';

export interface LiveStreamStatus {
  isLive: boolean;
  mode: LiveCaptureMode | null;
  title: string;
  startedAt: string | null;
  broadcasterName: string | null;
  viewerCount: number;
}

export interface LiveChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'admin_geral' | 'client';
  text: string;
  createdAt: string;
}

export const LIVE_MODE_LABELS: Record<LiveCaptureMode, string> = {
  desktop_screen: 'Tela / Aba do Computador + Áudio',
  desktop_webcam: 'Webcam + Microfone (PC)',
  mobile_screen: 'Tela do Celular',
  mobile_camera: 'Câmera do Celular + Microfone',
};
