/**
 * P2: Domain Service — 纯业务 Why/How，不碰 I/O
 * 负责：行程可行性、冲突检测、时序推演
 */
import { evaluatePlannerDay } from '@/domain/planner-schedule';
import type { PlannerTrip } from '@/domain/planner';
import type { PlannerTripVisit } from '@/domain/planner-visits';

export const PlannerDomainService = {
  evaluateDay: evaluatePlannerDay,
  // 未来：place 合并、去重、路线优化等纯函数收敛至此
};
export type PlannerDomainServiceType = typeof PlannerDomainService;
