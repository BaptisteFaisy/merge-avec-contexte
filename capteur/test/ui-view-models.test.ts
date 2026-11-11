/**
 * Modèles de vue des trois écrans du Capteur : verdicts, message identique au
 * merge check, bouton de dérogation, jumelage, règles évaluées, réglages.
 */
import { describe, expect, it } from 'vitest';
import { formatEvaluation } from '../src/shared/message/format';
import type {
  Evaluation,
  FallbackPolicy,
  IssueContext,
  Reason,
  RuleConfig,
} from '../src/shared/types';
import {
  derogationVm,
  jumelageVm,
  marcheASuivreVm,
  politiqueOptions,
  raisonsVm,
  ticketVm,
  verdictVm,
  vmCarte,
  vmPanneau,
  vmReglagesEspace,
} from '../src/ui/view-models';

const MAINTENANT = '2026-11-11T08:30:00.000Z';

function evaluation(partiel: Partial<Evaluation> = {}): Evaluation {
  return {
    verdict: 'blocked',
    reasons: [],
    issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed',
    evaluatedAt: MAINTENANT,
    durationMs: 1200,
    ...partiel,
  };
}

const RAISON_CRITERES: Reason = {
  rule: 'R-03',
  level: 'blocking',
  text: 'PAY-123 : 2 critères d’acceptation non cochés.',
  action: 'Cochez dans le ticket les critères vraiment validés.',
  issueKey: 'PAY-123',
  link: { label: 'PAY-123', url: 'https://exemple.atlassian.net/browse/PAY-123' },
};

const RAISON_GEL: Reason = {
  rule: 'R-04',
  level: 'blocking',
  text: 'Gel « Black Friday » sur main jusqu’au 30/11 à 9 h.',
  action: 'Attendez la fin du gel ou demandez une dérogation.',
};

const RAISON_OBSERVEE: Reason = {
  rule: 'R-11',
  level: 'information',
  text: 'La PR référence d’autres tickets : PAY-9.',
  observed: true,
};

const ISSUE: IssueContext = {
  key: 'PAY-123',
  id: '10042',
  exists: true,
  status: 'En cours',
  criteria: [],
  links: [],
  fixVersions: [],
  labels: [],
  components: [],
  incidentKeys: [],
  url: 'https://exemple.atlassian.net/browse/PAY-123',
};

const JUMELAGE = { jumele: true, site: 'exemple.atlassian.net', depuis: '2026-11-01T10:00:00.000Z' };

const CONFIG_R03: RuleConfig = {
  rule: 'R-03',
  level: 'blocking',
  mode: 'active',
  scope: {},
  params: {},
};

const CONFIG_R11: RuleConfig = {
  rule: 'R-11',
  level: 'information',
  mode: 'observe',
  scope: {},
  params: {},
};

describe('verdicts', () => {
  it('traduit bloqué, autorisé et non concluant', () => {
    expect(verdictVm(evaluation({ verdict: 'blocked' }))).toBe('bloque');
    expect(verdictVm(evaluation({ verdict: 'allowed' }))).toBe('autorise');
    expect(verdictVm(evaluation({ verdict: 'inconclusive', fallback: 'open' }))).toBe('nonConcluant');
  });

  it('donne un libellé court dans les deux langues', () => {
    const vm = vmCarte({ evaluation: evaluation(), jumelage: JUMELAGE });
    expect(vm.verdictTexte).toBe('Bloqué');
    const en = vmCarte({ evaluation: evaluation(), jumelage: JUMELAGE, locale: 'en' });
    expect(en.verdictTexte).toBe('Blocked');
  });
});

describe('message de la carte', () => {
  it('est exactement celui rendu par formatEvaluation', () => {
    const ev = evaluation({ reasons: [RAISON_GEL, RAISON_CRITERES] });
    const vm = vmCarte({ evaluation: ev, jumelage: JUMELAGE, issues: [ISSUE] });
    expect(vm.message).toBe(formatEvaluation(ev, { locale: 'fr' }));
    expect(vm.message).toContain('Bloqué, 2 raisons.');
  });

  it('suit la langue demandée', () => {
    const ev = evaluation({ verdict: 'allowed', reasons: [] });
    const vm = vmCarte({ evaluation: ev, jumelage: JUMELAGE, locale: 'en' });
    expect(vm.message).toBe(formatEvaluation(ev, { locale: 'en' }));
    expect(vm.message).toContain('Allowed.');
  });

  it('reprend la politique de repli quand le Cerveau ne répond pas', () => {
    const ev = evaluation({ verdict: 'inconclusive', fallback: 'closed', reasons: [] });
    const vm = vmCarte({ evaluation: ev, jumelage: JUMELAGE });
    expect(vm.message).toBe(formatEvaluation(ev, { locale: 'fr' }));
    expect(vm.message).toContain('Contexte indisponible');
  });
});

describe('raisons', () => {
  it('garde texte, action, niveau, règle et lien', () => {
    const vm = vmCarte({ evaluation: evaluation({ reasons: [RAISON_CRITERES] }), jumelage: JUMELAGE });
    expect(vm.raisons).toHaveLength(1);
    expect(vm.raisons[0]).toEqual({
      text: RAISON_CRITERES.text,
      action: RAISON_CRITERES.action,
      level: 'blocking',
      rule: 'R-03',
      lien: { label: 'PAY-123', url: 'https://exemple.atlassian.net/browse/PAY-123' },
    });
  });

  it('classe la plus grave d’abord et écarte les raisons observées', () => {
    const ev = evaluation({
      reasons: [RAISON_OBSERVEE, { rule: 'R-07', level: 'warning', text: 'Version publiée.' }, RAISON_GEL],
    });
    const codes = raisonsVm(ev).map((raison) => raison.rule);
    expect(codes).toEqual(['R-04', 'R-07']);
  });

  it('est vide quand tout passe', () => {
    const vm = vmCarte({ evaluation: evaluation({ verdict: 'allowed', reasons: [] }), jumelage: JUMELAGE });
    expect(vm.raisons).toEqual([]);
  });
});

describe('ticket reconnu', () => {
  it('expose les clés et le lien du ticket', () => {
    const vm = vmCarte({ evaluation: evaluation(), jumelage: JUMELAGE, issues: [ISSUE] });
    expect(vm.ticket.reconnu).toBe(true);
    expect(vm.ticket.cles).toEqual(['PAY-123']);
    expect(vm.ticket.liens).toEqual([{ label: 'PAY-123', url: ISSUE.url }]);
  });

  it('reste sans lien quand aucun ticket n’est reconnu', () => {
    const vm = vmCarte({ evaluation: evaluation({ issueKeys: [] }), jumelage: JUMELAGE });
    expect(vm.ticket).toEqual({ reconnu: false, cles: [], liens: [] });
    expect(ticketVm(evaluation({ issueKeys: ['PAY-404'] }), []).liens).toEqual([]);
  });
});

describe('bouton de dérogation', () => {
  it('est offert quand le contrôle bloque et que le pont tient', () => {
    const vm = vmCarte({ evaluation: evaluation(), jumelage: JUMELAGE });
    expect(vm.derogation.disponible).toBe(true);
    expect(vm.derogation.libelle).toBe('Demander une dérogation');
    expect(vm.derogation.motif).toBeUndefined();
  });

  it('est masqué quand le contrôle est autorisé', () => {
    const vm = vmCarte({ evaluation: evaluation({ verdict: 'allowed', reasons: [] }), jumelage: JUMELAGE });
    expect(vm.derogation.disponible).toBe(false);
    expect(vm.derogation.motif).toContain('autorisé');
  });

  it('est masqué quand le Cerveau est injoignable', () => {
    const ev = evaluation({ verdict: 'inconclusive', fallback: 'open', reasons: [] });
    expect(derogationVm('nonConcluant', true).disponible).toBe(false);
    expect(vmCarte({ evaluation: ev, jumelage: JUMELAGE }).derogation.disponible).toBe(false);
  });
});

describe('jumelage', () => {
  it('nomme le site et la date quand la liaison existe', () => {
    const vm = jumelageVm(JUMELAGE);
    expect(vm.jumele).toBe(true);
    expect(vm.texte).toBe('Jumelé avec le site exemple.atlassian.net');
    expect(vm.depuis).toBe(JUMELAGE.depuis);
  });

  it('dit clairement que rien n’est jumelé', () => {
    const vm = vmCarte({ evaluation: evaluation(), jumelage: { jumele: false } });
    expect(vm.jumelage.jumele).toBe(false);
    expect(vm.jumelage.texte).toContain('Non jumelé');
    expect(vm.jumelage.site).toBeUndefined();
    expect(vm.derogation.disponible).toBe(false);
    expect(vm.derogation.motif).toContain('réglages de l’espace de travail');
  });
});

describe('Cerveau injoignable', () => {
  it('donne la marche à suivre avec la politique ouverte', () => {
    const ev = evaluation({ verdict: 'inconclusive', fallback: 'open', reasons: [] });
    const marche = marcheASuivreVm(ev);
    expect(marche?.titre).toBe('Cerveau injoignable');
    expect(marche?.texte).toContain('la fusion reste possible');
    expect(vmCarte({ evaluation: ev, jumelage: JUMELAGE }).marcheASuivre).toBeDefined();
  });

  it('annonce le blocage quand la politique est fermée', () => {
    const ev = evaluation({ verdict: 'inconclusive', fallback: 'closed', reasons: [] });
    expect(marcheASuivreVm(ev)?.texte).toContain('la fusion est bloquée');
  });

  it('n’en donne pas quand le contrôle a conclu', () => {
    expect(marcheASuivreVm(evaluation())).toBeUndefined();
  });
});

describe('panneau de l’onglet Overview', () => {
  it('ajoute les règles évaluées et l’horodatage', () => {
    const ev = evaluation({ reasons: [RAISON_CRITERES] });
    const vm = vmPanneau({ evaluation: ev, jumelage: JUMELAGE, regles: [CONFIG_R03, CONFIG_R11] });
    expect(vm.regles).toHaveLength(2);
    expect(vm.regles[0]).toEqual({
      code: 'R-03',
      titre: 'Les critères d’acceptation sont validés',
      niveau: 'blocking',
      mode: 'active',
      resultat: 'fail',
    });
    expect(vm.regles[1].mode).toBe('observe');
    expect(vm.regles[1].resultat).toBe('pass');
    expect(vm.evalueLeIso).toBe(MAINTENANT);
    expect(vm.evalueLe).toBe('11/11 à 8 h 30');
    expect(vm.dureeMs).toBe(1200);
  });

  it('préfère le statut fourni par le moteur', () => {
    const vm = vmPanneau({
      evaluation: evaluation(),
      jumelage: JUMELAGE,
      regles: [CONFIG_R03],
      resultats: { 'R-03': 'not-evaluated' },
    });
    expect(vm.regles[0].resultat).toBe('not-evaluated');
  });

  it('rend la même carte que vmCarte et accepte des listes vides', () => {
    const ev = evaluation({ verdict: 'allowed', reasons: [] });
    const panneau = vmPanneau({ evaluation: ev, jumelage: JUMELAGE });
    const carte = vmCarte({ evaluation: ev, jumelage: JUMELAGE });
    expect(panneau.message).toBe(carte.message);
    expect(panneau.regles).toEqual([]);
    expect(panneau.raisons).toEqual([]);
  });

  it('liste l’historique, la plus récente d’abord', () => {
    const ancienne = evaluation({ verdict: 'allowed', evaluatedAt: '2026-11-10T09:00:00.000Z', durationMs: 800 });
    const vm = vmPanneau({ evaluation: evaluation(), jumelage: JUMELAGE, historique: [ancienne] });
    expect(vm.historique).toHaveLength(2);
    expect(vm.historique[0].evalueLeIso).toBe(MAINTENANT);
    expect(vm.historique[0].verdictTexte).toBe('Bloqué');
    expect(vm.historique[1]).toMatchObject({ verdict: 'autorise', verdictTexte: 'Autorisé', dureeMs: 800 });
  });
});

describe('réglages de l’espace de travail', () => {
  it('propose le code de jumelage et l’état de la liaison', () => {
    const vm = vmReglagesEspace({ jumelage: JUMELAGE, politique: 'open', envoyerChemins: true });
    expect(vm.codeJumelage.libelle).toBe('Code de jumelage');
    expect(vm.codeJumelage.obligatoire).toBe(false);
    expect(vm.liaison.jumele).toBe(true);
    expect(vm.liaison.site).toBe('exemple.atlassian.net');
  });

  it('rend le code obligatoire quand rien n’est jumelé', () => {
    const vm = vmReglagesEspace({ jumelage: { jumele: false }, politique: 'open', envoyerChemins: true });
    expect(vm.codeJumelage.obligatoire).toBe(true);
    expect(vm.liaison.texte).toContain('Non jumelé');
  });

  it('décrit la politique fermée et son texte d’aide', () => {
    const vm = vmReglagesEspace({ jumelage: JUMELAGE, politique: 'closed', envoyerChemins: false });
    expect(vm.politique.valeur).toBe('closed');
    expect(vm.politique.libelle).toBe('Politique de repli');
    expect(vm.politique.options.find((option) => option.value === 'closed')?.label).toBe('Fermé');
    expect(vm.politique.aide).toContain('Le contrôle échoue');
    expect(vm.politique.options.map((option) => option.value)).toEqual<FallbackPolicy[]>(['open', 'closed']);
  });

  it('expose la case d’envoi des chemins de fichiers', () => {
    const actif = vmReglagesEspace({ jumelage: JUMELAGE, politique: 'open', envoyerChemins: true });
    const inactif = vmReglagesEspace({ jumelage: JUMELAGE, politique: 'open', envoyerChemins: false });
    expect(actif.envoyerChemins.actif).toBe(true);
    expect(inactif.envoyerChemins.actif).toBe(false);
    expect(actif.envoyerChemins.aide).toContain('chemins modifiés');
  });

  it('traduit les options de politique en anglais', () => {
    const options = politiqueOptions('en');
    expect(options[0].label).toBe('Open');
    expect(options[1].aide).toContain('reserve it for critical branches');
  });
});
