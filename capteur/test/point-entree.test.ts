/**
 * Point d'entrée du Capteur (§AUDIT 64) : ce qui est vérifiable sans plateforme.
 *
 * `capteur/src/index.ts` s'importe hors Forge (les adaptateurs `@forge/*` ne
 * lèvent qu'à l'appel). On vérifie la cohérence manifeste ↔ exports : chaque
 * `handler: index.<nom>` du manifeste correspond à un export réel et fonctionnel,
 * et les quatre clés attendues sont bien présentes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import * as index from '../src/index';

const manifeste = parse(readFileSync(new URL('../manifest.yml', import.meta.url), 'utf8')) as {
  modules?: { function?: Array<{ key: string; handler: string }> };
};
const fonctions = manifeste.modules?.function ?? [];
const exportations = index as unknown as Record<string, unknown>;

describe('capteur/src/index.ts — point d’entrée (§AUDIT 64)', () => {
  it('chaque handler du manifeste correspond à un export réel', () => {
    expect(fonctions.length).toBe(4);
    for (const entree of fonctions) {
      const nom = entree.handler.split('.')[1];
      expect(entree.handler.startsWith('index.'), entree.handler).toBe(true);
      expect(typeof exportations[nom], `${entree.key} → index.${nom}`).toBe('function');
    }
  });

  it('exporte exactement les quatre clés du manifeste', () => {
    const cles = fonctions.map((entree) => entree.handler.split('.')[1]).sort();
    expect(cles).toEqual(['resolverPrCard', 'resolverPrPanel', 'resolverWorkspaceSettings', 'runCheck']);
  });
});