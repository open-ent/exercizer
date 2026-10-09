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
| Passation d'une copie par l'élève | `#/subject/copy/perform/:id/` | porté, sauf les 3 types « à zones » |
| Consultation d'une copie corrigée | `#/subject/copy/view/:id/` | porté |
| Score d'une copie d'entraînement | `#/subject/copy/view/final-score/:id/` | porté |
| Correction d'une copie par l'enseignant | `#/subject/copy/view/:subjectId/:copyId/` | porté |
| Distribution d'un sujet (type, destinataires, options) | fenêtre de `#/subject/edit/:id/` | porté |

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

Les mêmes sept types se répondent et se relisent côté élève. La **correction automatique** est
portée pour tous, y compris les trois types « à zones » : une copie faite dans l'ancienne
interface se relit donc entièrement ici, même si elle ne s'y répond pas.

Un grain d'un type non porté reste À SA PLACE, garde son titre, son barème et son énoncé, et
n'est **jamais réenregistré** depuis la nouvelle IHM : aucune donnée ne peut être abîmée par un
passage ici. L'écran le dit et propose d'ouvrir le sujet dans la version précédente.

## Ce qui reste à porter

Dans l'ordre où cela bloque le plus :

1. **Les trois types « à zones »** (10, 11, 12). Leur édition reposait sur l'éditeur riche
   d'AngularJS, dans lequel l'enseignant insérait des balises `<fill-zone>` via une option de
   barre d'outils, et sur un placement libre de zones au-dessus d'une image de fond. Les porter
   demande une extension tiptap dédiée et un composant de placement : c'est un chantier à part.
2. **Passation d'un sujet « simple »** (dépôt d'un fichier par l'élève) et **pilotage en direct**
   (WebSocket `real-time`, port 8106).
3. **Partage** d'un sujet entre enseignants (le panneau de partage du socle).
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
- `copies.ts`, `corrections.ts`, `grains.ts`, `correction.ts`, `schedule.ts` — les **règles**
  (état d'une copie, ce que l'élève peut ouvrir, avancement d'une distribution, barème et
  numérotation d'un sujet, correction automatique, distribution), sans réseau ni composant, et
  couvertes par des tests ;
- `latinise.ts` — table de translittération **recopiée telle quelle** depuis l'IHM AngularJS :
  elle sert à comparer les réponses, donc à calculer des notes, et ne doit pas diverger ;
- `screens/` — un écran par route ; `features/` — morceaux réutilisés (`features/grains/` : un
  éditeur par type de grain) ; `components/` — fenêtres ; `hooks/` — l'enregistrement différé.

### La correction automatique est calculée par le CLIENT

Ce n'est pas un choix de ce portage : le module fonctionne ainsi. L'écran de consultation compare
la copie au grain DISTRIBUÉ et en déduit le score (`correction.ts`, porté fonction par fonction
depuis `QcmService`, `SimpleAnswerService`, etc.).

Mais **rien n'est enregistré depuis l'écran de l'élève** : l'IHM AngularJS ne persiste depuis la
consultation que lorsque c'est l'ENSEIGNANT qui regarde, et le serveur refuse de toute façon
toute écriture sur une copie rendue par la route de l'élève (`PUT /grain-copy` →
`exercizer.pilotage.copy.submitted`, 400).

L'écran de **correction**, lui, écrit — par `PUT /grain-copy/correct`, la seule route acceptée sur
une copie rendue. Il y enregistre le score automatique qu'il vient de calculer, puis la note et le
commentaire de l'enseignant. La note finale d'une question non saisie **vaut son score
automatique** (`correction.ts#copyScores`) : une copie s'ouvre déjà notée, et corriger consiste à
amender. Et la COPIE est réenregistrée après chaque note de question, sans quoi la liste de
correction continuerait d'afficher l'ancien total.

⚠ `GET /grains-scheduled/:id` porte les RÉPONSES ATTENDUES. Seule la consultation d'une copie
rendue le demande — jamais la passation, où elles se retrouveraient dans le navigateur de l'élève.

### La copie initiale est préparée par le CLIENT

Distribuer un sujet n'est pas qu'un formulaire. `POST /schedule-subject/:id` attend, à côté des
dates et des destinataires, un `grainsCustomCopyData` : **la copie vierge de chaque question**,
déjà fabriquée par le navigateur (`GrainCopyService#createGrainCopyCustomList`, porté dans
`schedule.ts`). C'est là que se joue l'essentiel :

- un QCM et des réponses multiples partent avec leurs seuls **textes** — pas de `isChecked`,
  sinon le corrigé voyagerait jusque dans la copie de l'élève ;
- une **mise en ordre** part brouillée, et une **association** part avec ses étiquettes de droite
  mélangées : sans cela, l'exercice serait déjà résolu à l'ouverture ;
- le tirage est fait **une seule fois**, pour toute la distribution : tous les destinataires
  reçoivent donc le même ordre. C'est le comportement de l'ancienne IHM, à la lettre.

La règle des **destinataires** n'est pas celle qu'on croit (`schedule.ts#buildScheduledAt`) : le
serveur résout lui-même les groupes, aussi `userList` ne contient que les personnes choisies
nominativement. Les membres d'un groupe choisi n'y figurent jamais — ils ne servent qu'à remplir
`exclude`, qui est le seul moyen de distribuer à une classe « sauf untel ».

Une distribution d'**entraînement** n'a pas d'échéance : ses bornes partent aux extrêmes de
l'epoch, et c'est ce qui la distingue en base.

### Enregistrement

L'éditeur de sujet **n'a pas de bouton « Enregistrer »** : chaque grain part de lui-même peu
après la frappe (`hooks/useDebouncedSave.ts`), comme le faisait l'IHM AngularJS avec un flux rxjs
par grain. « Enregistrer et quitter » ne fait que chasser ce qui reste en attente. Un témoin dit
si quelque chose n'est pas encore parti, et ce qui est en vol au démontage est envoyé aussitôt.

Le barème du SUJET n'est jamais envoyé : le serveur le recalcule comme la somme des barèmes des
grains à chaque enregistrement de grain. Le total affiché dans le résumé n'est qu'un aperçu.

## Tests

- unitaires : `pnpm test` — `copies`, `corrections`, `grains`, `correction`, `schedule` ;
- de bout en bout, depuis la racine du dépôt :
  ```bash
  npx playwright test tests/exercizer-react.spec.ts tests/exercizer-ui-switch.spec.ts \
    tests/exercizer-subject-editor.spec.ts tests/exercizer-copy.spec.ts \
    tests/exercizer-schedule.spec.ts --project=chromium
  ```
  Comptes locaux : `amelie.martin` / `amelie.martin` (enseignante) et `lea.bernard` /
  `lea.bernard` (élève de sa classe). Les specs de bascule tournent **en série** : elles écrivent
  toutes la même préférence usager. Et plusieurs specs distribuent des sujets pour le même
  enseignant : aucune ne doit cliquer une vignette qu'une autre peut faire disparaître entre
  l'appel d'API et le clic.

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
  plat sur `grain_data` (imports, jeux d'essai) : la lecture est tolérante, l'écriture non. Dans
  une COPIE, le serveur le range encore ailleurs — `grain_copy_data.custom_data` — et le titre
  peut n'être que là ; `api.ts#parseGrainCopies` remet les deux en place à la lecture.
- `grain_copy_data` doit partir **sérialisé en chaîne** sur `PUT /grain-copy` : envoyé en objet,
  le serveur ne le range pas.
- `GET /subject-copy/check/no-corrected/:id` répond `{"result": true}`, et non un booléen nu.
  Comparée telle quelle, la réponse vaut toujours « non » : l'élève lisait « votre copie est en
  cours de correction » sur une copie parfaitement ouverte, et ne pouvait plus la rendre.
- Une note en cours de frappe est encore une **chaîne** : tout calcul qui la touche doit passer
  par `sanitizeScore`, jamais par `Number` — « 1,5 » donnerait `NaN`, donc un total de copie à 0,
  en silence, jusque sous les yeux de l'élève.
- `POST /schedule-subject/:id` est validé contre un schéma JSON en `additionalProperties: false` :
  un champ de plus fait échouer la requête en 400, les destinataires prennent `_id` (pas `id`),
  et `grainsCustomCopyData` est obligatoire.
- Dans un sujet, la solution d'une **mise en ordre** est rangée dans `correct_answer_list` comme
  celle des autres types — c'est `order_by` qui y porte le rang attendu. Un jeu d'essai qui
  inventerait `ordered_answer_list` passerait l'enregistrement mais rendrait le sujet
  indistribuable, avec pour seul indice « des questions sans réponses renseignées subsistent ».
- Le bootstrap `@open-ent` n'est **pas** bundlé : il est chargé au runtime par `index.html`, pour
  que le module suive le thème de l'établissement sans recompilation.
