import { LoadingScreen } from '@open-ent/react';
import { Suspense, lazy } from 'react';
import { Navigate, RouteObject, createHashRouter } from 'react-router-dom';

import { DashboardRedirect } from './screens/DashboardRedirect';
import { Root, TeacherOnly } from './screens/Root';
import { StudentDashboard } from './screens/StudentDashboard';
import { TeacherSubjects } from './screens/TeacherSubjects';

/**
 * Les éditeurs embarquent l'éditeur riche du socle (tiptap, ~800 ko) : on diffère leur
 * chargement pour garder l'ouverture des tableaux de bord légère — ce sont eux que tout le monde
 * voit, l'édition d'un sujet ne concernant que les enseignants, et seulement par moments.
 *
 * ⚠ La frontière `Suspense` est posée ICI, au niveau de la route, hors de toute fenêtre modale :
 * suspendre à l'intérieur d'une modale du socle, animée par react-spring, lève une erreur
 * React #321 et la fenêtre n'est jamais rendue.
 */
const SubjectEditor = lazy(() => import('./screens/SubjectEditor'));
const SimpleSubjectEditor = lazy(() => import('./screens/SimpleSubjectEditor'));
const GenerateSubject = lazy(() => import('./screens/GenerateSubject'));
const PerformCopy = lazy(() => import('./screens/PerformCopy'));
const PerformSimpleCopy = lazy(() => import('./screens/PerformSimpleCopy'));
const ViewCopy = lazy(() => import('./screens/ViewCopy'));
const CopyFinalScore = lazy(() => import('./screens/CopyFinalScore'));
const CorrectCopy = lazy(() => import('./screens/CorrectCopy'));
// Les corrections embarquent elles aussi l'éditeur riche (relance personnalisée) : différées.
const TeacherCorrections = lazy(() => import('./screens/TeacherCorrections'));
const Archives = lazy(() => import('./screens/Archives'));
const Catalog = lazy(() => import('./screens/Catalog'));
const Pilotage = lazy(() => import('./screens/Pilotage'));
const PrintSubject = lazy(() => import('./screens/PrintSubject'));
const SubjectSequenceScheduled = lazy(() => import('./screens/SubjectSequenceScheduled'));

// Plusieurs écrans par fichier : `lazy` attend un export par défaut, on le lui fabrique.
const SubjectSequenceList = lazy(() => import('./screens/SubjectSequences'));
const SubjectSequenceEditor = lazy(() =>
  import('./screens/SubjectSequences').then((module) => ({ default: module.SubjectSequenceEditor })),
);
const PreviewPerformCopy = lazy(() => import('./screens/PreviewCopy'));
const PreviewViewCopy = lazy(() =>
  import('./screens/PreviewCopy').then((module) => ({ default: module.PreviewViewCopy })),
);
const PreviewSimpleSubject = lazy(() =>
  import('./screens/PreviewCopy').then((module) => ({ default: module.PreviewSimpleSubject })),
);
const Linker = lazy(() =>
  import('./screens/PerformSimpleCopy').then((module) => ({ default: module.Linker })),
);

const deferred = (element: JSX.Element) => (
  <Suspense fallback={<LoadingScreen position={false} />}>{element}</Suspense>
);

/** Un écran réservé à qui a le droit de créer des sujets — l'élève n'y voit qu'un refus. */
const teacher = (element: JSX.Element) => <TeacherOnly>{deferred(element)}</TeacherOnly>;

/**
 * Les chemins sont ceux de l'IHM AngularJS, à l'identique (cf. `public/ts/app.ts`) : un lien
 * copié dans l'une des deux interfaces doit rester valide dans l'autre, et les notifications
 * comme le « linker » du portail en fabriquent.
 */
export const routes: RouteObject[] = [
  // ── Impression ────────────────────────────────────────────────────────────
  // HORS du gabarit commun : la page s'imprime, elle ne doit porter ni bandeau ni navigation.
  { path: '/subject/print/:subjectId', element: deferred(<PrintSubject />) },
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      // `/dashboard` seul : c'est le droit de création qui décide de la vue servie.
      { path: 'dashboard', element: <DashboardRedirect /> },
      { path: 'dashboard/student', element: <StudentDashboard /> },
      { path: 'dashboard/teacher', element: <TeacherSubjects /> },
      { path: 'dashboard/teacher/correction', element: teacher(<TeacherCorrections />) },
      {
        path: 'dashboard/teacher/correction/:subjectScheduledId',
        element: teacher(<TeacherCorrections />),
      },
      // Archives : la liste, les copies d'une distribution, puis une copie.
      { path: 'dashboard/teacher/catalog', element: teacher(<Catalog />) },
      { path: 'dashboard/teacher/archive', element: teacher(<Archives />) },
      { path: 'dashboard/teacher/archive/:subjectScheduledId', element: teacher(<Archives />) },
      {
        path: 'dashboard/teacher/archive/:subjectScheduledId/:subjectCopyId',
        element: teacher(<Archives />),
      },
      // Pilotage en direct d'une séance.
      { path: 'dashboard/teacher/pilotage/:subjectScheduledId', element: teacher(<Pilotage />) },

      // ── Édition d'un sujet ────────────────────────────────────────────────
      { path: 'subject/edit/:subjectId/', element: teacher(<SubjectEditor />) },
      {
        path: 'subject/edit/simple/:subjectId/',
        element: teacher(<SimpleSubjectEditor mode="edit" />),
      },
      // Un sujet simple qu'on n'a qu'en lecture : sa consigne et ses corrigés, sans rien à saisir.
      {
        path: 'subject/edit/simple/preview/:subjectPreviewId/',
        element: teacher(<PreviewSimpleSubject />),
      },
      // `create/simple` existe avec et sans dossier de destination.
      {
        path: 'subject/create/simple/',
        element: teacher(<SimpleSubjectEditor mode="create" />),
      },
      {
        path: 'subject/create/simple/:folderId',
        element: teacher(<SimpleSubjectEditor mode="create" />),
      },
      { path: 'subject/generate', element: teacher(<GenerateSubject />) },

      // ── Parcours ──────────────────────────────────────────────────────────
      { path: 'subject-sequence/list', element: teacher(<SubjectSequenceList />) },
      {
        path: 'subject-sequence/edit/:subjectSequenceId/',
        element: teacher(<SubjectSequenceEditor />),
      },
      // Ouvert aux deux publics : l'élève y navigue, l'enseignant propriétaire y suit sa classe.
      {
        path: 'subject-sequence-scheduled/:subjectSequenceScheduledId/',
        element: deferred(<SubjectSequenceScheduled />),
      },

      // ── Aperçus de l'enseignant ───────────────────────────────────────────
      {
        path: 'subject/copy/preview/perform/:subjectId/',
        element: teacher(<PreviewPerformCopy />),
      },
      { path: 'subject/copy/view/preview/:subjectId/', element: teacher(<PreviewViewCopy />) },

      // ── Parcours de l'élève : répondre, puis relire sa copie ──────────────
      //
      // ⚠ L'ordre compte peu (React Router classe par spécificité), mais la DISTINCTION entre
      // ces chemins, oui : `perform/simple/:id/` et `view/final-score/:id/` sont plus précis que
      // `perform/:id/` et `view/:id/`, et `view/:subjectId/:copyId/` (la correction vue par
      // l'enseignant) a un segment de plus.
      { path: 'subject/copy/perform/simple/:subjectCopyId/', element: deferred(<PerformSimpleCopy />) },
      { path: 'subject/copy/perform/:subjectCopyId/', element: deferred(<PerformCopy />) },
      { path: 'subject/copy/view/final-score/:subjectCopyId/', element: deferred(<CopyFinalScore />) },
      { path: 'subject/copy/view/:subjectCopyId/', element: deferred(<ViewCopy />) },
      // La correction par l'enseignant : DEUX segments, donc distincte de la relecture de
      // l'élève. C'est le sujet qui précède la copie, comme dans l'ancienne IHM.
      {
        path: 'subject/copy/view/:subjectId/:subjectCopyId/',
        element: teacher(<CorrectCopy />),
      },

      // Liens du « linker » du portail : ils ne portent que la distribution.
      { path: 'linker/:subjectScheduledId', element: deferred(<Linker />) },

      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
];

// Hash router : l'app est servie sous `/exercizer` (route serveur unique `@Get("")`), le routage se
// fait dans le fragment (`/exercizer#/…`). Évite les 404 sur accès direct / rechargement (F5) des
// sous-routes, que le `createBrowserRouter` provoquerait faute de fallback SPA côté backend —
// et c'est déjà la convention de l'IHM AngularJS, dont on reprend les chemins.
export const router = createHashRouter(routes);
