import type { Seat, Suit } from './cards';

export type ContractType =
  | 'samen'
  | 'alleen'
  | 'troel'
  | 'piccolo'
  | 'abondance'
  | 'miserie'
  | 'openMiserie'
  | 'soloSlim';

export interface ContractDef {
  /** Auction strength: a bid must have a strictly higher rank to overbid. */
  rank: number;
  /** 'team' = 2 vs 2; 'solo' = 1 vs 3 (every declarer plays for themselves). */
  kind: 'team' | 'solo';
  /** Tricks needed (for miserie/piccolo: the exact number of tricks allowed). */
  target: number;
  exact: boolean;
  /** Points per player (team) or per opponent (solo) when made. */
  base: number;
  /** Earns +1 per overtrick / costs 1 extra per undertrick, doubled when all 13 tricks are taken. */
  perTrick: boolean;
  hasTrump: boolean;
  /** Several players may declare it independently (miserie-like contracts). */
  joinable: boolean;
  /** The declarer leads the first trick instead of the player left of the dealer. */
  declarerLeads: boolean;
}

export const CONTRACTS: Record<ContractType, ContractDef> = {
  samen: { rank: 1, kind: 'team', target: 8, exact: false, base: 2, perTrick: true, hasTrump: true, joinable: false, declarerLeads: false },
  alleen: { rank: 2, kind: 'solo', target: 5, exact: false, base: 3, perTrick: true, hasTrump: true, joinable: false, declarerLeads: false },
  troel: { rank: 3, kind: 'team', target: 8, exact: false, base: 4, perTrick: true, hasTrump: true, joinable: false, declarerLeads: false },
  piccolo: { rank: 4, kind: 'solo', target: 1, exact: true, base: 5, perTrick: false, hasTrump: false, joinable: true, declarerLeads: false },
  abondance: { rank: 5, kind: 'solo', target: 9, exact: false, base: 6, perTrick: false, hasTrump: true, joinable: false, declarerLeads: true },
  miserie: { rank: 6, kind: 'solo', target: 0, exact: true, base: 7, perTrick: false, hasTrump: false, joinable: true, declarerLeads: false },
  openMiserie: { rank: 7, kind: 'solo', target: 0, exact: true, base: 14, perTrick: false, hasTrump: false, joinable: true, declarerLeads: false },
  soloSlim: { rank: 8, kind: 'solo', target: 13, exact: false, base: 25, perTrick: false, hasTrump: true, joinable: false, declarerLeads: true },
};

/** Contracts a player can bid directly in the auction (samen comes from ask + join, alleen from an unanswered ask). */
export const DIRECT_BIDS: ContractType[] = ['piccolo', 'abondance', 'miserie', 'openMiserie', 'soloSlim'];

export interface Settings {
  piccolo: boolean;
  /** Number of hands in a game; 0 = play until you stop. */
  hands: number;
  /** After a hand where everybody passed, the next hand counts double. */
  passDoubles: boolean;
}

export const DEFAULT_SETTINGS: Settings = { piccolo: true, hands: 16, passDoubles: true };

export interface Contract {
  type: ContractType;
  trump: Suit | null;
  declarers: Seat[];
  multiplier: number;
}

export interface DeclarerOutcome {
  seat: Seat;
  tricks: number;
  made: boolean;
}

export interface Scoring {
  deltas: number[];
  outcomes: DeclarerOutcome[];
}

/**
 * Zero-sum scoring. Team contracts: each declarer wins or loses the value, each opponent the opposite.
 * Solo contracts: the declarer wins or loses the value from each of the three others (so 3x);
 * with several miserie/piccolo declarers each one is settled separately and the results added up.
 */
export function scoreContract(contract: Contract, tricksWon: number[]): Scoring {
  const def = CONTRACTS[contract.type];
  const deltas = [0, 0, 0, 0];
  const outcomes: DeclarerOutcome[] = [];

  const valueFor = (tricks: number): { made: boolean; value: number } => {
    if (def.exact) {
      const made = tricks === def.target;
      return { made, value: made ? def.base : -def.base };
    }
    const made = tricks >= def.target;
    if (!def.perTrick) return { made, value: made ? def.base : -def.base };
    if (!made) return { made, value: -(def.base + (def.target - tricks)) };
    const value = def.base + (tricks - def.target);
    return { made, value: tricks === 13 ? value * 2 : value };
  };

  if (def.kind === 'team') {
    const teamTricks = contract.declarers.reduce<number>((sum, s) => sum + tricksWon[s], 0);
    const { made, value } = valueFor(teamTricks);
    const v = value * contract.multiplier;
    for (let s = 0; s < 4; s++) deltas[s] = contract.declarers.includes(s as Seat) ? v : -v;
    for (const seat of contract.declarers) outcomes.push({ seat, tricks: teamTricks, made });
  } else {
    for (const seat of contract.declarers) {
      const { made, value } = valueFor(tricksWon[seat]);
      const v = value * contract.multiplier;
      for (let s = 0; s < 4; s++) deltas[s] += s === seat ? 3 * v : -v;
      outcomes.push({ seat, tricks: tricksWon[seat], made });
    }
  }
  return { deltas, outcomes };
}

/**
 * Whether the rest of the hand can no longer change the score, so play can stop early.
 * Contracts that count over/undertricks are always played out.
 */
export function outcomeDecided(contract: Contract, tricksWon: number[], tricksPlayed: number): boolean {
  if (tricksPlayed >= 13) return true;
  const def = CONTRACTS[contract.type];
  if (def.perTrick) return false;
  const remaining = 13 - tricksPlayed;
  if (def.exact) {
    // Every declarer has already gone over the allowed number of tricks.
    return contract.declarers.every((s) => tricksWon[s] > def.target);
  }
  const tricks = tricksWon[contract.declarers[0]];
  return tricks >= def.target || tricks + remaining < def.target;
}
