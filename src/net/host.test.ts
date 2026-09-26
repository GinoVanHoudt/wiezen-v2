import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../game/rules';
import { GameHost } from './host';

describe('GameHost seats', () => {
  let host: GameHost;
  afterEach(() => {
    host.dispose();
    vi.useRealTimers();
  });

  function fullTable() {
    vi.useFakeTimers();
    host = new GameHost('Anna', 'a', DEFAULT_SETTINGS);
    expect(host.addPlayer('Bert', 'b')).toBe(1);
    expect(host.addPlayer('Cis', 'c')).toBe(2);
    expect(host.addPlayer('Dirk', 'd')).toBe(3);
    expect(host.addPlayer('Eva', 'e')).toBeNull();
  }

  it('fills bot seats and frees them again in the lobby', () => {
    fullTable();
    host.removePlayer('c');
    expect(host.state.players[2]).toMatchObject({ bot: true, id: null });
    expect(host.addPlayer('Eva', 'e')).toBe(2);
  });

  it('keeps a dropped player’s seat reserved during a game, then lets a newcomer in', () => {
    fullTable();
    host.handle(0, { type: 'start' });
    host.removePlayer('b', 1_000);
    expect(host.state.players[1]).toMatchObject({ name: 'Bert', bot: true, connected: false });
    expect(host.addPlayer('Eva', 'e', 30_000)).toBeNull();
    expect(host.addPlayer('Bert', 'b', 40_000)).toBe(1);
    expect(host.state.players[1]).toMatchObject({ bot: false, connected: true });

    host.removePlayer('b', 50_000);
    expect(host.addPlayer('Eva', 'e', 50_000 + 3 * 60_000)).toBe(1);
    expect(host.addPlayer('Bert', 'b', 50_000 + 4 * 60_000)).toBeNull();
  });

  it('ignores host-only actions from guests', () => {
    fullTable();
    host.handle(1, { type: 'settings', settings: { ...DEFAULT_SETTINGS, piccolo: false } });
    host.handle(1, { type: 'start' });
    expect(host.state.settings.piccolo).toBe(true);
    expect(host.state.phase).toBe('lobby');
    host.handle(0, { type: 'start' });
    expect(host.state.phase).toBe('bidding');
    host.handle(2, { type: 'toLobby' });
    expect(host.state.phase).toBe('bidding');
  });
});
