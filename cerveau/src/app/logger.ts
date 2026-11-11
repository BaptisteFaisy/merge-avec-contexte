/**
 * Journal applicatif du Cerveau.
 *
 * Un seul objet satisfait les deux ports existants : le pont attend
 * `info`/`error` (`bridge/deps.ts`), les actions Rovo attendent `info`/`warn`
 * (`rovo/deps.ts`). Rien de sensible n'est journalisé : ni secret, ni corps
 * brut de requête, ni contenu de code.
 */
import type { Logger as LoggerPont } from '../bridge/deps';
import type { Logger as LoggerRovo } from '../rovo/deps';

export type LoggerCommun = LoggerPont & LoggerRovo;

type Niveau = 'info' | 'warn' | 'error';

/** Écrit une ligne préfixée sur la console Forge. */
function ecrire(prefixe: string, niveau: Niveau) {
  return (message: string, contexte?: Record<string, unknown>) => {
    const ligne = contexte ? `${message} ${JSON.stringify(contexte)}` : message;
    if (niveau === 'error') console.error(`[${prefixe}] ${ligne}`);
    else if (niveau === 'warn') console.warn(`[${prefixe}] ${ligne}`);
    else console.info(`[${prefixe}] ${ligne}`);
  };
}

/** Journal sur la console Forge, avec un préfixe qui nomme l'app. */
export function loggerConsole(prefixe = 'cerveau'): LoggerCommun {
  return {
    info: ecrire(prefixe, 'info'),
    warn: ecrire(prefixe, 'warn'),
    error: ecrire(prefixe, 'error'),
  };
}

/** Journal muet : pour les tests qui ne veulent aucune sortie. */
export function loggerSilencieux(): LoggerCommun {
  const rien = () => undefined;
  return { info: rien, warn: rien, error: rien };
}
