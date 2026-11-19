import type { DirectionChoice } from './actions';
import {
  getActivePlayer,
  getAvailableDirections,
  getTile,
  resolveEscalatorExit,
} from './helpers';
import type { EscalatorLink, GameState, HorizontalDir, VerticalDir } from './types';

export interface MoveOption {
  tileId: string;
  direction?: DirectionChoice;
}

export interface EndTarget {
  tileId: string;
  queuedChoices: DirectionChoice[];
  pathTileIds: string[];
}

export interface MovePreview {
  nextTiles: MoveOption[];
  endTargets: EndTarget[];
}

interface SimCursor {
  tileId: string;
  hDir: HorizontalDir | null;
  vDir: VerticalDir | null;
  stepsLeft: number;
  onEscalator: boolean;
  choices: DirectionChoice[];
  path: string[];
}

function collectEndTargets(
  state: GameState,
  cursor: SimCursor,
  results: Map<string, EndTarget>,
  depth = 0
): void {
  if (depth > 24) return;
  const tile = state.tiles[cursor.tileId];
  if (!tile) return;

  if (cursor.onEscalator) {
    const { up, down } = tile.neighbors;
    const handleLink = (link: EscalatorLink, chosenV?: VerticalDir) => {
      const exit = resolveEscalatorExit(link, cursor.hDir);
      const nextCursor: SimCursor = {
        tileId: exit.targetTileId,
        hDir: exit.exitHorizontalDir,
        vDir: link.nextVerticalDir ?? chosenV ?? cursor.vDir,
        stepsLeft: cursor.stepsLeft,
        onEscalator: false,
        choices: chosenV ? [...cursor.choices, chosenV] : cursor.choices,
        path: [...cursor.path, exit.targetTileId],
      };
      if (nextCursor.stepsLeft === 0) {
        if (!results.has(nextCursor.tileId)) {
          results.set(nextCursor.tileId, {
            tileId: nextCursor.tileId,
            queuedChoices: nextCursor.choices,
            pathTileIds: nextCursor.path,
          });
        }
        return;
      }
      collectEndTargets(state, nextCursor, results, depth + 1);
    };

    if (up && down) {
      if (cursor.vDir) {
        handleLink(cursor.vDir === 'up' ? up : down);
      } else {
        handleLink(up, 'up');
        handleLink(down, 'down');
      }
      return;
    }

    const single = up ?? down;
    if (single) {
      handleLink(single);
      return;
    }
  }

  if (cursor.stepsLeft <= 0) {
    if (!results.has(cursor.tileId)) {
      results.set(cursor.tileId, {
        tileId: cursor.tileId,
        queuedChoices: cursor.choices,
        pathTileIds: cursor.path,
      });
    }
    return;
  }

  if (!cursor.hDir) {
    for (const dir of ['left', 'right'] as const) {
      if (tile.neighbors[dir]) {
        collectEndTargets(
          state,
          { ...cursor, hDir: dir, choices: [...cursor.choices, dir] },
          results,
          depth + 1
        );
      }
    }
    return;
  }

  const nextId = tile.neighbors[cursor.hDir];
  if (!nextId) return;
  const nextTile = state.tiles[nextId];
  if (!nextTile) return;

  const nextCursor: SimCursor = {
    tileId: nextId,
    hDir: cursor.hDir,
    vDir: cursor.vDir,
    stepsLeft: cursor.stepsLeft - 1,
    onEscalator: nextTile.type === 'escalator',
    choices: cursor.choices,
    path: [...cursor.path, nextId],
  };

  if (nextCursor.stepsLeft === 0 && !nextCursor.onEscalator) {
    if (!results.has(nextId)) {
      results.set(nextId, {
        tileId: nextId,
        queuedChoices: nextCursor.choices,
        pathTileIds: nextCursor.path,
      });
    }
    return;
  }

  collectEndTargets(state, nextCursor, results, depth + 1);
}

export function computeMovePreview(state: GameState): MovePreview {
  if (
    state.phase !== 'CHOOSE_DIRECTION' &&
    state.phase !== 'STEPPING' &&
    state.phase !== 'ESCALATOR_RIDE'
  ) {
    return { nextTiles: [], endTargets: [] };
  }

  const active = getActivePlayer(state);
  const currentTile = getTile(state, active.tileId);
  const nextTiles: MoveOption[] = [];

  if (state.remainingSteps > 1) {
    if (state.phase === 'CHOOSE_DIRECTION') {
      for (const dir of getAvailableDirections(state, active)) {
        if (dir === 'left' || dir === 'right') {
          const targetId = currentTile.neighbors[dir];
          if (targetId) nextTiles.push({ tileId: targetId, direction: dir });
        } else {
          const link = currentTile.neighbors[dir];
          if (link) {
            nextTiles.push({
              tileId: resolveEscalatorExit(link, active.horizontalDir).targetTileId,
              direction: dir,
            });
          }
        }
      }
    } else if (state.phase === 'STEPPING' && active.horizontalDir) {
      const nextId = currentTile.neighbors[active.horizontalDir];
      if (nextId) nextTiles.push({ tileId: nextId });
    } else if (state.phase === 'ESCALATOR_RIDE') {
      const { up, down } = currentTile.neighbors;
      const link = up && down ? (active.verticalDir === 'down' ? down : up) : up ?? down;
      if (link) {
        nextTiles.push({ tileId: resolveEscalatorExit(link, active.horizontalDir).targetTileId });
      }
    }
  }

  const results = new Map<string, EndTarget>();
  collectEndTargets(
    state,
    {
      tileId: active.tileId,
      hDir: active.horizontalDir,
      vDir: active.verticalDir,
      stepsLeft: state.remainingSteps,
      onEscalator:
        state.phase === 'ESCALATOR_RIDE' ||
        (state.phase === 'CHOOSE_DIRECTION' && currentTile.type === 'escalator'),
      choices: [],
      path: [active.tileId],
    },
    results
  );

  return {
    nextTiles,
    endTargets: Array.from(results.values()),
  };
}