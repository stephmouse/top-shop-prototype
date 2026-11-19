import { buildStageMap } from './builder';
import type { BuiltMap, StageDefinition, StageId } from './builder';
import { STAGES_PART_1 } from './stagesPart1';
import { STAGES_PART_2 } from './stagesPart2';

export const OFFICIAL_STAGES: readonly StageDefinition[] = [
  ...STAGES_PART_1,
  ...STAGES_PART_2,
];

export const DEFAULT_STAGE_ID: StageId = 'stage_0';

export function getStageDef(stageId: StageId): StageDefinition {
  return OFFICIAL_STAGES.find((s) => s.id === stageId) ?? OFFICIAL_STAGES[0]!;
}

export function createStageMap(stageId: StageId): BuiltMap {
  return buildStageMap(getStageDef(stageId));
}

export { buildStageMap };
export type { BuiltMap, StageDefinition, StageId };
