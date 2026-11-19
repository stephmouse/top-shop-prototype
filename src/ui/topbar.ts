import { OFFICIAL_STAGES } from '../config/maps';
import type { StageId } from '../config/maps';

export interface TopbarOptions {
  initialShowRoutes: boolean;
  initialAutoStep: boolean;
  initialStageId: StageId;
  onToggleRoutes: (show: boolean) => void;
  onToggleAutoStep: (enabled: boolean) => void;
  onSelectStage: (stageId: StageId) => void;
  onNewMatch: (playerCount: number) => void;
}

export function createTopbar(options: TopbarOptions): HTMLElement {
  const topbar = document.createElement('header');
  topbar.className = 'topbar';

  const title = document.createElement('div');
  title.className = 'topbar-title';
  title.textContent = 'TOP SHOP PROTOTYPE — Move: Arrows/WASD, Click Tiles, Esc: Reset';

  const controls = document.createElement('div');
  controls.className = 'topbar-controls';

  const routesLabel = document.createElement('label');
  const routesCheckbox = document.createElement('input');
  routesCheckbox.type = 'checkbox';
  routesCheckbox.checked = options.initialShowRoutes;
  routesCheckbox.addEventListener('change', () => options.onToggleRoutes(routesCheckbox.checked));
  routesLabel.appendChild(routesCheckbox);
  routesLabel.append(' Routes');
  controls.appendChild(routesLabel);

  const autoStepLabel = document.createElement('label');
  const autoStepCheckbox = document.createElement('input');
  autoStepCheckbox.type = 'checkbox';
  autoStepCheckbox.checked = options.initialAutoStep;
  autoStepCheckbox.addEventListener('change', () => options.onToggleAutoStep(autoStepCheckbox.checked));
  autoStepLabel.appendChild(autoStepCheckbox);
  autoStepLabel.append(' Auto-Move');
  controls.appendChild(autoStepLabel);

  const stageSelect = document.createElement('select');
  stageSelect.setAttribute('aria-label', 'Select Map Stage');
  for (const stage of OFFICIAL_STAGES) {
    const opt = document.createElement('option');
    opt.value = stage.id;
    opt.textContent = `${stage.name} (${stage.cols}×${stage.floors} · ${stage.shopCount} shops)`;
    stageSelect.appendChild(opt);
  }
  stageSelect.value = options.initialStageId;
  stageSelect.addEventListener('change', () => options.onSelectStage(stageSelect.value as StageId));
  controls.appendChild(stageSelect);

  for (const count of [2, 3, 4]) {
    const btn = document.createElement('button');
    btn.textContent = `New ${count}P`;
    btn.addEventListener('click', () => options.onNewMatch(count));
    controls.appendChild(btn);
  }

  topbar.appendChild(title);
  topbar.appendChild(controls);
  return topbar;
}
