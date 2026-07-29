export interface CaptionEvent {
  sessionId: string;
  type: 'partial' | 'final';
  language: string;
  text: string;
  timestamp: number;
}
