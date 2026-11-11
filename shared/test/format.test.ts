import { describe, expect, it } from 'vitest';
import { formatEvaluation, compareReasons, visibleReasons, MESSAGE_MAX_CHARS } from '../src/message/format';
import { toMergeCheckResponse, isMergeAllowed } from '../src/check/response';
import { fallbackEvaluation } from '../src/policy/fallback';
import type { Evaluation, Reason } from '../src/types';

/** Évaluation minimale, construite pour un test. */
function evaluation(verdict: Evaluation['verdict'], reasons: Reason[]): Evaluation {
  return {
    verdict,
    reasons,
    issueKeys: ['PAY-123'],
    trigger: 'on-code-pushed',
    evaluatedAt: '2026-11-11T09:00:00Z',
    durationMs: 120,
  };
}

const criteres: Reason = {
  rule: 'R-03',
  level: 'blocking',
  text: 'PAY-123 : 2 critères d’acceptation non cochés.',
  action: 'Cochez dans le ticket les critères vraiment validés.',
  issueKey: 'PAY-123',
};

const gel: Reason = {
  rule: 'R-04',
  level: 'blocking',
  text: 'Gel « Black Friday » sur main jusqu’au 30/11 à 9 h.',
  action: 'Attendez la fin du gel ou demandez une dérogation.',
};

const carte = 'Détail et dérogation : carte « Merge avec contexte » à droite.';

describe('formatEvaluation — format imposé (§9)', () => {
  it('rend le message à deux raisons du cahier des charges, mot pour mot', () => {
    const message = formatEvaluation(evaluation('blocked', [gel, criteres]));
    expect(message).toBe(
      ['Bloqué, 2 raisons.', '1) PAY-123 : 2 critères d’acceptation non cochés.',
        '2) Gel « Black Friday » sur main jusqu’au 30/11 à 9 h.', carte].join('\n'),
    );
  });

  it('accorde le singulier sur une seule raison', () => {
    expect(formatEvaluation(evaluation('blocked', [criteres])).split('\n')[0]).toBe('Bloqué, 1 raison.');
  });

  it('met la raison la plus grave en premier, quel que soit l’ordre reçu', () => {
    const avertissement: Reason = { rule: 'R-07', level: 'warning', text: 'Version déjà publiée.' };
    const message = formatEvaluation(evaluation('blocked', [avertissement, gel]));
    expect(message.split('\n')[1]).toBe('1) Gel « Black Friday » sur main jusqu’au 30/11 à 9 h.');
  });

  it('écrit « Autorisé, 1 avertissement : … » sur une ligne', () => {
    const avertissement: Reason = { rule: 'R-07', level: 'warning', text: 'Version 1.0 déjà publiée.' };
    const message = formatEvaluation(evaluation('allowed', [avertissement]));
    expect(message.split('\n')[0]).toBe('Autorisé, 1 avertissement : Version 1.0 déjà publiée.');
  });

  it('écrit « Autorisé. » quand rien n’est signalé', () => {
    expect(formatEvaluation(evaluation('allowed', [])).split('\n')[0]).toBe('Autorisé.');
  });

  it('masque les raisons en observation et celles couvertes par une dérogation', () => {
    const observe: Reason = { rule: 'R-11', level: 'information', text: 'Autre ticket cité.', observed: true };
    const derogee: Reason = { rule: 'R-02', level: 'blocking', text: 'Statut non autorisé.', waived: true };
    const visibles = visibleReasons(evaluation('allowed', [observe, derogee]));
    expect(visibles).toHaveLength(0);
  });

  it('renvoie le reste vers la carte au-delà de maxReasons', () => {
    const raisons = [criteres, gel, { rule: 'R-02', level: 'blocking', text: 'Statut non autorisé.' } as Reason];
    const message = formatEvaluation(evaluation('blocked', raisons), { maxReasons: 2 });
    expect(message.split('\n')[3]).toBe('…et 1 autre(s) raison(s) : voir la carte.');
  });

  it('tronque jusqu’à tenir dans maxChars', () => {
    const raisons = [criteres, gel, { rule: 'R-02', level: 'blocking', text: 'Statut non autorisé.' } as Reason];
    const message = formatEvaluation(evaluation('blocked', raisons), { maxChars: 200 });
    expect(message.length).toBeLessThanOrEqual(200);
  });

  it('rend l’anglais quand il est demandé', () => {
    const message = formatEvaluation(evaluation('blocked', [criteres]), { locale: 'en' });
    expect(message.split('\n')[0]).toBe('Blocked, 1 reason.');
  });
});

describe('repli et réponse Bitbucket', () => {
  it('écrit « Contexte indisponible » puis la politique appliquée', () => {
    const repli = fallbackEvaluation({ policy: 'open', cause: 'timeout', trigger: 'on-merge', now: '2026-11-11T09:00:00Z' });
    const message = formatEvaluation(repli);
    expect(message.split('\n')[0]).toBe('Contexte indisponible, contrôle non concluant.');
    expect(message).toContain('Politique de repli : ouvert');
  });

  it('laisse passer en repli ouvert et bloque en repli fermé', () => {
    const ouvert = fallbackEvaluation({ policy: 'open', cause: 'unreachable', trigger: 'on-merge', now: '2026-11-11T09:00:00Z' });
    const ferme = fallbackEvaluation({ policy: 'closed', cause: 'unreachable', trigger: 'on-merge', now: '2026-11-11T09:00:00Z' });
    expect(isMergeAllowed(ouvert)).toBe(true);
    expect(isMergeAllowed(ferme)).toBe(false);
    expect(toMergeCheckResponse(ferme).success).toBe(false);
  });

  it('rend success=false dès qu’une raison bloque', () => {
    const response = toMergeCheckResponse(evaluation('blocked', [criteres]));
    expect(response.success).toBe(false);
    expect(response.message).toContain('Bloqué, 1 raison.');
  });

  it('classe par gravité puis par ordre du catalogue', () => {
    const a: Reason = { rule: 'R-07', level: 'warning', text: 'a' };
    const b: Reason = { rule: 'R-02', level: 'warning', text: 'b' };
    const c: Reason = { rule: 'R-04', level: 'blocking', text: 'c' };
    expect([a, b, c].sort(compareReasons).map((r) => r.rule)).toEqual(['R-04', 'R-02', 'R-07']);
  });
});

describe('formatEvaluation — borne du message Bitbucket (§15 V3)', () => {
  /** Dix raisons bloquantes, chacune assez longue pour déborder la borne. */
  function dixRaisons(): Reason[] {
    return Array.from({ length: 10 }, (_, index) => ({
      rule: `R-${String(index + 1).padStart(2, '0')}` as Reason['rule'],
      level: 'blocking' as const,
      text: `Raison ${index + 1} : ${'texte long, ajouté pour déborder la borne du message. '.repeat(2)}`,
    }));
  }

  it('ne dépasse jamais la borne exportée, même avec dix raisons', () => {
    const message = formatEvaluation(evaluation('blocked', dixRaisons()));
    expect(MESSAGE_MAX_CHARS).toBeGreaterThan(0);
    expect(message.length).toBeLessThanOrEqual(MESSAGE_MAX_CHARS);
    expect(message.split('\n')[0]).toBe('Bloqué, 10 raisons.');
    expect(message).toContain(carte);
  });

  it('réduit le nombre de raisons listées et renvoie vers la carte', () => {
    const message = formatEvaluation(evaluation('blocked', dixRaisons()), { maxChars: 300 });
    expect(message.length).toBeLessThanOrEqual(300);
    const listees = message.split('\n').filter((ligne) => /^\d+\)/.test(ligne));
    expect(listees.length).toBeLessThan(10);
    expect(listees.length).toBeGreaterThan(0);
    expect(message).toContain(`…et ${10 - listees.length} autre(s) raison(s) : voir la carte.`);
    expect(message).toContain(carte);
  });
});
