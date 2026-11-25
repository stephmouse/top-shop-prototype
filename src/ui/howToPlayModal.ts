import { addLobbySection, mk, mkBtn } from './lobbyRoomView';

export interface HowToPlayModalController {
  el: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

interface RuleSection {
  title: string;
  items: Array<[lead: string, text: string]>;
}

const RULE_SECTIONS: readonly RuleSection[] = [
  {
    title: '1. Objective',
    items: [
      ['Win by Net Worth:', 'Be the first player to reach the Target Assets goal (Cash + Owned Store Value).'],
      ['Win by Elimination:', 'If enough rivals go Bankrupt to meet the Bankrupt Limit, the richest active player wins.'],
    ],
  },
  {
    title: '2. Rolling & Moving',
    items: [
      ['Pencil Die (1–8 & E):', 'Spin and stop the Pencil Die (Space or button) to walk 1–8 steps, or roll E to draw 1 of 3 face-down Event Cards.'],
      ['Rounds vs. Turns:', 'A Turn is one player’s move; a Round is one full cycle around the table (1 calendar month). Timed effects (like 2× Prices or Closed Stores) last N full rounds and expire right after the triggering player finishes their turn N rounds later—so a badge like 4 rd stays at 4 rd across everyone’s turn until that round finishes.'],
      ['Direction Locking:', 'Once you pick a direction (←/→ or escalator ↑/↓), you keep traveling that way until you pass/land on the Bank, stop at an Elevator, or draw a direction-unlocking Event.'],
      ['Controls:', 'Use the bottom direction buttons, click dashed LAND tiles on the board to auto-walk, or press Arrow / WASD keys (opposite direction steps Back, Esc resets your move).'],
    ],
  },
  {
    title: '3. Stores & Chains (Levels 1–4)',
    items: [
      ['Vacant Lots (Tenant Wanted):', 'Land on an empty lot and pay its opening cost to launch a store (auto-stocked with starter items).'],
      ['Store Chains (Level 1 → Level 4):', 'Owning adjacent stores in the same mall section links them into a chain: 1 store = Level 1 (3 shelves), up to 4 connected stores = Level 4 (6 shelves), unlocking higher-priced items when you Deliver stock.'],
      ['Segment Exclusivity:', 'Only one player may own a given store type in each mall section.'],
    ],
  },
  {
    title: '4. Rival Shopping, Cash Back & Buyouts',
    items: [
      ['Sequential Buying:', 'Landing on a rival’s stocked store requires buying 1 item, then lets you choose whether to buy a 2nd item or Leave Shop.'],
      ['Shopping Points:', 'Each item bought has a 65% chance to award Shopping Points (up to 99 max) to spend at the Bank.'],
      ['2× Cash Back:', 'Every item has a 2%–12% chance (higher on pricier items) to trigger Cash Back—forcing the owner to pay you double the item’s price!'],
      ['Buyouts:', 'Buying a rival store’s last remaining item lets you pay to buy out and convert the slot.'],
    ],
  },
  {
    title: '5. Bank & Negative Cash',
    items: [
      ['Payday:', 'Passing the Bank pays a salary based on your net worth and steps walked; landing directly on the Bank pays a 1.5× bonus.'],
      ['Point Exchange:', 'On any Bank visit, you may redeem 1 reward using your Shopping Points.'],
      ['Negative Cash & Bankruptcy:', 'Ending a turn below $0 forces selling your stores at 75% asset value until back at $0+. With no stores left, you go Bankrupt.'],
    ],
  },
];

export function createHowToPlayModal(): HowToPlayModalController {
  let visible = false;

  const backdrop = Object.assign(mk('div', 'setup-backdrop howto-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal howto-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const close = () => { visible = false; backdrop.hidden = true; };

  const header = mk('div', 'setup-header');
  header.append(mk('h2', 'setup-title', 'How to Play Top Shop'), mkBtn('Close (Esc)', close));

  const body = mk('div', 'lobby-body howto-body');
  for (const section of RULE_SECTIONS) {
    const sec = addLobbySection(section.title);
    const list = mk('ul', 'howto-list');
    for (const [lead, text] of section.items) {
      const li = document.createElement('li');
      li.append(mk('strong', '', `${lead} `), document.createTextNode(text));
      list.appendChild(li);
    }
    sec.appendChild(list);
    body.appendChild(sec);
  }

  const footer = mk('div', 'setup-footer');
  footer.append(mk('span', 'setup-muted', 'Original PS1 ruleset with 2–6 players & online P2P.'), mkBtn('Back', close, 'primary'));

  modal.append(header, body, footer);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return {
    el: backdrop,
    open: () => { visible = true; backdrop.hidden = false; },
    close,
    isOpen: () => visible,
  };
}
