import i18n from 'i18next';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

/**
 * Traductions du site public : toujours en FRANÇAIS. Les exercices le sont, et un navigateur réglé en
 * anglais mêlait des niveaux traduits (« Year 7 ») à des titres français. Le serveur choisit la langue
 * d'après Accept-Language : on la fixe.
 */
i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: (_lngs: string[], namespaces: string[]) =>
        namespaces.map((ns: string) => (ns === 'common' ? `/i18n` : `/${ns}/i18n`)),
      parse: (data: string) => JSON.parse(data),
      customHeaders: { 'Accept-Language': 'fr' },
    },
    defaultNS: 'common',
    ns: ['common', 'exercizer'],
    fallbackLng: 'fr',
    lng: 'fr',
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false, prefix: '[[', suffix: ']]' },
    debug: false,
  });

export default i18n;
