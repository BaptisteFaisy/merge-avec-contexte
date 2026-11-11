/**
 * Point d'entrée du Cerveau (§AUDIT 63) : ce qui est vérifiable sans plateforme.
 *
 * `cerveau/src/index.ts` s'importe hors Forge (les adaptateurs `@forge/*` ne
 * lèvent qu'à l'appel, pas à l'import). On vérifie donc (1) la cohérence
 * manifeste ↔ exports : chaque `handler: index.<nom>` du manifeste correspond à
 * un export réel et fonctionnel, et (2) les fonctions pures exportées
 * (`aplatirHeaders`, `projetDuContexte`, `cleTicketDuContexte`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import * as index from '../src/index';
import type { JiraExtensionContext } from '../src/index';

const manifeste = parse(readFileSync(new URL('../manifest.yml', import.meta.url), 'utf8')) as {
  modules?: { function?: Array<{ key: string; handler: string }> };
};
const fonctions = manifeste.modules?.function ?? [];
const exportations = index as unknown as Record<string, unknown>;

/** Contexte d'extension Jira minimal, pour exercer les sélecteurs purs. */
function contexte(partiel: Record<string, unknown>): JiraExtensionContext {
  return { type: 'x', location: 'x', ...partiel } as unknown as JiraExtensionContext;
}

describe('cerveau/src/index.ts — point d’entrée (§AUDIT 63)', () => {
  it('chaque handler du manifeste correspond à un export réel', () => {
    expect(fonctions.length).toBeGreaterThan(0);
    for (const entree of fonctions) {
      const nom = entree.handler.split('.')[1];
      expect(entree.handler.startsWith('index.'), entree.handler).toBe(true);
      expect(typeof exportations[nom], `${entree.key} → index.${nom}`).toBe('function');
    }
  });

  it('aplatirHeaders : clés en minuscules, première valeur, tolérant aux absents', () => {
    expect(index.aplatirHeaders({ Signature: ['a', 'b'], 'X-Test': ['c'] })).toEqual({ signature: 'a', 'x-test': 'c' });
    expect(index.aplatirHeaders(undefined)).toEqual({});
    expect(index.aplatirHeaders({ X: 'brut' as unknown as string[] })).toEqual({ x: 'brut' });
  });

  it('projetDuContexte : clé d’abord, puis identifiant, principal puis extension', () => {
    expect(index.projetDuContexte(contexte({ project: { id: '42', key: 'PAY' } }))).toBe('PAY');
    expect(index.projetDuContexte(contexte({ project: { id: '42' } }))).toBe('42');
    expect(index.projetDuContexte(contexte({ extension: { project: { key: 'EXT' } } }))).toBe('EXT');
    expect(index.projetDuContexte(undefined)).toBeUndefined();
  });

  it('cleTicketDuContexte : clé principale puis extension', () => {
    expect(index.cleTicketDuContexte(contexte({ issue: { id: '1', key: 'PAY-123' } }))).toBe('PAY-123');
    expect(index.cleTicketDuContexte(contexte({ extension: { issue: { key: 'PAY-9' } } }))).toBe('PAY-9');
    expect(index.cleTicketDuContexte(undefined)).toBeUndefined();
  });
});