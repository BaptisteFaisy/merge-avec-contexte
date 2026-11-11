import { describe, expect, it } from 'vitest';
import { activeFreezes, describeFreezeEnd, freezeApplies } from '../src/freezes/match';
import type { Freeze } from '../src/types';

/** Gel ponctuel du 30 novembre, 8 h → 10 h UTC. */
const blackFriday: Freeze = {
  id: 'f1',
  name: 'Black Friday',
  startsAt: '2026-11-30T08:00:00Z',
  endsAt: '2026-11-30T10:00:00Z',
  branches: ['main'],
  services: [],
  recurrence: { kind: 'none' },
};

/** Gel quotidien 22 h → 23 h UTC, du 1er au 30 novembre. */
const nocturne: Freeze = {
  id: 'f2',
  name: 'Fenêtre nocturne',
  startsAt: '2026-11-01T22:00:00Z',
  endsAt: '2026-11-30T23:00:00Z',
  branches: ['main', 'release/*'],
  services: ['checkout-api'],
  recurrence: { kind: 'daily' },
};

/** Gel hebdomadaire du lundi, 9 h → 12 h UTC. */
const lundiMatin: Freeze = {
  id: 'f3',
  name: 'Revue du lundi',
  startsAt: '2026-11-02T09:00:00Z',
  endsAt: '2026-11-30T12:00:00Z',
  branches: ['main'],
  services: [],
  recurrence: { kind: 'weekly', daysOfWeek: [1] },
};

describe('gels — portée et fenêtre', () => {
  it('bloque la branche visée pendant la fenêtre ponctuelle', () => {
    expect(freezeApplies(blackFriday, { targetBranch: 'main', now: '2026-11-30T09:00:00Z' })).toBe(true);
    expect(freezeApplies(blackFriday, { targetBranch: 'main', now: '2026-11-30T10:00:00Z' })).toBe(false);
    expect(freezeApplies(blackFriday, { targetBranch: 'develop', now: '2026-11-30T09:00:00Z' })).toBe(false);
  });

  it('suit les motifs de branche', () => {
    const now = '2026-11-14T22:30:00Z';
    expect(freezeApplies(nocturne, { targetBranch: 'release/1.4', service: 'checkout-api', now })).toBe(true);
    expect(freezeApplies(nocturne, { targetBranch: 'feature/x', service: 'checkout-api', now })).toBe(false);
  });

  it('ne s’applique pas à un service non concerné, ni sans service connu', () => {
    const now = '2026-11-14T22:30:00Z';
    expect(freezeApplies(nocturne, { targetBranch: 'main', service: 'payments-api', now })).toBe(false);
    expect(freezeApplies(nocturne, { targetBranch: 'main', now })).toBe(false);
  });

  it('répète la fenêtre chaque jour, dans les bornes du gel', () => {
    expect(freezeApplies(nocturne, { targetBranch: 'main', service: 'checkout-api', now: '2026-11-15T22:30:00Z' })).toBe(true);
    expect(freezeApplies(nocturne, { targetBranch: 'main', service: 'checkout-api', now: '2026-11-15T21:30:00Z' })).toBe(false);
    expect(freezeApplies(nocturne, { targetBranch: 'main', service: 'checkout-api', now: '2026-12-01T22:30:00Z' })).toBe(false);
  });

  it('ne réveille le gel hebdomadaire que le bon jour', () => {
    const lundi = '2026-11-16T10:00:00Z';
    const mardi = '2026-11-17T10:00:00Z';
    expect(freezeApplies(lundiMatin, { targetBranch: 'main', now: lundi })).toBe(true);
    expect(freezeApplies(lundiMatin, { targetBranch: 'main', now: mardi })).toBe(false);
    expect(freezeApplies(lundiMatin, { targetBranch: 'main', now: '2026-11-16T12:30:00Z' })).toBe(false);
  });

  it('lit la fenêtre dans le fuseau du gel', () => {
    const paris: Freeze = { ...blackFriday, timezone: 'Europe/Paris' };
    expect(describeFreezeEnd(paris, 'fr')).toBe('30/11 à 11 h');
    expect(describeFreezeEnd(paris, 'en')).toBe('30 Nov, 11:00');
  });

  it('rend les gels actifs, la fin la plus proche d’abord', () => {
    const actifs = activeFreezes([lundiMatin, nocturne, blackFriday], {
      targetBranch: 'main', service: 'checkout-api', now: '2026-11-16T10:00:00Z',
    });
    expect(actifs.map((gel) => gel.id)).toEqual(['f3']);
  });
});
