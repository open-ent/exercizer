# IHM React d'Exercizer

Nouvelle interface du module « Exercices et évaluations », destinée à remplacer l'IHM AngularJS
de `src/main/resources/public/ts/`. La migration est **en cours** : les deux interfaces
cohabitent, et c'est l'usager (ou la plateforme) qui décide laquelle est servie.

## Ce qui est porté

| Écran | Route | État |
| --- | --- | --- |
| Tableau de bord apprenant (à faire / terminés / entraînement) | `#/dashboard/student` | porté |
| Tableau de bord enseignant — Mes sujets (dossiers, liste, recherche, rangement) | `#/dashboard/teacher` | porté |
| Mes corrections — liste des distributions | `#/dashboard/teacher/correction` | porté |
| Mes corrections — copies d'une distribution | `#/dashboard/teacher/correction/:id` | porté |
| Édition d'un sujet interactif et de ses grains | `#/subject/edit/:id/` | porté, sauf les 3 types « à zones » |
| Sujet « simple » : création, titre, description, corrigés | `#/subject/create/simple/`, `#/subject/edit/simple/:id/` | porté |

### Types de grains

| Type | id | Édition |
| --- | --- | --- |
| Énoncé | 3 | portée (texte riche) |
| Réponse simple | 4 | portée |
| Réponse ouverte | 5 | portée (rien à régler) |
| Réponses multiples | 6 | portée |
| QCM | 7 | portée |
| Association | 8 | portée |
| Mise en ordre | 9 | portée (boutons monter/descendre, clavier compris) |
| Texte à trous | 10 | **non portée** |
| Zone à remplir (texte) | 11 | **non portée** |
| Zone à remplir (images) | 12 | **non portée** |

Un grain d'un type non porté reste À SA PLACE, garde son titre, son barème et son énoncé, et
n'est **jamais réenregistré** depuis la nouvelle IHM : aucune donnée ne peut être abîmée par un
passage ici. L'écran le dit et propose d'ouvrir le sujet dans la version précédente.

## Ce qui reste à porter

Dans l'ordre où cela bloque le plus :

1. **Les trois types « à zones »** (10, 11, 12). Leur édition reposait sur l'éditeur riche
   d'AngularJS, dans lequel l'enseignant insérait des balises `<fill-zone>` via une option de
   barre d'outils, et sur un placement libre de zones au-dessus d'une image de fond. Les porter
   demande une extension tiptap dédiée et un composant de placement : c'est un chantier à part.
2. **Passation d'une copie** (`#/subject/copy/perform/…`) et **consultation** (`…/view/…`),
   y compris le score final et le pilotage en direct (WebSocket `real-time`).
3. **Distribution d'un sujet** et **partage** : il manque le sélecteur de destinataires
   (élèves + groupes) qui alimente `scheduled_at`.
4. Archives, parcours (`subject-sequence`), impression, import, publication en bibliothèque,
   génération automatique d'un sujet, statistiques de correction, image de couverture d'un sujet.

Toute route non portée tombe sur `screens/NotMigrated.tsx`, qui renvoie vers l'ancienne IHM **en
conservant le chemin demandé** (`/exercizer?ui=angular#<même chemin>`) : les deux interfaces
partagent leurs routes, ce qui garde valides les liens des notifications et du « linker ».

## Arbitrage entre les deux interfaces

`ExercizerController#view` choisit la vue, par priorité décroissante :

1. `?ui=react|angular` — dérogation ponctuelle, **non mémorisée** (vérification, support) ;
2. la **préférence usager** `exercizerUi`, lue directement sur le nœud `UserAppConf` du graphe ;
3. la conf `frontend-ui` du module, alimentée par **`EXERCIZER_FRONTEND_UI`** (variable propre à
   ce module, isolée de `FRONTEND_UI_DEFAULT` que huit modules partagent). Défaut : `angular`.

Deux bandeaux font découvrir la bascule et s'effacent — l'invitation sur l'ancienne IHM
(`public/ui-switch.js`, JavaScript natif hors de l'application AngularJS) et le retour sur la
nouvelle (`src/features/UiSwitchBanner.tsx`). Le réglage **durable** vit ailleurs : page
`/dashboard/account/settings` du dashboard, liste `RENEWED_INTERFACES`.

## Développement

```bash
cd frontend
export NODE_AUTH_TOKEN=$(gh auth token)   # paquets @open-ent sur GitHub Packages
node scripts/refresh-open-ent-lock.mjs    # évite un 409 sur les tags republiés
pnpm install
pnpm dev                                  # Vite sur :4201, proxy vers l'ENT local :8090
```

Autres commandes : `pnpm lint` (`tsc --noEmit`), `pnpm test` (vitest), `pnpm build`.

### Voir ses changements sur l'ENT local

Le launcher charge le module depuis un répertoire **explosé**, pas depuis le jar :

```bash
pnpm build
D=../../../starter/mods/fr.openent~exercizer~4.4.7-patched
rm -f $D/public/index-*.js $D/public/index-*.css
cp -r dist/public/. $D/public/
cp dist/index.html $D/view/exercizer-react.html
```

La vue React est **générée par Vite** : ses fichiers portent une empreinte de contenu, dont seul
le build connaît les noms. Elle ne vient donc pas de `view-src/`, et `build.sh` comme le CI la
copient après l'étape qui produit `view/` depuis `view-src/`.

## Organisation du code

- `api.ts` — client REST, un appel par endpoint, nommé comme le service AngularJS d'origine ;
- `types.ts` — le modèle tel que le serveur le renvoie (noms de colonnes conservés) ;
- `copies.ts`, `corrections.ts`, `grains.ts` — les **règles** (état d'une copie, ce que l'élève
  peut ouvrir, avancement d'une distribution, barème et numérotation d'un sujet), sans réseau ni
  composant, et couvertes par des tests ;
- `screens/` — un écran par route ; `features/` — morceaux réutilisés (`features/grains/` : un
  éditeur par type de grain) ; `components/` — fenêtres ; `hooks/` — l'enregistrement différé.

### Enregistrement

L'éditeur de sujet **n'a pas de bouton « Enregistrer »** : chaque grain part de lui-même peu
après la frappe (`hooks/useDebouncedSave.ts`), comme le faisait l'IHM AngularJS avec un flux rxjs
par grain. « Enregistrer et quitter » ne fait que chasser ce qui reste en attente. Un témoin dit
si quelque chose n'est pas encore parti, et ce qui est en vol au démontage est envoyé aussitôt.

Le barème du SUJET n'est jamais envoyé : le serveur le recalcule comme la somme des barèmes des
grains à chaque enregistrement de grain. Le total affiché dans le résumé n'est qu'un aperçu.

## Tests

- unitaires : `pnpm test` (`copies.test.ts`, `corrections.test.ts`) ;
- de bout en bout, depuis la racine du dépôt :
  ```bash
  npx playwright test tests/exercizer-react.spec.ts tests/exercizer-ui-switch.spec.ts \
    tests/exercizer-subject-editor.spec.ts --project=chromium
  ```
  Compte local : `amelie.martin` / `amelie.martin`. Les specs de bascule tournent **en série** :
  elles écrivent toutes la même préférence usager.

## Pièges rencontrés

- Le `Tabs` du socle appelle `onChange` **dès son montage** (`useEffect` sur `[activeTab]`, cf.
  `useTabs`), pas seulement sur un clic. Une barre d'onglets de NAVIGATION montée ailleurs que sur
  ses propres routes renvoie donc aussitôt l'usager sur le premier onglet — et aucun lien profond
  ne s'ouvre plus.
- `Card isSelectable` du socle pose une icône « ⋯ options » câblée sur `onSelect` : c'est un menu
  contextuel, pas une sélection. Pour cocher, mettre une vraie `Checkbox` dans la carte, au-dessus
  du bouton transparent qui couvre toute sa surface (`z-2` + `stopPropagation`).
- `scheduled_at` ET `grain_data` arrivent en **chaîne JSON** (colonnes texte) et doivent être
  désérialisés par le client.
- Un `Input`, un `TextArea` ou un `Label` du socle **lève une erreur** hors d'un `FormControl`
  (« Cannot be rendered outside the FormControl component ») : l'enveloppe n'est pas décorative,
  le champ ne se rend pas sans elle, et c'est tout l'écran qui tombe.
- La `Checkbox` du socle associe son intitulé de façon fiable ; un `<input type="checkbox">` dans
  un `<label>` était annoncé « on » par le lecteur d'écran.
- Les attributs `width`/`height` d'un `<svg>` ne suffisent pas dans un `.btn` : les règles du
  socle les emportent, la taille doit passer par le style en ligne.
- L'enregistrement **écarte les lignes de réponse vides** (QCM, association), comme le faisait
  l'ancienne IHM. L'éditeur complète donc la liste à l'affichage (`withEditableAnswers`) : sans
  cela, rouvrir un QCM à peine commencé n'afficherait plus aucune ligne.
- L'énoncé d'un grain de type 3 vit dans `custom_data.statement`. On en trouve en base posés à
  plat sur `grain_data` (imports, jeux d'essai) : la lecture est tolérante, l'écriture non.
- Le bootstrap `@open-ent` n'est **pas** bundlé : il est chargé au runtime par `index.html`, pour
  que le module suive le thème de l'établissement sans recompilation.
