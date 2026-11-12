/**
 * Point d'entrée du contrat partagé. Les deux apps importent depuis ce module
 * (copie générée par `scripts/shared-sync.mjs`).
 */
export * from './types';
export * from './match/glob';
export * from './time/moment';
export * from './rules/catalog';
export * from './rules/contrat';
export * from './rules/depot';
export * from './rules/bascule';
export * from './message/strings';
export * from './message/format';
export * from './check/response';
export * from './issues/extract-keys';
export * from './issues/libelles';
export * from './issues/statuts';
export * from './bridge/sign';
export * from './bridge/verify';
export * from './bridge/pairing';
export * from './bridge/payload';
export * from './freezes/match';
export * from './waivers/resolve';
export * from './waivers/journal';
export * from './policy/fallback';
