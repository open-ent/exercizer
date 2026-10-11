/*
 * Pont SCORM injecté dans un SCO servi depuis le domaine de contenu.
 *
 * Ce fichier est une ressource du classpath, et NON un fichier de src/main/resources/public/ :
 * ce répertoire est la sortie du build React, il est ignoré par git (à quelques exceptions
 * près) et build.sh l'écrase. Le serveur lit donc ce script depuis le jar et l'injecte dans la
 * page du SCO au moment de la servir.
 *
 * Le SCO cherche un objet « API » (SCORM 1.2) ou « API_1484_11 » (SCORM 2004) en remontant la
 * chaîne des fenêtres parentes. Ici il ne peut pas l'y trouver : la page de l'ENT est sur une
 * AUTRE origine, et le navigateur interdit — à juste titre — d'accéder à ses objets. C'est tout
 * l'intérêt du cloisonnement : le code du paquet n'a aucune prise sur la session de l'élève.
 *
 * Le pont rétablit donc l'API localement, dans la fenêtre du SCO, et relaie chaque appel au
 * parent par postMessage. Le parent, lui, est sur le domaine de l'ENT et sait persister.
 *
 * Conséquence à connaître : l'API SCORM est SYNCHRONE (GetValue rend une valeur) alors que
 * postMessage est asynchrone. Les valeurs sont donc servies depuis un cache local, amorcé avant
 * le démarrage du SCO et tenu à jour par les SetValue ; seules les écritures voyagent.
 */
(function () {
  'use strict';

  var config = window.__OPENENT_SCORM__ || {};
  var parentOrigin = config.parentOrigin;
  var version = config.version === '2004' ? '2004' : '1.2';
  var cache = config.initial || {};
  var lastError = '0';
  var initialized = false;

  if (!parentOrigin) {
    /* Sans origine parente déclarée, on ne peut vérifier personne : on ne parle à personne. */
    return;
  }

  function post(type, payload) {
    try {
      /* L'origine cible est TOUJOURS nommée : « * » enverrait l'état d'apprentissage de
         l'élève à n'importe quelle page capable de nous encadrer. */
      window.parent.postMessage(
        { source: 'openent-scorm', type: type, payload: payload },
        parentOrigin
      );
    } catch (e) {
      lastError = '101';
    }
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== parentOrigin) {
      return;
    }
    var data = event.data;
    if (!data || data.source !== 'openent-scorm-host') {
      return;
    }
    if (data.type === 'state' && data.payload) {
      cache = data.payload;
    }
  });

  function set(key, value) {
    cache[key] = value;
    post('set', { key: key, value: value });
    return 'true';
  }

  function get(key) {
    var value = cache[key];
    return value === undefined || value === null ? '' : String(value);
  }

  var api = {
    initialize: function () {
      initialized = true;
      lastError = '0';
      post('initialize', { version: version });
      return 'true';
    },
    terminate: function () {
      if (!initialized) {
        lastError = '301';
        return 'false';
      }
      initialized = false;
      post('terminate', {});
      return 'true';
    },
    getValue: function (key) {
      lastError = '0';
      return get(key);
    },
    setValue: function (key, value) {
      lastError = '0';
      return set(key, value);
    },
    commit: function () {
      post('commit', { cmi: cache });
      return 'true';
    },
    getLastError: function () {
      return lastError;
    },
    getErrorString: function (code) {
      return code === '0' ? 'No error' : 'Error';
    },
    getDiagnostic: function () {
      return '';
    }
  };

  if (version === '2004') {
    window.API_1484_11 = {
      Initialize: api.initialize,
      Terminate: api.terminate,
      GetValue: api.getValue,
      SetValue: api.setValue,
      Commit: api.commit,
      GetLastError: api.getLastError,
      GetErrorString: api.getErrorString,
      GetDiagnostic: api.getDiagnostic
    };
  } else {
    window.API = {
      LMSInitialize: api.initialize,
      LMSFinish: api.terminate,
      LMSGetValue: api.getValue,
      LMSSetValue: api.setValue,
      LMSCommit: api.commit,
      LMSGetLastError: api.getLastError,
      LMSGetErrorString: api.getErrorString,
      LMSGetDiagnostic: api.getDiagnostic
    };
  }

  /* Un SCO qui se ferme sans appeler Terminate est courant ; son dernier état serait perdu. */
  window.addEventListener('unload', function () {
    if (initialized) {
      post('commit', { cmi: cache });
      post('terminate', {});
    }
  });
})();
