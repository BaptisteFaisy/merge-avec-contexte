import { describe, expect, it } from 'vitest';
import {
  describeExpiry,
  describeWaiver,
  effectiveWaivers,
  expiredWaiverForRule,
  expiryReason,
  expireStale,
  isEffective,
  waiverForRule,
  waiversForPr,
} from '../src/waivers/resolve';
import { journalWaiver, journalWaivers } from '../src/waivers/journal';
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

/** Dérogation demandée depuis un ticket (Jira ou Rovo) : aucune PR connue. */
const parTicket: Waiver = {
  id: 'w2',
  prId: 0,
  repositoryUuid: '',
  rule: 'R-04',
  requestedBy: 'lea',
  grantedBy: 'tech-lead',
  reason: 'correctif urgent pendant le gel',
  requestedAt: '2026-11-11T09:30:00Z',
  expiresAt: '2026-11-11T11:30:00Z',
  status: 'granted',
  issueKeys: ['PAY-123'],
};

describe('dérogations — rattachement à un ticket', () => {
  it('lève le blocage de n’importe quelle PR qui cite le ticket, pendant sa durée', () => {
    const autre = { prId: 77, repositoryUuid: 'autre-repo', issueKeys: ['PAY-123'], now: ctx.now };
    expect(isEffective(parTicket, autre)).toBe(true);
    expect(waiverForRule([parTicket], 'R-04', autre)?.id).toBe('w2');
  });

  it('ignore la casse des clés de tickets', () => {
    const minuscules = { prId: 77, repositoryUuid: 'autre-repo', issueKeys: ['pay-123'], now: ctx.now };
    expect(isEffective(parTicket, minuscules)).toBe(true);
  });

  it('ne couvre pas une PR qui ne cite pas le ticket', () => {
    expect(isEffective(parTicket, { prId: 77, repositoryUuid: 'autre-repo', issueKeys: ['PAY-999'], now: ctx.now })).toBe(false);
    expect(isEffective(parTicket, { prId: 77, repositoryUuid: 'autre-repo', now: ctx.now })).toBe(false);
  });

  it('ne couvre plus rien une fois expirée', () => {
    const tard = { prId: 77, repositoryUuid: 'autre-repo', issueKeys: ['PAY-123'], now: '2026-11-11T11:31:00Z' };
    expect(isEffective(parTicket, tard)).toBe(false);
  });

  it('laisse la dérogation par PR fonctionner, avec ou sans tickets', () => {
    expect(isEffective(derogation, ctx)).toBe(true);
    expect(isEffective({ ...derogation, issueKeys: ['PAY-999'] }, ctx)).toBe(true);
    expect(isEffective(derogation, { ...ctx, issueKeys: ['PAY-123'] })).toBe(true);
  });
});

describe('waiversForPr — chargement par PR et par ticket', () => {
  const scope = { prId: 42, repositoryUuid: 'repo-uuid', issueKeys: ['PAY-123'] };

  it('retient les deux portées, dédoublonnées par identifiant', () => {
    const candidats = [parTicket, derogation, parTicket, { ...parTicket, id: 'w3', issueKeys: ['PAY-999'] }];
    const retenus = waiversForPr(candidats, scope);
    expect(retenus.map((waiver) => waiver.id)).toEqual(['w2', 'w1']);
  });

  it('rattache la dérogation par ticket à la PR couverte', () => {
    const [rattachee] = waiversForPr([parTicket], scope);
    expect(rattachee?.prId).toBe(42);
    expect(rattachee?.repositoryUuid).toBe('repo-uuid');
    expect(rattachee?.issueKeys).toEqual(['PAY-123']);
  });

  it('laisse inchangée une dérogation déjà rattachée à la PR', () => {
    const [originale] = waiversForPr([derogation], scope);
    expect(originale).toBe(derogation);
  });
});

describe('dérogation expirée — le contrôle échoue et le dit (§17, cas 5)', () => {
  const apres = { ...ctx, now: '2026-11-11T12:00:00Z' };

  it('retrouve la dérogation expirée qui couvrait la règle', () => {
    expect(expiredWaiverForRule([derogation], 'R-04', apres)?.id).toBe('w1');
    expect(expiredWaiverForRule([derogation], 'R-03', apres)).toBeUndefined();
    expect(expiredWaiverForRule([derogation], 'R-04', ctx)).toBeUndefined();
  });

  it('retrouve aussi une dérogation par ticket expirée', () => {
    const ctxTicket = { prId: 77, repositoryUuid: 'autre-repo', issueKeys: ['PAY-123'], now: '2026-11-11T12:00:00Z' };
    expect(expiredWaiverForRule([parTicket], 'R-04', ctxTicket)?.id).toBe('w2');
  });

  it('ignore une demande jamais accordée', () => {
    expect(expiredWaiverForRule([{ ...derogation, status: 'requested' }], 'R-04', apres)).toBeUndefined();
  });

  it('rend une raison lisible qui cite l’expiration', () => {
    const raison = expiryReason(derogation, 'fr');
    expect(raison).toEqual({
      rule: 'R-04',
      level: 'blocking',
      text: 'Dérogation expirée le 11/11 à 11 h 30 : le contrôle échoue.',
    });
    expect(expiryReason(derogation, 'en').text).toContain('expired');
  });

  it('suit le niveau demandé pour une règle non bloquante', () => {
    expect(expiryReason(derogation, 'fr', 'warning').level).toBe('warning');
  });
});

describe('journalWaiver — les dérogations du journal (§12, écran 7)', () => {
  it('recopie la portée et rédige la trace d’une dérogation accordée', () => {
    const ligne = journalWaiver(parTicket, 'fr');
    expect(ligne.issueKeys).toEqual(['PAY-123']);
    expect(ligne.prId).toBe(0);
    expect(ligne.text).toBe(describeWaiver(parTicket, 'fr'));
  });

  it('dit l’expiration d’une dérogation expirée', () => {
    const ligne = journalWaiver({ ...derogation, status: 'expired' }, 'fr');
    expect(ligne.text).toBe(describeExpiry({ ...derogation, status: 'expired' }, 'fr'));
  });

  it('affiche le motif tant que la demande n’est pas tranchée', () => {
    const ligne = journalWaiver({ ...derogation, status: 'requested' }, 'fr');
    expect(ligne.text).toBe(derogation.reason);
    expect(ligne.issueKeys).toEqual([]);
  });

  it('classe les lignes du journal, les plus récentes d’abord', () => {
    const ancienne = { ...derogation, id: 'w0', requestedAt: '2026-11-10T09:00:00Z' };
    const journal = journalWaivers('eval-1', [ancienne, derogation], 'fr');
    expect(journal.evaluationId).toBe('eval-1');
    expect(journal.waivers.map((ligne) => ligne.id)).toEqual(['w1', 'w0']);
  });
});
