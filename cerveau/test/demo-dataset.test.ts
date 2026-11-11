import { describe, expect, it } from 'vitest';
import { DEMO_NOW, createDemoDataset, issueOf, prOf, serviceOf } from '../src/seed/dataset';

describe('jeu de données de démonstration (§20)', () => {
  const dataset = createDemoDataset();

  it('fournit les tickets du cahier des charges', () => {
    const pay123 = issueOf(dataset, 'PAY-123');
    expect(pay123).toBeDefined();
    expect(pay123?.criteria.filter((c) => !c.done)).toHaveLength(2);
    expect(issueOf(dataset, 'PAY-125')?.links.some((l) => l.targetKey === 'PAY-126')).toBe(true);
    expect(issueOf(dataset, 'PAY-130')?.fixVersions.some((v) => v.released)).toBe(true);
    expect(issueOf(dataset, 'PAY-140')?.incidentKeys).toContain('INC-52');
  });

  it('contient le gel Black Friday et l’incident de checkout', () => {
    expect(dataset.freezes.some((g) => g.name === 'Black Friday')).toBe(true);
    expect(dataset.incidents.some((i) => i.service === 'checkout-api')).toBe(true);
  });

  it('ajoute un gel court réellement actif, borné aux branches release', () => {
    const gel = dataset.freezes.find((g) => g.name === 'Fenêtre release');
    expect(gel).toBeDefined();
    expect(gel?.branches).toEqual(['release/*']);
    expect(Date.parse(gel!.startsAt)).toBeLessThan(Date.parse(dataset.now));
    expect(Date.parse(gel!.endsAt)).toBeGreaterThan(Date.parse(dataset.now));
  });

  it('fournit un ticket en statut interdit et une dépendance amont non livrée', () => {
    const pay132 = issueOf(dataset, 'PAY-132');
    expect(pay132?.status).toBe('Suspendu');
    const pay133 = issueOf(dataset, 'PAY-133');
    expect(pay133?.links.some((l) => l.type === 'dépend de' && l.targetKey === 'PAY-134')).toBe(true);
  });

  it('règle R-09 en observation et R-13 bloquante pour la démo', () => {
    const r09 = dataset.configs.find((c) => c.rule === 'R-09');
    const r13 = dataset.configs.find((c) => c.rule === 'R-13');
    expect(r09?.mode).toBe('observe');
    expect(r13?.level).toBe('blocking');
  });

  it('relie le dépôt checkout-api à son service', () => {
    expect(serviceOf(dataset, 'checkout-api')).toBe('checkout-api');
    expect(serviceOf(dataset, 'inconnu')).toBeUndefined();
  });

  it('contient la PR #42 du parcours §7.1', () => {
    const pr42 = prOf(dataset, 42);
    expect(pr42).toBeDefined();
    expect(pr42?.sourceBranch).toContain('PAY-123');
  });

  it('fixe un instant de référence', () => {
    expect(dataset.now).toBe(DEMO_NOW);
  });
});
