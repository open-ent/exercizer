import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Proxy de dev vers l'ENT local (traefik :8090)
const proxyTarget = { target: 'http://localhost:8090', changeOrigin: false };

export default defineConfig(({ mode }) => ({
  // Servi sous /exercizer par entcore (cf. view/exercizer-react.html -> /exercizer/public/index-<hash>.js)
  base: mode === 'production' ? '/exercizer' : '',
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'react-i18next',
      'i18next',
      'react-router-dom',
      '@open-ent/client',
      '@open-ent/react',
      '@open-ent/bootstrap',
    ],
    alias: {
      // Illustrations du socle (écrans vides), comme dans blog et calendar.
      '@images': resolve(__dirname, 'node_modules/@open-ent/bootstrap/dist/images'),
    },
  },
  build: {
    assetsDir: 'public',
    rollupOptions: {
      output: {
        /**
         * Tout porte une empreinte de contenu, y compris l'entrée — comme blog, wiki, video et
         * l'agenda. La vue n'est donc pas écrite à la main avec un `?v=<horodatage>` : elle est
         * GÉNÉRÉE par Vite (`dist/index.html`) et référence les fichiers empreintés.
         *
         * Deux défauts disparaissent ensemble : l'entrée à nom fixe que les navigateurs
         * resservaient après un déploiement, et la double URL qu'introduisait le `?v=` — un
         * morceau différé importe l'entrée par `./index.js` SANS la requête, le navigateur y voit
         * une autre ressource, la sert depuis son cache, et l'import échoue (« does not provide
         * an export named … ») en laissant la fenêtre jamais rendue.
         *
         * ⚠ Le dossier `public/` est PARTAGÉ avec l'IHM AngularJS (qui y dépose `dist/`, `js/`,
         * `assets/`, `template/`) : les noms empreintés évitent toute collision, et le build React
         * ne fait que s'y ajouter.
         */
        entryFileNames: 'public/[name]-[hash].js',
        chunkFileNames: 'public/[name]-[hash].js',
        assetFileNames: 'public/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 4201,
    // Autorise la lecture des images/polices du paquet bootstrap (hors racine du projet).
    fs: { allow: ['../../'] },
    proxy: {
      '/exercizer': proxyTarget,
      '^/(?=assets|theme|locale|i18n|skin)': proxyTarget,
      '^/(?=auth|userbook|directory|portal|session|timeline|workspace|infra|conf|applications-list)':
        proxyTarget,
    },
  },
  plugins: [react()],
}));
