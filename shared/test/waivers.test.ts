import { describe, expect, it } from 'vitest';
import { describeExpiry, describeWaiver, effectiveWaivers, expireStale, isEffective, waiverForRule } from '../src/waivers/resolve';
import type { Waiver } from '../src/types';

const ctx = { prId: 42, repositoryUuid: 'repo-uuid', now: '2026-11-11T10:00:00Z' };

const derogation: Waiver = {
  id: 'w1',
  prId: 42,
  repositoryUuid: 'repo-uuid',
  rule: 'R-04',
  requestedBy: 'lea',
  grantedBy: 'tech-lead',
  reason: 'correctif de prix avant l’ouverture',
  requestedAt: '2026-11-11T09:30:00Z',
  expiresAt: '2026-11-11T11:30:00Z',
  status: 'granted',
};

describe('dérogations — validité et trace', () => {
  it('couvre la PR visée jusqu’à expiration', () => {
    expect(isEffective(derogation, ctx)).toBe(true);
    expect(isEffective(derogation, { ...ctx, now: '2026-11-11T11:31:00Z' })).toBe(false);
  });

  it('ne couvre ni une autre PR ni un autre dépôt', () => {
    expect(isEffective(derogation, { ...ctx, prId: 43 })).toBe(false);
    expect(isEffective(derogation, { ...ctx, repositoryUuid: 'autre' })).toBe(false);
  });

  it('ignore une demande non accordée', () => {
    expect(isEffective({ ...derogation, status: 'requested' }, ctx)).toBe(false);
    expect(effectiveWaivers([{ ...derogation, status: 'requested' }], ctx)).toEqual([]);
  });

  it('trouve la dérogation d’une règle donnée', () => {
    expect(waiverForRule([derogation], 'R-04', ctx)?.id).toBe('w1');
    expect(waiverForRule([derogation], 'R-03', ctx)).toBeUndefined();
  });

  it('passe en expiré ce qui est dépassé', () => {
    const [passe] = expireStale([derogation], '2026-11-11T12:00:00Z');
    expect(passe?.status).toBe('expired');
  });

  it('raconte qui, pourquoi, jusqu’à quand', () => {
    expect(describeWaiver(derogation, 'fr')).toBe(
      'Dérogation accordée par tech-lead jusqu’au 11/11 à 11 h 30 : correctif de prix avant l’ouverture',
    );
    expect(describeExpiry({ ...derogation, status: 'expired' }, 'fr')).toBe(
      'Dérogation expirée le 11/11 à 11 h 30 : le contrôle échoue.',
    );
  });
});
