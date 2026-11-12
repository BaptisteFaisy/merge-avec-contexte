/* Preuve « en temps réel » : la page interroge l'app déployée et la dernière
 * exécution de la démonstration, et affiche leur état à l'instant. Rien ne
 * provient d'une capture : les deux appels sont faits au chargement. Si l'un
 * manque, la sortie statique de la démonstration reste lisible — on ne casse
 * jamais l'affichage. */
(function () {
  var PONT = 'https://4eaf9725-e0ff-4e55-a4d4-d2a69adcddb1.webtrigger.atlassian.app/public/JcnMLsMiLo6g2Rq3-VvtETaQZR8';
  var JSON_URL = 'https://raw.githubusercontent.com/Tradoooo/merge-avec-contexte/data-live/preuve.json';
  var bloc = document.getElementById('preuve-vivante');
  if (!bloc) return;

  function lire(url, options) {
    return fetch(url, options).then(function (reponse) {
      if (!reponse.ok) throw new Error(String(reponse.status));
      return reponse.json();
    });
  }

  function sante() {
    return lire(PONT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ route: 'health', payload: {} }),
    }).then(function (reponse) {
      return reponse.date ? { version: reponse.version, date: reponse.date } : null;
    });
  }

  function derniereExecution() {
    return lire(JSON_URL, { cache: 'no-store' }).then(function (reponse) {
      if (!Array.isArray(reponse.etapes)) return null;
      var ok = reponse.etapes.filter(function (etape) { return etape.ok; }).length;
      return {
        horodatage: reponse.horodatage,
        ok: ok,
        total: reponse.etapes.length,
        mediane: reponse.medianeMs,
      };
    });
  }

  Promise.allSettled([sante(), derniereExecution()]).then(function (resultats) {
    var lignes = [];
    var exec = resultats[1].status === 'fulfilled' ? resultats[1].value : null;
    var app = resultats[0].status === 'fulfilled' ? resultats[0].value : null;

    if (exec) {
      var heure = new Date(exec.horodatage).toLocaleTimeString('fr-FR');
      lignes.push('Dernière exécution réelle : ' + exec.ok + '/' + exec.total +
        ' étapes OK · médiane ' + exec.mediane + ' ms · ' + heure);
    }
    if (app) {
      lignes.push('L’app répond à l’instant — version ' + app.version +
        ' · horloge ' + new Date(app.date).toLocaleString('fr-FR'));
    }
    if (lignes.length) {
      bloc.innerHTML = lignes.map(function (ligne) {
        return '<span class="vivant-pastille"></span>' + ligne;
      }).join('<br>');
      bloc.classList.add('visible');
    }
  }).catch(function () { /* la sortie statique reste la référence */ });
})();