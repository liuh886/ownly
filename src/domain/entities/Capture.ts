/**
 * P0: CaptureItem — 极简 Inbox 模型（P1 方向）
 * rawInput 为唯一必填，后台异步 enrichment
 */
import type { Place } from './Place';

export type CaptureStatus = 'inbox' | 'processed' | 'archived';

export interface CaptureItem {
  id: string;
  rawInput: string;
  source: 'web' | 'map' | 'manual';
  status: CaptureStatus;
  place?: Place;
  enrichment?: {
    location?: Place['coordinates'];
    category?: string;
    metadata?: Record<string, unknown>;
  };
  captured_at: string;
}
