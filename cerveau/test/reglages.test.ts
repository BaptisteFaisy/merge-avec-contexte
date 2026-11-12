/**
 * Écran 4 — réglages du projet : ce que le resolver écrit, lit et refuse.
 *
 * Couvre les règlements désormais éditables (portée et paramètres, items 3/6),
 * l'annuaire des approbateurs rangé par projet (item 23), le calendrier des
 * gels (item 10, MC-14) et la langue de l'écran (item 97).
 */
import { describe, expect, it } from 'vitest';

import { assemblerCerveau, resolversUi, type Cerveau } from '../src/app/compose';
import { horlogeFixe } from '../src/app/horloge';
import { loggerSilencieux } from '../src/app/logger';
import {
  approbateursProjet,
  avecApprobateur,
  createMemoryReglagesStore,
  type ReglagesApp,
} from '../src/app/reglages';
import { createMemoryStore } from '../src/storage/memory-store';
import type { Freeze, RuleCode, RuleConfig } from '../src/shared/types';
import { localeDemandee, localeEffective } from '../src/ui/view-model-commun';
import { vmReglages } from '../src/ui/view-model-reglages';

const NOW = '2026-11-27T16:00:00.000Z';

/** Cerveau en mémoire, horloge figée, annuaire initial fourni. */
function cerveau(approbateurs: string[] = [], locale: 'fr' | 'en' = 'fr'): Cerveau {
  return assemblerCerveau({
    store: createMemoryStore(),
    reglages: createMemoryReglagesStore({ approbateurs }),
    clock: horlogeFixe(NOW),
    logger: loggerSilencieux(),
    config: { projectId: 'DEMO', locale },
  });
}

/* ------------------------------------------------- règles : portée et paramètres */

describe('resolverReglages — niveau, mode, portée et paramètres', () => {
  it('enregistre la portée et les paramètres reçus de l’écran', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({
      method: 'enregistrerRegles',
      regles: {
        'R-03': {
          niveau: 'warning',
          mode: 'observe',
          portee: { repositories: ['payments-api'], branches: ['main', 'release/*'] },
          params: { source: 'customfield', fieldId: 'customfield_10001' },
        },
      },
    }, 'PAY');

    const config = await c.store.ruleConfig.find('PAY', 'R-03');
    expect(config?.level).toBe('warning');
    expect(config?.mode).toBe('observe');
    expect(config?.scope.repositories).toEqual(['payments-api']);
    expect(config?.scope.branches).toEqual(['main', 'release/*']);
    expect(config?.params.source).toBe('customfield');
    expect(config?.params.fieldId).toBe('customfield_10001');

    const vue = await ui.reglages({ method: 'charger' }, 'PAY');
    const ligne = vue.vue.regles.find((regle) => regle.code === 'R-03');
    expect(ligne?.niveau).toBe('warning');
    expect(ligne?.portee.depots).toEqual(['payments-api']);
    expect(ligne?.params[0]?.valeurBrute).toBe('customfield');
  });

  it('complète le réglage enregistré au lieu de l’écraser', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({
      method: 'enregistrerRegles',
      regles: { 'R-03': { params: { source: 'customfield', fieldId: 'x' } } },
    }, 'PAY');
    await ui.reglages({ method: 'enregistrerRegles', regles: { 'R-03': { niveau: 'warning' } } }, 'PAY');

    const config = await c.store.ruleConfig.find('PAY', 'R-03');
    expect(config?.level).toBe('warning');
    expect(config?.params.source).toBe('customfield');
    expect(config?.params.fieldId).toBe('x');
  });

  it('efface un paramètre quand l’écran l’envoie vide', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({
      method: 'enregistrerRegles',
      regles: { 'R-03': { params: { source: 'customfield', fieldId: 'x' } } },
    }, 'PAY');
    await ui.reglages({ method: 'enregistrerRegles', regles: { 'R-03': { params: { fieldId: null } } } }, 'PAY');

    const config = await c.store.ruleConfig.find('PAY', 'R-03');
    expect(config?.params.source).toBe('customfield');
    expect(config?.params.fieldId).toBeUndefined();
  });

  it('accepte la forme « liste de règles » de l’ancien écran', async () => {
    const c = cerveau();
    await resolversUi(c).reglages({
      method: 'enregistrerRegles',
      regles: [{ code: 'R-02', niveau: 'information' }],
    }, 'PAY');

    expect((await c.store.ruleConfig.find('PAY', 'R-02'))?.level).toBe('information');
  });

  it('ignore un code de règle inconnu', async () => {
    const c = cerveau();
    await resolversUi(c).reglages({
      method: 'enregistrerRegles',
      regles: { 'R-99': { niveau: 'blocking' } },
    }, 'PAY');

    expect(await c.store.ruleConfig.find('PAY', 'R-99' as RuleCode)).toBeUndefined();
  });
});

/* ------------------------------------------------------------ approbateurs par projet */

describe('resolverReglages — approbateurs par projet (item 23)', () => {
  it('range l’approbateur dans le projet de la page', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({ method: 'ajouterApprobateur', approbateur: 'lea' }, 'PAYA');

    const dansA = await ui.reglages({ method: 'charger' }, 'PAYA');
    expect(dansA.vue.approbateurs).toEqual(['lea']);
  });

  it('n’offre pas l’approbateur d’un projet aux autres projets', async () => {
    const c = cerveau(['tech-lead']);
    const ui = resolversUi(c);
    await ui.reglages({ method: 'ajouterApprobateur', approbateur: 'lea' }, 'PAYA');

    const dansA = await ui.reglages({ method: 'charger' }, 'PAYA');
    const dansB = await ui.reglages({ method: 'charger' }, 'PAYB');
    expect(dansA.vue.approbateurs).toEqual(['tech-lead', 'lea']);
    expect(dansB.vue.approbateurs).toEqual(['tech-lead']);
  });

  it('conserve l’annuaire global pour les écrans qui ignorent le projet', async () => {
    const c = cerveau();
    await resolversUi(c).reglages({ method: 'ajouterApprobateur', approbateur: 'lea' }, 'PAYA');

    const lus = await c.uiDeps.reglages.lire();
    expect(lus.approbateurs).toEqual(['lea']);
    expect(lus.parProjet?.PAYA).toEqual(['lea']);
  });

  it('ne range pas deux fois le même nom', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({ method: 'ajouterApprobateur', approbateur: 'lea' }, 'PAYA');
    await ui.reglages({ method: 'ajouterApprobateur', approbateur: 'lea' }, 'PAYA');

    const dansA = await ui.reglages({ method: 'charger' }, 'PAYA');
    expect(dansA.vue.approbateurs).toEqual(['lea']);
  });

  it('conserve l’annuaire global d’une installation existante', async () => {
    const c = cerveau(['tech-lead']);
    const vue = await resolversUi(c).reglages({ method: 'charger' }, 'PAYA');
    expect(vue.vue.approbateurs).toEqual(['tech-lead']);
  });
});

describe('réglages applicatifs — annuaire par projet', () => {
  it('range par projet et fige l’héritage des autres projets', () => {
    const base: ReglagesApp = { approbateurs: ['tech-lead'] };
    const apres = avecApprobateur(base, 'PAYA', 'lea');

    expect(approbateursProjet(apres, 'PAYA')).toEqual(['tech-lead', 'lea']);
    expect(approbateursProjet(apres, 'PAYB')).toEqual(['tech-lead']);
    expect(apres.approbateurs).toEqual(['tech-lead', 'lea']);
    expect(base.approbateurs).toEqual(['tech-lead']);
    expect(base.parProjet).toBeUndefined();
  });

  it('ne rajoute pas un nom déjà présent', () => {
    const base: ReglagesApp = { approbateurs: ['tech-lead'], parProjet: { PAYA: ['tech-lead'] } };
    expect(avecApprobateur(base, 'PAYA', 'tech-lead')).toBe(base);
  });
});

/* ------------------------------------------------------------------- calendrier des gels */

describe('resolverReglages — calendrier des gels (item 10)', () => {
  it('crée un gel et le rend dans le calendrier', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({
      method: 'ajouterGel',
      nom: 'Fenêtre de nuit',
      debut: '2026-11-27T18:00',
      fin: '2026-11-27T20:00',
      branches: 'main, release/*',
      services: 'checkout-api',
      recurrence: 'none',
      fuseau: 'Europe/Paris',
    });

    const gels = await c.store.freezes.list();
    expect(gels).toHaveLength(1);
    expect(gels[0]?.name).toBe('Fenêtre de nuit');
    expect(gels[0]?.branches).toEqual(['main', 'release/*']);
    expect(gels[0]?.services).toEqual(['checkout-api']);
    expect(gels[0]?.timezone).toBe('Europe/Paris');

    const vue = await ui.reglages({ method: 'charger' });
    expect(vue.vue.gels).toHaveLength(1);
    expect(vue.vue.gels[0]?.nom).toBe('Fenêtre de nuit');
    expect(vue.vue.gels[0]?.etat).toBe('upcoming');
    expect(vue.vue.gels[0]?.branchesLabel).toBe('Branches : main, release/*');
  });

  it('convertit l’heure locale du fuseau choisi en instant', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({
      method: 'ajouterGel',
      nom: 'Hiver',
      debut: '2026-11-27T18:00',
      fin: '2026-11-27T19:00',
      fuseau: 'Europe/Paris',
    });
    await ui.reglages({
      method: 'ajouterGel',
      nom: 'Été',
      debut: '2026-07-24T18:00',
      fin: '2026-07-24T19:00',
      fuseau: 'Europe/Paris',
    });

    const gels = await c.store.freezes.list();
    const hiver = gels.find((gel) => gel.name === 'Hiver');
    const ete = gels.find((gel) => gel.name === 'Été');
    // Paris : UTC+1 en novembre, UTC+2 en juillet.
    expect(hiver?.startsAt).toBe('2026-11-27T17:00:00.000Z');
    expect(ete?.startsAt).toBe('2026-07-24T16:00:00.000Z');
  });

  it('retombe sur UTC quand le fuseau demandé est inconnu', async () => {
    const c = cerveau();
    await resolversUi(c).reglages({
      method: 'ajouterGel',
      nom: 'Fuseau inconnu',
      debut: '2026-11-27T18:00',
      fin: '2026-11-27T19:00',
      fuseau: 'Mars/Phobos',
    });

    const gel = (await c.store.freezes.list())[0];
    expect(gel?.timezone).toBe('UTC');
    expect(gel?.startsAt).toBe('2026-11-27T18:00:00.000Z');
  });

  it('enregistre la récurrence hebdomadaire et ses jours', async () => {
    const c = cerveau();
    await resolversUi(c).reglages({
      method: 'ajouterGel',
      nom: 'Astreinte',
      debut: '2026-11-30T22:00',
      fin: '2026-12-31T06:00',
      recurrence: 'weekly',
      jours: '1, 3',
      fuseau: 'Europe/Paris',
    });

    const gel = (await c.store.freezes.list())[0];
    expect(gel?.recurrence).toEqual({ kind: 'weekly', daysOfWeek: [1, 3] });
  });

  it('refuse un gel dont la fin précède le début, ou sans nom', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({
      method: 'ajouterGel',
      nom: 'Fenêtre inversée',
      debut: '2026-11-27T20:00',
      fin: '2026-11-27T18:00',
    });
    await ui.reglages({
      method: 'ajouterGel',
      nom: '  ',
      debut: '2026-11-27T18:00',
      fin: '2026-11-27T19:00',
    });

    expect(await c.store.freezes.list()).toHaveLength(0);
    const vue = await ui.reglages({ method: 'charger' });
    expect(vue.vue.gels).toEqual([]);
  });

  it('supprime un gel du calendrier', async () => {
    const c = cerveau();
    const ui = resolversUi(c);
    await ui.reglages({
      method: 'ajouterGel',
      nom: 'Gel éphémère',
      debut: '2026-11-27T18:00',
      fin: '2026-11-27T19:00',
    });
    const cree = (await ui.reglages({ method: 'charger' })).vue.gels[0];
    expect(cree?.id).toBeTruthy();

    await ui.reglages({ method: 'supprimerGel', id: cree?.id });
    const vue = await ui.reglages({ method: 'charger' });
    expect(vue.vue.gels).toEqual([]);
    expect(await c.store.freezes.list()).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- langue */

describe('resolverReglages — langue de l’écran (item 97)', () => {
  it('suit la langue demandée par l’utilisateur ou le site', async () => {
    const c = cerveau();
    const reponse = await resolversUi(c).reglages({ method: 'charger', locale: 'en-GB' });

    expect(reponse.locale).toBe('en');
    expect(reponse.vue.jumelage.etatLabel).toBe('Not paired');
    expect(reponse.vue.libelles.gels.titre).toBe('Freezes');
  });

  it('retombe sur la langue de la configuration', async () => {
    const c = cerveau([], 'en');
    const reponse = await resolversUi(c).reglages({ method: 'charger', locale: 'de-DE' });

    expect(reponse.locale).toBe('en');
    expect(reponse.vue.libelles.gels.titre).toBe('Freezes');
  });

  it('utilise la langue de la configuration quand rien n’est demandé', async () => {
    const c = cerveau();
    const reponse = await resolversUi(c).reglages({ method: 'charger' });

    expect(reponse.locale).toBe('fr');
    expect(reponse.vue.libelles.gels.titre).toBe('Gels');
  });
});

/* ------------------------------------------------------------------ modèle de vue */

const REGLAGE_R03: RuleConfig = {
  rule: 'R-03',
  level: 'blocking',
  mode: 'observe',
  scope: { repositories: ['payments-api'], branches: ['main', 'release/*'] },
  params: { source: 'description-checkboxes' },
};

const GELS: Freeze[] = [
  {
    id: 'gel-1',
    name: 'Black Friday',
    startsAt: '2026-11-27T09:00:00Z',
    endsAt: '2026-11-27T18:00:00Z',
    branches: ['main'],
    services: [],
    recurrence: { kind: 'none' },
    timezone: 'UTC',
  },
  {
    id: 'gel-2',
    name: 'Noël',
    startsAt: '2026-12-24T17:00:00Z',
    endsAt: '2026-12-27T07:00:00Z',
    branches: [],
    services: ['checkout-api'],
    recurrence: { kind: 'daily' },
    timezone: 'Europe/Paris',
  },
  {
    id: 'gel-3',
    name: 'Astreinte',
    startsAt: '2026-11-01T22:00:00Z',
    endsAt: '2026-12-31T06:00:00Z',
    branches: [],
    services: [],
    recurrence: { kind: 'weekly', daysOfWeek: [1, 2] },
    timezone: 'UTC',
  },
];

describe('vmReglages — paramètres, gels et libellés', () => {
  it('expose les valeurs brutes et les libellés des paramètres pour l’édition', () => {
    const ligne = vmReglages({ locale: 'fr', configs: [REGLAGE_R03] }).regles[2];
    expect(ligne?.params[0]?.libelle).toBe('Source des critères');
    expect(ligne?.params[0]?.valeurBrute).toBe('description-checkboxes');
    expect(ligne?.params[1]?.valeurBrute).toBeNull();

    const calme: RuleConfig = {
      rule: 'R-08',
      level: 'warning',
      mode: 'active',
      scope: {},
      params: { days: ['mon'], startHour: 8 },
    };
    const ligneR08 = vmReglages({ locale: 'en', configs: [calme] }).regles[7];
    expect(ligneR08?.params[0]?.libelle).toBe('Branches');
    expect(ligneR08?.params[1]?.valeurBrute).toEqual(['mon']);
    expect(ligneR08?.params[2]?.valeurBrute).toBe(8);
    expect(ligneR08?.params[3]?.valeurBrute).toBeNull();
  });

  it('rend le calendrier des gels : fenêtre, portée, récurrence et état', () => {
    const vue = vmReglages({ locale: 'fr', gels: GELS, maintenant: '2026-11-27T10:00:00Z' });
    expect(vue.gels.map((ligne) => ligne.id)).toEqual(['gel-3', 'gel-1', 'gel-2']);

    const astreinte = vue.gels[0];
    expect(astreinte?.recurrenceLabel).toBe('Hebdomadaire (lun., mar.)');
    expect(astreinte?.etat).toBe('upcoming');
    expect(astreinte?.etatLabel).toBe('À venir');

    const blackFriday = vue.gels[1];
    expect(blackFriday?.etat).toBe('active');
    expect(blackFriday?.etatLabel).toBe('En cours');
    expect(blackFriday?.fenetre).toBe('27/11 à 9 h → 27/11 à 18 h');
    expect(blackFriday?.branchesLabel).toBe('Branches : main');
    expect(blackFriday?.servicesLabel).toBe('Tous les services');

    const noel = vue.gels[2];
    expect(noel?.etat).toBe('upcoming');
    expect(noel?.recurrenceLabel).toBe('Quotidienne');
    // Fenêtre lue dans le fuseau du gel : 17 h UTC = 18 h à Paris en décembre.
    expect(noel?.fenetre).toBe('24/12 à 18 h → 27/12 à 8 h');
    expect(noel?.servicesLabel).toBe('Services : checkout-api');
    expect(noel?.branchesLabel).toBe('Toutes les branches');
  });

  it('dit qu’un gel ponctuel dépassé est terminé', () => {
    const vue = vmReglages({ locale: 'fr', gels: [GELS[0]], maintenant: '2026-11-27T20:00:00Z' });
    expect(vue.gels[0]?.etat).toBe('past');
    expect(vue.gels[0]?.etatLabel).toBe('Terminé');
  });

  it('traduit le calendrier des gels en anglais', () => {
    const vue = vmReglages({ locale: 'en', gels: GELS, maintenant: '2026-11-27T10:00:00Z' });
    expect(vue.gels[0]?.recurrenceLabel).toBe('Weekly (Mon, Tue)');
    expect(vue.gels[1]?.etatLabel).toBe('Active');
    expect(vue.gels[1]?.servicesLabel).toBe('All services');
    expect(vue.gels[1]?.supprimerConsequence).toContain('Black Friday');
  });

  it('rappelle la conséquence avant la suppression d’un gel', () => {
    const vue = vmReglages({ locale: 'fr', gels: GELS, maintenant: '2026-11-27T10:00:00Z' });
    expect(vue.gels[1]?.supprimerConsequence).toBe(
      'Le gel « Black Friday » sera retiré du calendrier : les fusions ne seront plus bloquées par cette fenêtre.',
    );
  });

  it('fournit les libellés bilingues de l’écran, gels compris', () => {
    const fr = vmReglages({ locale: 'fr' });
    expect(fr.libelles.regles.depots).toBe('Dépôts (motifs glob)');
    expect(fr.libelles.gels.titre).toBe('Gels');
    expect(fr.libelles.gels.creer).toBe('Créer le gel');
    expect(fr.libelles.gels.recurrenceOptions.map((option) => option.value)).toEqual(['none', 'daily', 'weekly']);

    const en = vmReglages({ locale: 'en' });
    expect(en.libelles.regles.depots).toBe('Repositories (glob patterns)');
    expect(en.libelles.gels.titre).toBe('Freezes');
    expect(en.libelles.gels.creer).toBe('Create the freeze');
    expect(en.libelles.approbateursAide).toContain('this project');
  });

  it('rappelle le projet dont c’est la page de réglages', () => {
    expect(vmReglages({ locale: 'fr', projet: 'PAY' }).projetLabel).toBe('Projet : PAY');
    expect(vmReglages({ locale: 'en', projet: 'PAY' }).projetLabel).toBe('Project: PAY');
    expect(vmReglages({ locale: 'fr' }).projetLabel).toBeNull();
  });

  it('normalise la langue demandée et retombe sur la configuration', () => {
    expect(localeDemandee('fr-FR')).toBe('fr');
    expect(localeDemandee('EN-gb')).toBe('en');
    expect(localeDemandee('de-DE')).toBeUndefined();
    expect(localeDemandee(undefined)).toBeUndefined();
    expect(localeEffective('en-GB', 'fr')).toBe('en');
    expect(localeEffective('it-IT', 'fr')).toBe('fr');
    expect(localeEffective(42, 'en')).toBe('en');
  });
});
