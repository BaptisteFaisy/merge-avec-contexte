/**
 * Écran 5 — l'encart du ticket (§12) : décider d'une dérogation.
 *
 * Un approbateur de l'annuaire accorde une dérogation pour une durée bornée de
 * 1 à 72 h, ou la refuse ; une personne hors de l'annuaire ne peut rien
 * appliquer, et l'écran sait pourquoi (§7.1 étape 6, MC-07).
 *
 * Sont couverts ici la méthode `deciderDerogation` du resolver, l'annuaire qui
 * dit qui peut décider, et le modèle de vue `vmEncart` qui rend les demandes à
 * trancher et les décisions closes.
 */
import { describe, expect, it } from 'vitest';

import { assemblerCerveau, resolversUi, type Cerveau } from '../src/app/compose';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import { createMemoryReglagesStore } from '../src/app/reglages';
import type { Waiver } from '../src/shared/types';
import { createMemoryStore } from '../src/storage/memory-store';
import { vmEncart } from '../src/ui/view-model-encart';

const NOW = '2026-11-27T16:00:00.000Z';
const CLE = 'PAY-131';
const APPROBATEUR = 'tech-lead';

/** Cerveau en mémoire, horloge figée, annuaire des approbateurs fourni. */
function cerveau(approbateurs: string[] = [APPROBATEUR]): Cerveau {
  return assemblerCerveau({
    store: createMemoryStore(),
    reglages: createMemoryReglagesStore({ approbateurs }),
    clock: horlogeFixe(NOW),
    logger: loggerSilencieux(),
  });
}

/** Échéance attendue `heures` après l'instant figé. */
function dans(heures: number): string {
  return new Date(Date.parse(NOW) + heures * 3_600_000).toISOString();
}

/** Dérogation de référence : accordée, demandée deux heures avant l'instant figé. */
function derogation(partiel: Partial<Waiver> = {}): Waiver {
  return {
    id: 'w-1',
    prId: 42,
    repositoryUuid: 'repo-1',
    rule: 'R-04',
    requestedBy: 'lea',
    grantedBy: 'tech-lead',
    reason: 'gel contourné',
    requestedAt: '2026-11-27T14:00:00.000Z',
    expiresAt: '2026-11-27T18:00:00.000Z',
    status: 'granted',
    ...partiel,
  };
}

/** Demande une dérogation depuis l'encart, puis la retrouve par son ticket. */
async function demander(c: Cerveau, partiel: Record<string, unknown> = {}): Promise<string> {
  const payload = { method: 'demanderDerogation', issueKey: CLE, rule: 'R-04', reason: 'gel contourné', hours: 2, ...partiel };
  await resolversUi(c).encart(payload, CLE);
  const [demande] = await c.store.waivers.listByIssue(CLE);
  if (!demande) throw new Error('demande absente du stockage');
  return demande.id;
}

/** Décide d'une dérogation et rend la réponse complète du resolver. */
function decider(c: Cerveau, payload: Record<string, unknown>) {
  return resolversUi(c).encart({ method: 'deciderDerogation', issueKey: CLE, ...payload }, CLE);
}

describe('resolverEncart — décider d’une dérogation', () => {
  it('accorde la dérogation pour la durée choisie, et dit qui a tranché', async () => {
    const c = cerveau();
    const waiverId = await demander(c);

    const reponse = await decider(c, { waiverId, decision: 'granted', hours: 2, utilisateur: APPROBATEUR });

    expect(reponse.avis).toEqual({ code: 'accordee', waiverId });
    const enregistree = await c.store.waivers.find(waiverId);
    expect(enregistree?.status).toBe('granted');
    expect(enregistree?.grantedBy).toBe(APPROBATEUR);
    expect(enregistree?.expiresAt).toBe(dans(2));
    expect(reponse.vue.derogations).toEqual([
      { rule: 'R-04', grantedBy: APPROBATEUR, reason: 'gel contourné', expiresLabel: '27/11 à 18 h' },
    ]);
  });

  it('borne l’accord à 72 h, même si l’écran demande plus', async () => {
    const c = cerveau();
    const waiverId = await demander(c);

    await decider(c, { waiverId, decision: 'granted', hours: 500, utilisateur: APPROBATEUR });

    expect((await c.store.waivers.find(waiverId))?.expiresAt).toBe(dans(72));
  });

  it('borne l’accord à 1 h, même sans durée exploitable', async () => {
    const c = cerveau();
    const waiverId = await demander(c);

    await decider(c, { waiverId, decision: 'granted', hours: 0, utilisateur: APPROBATEUR });

    expect((await c.store.waivers.find(waiverId))?.expiresAt).toBe(dans(1));
  });

  it('refuse la dérogation et garde la trace de qui a tranché', async () => {
    const c = cerveau();
    const waiverId = await demander(c);

    const reponse = await decider(c, { waiverId, decision: 'refused', utilisateur: APPROBATEUR });

    expect(reponse.avis).toEqual({ code: 'refusee', waiverId });
    const enregistree = await c.store.waivers.find(waiverId);
    expect(enregistree?.status).toBe('refused');
    expect(enregistree?.grantedBy).toBe(APPROBATEUR);
    expect(reponse.vue.decisions).toEqual([
      { id: waiverId, rule: 'R-04', statut: 'refused', decidedBy: APPROBATEUR, reason: 'gel contourné', expiresLabel: null },
    ]);
    expect(reponse.vue.derogations).toEqual([]);
  });

  it('n’applique rien quand le décideur n’est pas dans l’annuaire', async () => {
    const c = cerveau();
    const waiverId = await demander(c);

    const reponse = await decider(c, { waiverId, decision: 'granted', hours: 2, utilisateur: 'lea' });

    expect(reponse.avis).toEqual({ code: 'non-approbateur', waiverId });
    expect((await c.store.waivers.find(waiverId))?.status).toBe('requested');
  });

  it('n’applique rien deux fois : la dérogation déjà tranchée le reste', async () => {
    const c = cerveau();
    const waiverId = await demander(c);
    await decider(c, { waiverId, decision: 'granted', hours: 2, utilisateur: APPROBATEUR });

    const reponse = await decider(c, { waiverId, decision: 'refused', utilisateur: APPROBATEUR });

    expect(reponse.avis).toEqual({ code: 'deja-decidee', waiverId });
    expect((await c.store.waivers.find(waiverId))?.status).toBe('granted');
  });

  it('signale une dérogation inconnue, ou rattachée à un autre ticket', async () => {
    const c = cerveau();
    await demander(c);

    const inconnue = await decider(c, { waiverId: 'w-inexistant', decision: 'granted', utilisateur: APPROBATEUR });
    expect(inconnue.avis).toEqual({ code: 'introuvable', waiverId: 'w-inexistant' });

    const autre = await c.store.waivers.listByIssue(CLE);
    const horsTicket = await decider(c, { waiverId: `${autre[0]?.id}-autre`, decision: 'granted', utilisateur: APPROBATEUR });
    expect(horsTicket.avis?.code).toBe('introuvable');
  });

  it('ignore une décision sans dérogation visée ni sens connu', async () => {
    const c = cerveau();
    const waiverId = await demander(c);

    const reponse = await decider(c, { waiverId, decision: 'peut-etre', utilisateur: APPROBATEUR });

    expect(reponse.avis).toBeUndefined();
    expect((await c.store.waivers.find(waiverId))?.status).toBe('requested');
  });
});

describe('resolverEncart — annuaire des approbateurs', () => {
  it('liste qui peut décider et laisse l’approbateur agir', async () => {
    const c = cerveau([APPROBATEUR, 'lea']);
    await demander(c);

    const reponse = await resolversUi(c).encart({ method: 'charger', utilisateur: 'lea' }, CLE);

    expect(reponse.vue.approbateurs).toEqual([APPROBATEUR, 'lea']);
    expect(reponse.vue.peutDecider).toBe(true);
    expect(reponse.vue.motif).toBeNull();
    expect(reponse.vue.demandes).toEqual([
      {
        id: expect.stringContaining('w-encart-PAY-131-R-04'),
        rule: 'R-04',
        titre: 'Aucun gel en cours sur la branche cible',
        requestedBy: 'admin',
        reason: 'gel contourné',
        requestedAtLabel: '27/11 à 16 h',
        heuresDemandees: 2,
      },
    ]);
  });

  it('dit pourquoi une personne hors annuaire ne peut pas décider', async () => {
    const c = cerveau([APPROBATEUR]);

    const reponse = await resolversUi(c).encart({ method: 'charger', utilisateur: 'lea' }, CLE);

    expect(reponse.vue.peutDecider).toBe(false);
    expect(reponse.vue.motif).toBe('non-approbateur');
  });

  it('dit pourquoi personne ne peut décider quand l’annuaire est vide', async () => {
    const c = cerveau([]);

    const reponse = await resolversUi(c).encart({ method: 'charger', utilisateur: 'lea' }, CLE);

    expect(reponse.vue.approbateurs).toEqual([]);
    expect(reponse.vue.peutDecider).toBe(false);
    expect(reponse.vue.motif).toBe('annuaire-vide');
  });

  it('retombe sur l’administrateur de l’installation quand l’écran ne dit pas qui agit', async () => {
    const c = cerveau(['admin']);
    const waiverId = await demander(c);

    const reponse = await decider(c, { waiverId, decision: 'granted', hours: 3 });

    expect(reponse.avis?.code).toBe('accordee');
    expect((await c.store.waivers.find(waiverId))?.grantedBy).toBe('admin');
  });
});

describe('resolverEncart — méthodes déjà en place', () => {
  it('ne rend aucun avis tant qu’aucune décision n’est demandée', async () => {
    const c = cerveau();

    const reponse = await resolversUi(c).encart({ method: 'charger' }, CLE);

    expect(Object.keys(reponse).sort()).toEqual(['locale', 'vue']);
    expect(reponse.locale).toBe('fr');
  });

  it('enregistre toujours la demande faite depuis le ticket', async () => {
    const c = cerveau();

    const waiverId = await demander(c, { rule: 'R-05', hours: 5, reason: 'incident en cours' });

    const enregistree = await c.store.waivers.find(waiverId);
    expect(enregistree?.rule).toBe('R-05');
    expect(enregistree?.status).toBe('requested');
    expect(enregistree?.requestedBy).toBe('admin');
    expect(enregistree?.expiresAt).toBe(dans(5));
    expect(enregistree?.issueKeys).toEqual([CLE]);
  });
});

describe('vmEncart — décider d’une dérogation', () => {
  it('liste les demandes à trancher, avec la durée demandée bornée de 1 à 72 h', () => {
    const vue = vmEncart({
      locale: 'fr',
      maintenant: NOW,
      waivers: [
        derogation({ id: 'w-3', rule: 'R-06', status: 'requested' }),
        derogation({ id: 'w-5', rule: 'R-05', status: 'requested', expiresAt: undefined }),
        derogation({ id: 'w-6', rule: 'R-09', status: 'requested', expiresAt: '2026-12-05T14:00:00.000Z' }),
      ],
    });
    expect(vue.demandes.map((demande) => demande.id)).toEqual(['w-3', 'w-5', 'w-6']);
    expect(vue.demandes[0]).toEqual({
      id: 'w-3',
      rule: 'R-06',
      titre: 'Le ticket n’est pas bloqué par un ticket ouvert',
      requestedBy: 'lea',
      reason: 'gel contourné',
      requestedAtLabel: '27/11 à 14 h',
      heuresDemandees: 4,
    });
    expect(vue.demandes[1]?.heuresDemandees).toBe(2);
    expect(vue.demandes[2]?.heuresDemandees).toBe(72);
    expect(vmEncart({ locale: 'fr' }).demandes).toEqual([]);

    const anglais = vmEncart({ locale: 'en', waivers: [derogation({ id: 'w-3', rule: 'R-06', status: 'requested' })] });
    expect(anglais.demandes[0]?.titre).toBe('The issue is not blocked by an open issue');
  });

  it('rend les décisions closes : qui a tranché, jusqu’à quand, et pourquoi', () => {
    const vue = vmEncart({
      locale: 'fr',
      maintenant: NOW,
      waivers: [
        derogation(),
        derogation({ id: 'w-2', rule: 'R-03', expiresAt: '2026-11-27T15:00:00.000Z' }),
        derogation({ id: 'w-7', rule: 'R-05', status: 'refused', grantedBy: 'lea' }),
        derogation({ id: 'w-8', rule: 'R-06', status: 'requested' }),
      ],
    });
    expect(vue.decisions.map((decision) => decision.id)).toEqual(['w-2', 'w-7']);
    expect(vue.decisions[0]).toEqual({
      id: 'w-2',
      rule: 'R-03',
      statut: 'expired',
      decidedBy: 'tech-lead',
      reason: 'gel contourné',
      expiresLabel: '27/11 à 15 h',
    });
    expect(vue.decisions[1]).toEqual({
      id: 'w-7',
      rule: 'R-05',
      statut: 'refused',
      decidedBy: 'lea',
      reason: 'gel contourné',
      expiresLabel: null,
    });
    expect(vue.derogations.map((active) => active.rule)).toEqual(['R-04']);
    expect(vmEncart({ locale: 'fr' }).decisions).toEqual([]);
  });

  it('dit qui peut décider d’après l’annuaire des approbateurs', () => {
    const vue = vmEncart({ locale: 'fr', approbateurs: ['tech-lead', 'lea'], utilisateur: 'lea' });
    expect(vue.approbateurs).toEqual(['tech-lead', 'lea']);
    expect(vue.peutDecider).toBe(true);
    expect(vue.motif).toBeNull();
  });

  it('refuse la décision à qui n’est pas de l’annuaire, et dit pourquoi', () => {
    const vue = vmEncart({ locale: 'fr', approbateurs: ['tech-lead'], utilisateur: 'sam' });
    expect(vue.peutDecider).toBe(false);
    expect(vue.motif).toBe('non-approbateur');
    expect(vmEncart({ locale: 'fr', approbateurs: [] }).motif).toBe('annuaire-vide');
    expect(vmEncart({ locale: 'fr' }).peutDecider).toBe(false);
  });
});
