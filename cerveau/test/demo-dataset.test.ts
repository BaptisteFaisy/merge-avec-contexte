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
