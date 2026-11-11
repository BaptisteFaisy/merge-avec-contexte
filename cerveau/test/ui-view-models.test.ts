/**
 * Modèles de vue des écrans Jira (§12, écrans 4 à 7) : libellés bilingues,
 * options de niveau et de mode, message d'aperçu identique au contrôle réel,
 * statistiques du journal et rapport d'observation.
 */
import { describe, expect, it } from 'vitest';

import { formatEvaluation } from '../src/shared/message/format';
import { RULE_CODES } from '../src/shared/rules/catalog';
import type { Evaluation, Locale, Reason, RuleConfig, Waiver } from '../src/shared/types';
import {
  libelleVerdict,
  vmConsole,
  vmEncart,
  vmJournal,
  vmReglages,
} from '../src/ui/view-models';

const MAINTENANT = '2026-11-11T10:00:00.000Z';

function evaluation(partiel: Partial<Evaluation> = {}): Evaluation {
  return {
    verdict: 'allowed',
    reasons: [],
    issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed',
    evaluatedAt: '2026-11-11T09:00:00.000Z',
    durationMs: 120,
    ...partiel,
  };
}

function raison(partiel: Partial<Reason> & { rule: Reason['rule']; level: Reason['level'] }): Reason {
  return { text: 'raison', ...partiel };
}

function derogation(partiel: Partial<Waiver> = {}): Waiver {
  return {
    id: 'w-1',
    prId: 42,
    repositoryUuid: 'repo-1',
    rule: 'R-04',
    requestedBy: 'lea',
    grantedBy: 'tech-lead',
    reason: 'correctif de prix avant l’ouverture',
    requestedAt: '2026-11-11T08:00:00.000Z',
    expiresAt: '2026-11-11T12:00:00.000Z',
    status: 'granted',
    ...partiel,
  };
}

const CRITERE = raison({
  rule: 'R-03',
  level: 'blocking',
  text: 'PAY-123 : 2 critère(s) d’acceptation non coché(s).',
  action: 'Cochez dans le ticket les critères vraiment validés.',
});
const GEL = raison({
  rule: 'R-04',
  level: 'blocking',
  text: 'Gel « Black Friday » sur main jusqu’au 30/11 à 9 h.',
  action: 'Attendez la fin du gel ou demandez une dérogation.',
});
const AVERTISSEMENT = raison({ rule: 'R-01', level: 'warning', text: 'Aucun ticket Jira reconnu dans cette PR.' });

const REGLAGE_R03: RuleConfig = {
  rule: 'R-03',
  level: 'blocking',
  mode: 'observe',
  scope: { repositories: ['payments-api'], branches: ['main', 'release/*'] },
  params: { source: 'description-checkboxes' },
};

/* ------------------------------------------------------------------ réglages */

describe('vmReglages', () => {
  it('rend les treize règles dans l’ordre du catalogue', () => {
    const vue = vmReglages({ locale: 'fr' });
    expect(vue.regles.map((ligne) => ligne.code)).toEqual(RULE_CODES);
    expect(vue.regles).toHaveLength(13);
  });

  it('titre chaque règle dans la langue demandée', () => {
    const fr = vmReglages({ locale: 'fr' });
    const en = vmReglages({ locale: 'en' });
    expect(fr.regles[0]?.titre).toBe('La PR est reliée à un ticket Jira existant');
    expect(en.regles[0]?.titre).toBe('The pull request is linked to an existing Jira issue');
    expect(fr.regles[2]?.titre).toBe('Les critères d’acceptation sont validés');
    expect(en.regles[2]?.titre).toBe('Acceptance criteria are met');
  });

  it('prend le niveau et le mode par défaut du catalogue', () => {
    const ligne = vmReglages({ locale: 'fr' }).regles[1];
    expect(ligne?.niveau).toBe('blocking');
    expect(ligne?.niveauLabel).toBe('Bloquant');
    expect(ligne?.mode).toBe('active');
    expect(ligne?.modeLabel).toBe('Actif');
  });

  it('propose les trois niveaux et les deux modes, avec leurs libellés', () => {
    const ligne = vmReglages({ locale: 'fr' }).regles[0];
    expect(ligne?.niveauxPossibles.map((option) => option.value)).toEqual(['blocking', 'warning', 'information']);
    expect(ligne?.niveauxPossibles.map((option) => option.label)).toEqual(['Bloquant', 'Avertissement', 'Information']);
    expect(ligne?.modesPossibles.map((option) => option.value)).toEqual(['active', 'observe']);
    expect(ligne?.modesPossibles.map((option) => option.label)).toEqual(['Actif', 'Observation']);

    const anglais = vmReglages({ locale: 'en' }).regles[0];
    expect(anglais?.niveauxPossibles.map((option) => option.label)).toEqual(['Blocking', 'Warning', 'Information']);
    expect(anglais?.modesPossibles.map((option) => option.label)).toEqual(['Active', 'Observation']);
  });

  it('applique le réglage enregistré quand il existe', () => {
    const ligne = vmReglages({ locale: 'fr', configs: [REGLAGE_R03] }).regles[2];
    expect(ligne?.code).toBe('R-03');
    expect(ligne?.niveau).toBe('blocking');
    expect(ligne?.mode).toBe('observe');
    expect(ligne?.modeLabel).toBe('Observation');
    expect(ligne?.portee.depots).toEqual(['payments-api']);
    expect(ligne?.portee.branches).toEqual(['main', 'release/*']);
    expect(ligne?.portee.resume).toBe('Dépôts : payments-api · Branches : main, release/*');
  });

  it('résume une portée vide par « tous les dépôts, toutes les branches »', () => {
    const fr = vmReglages({ locale: 'fr' }).regles[3];
    const en = vmReglages({ locale: 'en' }).regles[3];
    expect(fr?.portee.resume).toBe('Tous les dépôts, toutes les branches');
    expect(en?.portee.resume).toBe('All repositories, all branches');
    expect(fr?.portee.depots).toEqual([]);
  });

  it('liste les paramètres du catalogue avec leur valeur courante', () => {
    const ligne = vmReglages({ locale: 'fr', configs: [REGLAGE_R03] }).regles[2];
    expect(ligne?.params.map((param) => param.name)).toEqual(['source', 'fieldId']);
    expect(ligne?.params[0]?.value).toBe('description-checkboxes');
    expect(ligne?.params[1]?.value).toBe('');
    expect(ligne?.params[0]?.type).toBe('string');
    expect(ligne?.params[0]?.note).toContain('critères');
  });

  it('met en texte les listes et les booléens d’un paramètre', () => {
    const configs: RuleConfig[] = [{
      rule: 'R-08',
      level: 'warning',
      mode: 'active',
      scope: {},
      params: { days: ['mon', 'tue'], startHour: 17, endHour: 8, timezone: 'Europe/Paris' },
    }];
    const ligne = vmReglages({ locale: 'fr', configs }).regles[7];
    expect(ligne?.params.map((param) => param.name)).toEqual(['branches', 'days', 'startHour', 'endHour', 'timezone']);
    expect(ligne?.params[1]?.value).toBe('mon, tue');
    expect(ligne?.params[2]?.value).toBe('17');
    expect(ligne?.params[0]?.value).toBe('');
    const avecBooleen = vmReglages({
      locale: 'en',
      configs: [{ rule: 'R-03', level: 'blocking', mode: 'active', scope: {}, params: { actif: true } }],
    }).regles[2];
    expect(avecBooleen?.params[0]?.value).toBe('');
  });

  it('décrit un jumelage actif et sa politique de repli', () => {
    const vue = vmReglages({
      locale: 'fr',
      jumelage: { etat: 'paired', siteUrl: 'https://demo.atlassian.net', politiqueRepli: 'closed' },
    });
    expect(vue.jumelage.etat).toBe('paired');
    expect(vue.jumelage.etatLabel).toBe('Jumelé avec Bitbucket');
    expect(vue.jumelage.siteUrl).toBe('https://demo.atlassian.net');
    expect(vue.jumelage.codeEnCours).toBeNull();
    expect(vue.jumelage.codeExpire).toBeNull();
    expect(vue.jumelage.codeValide).toBe(false);
    expect(vue.jumelage.politiqueRepli).toBe('closed');
    expect(vue.jumelage.politiqueRepliLabel).toBe('Fermé : la fusion est bloquée');
  });

  it('dit si le code de jumelage en cours est encore valable', () => {
    const entree = {
      etat: 'code-pending' as const,
      code: 'MAC-7Q2Z-4K9M',
      codeExpireA: '2026-11-11T10:10:00.000Z',
      politiqueRepli: 'open' as const,
    };
    const valide = vmReglages({ locale: 'fr', jumelage: entree, maintenant: MAINTENANT });
    expect(valide.jumelage.etatLabel).toBe('Code de jumelage en attente');
    expect(valide.jumelage.codeEnCours).toBe('MAC-7Q2Z-4K9M');
    expect(valide.jumelage.codeValide).toBe(true);
    expect(valide.jumelage.codeExpireLabel).toBe('11/11 à 10 h 10');

    const expire = vmReglages({
      locale: 'fr',
      jumelage: entree,
      maintenant: '2026-11-11T10:30:00.000Z',
    });
    expect(expire.jumelage.codeValide).toBe(false);
    expect(expire.jumelage.etat).toBe('code-pending');
  });

  it('traduit l’état « non jumelé » et la politique ouverte', () => {
    const en = vmReglages({ locale: 'en', jumelage: { etat: 'unpaired', politiqueRepli: 'open' } });
    expect(en.jumelage.etatLabel).toBe('Not paired');
    expect(en.jumelage.politiqueRepliLabel).toBe('Open: the merge stays possible');
  });

  it('rend la correspondance dépôt → service et les approbateurs', () => {
    const vue = vmReglages({
      locale: 'fr',
      correspondance: [
        { depot: 'payments-api', service: 'checkout-api', composant: 'Paiement' },
        { depot: 'web-shop', service: 'storefront' },
      ],
      approbateurs: ['tech-lead', 'release-manager'],
    });
    expect(vue.correspondance).toEqual([
      { depot: 'payments-api', service: 'checkout-api', composant: 'Paiement' },
      { depot: 'web-shop', service: 'storefront', composant: null },
    ]);
    expect(vue.approbateurs).toEqual(['tech-lead', 'release-manager']);
  });

  it('rend des listes vides quand rien n’est enregistré', () => {
    const vue = vmReglages({ locale: 'fr' });
    expect(vue.correspondance).toEqual([]);
    expect(vue.approbateurs).toEqual([]);
    expect(vue.jumelage.etat).toBe('unpaired');
    expect(vue.jumelage.codeEnCours).toBeNull();
  });
});

/* -------------------------------------------------------------------- encart */

describe('vmEncart', () => {
  const bloquee = evaluation({ verdict: 'blocked', reasons: [AVERTISSEMENT, GEL, CRITERE], durationMs: 90 });
  const autorisee = evaluation({ verdict: 'allowed', evaluatedAt: '2026-11-11T09:30:00.000Z', durationMs: 80 });

  it('rend le message exact du contrôle, dans la langue demandée', () => {
    const fr = vmEncart({ locale: 'fr', prs: [{ prId: 42, depot: 'payments-api', evaluation: bloquee }] });
    const en = vmEncart({ locale: 'en', prs: [{ prId: 42, depot: 'payments-api', evaluation: bloquee }] });
    expect(fr.prs[0]?.message).toBe(formatEvaluation(bloquee, { locale: 'fr' }));
    expect(en.prs[0]?.message).toBe(formatEvaluation(bloquee, { locale: 'en' }));
    expect(fr.prs[0]?.message.startsWith('Bloqué, 2 raisons.')).toBe(true);
  });

  it('liste les raisons affichables, la plus grave d’abord, avec la marche à suivre', () => {
    const vue = vmEncart({ locale: 'fr', prs: [{ prId: 42, depot: 'payments-api', evaluation: bloquee }] });
    expect(vue.prs[0]?.reasons.map((item) => item.text)).toEqual([CRITERE.text, GEL.text, AVERTISSEMENT.text]);
    expect(vue.prs[0]?.reasons[0]).toEqual({
      text: CRITERE.text,
      action: CRITERE.action,
      level: 'blocking',
    });
    expect(vue.prs[0]?.reasons[2]?.action).toBeNull();
  });

  it('écarte les raisons en observation et celles couvertes par une dérogation', () => {
    const mixte = evaluation({
      verdict: 'blocked',
      reasons: [
        CRITERE,
        { ...GEL, waived: true },
        { ...AVERTISSEMENT, observed: true },
      ],
    });
    const vue = vmEncart({ locale: 'fr', prs: [{ prId: 42, depot: 'payments-api', evaluation: mixte }] });
    expect(vue.prs[0]?.reasons).toHaveLength(1);
    expect(vue.prs[0]?.reasons[0]?.text).toBe(CRITERE.text);
  });

  it('met en avant la PR évaluée le plus récemment', () => {
    const vue = vmEncart({
      locale: 'fr',
      prs: [
        { prId: 42, depot: 'payments-api', evaluation: bloquee },
        { prId: 57, depot: 'web-shop', evaluation: autorisee },
      ],
    });
    expect(vue.prs).toHaveLength(2);
    expect(vue.derniere?.prId).toBe(57);
    expect(vue.derniere?.verdictLabel).toBe('Autorisé');
    expect(vue.prs[0]?.verdictLabel).toBe('Bloqué');
  });

  it('garde les seules dérogations accordées et encore en vigueur', () => {
    const vue = vmEncart({
      locale: 'fr',
      maintenant: MAINTENANT,
      waivers: [
        derogation(),
        derogation({ id: 'w-2', rule: 'R-03', expiresAt: '2026-11-11T09:00:00.000Z' }),
        derogation({ id: 'w-3', rule: 'R-06', status: 'requested' }),
        derogation({ id: 'w-4', rule: 'R-09', grantedBy: undefined, expiresAt: undefined }),
      ],
    });
    expect(vue.derogations.map((item) => item.rule)).toEqual(['R-04', 'R-09']);
    expect(vue.derogations[0]).toEqual({
      rule: 'R-04',
      grantedBy: 'tech-lead',
      reason: 'correctif de prix avant l’ouverture',
      expiresLabel: '11/11 à 12 h',
    });
    expect(vue.derogations[1]?.grantedBy).toBe('lea');
    expect(vue.derogations[1]?.expiresLabel).toBe('sans échéance');
  });

  it('rend des listes vides pour un ticket sans PR', () => {
    const vue = vmEncart({ locale: 'fr' });
    expect(vue.prs).toEqual([]);
    expect(vue.derniere).toBeNull();
    expect(vue.derogations).toEqual([]);
  });

  it('propose une dérogation pour les seules règles qui pèsent sur le verdict', () => {
    const vue = vmEncart({ locale: 'fr' });
    expect(vue.reglesDerogables).toHaveLength(12);
    expect(vue.reglesDerogables.map((regle) => regle.code)).not.toContain('R-11');
    expect(vue.reglesDerogables[0]).toEqual({
      code: 'R-01',
      titre: 'La PR est reliée à un ticket Jira existant',
      niveau: 'warning',
    });
    const anglais = vmEncart({ locale: 'en' });
    expect(anglais.reglesDerogables[0]?.titre).toBe('The pull request is linked to an existing Jira issue');

    const reglee = vmEncart({
      locale: 'fr',
      configs: [{ rule: 'R-02', level: 'information', mode: 'active', scope: {}, params: {} }],
    });
    expect(reglee.reglesDerogables).toHaveLength(11);
    expect(reglee.reglesDerogables.map((regle) => regle.code)).not.toContain('R-02');
  });
});

/* -------------------------------------------------------------------- console */

describe('vmConsole', () => {
  const bloquee = evaluation({ verdict: 'blocked', reasons: [CRITERE, GEL] });

  it('calcule l’aperçu avec le même texte que le contrôle réel', () => {
    const vue = vmConsole({
      locale: 'fr',
      ticket: 'PAY-123',
      brancheCible: 'main',
      depot: 'payments-api',
      evaluation: bloquee,
    });
    expect(vue.apercu?.message).toBe(formatEvaluation(bloquee, { locale: 'fr' }));
    expect(vue.apercu?.verdict).toBe('blocked');
    expect(vue.apercu?.verdictLabel).toBe('Bloqué');
    expect(vue.apercu?.success).toBe(false);

    const en = vmConsole({ locale: 'en', ticket: 'PAY-123', depot: 'payments-api', evaluation: bloquee });
    expect(en.apercu?.message).toBe(formatEvaluation(bloquee, { locale: 'en' }));
  });

  it('laisse passer une évaluation autorisée', () => {
    const vue = vmConsole({ locale: 'fr', ticket: 'PAY-123', depot: 'payments-api', evaluation: evaluation() });
    expect(vue.apercu?.success).toBe(true);
    expect(vue.apercu?.verdictLabel).toBe('Autorisé');
  });

  it('suit la politique de repli sur une évaluation non concluante', () => {
    const ouvert = evaluation({ verdict: 'inconclusive', fallback: 'open' });
    const ferme = evaluation({ verdict: 'inconclusive', fallback: 'closed' });
    const base = { locale: 'fr' as Locale, ticket: 'PAY-123', depot: 'payments-api' };
    expect(vmConsole({ ...base, evaluation: ouvert }).apercu?.success).toBe(true);
    expect(vmConsole({ ...base, evaluation: ferme }).apercu?.success).toBe(false);
    expect(vmConsole({ ...base, evaluation: ferme }).apercu?.verdictLabel).toBe('Non concluant');
  });

  it('remplit le formulaire et propose les valeurs disponibles', () => {
    const vue = vmConsole({
      locale: 'fr',
      ticket: ' PAY-123 ',
      brancheCible: 'main',
      depot: 'checkout-api',
      depotsDisponibles: ['payments-api', 'web-shop'],
      branchesDisponibles: ['main', 'develop'],
    });
    expect(vue.formulaire.ticket).toBe('PAY-123');
    expect(vue.formulaire.complet).toBe(true);
    expect(vue.formulaire.depotOptions.map((option) => option.value)).toEqual(['checkout-api', 'payments-api', 'web-shop']);
    expect(vue.formulaire.brancheOptions.map((option) => option.label)).toEqual(['main', 'develop']);
  });

  it('n’affiche pas d’aperçu et signale un formulaire incomplet sans évaluation', () => {
    const vue = vmConsole({ locale: 'fr', ticket: '', depot: '' });
    expect(vue.apercu).toBeNull();
    expect(vue.formulaire.complet).toBe(false);
    expect(vue.formulaire.depotOptions).toEqual([]);
  });
});

/* -------------------------------------------------------------------- journal */

describe('vmJournal', () => {
  const evaluations = [
    { depot: 'payments-api', prId: 42, evaluation: evaluation({ verdict: 'blocked', reasons: [CRITERE], durationMs: 100 }) },
    { depot: 'web-shop', prId: 57, evaluation: evaluation({ verdict: 'allowed', evaluatedAt: '2026-11-11T09:20:00.000Z', durationMs: 300 }) },
    { depot: 'payments-api', prId: 43, evaluation: evaluation({ verdict: 'blocked', evaluatedAt: '2026-11-11T09:40:00.000Z', durationMs: 200 }) },
    { depot: 'web-shop', prId: 58, evaluation: evaluation({ verdict: 'inconclusive', evaluatedAt: '2026-11-11T09:10:00.000Z', durationMs: 400 }) },
  ];

  it('liste les évaluations, la plus récente en tête', () => {
    const vue = vmJournal({ locale: 'fr', evaluations });
    expect(vue.evaluations.map((ligne) => ligne.prId)).toEqual([43, 57, 58, 42]);
    expect(vue.evaluations[0]?.evaluatedAt).toBe('2026-11-11T09:40:00.000Z');
    expect(vue.evaluations[0]?.depot).toBe('payments-api');
    expect(vue.evaluations[0]?.verdictLabel).toBe('Bloqué');
    expect(vue.evaluations[0]?.durationMs).toBe(200);
    const avecRaison = vue.evaluations.find((ligne) => ligne.prId === 42);
    expect(avecRaison?.reasons).toHaveLength(1);
    expect(avecRaison?.reasons[0]?.text).toBe(CRITERE.text);
    expect(vue.evaluations[0]?.reasons).toEqual([]);
  });

  it('compte les évaluations par verdict et calcule la durée moyenne', () => {
    const vue = vmJournal({ locale: 'fr', evaluations });
    expect(vue.statistiques).toEqual({
      total: 4,
      allowed: 1,
      blocked: 2,
      inconclusive: 1,
      averageDurationMs: 250,
    });
  });

  it('arrondit la durée moyenne à l’entier le plus proche', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations: [
        { depot: 'a', prId: 1, evaluation: evaluation({ durationMs: 100 }) },
        { depot: 'a', prId: 2, evaluation: evaluation({ durationMs: 101 }) },
        { depot: 'a', prId: 3, evaluation: evaluation({ durationMs: 101 }) },
      ],
    });
    expect(vue.statistiques.averageDurationMs).toBe(101);
  });

  it('rend le rapport d’observation, dépôts les plus bloquants en tête', () => {
    const vue = vmJournal({
      locale: 'fr',
      evaluations,
      observation: {
        observed: 212,
        wouldHaveBlocked: 31,
        byRepository: [
          { depot: 'web-shop', bloquees: 7 },
          { depot: 'payments-api', bloquees: 24 },
        ],
      },
    });
    expect(vue.rapport.observed).toBe(212);
    expect(vue.rapport.wouldHaveBlocked).toBe(31);
    expect(vue.rapport.byRepository).toEqual([
      { depot: 'payments-api', bloquees: 24 },
      { depot: 'web-shop', bloquees: 7 },
    ]);
  });

  it('rend un journal vide sans diviser par zéro', () => {
    const vue = vmJournal({ locale: 'fr' });
    expect(vue.evaluations).toEqual([]);
    expect(vue.statistiques).toEqual({ total: 0, allowed: 0, blocked: 0, inconclusive: 0, averageDurationMs: 0 });
    expect(vue.rapport).toEqual({ observed: 0, wouldHaveBlocked: 0, byRepository: [] });
  });

  it('traduit les verdicts dans les deux langues', () => {
    expect(libelleVerdict('fr', 'inconclusive')).toBe('Non concluant');
    expect(libelleVerdict('en', 'inconclusive')).toBe('Inconclusive');
    expect(libelleVerdict('en', 'blocked')).toBe('Blocked');
  });
});
