/**
 * Adresse publique du pont.
 *
 * Le Capteur ne peut pas la deviner : c'est le Cerveau qui la lui rend au
 * moment du jumelage. Elle est propre à chaque installation et à chaque
 * environnement, donc lue à l'exécution par `webTrigger.getUrl()` plutôt que
 * recopiée dans un fichier de configuration.
 */
import { webTrigger } from '@forge/api';

/** Clé du module `webtrigger` dans `cerveau/manifest.yml`. */
export const MODULE_PONT = 'pont-bitbucket';

/** URL du web trigger, ou chaîne vide si la plateforme ne la donne pas. */
export async function urlDuPont(): Promise<string> {
  try {
    return await webTrigger.getUrl(MODULE_PONT);
  } catch {
    return '';
  }
}

/** URL retenue : variable d'environnement d'abord, plateforme ensuite. */
export async function urlDuPontEffective(): Promise<string> {
  const forcee = process.env.MAC_BRIDGE_URL;
  if (typeof forcee === 'string' && forcee.length > 0) return forcee;
  return urlDuPont();
}
