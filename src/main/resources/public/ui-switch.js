/*
 * Bandeau d'invitation à la nouvelle IHM React d'Exercizer.
 *
 * Fichier SOURCE, servi tel quel (public/js/ et public/dist/, eux, reçoivent la sortie du build
 * webpack). Volontairement en JavaScript natif, hors de l'application AngularJS : l'IHM
 * historique ne doit pas être modifiée pour accueillir sa relève, et ce fichier disparaîtra avec
 * elle. Son balisage est rendu par `view-src/exercizer.html` (pour que les libellés passent par
 * l'i18n du serveur) ; il ne reste ici que la décision d'afficher, et l'enregistrement du choix.
 *
 * L'état vit dans la préférence usager `exercizerUi` (sans tiret ni point : entcore retire les
 * caractères non alphanumériques des clés avant d'en faire un nom de propriété Cypher) :
 *   { ui, invitationDismissed, invitationShown, returnDismissed, returnShown, feedback, feedbackAt }
 * `ui` est aussi lue par le serveur (ExercizerController#preferredUi) pour servir la bonne IHM.
 */
(function () {
  'use strict';

  var PREFERENCE_URL = '/userbook/preference/exercizerUi';
  /** Au-delà, on considère que l'usager a vu passer l'invitation et qu'insister serait du harcèlement. */
  var MAX_INVITATIONS = 5;

  var banner = document.getElementById('exercizer-ui-switch');
  if (!banner) return;

  function xsrfHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    if (match) headers['X-XSRF-TOKEN'] = decodeURIComponent(match[1]);
    return headers;
  }

  function read() {
    return fetch(PREFERENCE_URL, { credentials: 'include' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        // L'enveloppe est { preference: "<json>" } — une CHAÎNE, pas un objet.
        if (!body || !body.preference) return {};
        try { return JSON.parse(body.preference) || {}; } catch (e) { return {}; }
      })
      .catch(function () { return {}; });
  }

  function write(preference) {
    return fetch(PREFERENCE_URL, {
      credentials: 'include',
      method: 'PUT',
      headers: xsrfHeaders(),
      body: JSON.stringify(preference),
    }).catch(function () { /* un choix d'habillage ne justifie pas d'alerter l'usager */ });
  }

  read().then(function (preference) {
    // Un choix explicite — dans un sens comme dans l'autre — clôt le sujet : quelqu'un qui est
    // REVENU à l'ancienne IHM a déjà tranché, le réinviter à chaque visite serait insistant.
    if (preference.ui === 'react' || preference.ui === 'angular') return;
    if (preference.invitationDismissed) return;
    var shown = typeof preference.invitationShown === 'number' ? preference.invitationShown : 0;
    if (shown >= MAX_INVITATIONS) return;

    banner.hidden = false;
    preference.invitationShown = shown + 1;
    write(preference);

    banner.querySelector('[data-action="try"]').addEventListener('click', function () {
      preference.ui = 'react';
      // La navigation attend l'enregistrement, mais porte quand même `?ui=react` : la préférence
      // fraîchement écrite peut manquer au cache de la session en cours, et la dérogation d'URL,
      // elle, est honorée sans condition.
      write(preference).then(function () { window.location.href = '/exercizer?ui=react'; });
    });

    banner.querySelector('[data-action="later"]').addEventListener('click', function () {
      preference.invitationDismissed = true;
      write(preference);
      banner.hidden = true;
    });
  });
})();
