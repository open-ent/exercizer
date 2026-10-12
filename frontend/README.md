# IHM React d'Exercizer

Nouvelle interface du module « Exercices et évaluations », qui remplace l'IHM AngularJS de
`src/main/resources/public/ts/`. **Tous les écrans de l'ancienne interface y sont portés** ; les
deux interfaces restent servies côte à côte, et c'est l'usager (ou la plateforme) qui décide
laquelle il voit — le temps que la bascule soit décidée, cf. « Arbitrage » ci-dessous.

## Les écrans

| Écran | Route |
| --- | --- |
| Tableau de bord apprenant (à faire / terminés / entraînement, bandeau « Parcours ») | `#/dashboard/student` |
| Mes sujets — dossiers, liste, recherche, actions selon le droit détenu sur chaque sujet | `#/dashboard/teacher` |
| Nouveau sujet, propriétés (titre, description, image), import Moodle, partage, export Moodle | fenêtres de `#/dashboard/teacher` |
| Mes corrections — distributions, puis copies d'une distribution (interactive ou « simple ») | `#/dashboard/teacher/correction[/:id]` |
| Statistiques d'une distribution et leurs exports CSV | vue de `#/dashboard/teacher/correction/:id` |
| Pilotage en direct d'une séance | `#/dashboard/teacher/pilotage/:id` |
| Archives — distributions, copies, copie | `#/dashboard/teacher/archive[/:id[/:copyId]]` |
| Édition d'un sujet interactif, ressources externes, réutilisation de questions | `#/subject/edit/:id/` |
| Sujet « simple » : création, titre, description, corrigés | `#/subject/create/simple/`, `#/subject/edit/simple/:id/` |
| Création assistée (génération à partir d'une image) | `#/subject/generate` |
| Aperçu de la passation, puis de la correction | `#/subject/copy/preview/perform/:id/`, `#/subject/copy/view/preview/:id/` |
| Impression d'un sujet, avec ou sans les réponses | `#/subject/print/:id?responses=true|false` |
| Parcours — liste, édition, affectation | `#/subject-sequence/list`, `#/subject-sequence/edit/:id/` |
| Parcours distribué — navigation de l'élève, suivi de la classe | `#/subject-sequence-scheduled/:id/` |
| Passation d'une copie, d'un sujet « simple » (dépôt de fichiers) | `#/subject/copy/perform/:id/`, `#/subject/copy/perform/simple/:id/` |
| Consultation d'une copie corrigée, score d'un entraînement | `#/subject/copy/view/:id/`, `#/subject/copy/view/final-score/:id/` |
| Correction d'une copie par l'enseignant | `#/subject/copy/view/:subjectId/:copyId/` |
| Liens du « linker » du portail | `#/linker/:subjectScheduledId` |

Les chemins sont ceux de l'IHM AngularJS, à l'identique : un lien de notification, du linker ou
copié dans l'une des deux interfaces s'ouvre dans l'autre.

### Types de grains

Les dix types s'éditent, se répondent, se relisent et s'impriment : énoncé (3), réponse simple
(4), réponse ouverte (5), réponses multiples (6), QCM (7), association (8), mise en ordre (9),
**texte à trous (10)**, **zones de texte (11)** et **zones d'images (12)** sur une image de fond.

### Ce qui n'est délibérément pas repris

- **Publier dans la bibliothèque** : l'ancienne IHM masquait déjà l'action (`display: () => false`
  dans le « toaster »), la Bibliothèque de ressources n'étant pas provisionnée. L'onglet
  « Bibliothèque » du tableau de bord, lui, est repris : il ouvre la bibliothèque EXTERNE quand la
  plateforme en déclare une (`libraryHost` de `/exercizer/conf/public`).
- **L'onglet interne `/dashboard/teacher/library`** : aucune route de l'ancienne IHM n'y menait.
- **« Copier » une sélection** (WB-1205) : retiré de l'ancienne barre d'actions, non repris.
- **Créer un sujet « simple »** depuis « Nouveau sujet » : comme dans l'ancienne IHM, la carte
  renvoie vers l'application Casier. Les routes `subject/create/simple/` existent toujours, pour
  les liens entrants.
- **Les téléchargements d'un sujet simple ARCHIVÉ** fichier par fichier : les routes
  `…/corrected/download/…` qu'appelait l'ancienne IHM n'existent plus côté serveur. Les rendus
  d'une copie archivée se téléchargent en archive (`/subject-copy/simple/downloads`).

### Écarts assumés avec l'ancienne IHM

- **Glisser-déposer** : remplacé partout par une action au clavier comme à la souris — « Déplacer »
  pour ranger un sujet, « Ajouter » pour reprendre une question d'un autre sujet, une liste
  déroulante des étiquettes encore libres pour un texte à trous ou des zones de texte en mode
  « glisser-déposer ». Les zones posées sur une image se déplacent à la souris, au doigt ET aux
  flèches du clavier ; les vignettes d'une zone d'images se glissent ou se cliquent.
- **Horloge du poste** : l'ancienne IHM exigeait la même heure ronde que le serveur et refusait
  donc l'accès quelques instants à chaque changement d'heure ; on tolère moins d'une heure d'écart.
- **Copie archivée** : elle se retrouve par son identifiant, le lien tient au rechargement (elle
  vivait dans un service en mémoire).
- **Tri des tableaux de copies** : les copies sans valeur vont toujours en fin de liste.

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
- les **règles**, sans réseau ni composant, chacune avec ses tests :
  `copies.ts` (état d'une copie, ce que l'élève peut ouvrir), `corrections.ts` (avancement d'une
  distribution, tri), `grains.ts` (barème, numérotation), `correction.ts` (correction
  automatique), `schedule.ts` (distribution), `sections.ts` (parties), `stats.ts` (matrice élève ×
  question, exports CSV), `zones.ts` (grains à zones : modèle, HTML du texte à trous, géométrie),
  `pilotage.ts` (canal, temps restant, événements), `moodleImport.ts` (lecture d'un fichier
  Moodle XML), `rights.ts` (droits de workflow, droit détenu sur un sujet) ;
- `latinise.ts` — table de translittération **recopiée telle quelle** depuis l'IHM AngularJS :
  elle sert à comparer les réponses, donc à calculer des notes, et ne doit pas diverger ;
- `screens/` — un écran par route ; `features/` — morceaux réutilisés (`features/grains/` : un
  éditeur par type de grain ; `features/zones/` : les trois types à zones) ; `components/` —
  fenêtres ; `hooks/` — l'enregistrement différé.

### Les grains à zones

Un **texte à trous** est un HTML dans lequel l'ancien éditeur insérait des balises
`<fill-zone zone-id="…">`. `features/zones/FillZoneExtension.ts` les déclare à l'éditeur du socle
(tiptap) : sans elle, il les écarterait comme inconnues en ouvrant le grain, et l'enregistrement
suivant effacerait toutes les zones. La balise est relue et réécrite TELLE QUELLE, pour que les
deux interfaces continuent de s'échanger les sujets.

À l'affichage (passation, relecture, impression) le texte est rendu HORS de l'éditeur — il faut y
glisser des champs. `zones.ts#fillTextSlots` l'assainit et remplace chaque zone par un
emplacement, où `FillTextHtml` monte un composant React par portail.

Les positions des **zones posées sur une image** sont enregistrées dans un repère de 760 × 600,
coin haut-gauche du bloc. `zones.ts#toScreen` / `toModel` convertissent par le CENTRE du bloc,
comme l'original : le bloc garde sa taille quand l'image rétrécit, et convertir son coin le
décalerait.

⚠ À la distribution, la copie d'un grain à zones reprend TOUT le grain — texte, image,
propositions — avec les réponses effacées (`zones.ts#zoneCopyData`). Ne recopier que les zones,
comme le faisait une première version de ce portage, produit des copies sans texte ni image.

### Le pilotage en direct

L'écran de l'enseignant affiche TOUJOURS l'état que le serveur consolide (`GET …/pilotage`) : le
WebSocket ne sert qu'à savoir quand le redemander, et un sondage toutes les vingt secondes prend
le relais s'il ne s'ouvre pas. L'élève, lui, n'a pas le droit de demander cet état : le sien est
lu sur sa distribution et sa copie, puis tenu à jour par les événements (`pilotage.ts`).

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

## Parties d'un sujet

Un sujet interactif peut se découper en **parties** (`subject_section`, sql/039 — sur le modèle
Chapitre → Activités de LearnHouse). Règles pures dans `sections.ts` :

- l'éditeur lit le sujet comme des groupes (hors partie en tête, puis chaque partie) et n'ouvre
  qu'une partie à la fois (`?section=` dans l'URL) ; toute modification de STRUCTURE part d'un bloc
  par `PUT /subject/:id/structure`, le contenu reste enregistré au fil de la frappe ;
- `grain.order_by` reste un rang global et continu : l'IHM AngularJS, qui ignore les parties, lit une
  séquence cohérente. Le rang d'un grain en attente d'enregistrement est relu dans le cache au moment
  de l'envoi, pour ne pas défaire un déplacement ;
- la passation regroupe les copies de grains par partie (`POST /grains-copy/sections`) et pagine par
  question ou par partie selon `display_mode` ; consultation et correction affichent un sous-total
  par partie (`features/copies/SectionedReview.tsx`).

## Tests

- unitaires : `pnpm test` — toutes les règles listées plus haut ;
- de bout en bout, depuis la racine du dépôt :
  ```bash
  npx playwright test tests/exercizer-react.spec.ts tests/exercizer-ui-switch.spec.ts \
    tests/exercizer-subject-editor.spec.ts tests/exercizer-copy.spec.ts \
    tests/exercizer-schedule.spec.ts tests/exercizer-sections.spec.ts --project=chromium
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
