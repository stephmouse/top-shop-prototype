import { AREA_POOLS } from '../areaPools';
import type { AreaId } from '../areaPools';
import type {
  EscalatorExit,
  EscalatorLink,
  Shop,
  Tile,
  TileNeighbors,
  VerticalDir,
} from '../../engine/types';

export type StageId =
  | 'stage_0'
  | 'stage_1'
  | 'stage_2'
  | 'stage_3'
  | 'stage_4'
  | 'stage_5'
  | 'stage_6'
  | 'stage_7'
  | 'stage_8'
  | 'stage_9';

export interface StageDefinition {
  readonly id: StageId;
  readonly stageIndex: number;
  readonly name: string;
  readonly cols: number;
  readonly floors: number;
  readonly shopCount: number;
  readonly lapSteps: number;
  readonly recommendedStartingCash: number;
  readonly recommendedTargetAssets: number;
  readonly rows: readonly string[];
}

export interface BuiltMap {
  tiles: Record<string, Tile>;
  shops: Record<string, Shop>;
  segmentPools: Record<string, string[]>;
  startTileId: string;
  cols: number;
  floors: number;
}

function isEscToken(token: string): boolean {
  return token === 'T' || token === 'S';
}

export function buildStageMap(def: StageDefinition): BuiltMap {
  const rows = def.floors;
  const cols = def.cols;
  const grid = def.rows.map((row) => row.trim().split(/\s+/));

  const tok = (x: number, y: number): string => {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return '.';
    return grid[y]?.[x] ?? '.';
  };

  const canGoUp = (x: number, y: number): boolean =>
    tok(x, y) === 'S' && isEscToken(tok(x, y - 1));

  const canGoDown = (x: number, y: number): boolean =>
    isEscToken(tok(x, y)) && tok(x, y + 1) === 'S';

  const walkHorizontal = (x: number, y: number, dx: -1 | 1): string | undefined => {
    let nx = x + dx;
    while (tok(nx, y) === '=') {
      nx += dx;
    }
    return tok(nx, y) === '.' ? undefined : `f${rows - y}_c${nx}`;
  };

  // Port of SLUS_013.33 0x80078808..0x80078998: ride shaft across void/bridges until walkable exit.
  const simulateEscalator = (x: number, y: number, hIn: -1 | 1, vStep: -1 | 1): EscalatorExit => {
    let cx = x;
    let cy = y;
    let ch: -1 | 1 = hIn;

    for (let guard = 0; guard < 12; guard++) {
      cy += vStep;
      if (tok(cx + ch, cy) !== '.') {
        // Keep horizontal direction
      } else if (tok(cx - ch, cy) !== '.') {
        ch = ch === 1 ? -1 : 1;
      } else {
        continue; // Express shaft: void on both sides, keep sliding vertically
      }

      do {
        cx += ch;
      } while (tok(cx, cy) === '=');

      if (isEscToken(tok(cx, cy))) continue;
      return {
        targetTileId: `f${rows - cy}_c${cx}`,
        exitHorizontalDir: ch === 1 ? 'right' : 'left',
      };
    }

    throw new Error(`Unresolved escalator at ${def.id} (${x},${y})`);
  };

  const buildEscLink = (
    x: number,
    y: number,
    hasLeft: boolean,
    hasRight: boolean,
    vStep: -1 | 1,
    nextVerticalDir?: VerticalDir
  ): EscalatorLink => {
    if (hasLeft && hasRight) {
      const rightExit = simulateEscalator(x, y, 1, vStep);
      const leftExit = simulateEscalator(x, y, -1, vStep);
      return {
        targetTileId: rightExit.targetTileId,
        exitHorizontalDir: rightExit.exitHorizontalDir,
        byEntryDir: { right: rightExit, left: leftExit },
        ...(nextVerticalDir ? { nextVerticalDir } : {}),
      };
    }
    const hIn: -1 | 1 = hasLeft ? 1 : -1;
    const exit = simulateEscalator(x, y, hIn, vStep);
    return {
      ...exit,
      ...(nextVerticalDir ? { nextVerticalDir } : {}),
    };
  };

  const tiles: Record<string, Tile> = {};
  const shops: Record<string, Shop> = {};
  const segmentPools: Record<string, string[]> = {};
  let startTileId = '';

  for (let y = 0; y < rows; y++) {
    const floor = rows - y;
    for (let x = 0; x < cols; x++) {
      const token = tok(x, y);
      if (token === '.' || token === '=') continue;

      const id = `f${floor}_c${x}`;
      const left = walkHorizontal(x, y, -1);
      const right = walkHorizontal(x, y, 1);

      if (token === 'B') {
        tiles[id] = { id, floor, col: x, type: 'bank', neighbors: { left, right } };
        startTileId = id;
        continue;
      }

      if (token === 'E0' || token === 'E1') {
        tiles[id] = {
          id,
          floor,
          col: x,
          type: 'elevator',
          elevatorShaft: token === 'E1' ? 1 : 0,
          neighbors: { left, right },
        };
        continue;
      }

      if (token.startsWith('A')) {
        const areaId = Number(token.slice(1)) as AreaId;
        const segmentId = `f${floor}_a${areaId}`;
        const shopSlotId = `shop_${floor}_${x}`;
        if (!segmentPools[segmentId]) {
          segmentPools[segmentId] = [...AREA_POOLS[areaId]];
        }
        tiles[id] = {
          id,
          floor,
          col: x,
          type: 'shop',
          segmentId,
          shopSlotId,
          neighbors: { left, right },
        };
        shops[shopSlotId] = {
          id: shopSlotId,
          tileId: id,
          segmentId,
          ownerId: null,
          storeTypeId: null,
          level: 1,
          stock: {},
          isClosedTurns: 0,
        };
        continue;
      }

      if (isEscToken(token)) {
        const hasLeft = tok(x - 1, y) !== '.';
        const hasRight = tok(x + 1, y) !== '.';
        if (!hasLeft && !hasRight) continue; // Unreachable express shaft cell

        const up = canGoUp(x, y);
        const down = canGoDown(x, y);
        const neighbors: TileNeighbors = {};
        if (up) {
          neighbors.up = buildEscLink(x, y, hasLeft, hasRight, -1, down ? undefined : 'up');
        }
        if (down) {
          neighbors.down = buildEscLink(x, y, hasLeft, hasRight, 1, up ? undefined : 'down');
        }
        tiles[id] = { id, floor, col: x, type: 'escalator', neighbors };
      }
    }
  }

  if (!startTileId) {
    throw new Error(`Stage ${def.id} is missing a Bank ('B') start tile`);
  }

  return { tiles, shops, segmentPools, startTileId, cols, floors: rows };
}
