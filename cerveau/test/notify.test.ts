/**
 * Notification des blocages (audit item 18) : empreinte, corps du commentaire,
 * garde-fous (observation, duplication, relance), adaptateur Jira et ADF.
 *
 * Aucun réseau : le notifieur Jira est exercé via une doublure `requete`, le
 * reste via le notifieur mémoire.
 */
import { describe, expect, it } from 'vitest';
import { loggerSilencieux, type LoggerCommun } from '../src/app/logger';
import { adfDepuisTexte, extraireEmpreintes, ligneMarque, texteAdf } from '../src/notify/adf';
import { empreinteBlocage } from '../src/notify/empreinte';
import { corpsCommentaire } from '../src/notify/message';
import { notifieurJira, type ReponseJira, type RequeteJira } from '../src/notify/notifieur-jira';
import { notifieurMemoire } from '../src/notify/notifieur-memoire';
import { blocageReel, creerServiceNotification } from '../src/notify/notifier';
import type { Evaluation, Reason } from '../src/shared';

const raison = (partiel: Partial<Reason> & { rule: Reason['rule'] }): Reason => ({
  level: 'blocking',
  text: `${partiel.rule} échoue`,
  ...partiel,
});

/** PR #42 du jeu de démonstration : R-03 + R-05 bloquent, R-09 est observée. */
const BLOQUEE: Evaluation = {
  verdict: 'blocked',
  reasons: [
    {
      ...raison({ rule: 'R-03', issueKey: 'PAY-123', text: 'PAY-123 : 2 critère(s) d’acceptation non coché(s).' }),
      action: 'Cochez dans le ticket les critères vraiment validés.',
    },
    {
      ...raison({ rule: 'R-05', text: 'Incident INC-52 ouvert sur checkout-api.' }),
      action: 'Ne fusionnez pas sur ce service pendant l’incident.',
    },
    raison({ rule: 'R-09', issueKey: 'PAY-123', observed: true }),
    raison({ rule: 'R-07', level: 'warning' }),
  ],
  issueKeys: ['PAY-123'],
  trigger: 'on-code-pushed',
  evaluatedAt: '2026-11-27T16:30:00Z',
  durationMs: 120,
};

const service = (notifieur = notifieurMemoire(), logger: LoggerCommun = loggerSilencieux()) =>
  creerServiceNotification({ notifieur, logger });

describe('empreinteBlocage', () => {
  it('est stable pour le même ticket et le même ensemble de raisons', () => {
    expect(empreinteBlocage('PAY-123', BLOQUEE)).toBe(empreinteBlocage('PAY-123', BLOQUEE));
  });

  it('ignore l’ordre des raisons', () => {
    const inversee: Evaluation = { ...BLOQUEE, reasons: [...BLOQUEE.reasons].reverse() };
    expect(empreinteBlocage('PAY-123', inversee)).toBe(empreinteBlocage('PAY-123', BLOQUEE));
  });

  it('change si le ticket ou une raison change', () => {
    const autreRaison: Evaluation = {
      ...BLOQUEE,
      reasons: BLOQUEE.reasons.map((r) => (r.rule === 'R-03' ? { ...r, text: 'PAY-123 : 1 critère(s).' } : r)),
    };
    expect(empreinteBlocage('PAY-124', BLOQUEE)).not.toBe(empreinteBlocage('PAY-123', BLOQUEE));
    expect(empreinteBlocage('PAY-123', autreRaison)).not.toBe(empreinteBlocage('PAY-123', BLOQUEE));
  });

  it('ignore les raisons observées et dérogées', () => {
    const sansObserved: Evaluation = { ...BLOQUEE, reasons: BLOQUEE.reasons.filter((r) => !r.observed) };
    expect(empreinteBlocage('PAY-123', sansObserved)).toBe(empreinteBlocage('PAY-123', BLOQUEE));
  });
});

describe('corpsCommentaire', () => {
  it('reprend le message du §9 avec la marche à suivre', () => {
    const corps = corpsCommentaire(BLOQUEE, 'fr');
    expect(corps.split('\n')[0]).toBe('Bloqué, 2 raisons.');
    expect(corps).toContain('1) PAY-123 : 2 critère(s) d’acceptation non coché(s). Cochez dans le ticket');
    expect(corps).toContain('2) Incident INC-52 ouvert sur checkout-api.');
    expect(corps).toContain('carte « Merge avec contexte »');
    expect(corps).not.toContain('R-09');
  });

  it('rédige en anglais sur demande', () => {
    expect(corpsCommentaire(BLOQUEE, 'en').split('\n')[0]).toBe('Blocked, 2 reasons.');
  });
});

describe('garde-fous du service de notification', () => {
  it('commente le ticket concerné quand la PR est bloquée', async () => {
    const notifieur = notifieurMemoire();
    await service(notifieur).notifierBlocage(BLOQUEE, 'fr');
    expect(notifieur.commentaires).toHaveLength(1);
    const [commentaire] = notifieur.commentaires;
    expect(commentaire?.cleTicket).toBe('PAY-123');
    expect(commentaire?.corps).toContain('Bloqué, 2 raisons.');
    expect(commentaire?.empreinte).toBe(empreinteBlocage('PAY-123', BLOQUEE));
  });

  it('ne duplique pas à chaque relance du contrôle', async () => {
    const notifieur = notifieurMemoire();
    const svc = service(notifieur);
    await svc.notifierBlocage(BLOQUEE, 'fr');
    await svc.notifierBlocage(BLOQUEE, 'fr');
    await svc.notifierBlocage({ ...BLOQUEE, evaluatedAt: '2026-11-27T17:00:00Z' }, 'fr');
    expect(notifieur.commentaires).toHaveLength(1);
  });

  it('recommente quand l’ensemble de raisons change', async () => {
    const notifieur = notifieurMemoire();
    const svc = service(notifieur);
    await svc.notifierBlocage(BLOQUEE, 'fr');
    const critereCoché: Evaluation = {
      ...BLOQUEE,
      reasons: BLOQUEE.reasons.map((r) => (r.rule === 'R-03' ? { ...r, text: 'PAY-123 : 1 critère(s).' } : r)),
    };
    await svc.notifierBlocage(critereCoché, 'fr');
    expect(notifieur.commentaires).toHaveLength(2);
  });

  it('ne commente jamais en mode observation ni sur un verdict autorisé', async () => {
    const notifieur = notifieurMemoire();
    const svc = service(notifieur);
    const observee: Evaluation = { ...BLOQUEE, verdict: 'allowed', observedOnly: true };
    await svc.notifierBlocage(observee, 'fr');
    await svc.notifierBlocage({ ...BLOQUEE, verdict: 'allowed' }, 'fr');
    expect(notifieur.commentaires).toHaveLength(0);
    expect(blocageReel(observee)).toBe(false);
  });

  it('ne commente pas un repli « contexte indisponible »', async () => {
    const notifieur = notifieurMemoire();
    const repli: Evaluation = {
      ...BLOQUEE,
      verdict: 'inconclusive',
      reasons: [],
      fallback: 'closed',
      cause: 'error',
    };
    expect(blocageReel(repli)).toBe(false);
    await service(notifieur).notifierBlocage(repli, 'fr');
    expect(notifieur.commentaires).toHaveLength(0);
  });

  it('ne commente pas quand toutes les raisons bloquantes sont dérogées', async () => {
    const notifieur = notifieurMemoire();
    const derogee: Evaluation = {
      ...BLOQUEE,
      reasons: BLOQUEE.reasons.map((r) => (r.level === 'blocking' && !r.observed ? { ...r, waived: true } : r)),
    };
    await service(notifieur).notifierBlocage(derogee, 'fr');
    expect(notifieur.commentaires).toHaveLength(0);
  });

  it('commente chaque ticket cité par la PR', async () => {
    const notifieur = notifieurMemoire();
    await service(notifieur).notifierBlocage({ ...BLOQUEE, issueKeys: ['PAY-123', 'PAY-124'] }, 'fr');
    expect(notifieur.commentaires.map((c) => c.cleTicket)).toEqual(['PAY-123', 'PAY-124']);
  });

  it('un conteneur neuf ne recommente pas une empreinte déjà posée sur le ticket', async () => {
    const notifieur = notifieurMemoire();
    await service(notifieur).notifierBlocage(BLOQUEE, 'fr');
    // Second service : registre mémoire vide, mais empreinte lisible sur le ticket.
    await service(notifieur).notifierBlocage(BLOQUEE, 'fr');
    expect(notifieur.commentaires).toHaveLength(1);
  });

  it('un échec Jira est journalisé, jamais propagé, et réessayé ensuite', async () => {
    const avertissements: string[] = [];
    const logger: LoggerCommun = {
      ...loggerSilencieux(),
      warn: (message: string) => avertissements.push(message),
    };
    let pose = 0;
    const fragile = notifieurMemoire();
    const original = fragile.commenter.bind(fragile);
    fragile.commenter = async (cle, commentaire) => {
      pose += 1;
      if (pose === 1) throw new Error('Jira indisponible');
      return original(cle, commentaire);
    };
    const svc = creerServiceNotification({ notifieur: fragile, logger });
    await svc.notifierBlocage(BLOQUEE, 'fr');
    expect(avertissements).toEqual(['notification de blocage impossible']);
    await svc.notifierBlocage(BLOQUEE, 'fr');
    expect(fragile.commentaires).toHaveLength(1);
  });
});

describe('adf', () => {
  it('construit un doc ADF dont le texte se relit, marque comprise', () => {
    const doc = adfDepuisTexte('Bloqué, 1 raison.\nDétail…', 'abc123');
    const texte = texteAdf(doc);
    expect(texte.split('\n').slice(0, 2)).toEqual(['Bloqué, 1 raison.', 'Détail…']);
    expect(texte).toContain(ligneMarque('abc123'));
    expect(extraireEmpreintes([{ body: doc }])).toEqual(['abc123']);
  });

  it('extrait plusieurs empreintes d’une réponse de commentaires', () => {
    const corps = { comments: [{ body: adfDepuisTexte('a', 'e1') }, { body: adfDepuisTexte('b', 'e2') }] };
    expect(extraireEmpreintes(corps)).toEqual(['e1', 'e2']);
    expect(extraireEmpreintes(undefined)).toEqual([]);
  });
});

describe('notifieurJira (doublure requête)', () => {
  /** Doublure : enregistre les appels, rend les corps par motif de chemin. */
  function doublure(reponses: Array<{ motif: RegExp; corps: unknown; status?: number }>) {
    const appels: Array<{ chemin: string; init?: Parameters<RequeteJira>[1] }> = [];
    const requete: RequeteJira = async (chemin, init) => {
      const value = String((chemin as { value?: string }).value ?? chemin);
      appels.push({ chemin: value, init });
      const trouve = reponses.find((r) => r.motif.test(value));
      const status = trouve?.status ?? (trouve ? 201 : 404);
      const reponse: ReponseJira = { ok: status < 300, status, json: async () => trouve?.corps };
      return reponse;
    };
    return { requete, appels };
  }

  it('pose le commentaire en ADF sur le ticket, empreinte scellée', async () => {
    const { requete, appels } = doublure([{ motif: /comment/, corps: { id: '1' } }]);
    await notifieurJira(requete).commenter('PAY-123', { corps: 'Bloqué, 1 raison.', empreinte: 'x9' });
    expect(appels).toHaveLength(1);
    expect(appels[0]?.chemin).toContain('/rest/api/3/issue/PAY-123/comment');
    expect(appels[0]?.init?.method).toBe('POST');
    const body = JSON.parse(String(appels[0]?.init?.body)) as { body: unknown };
    expect(texteAdf(body.body)).toContain('Bloqué, 1 raison.');
    expect(extraireEmpreintes([{ body: body.body }])).toEqual(['x9']);
  });

  it('relit les empreintes déjà commentées sur le ticket', async () => {
    const commentaires = { comments: [{ body: adfDepuisTexte('x', 'e1') }] };
    const { requete } = doublure([{ motif: /comment/, corps: commentaires }]);
    expect(await notifieurJira(requete).empreintesCommentees?.('PAY-123')).toEqual(['e1']);
  });

  it('lève sur un POST refusé et rend [] sur des commentaires illisibles', async () => {
    const refus = doublure([{ motif: /comment/, corps: {}, status: 500 }]);
    await expect(notifieurJira(refus.requete).commenter('PAY-1', { corps: 'x', empreinte: 'e' })).rejects.toThrow(/HTTP 500/);
    const illisible = doublure([]);
    expect(await notifieurJira(illisible.requete).empreintesCommentees?.('PAY-1')).toEqual([]);
  });
});
