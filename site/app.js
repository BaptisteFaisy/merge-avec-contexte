/* Bascule de langue : chaque texte porte data-fr et data-en dans le DOM. */
(function () {
  const CLE = 'mac-langue';
  const racine = document.documentElement;
  const bouton = document.getElementById('bascule-langue');

  function appliquer(langue) {
    racine.setAttribute('data-lang', langue);
    racine.setAttribute('lang', langue);
    bouton.textContent = langue === 'fr' ? 'EN' : 'FR';
    bouton.setAttribute('aria-label', langue === 'fr' ? 'Switch to English' : 'Passer en français');
    document.querySelectorAll('[data-fr],[data-en]').forEach(function (el) {
      // Attribut nu (`data-fr` sans valeur) : il ne porte pas de texte, il ne
      // fait que masquer l'autre langue. Un attribut vide effacerait le
      // contenu : on ne remplace donc que par une valeur non vide.
      const texte = el.getAttribute('data-' + langue);
      if (texte) el.innerHTML = texte;
    });
    try { localStorage.setItem(CLE, langue); } catch (e) { /* stockage indisponible */ }
  }

  let initiale = 'fr';
  try { initiale = localStorage.getItem(CLE) || (navigator.language || 'fr').slice(0, 2); } catch (e) { /* ignore */ }
  appliquer(initiale === 'en' ? 'en' : 'fr');

  bouton.addEventListener('click', function () {
    appliquer(racine.getAttribute('data-lang') === 'fr' ? 'en' : 'fr');
  });
})();
