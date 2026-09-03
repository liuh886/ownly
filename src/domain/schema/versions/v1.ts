/**
 * Schema v1 — 初始统一版本（Capture/Planner/Trip 均为 0.1）
 * 未来：Capture v2, Planner v3 等在此分文件演进，migration/ 下对应转换
 */
export const SCHEMA_V1 = {
  capture: '0.1' as const,
  planner: '0.1' as const,
  trip: '0.1' as const,
  place: '0.1' as const,
};
