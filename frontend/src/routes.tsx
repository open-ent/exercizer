import { LoadingScreen } from '@open-ent/react';
import { Suspense, lazy } from 'react';
import { Navigate, RouteObject, createHashRouter } from 'react-router-dom';

import { DashboardRedirect } from './screens/DashboardRedirect';
import { NotMigrated } from './screens/NotMigrated';
import { Root } from './screens/Root';
import { StudentDashboard } from './screens/StudentDashboard';
import { TeacherCorrections } from './screens/TeacherCorrections';
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
const PerformCopy = lazy(() => import('./screens/PerformCopy'));
const ViewCopy = lazy(() => import('./screens/ViewCopy'));
const CopyFinalScore = lazy(() => import('./screens/CopyFinalScore'));

const deferred = (element: JSX.Element) => (
  <Suspense fallback={<LoadingScreen position={false} />}>{element}</Suspense>
);

/**
 * Les chemins sont ceux de l'IHM AngularJS, à l'identique (cf. `public/ts/app.ts`) : un lien
 * copié dans l'une des deux interfaces doit rester valide dans l'autre, et les notifications
 * comme le « linker » du portail en fabriquent.
 *
 * Les écrans non encore portés tombent sur {@link NotMigrated}, qui renvoie l'usager vers
 * l'ancienne IHM EN CONSERVANT son chemin — plutôt que de le laisser devant un écran vide.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      // `/dashboard` seul : c'est le droit de création qui décide de la vue servie.
      { path: 'dashboard', element: <DashboardRedirect /> },
      { path: 'dashboard/student', element: <StudentDashboard /> },
      { path: 'dashboard/teacher', element: <TeacherSubjects /> },
      { path: 'dashboard/teacher/correction', element: <TeacherCorrections /> },
      { path: 'dashboard/teacher/correction/:subjectScheduledId', element: <TeacherCorrections /> },

      // ── Édition d'un sujet ────────────────────────────────────────────────
      { path: 'subject/edit/:subjectId/', element: deferred(<SubjectEditor />) },
      {
        path: 'subject/edit/simple/:subjectId/',
        element: deferred(<SimpleSubjectEditor mode="edit" />),
      },
      // `create/simple` existe avec et sans dossier de destination.
      {
        path: 'subject/create/simple/',
        element: deferred(<SimpleSubjectEditor mode="create" />),
      },
      {
        path: 'subject/create/simple/:folderId',
        element: deferred(<SimpleSubjectEditor mode="create" />),
      },

      // ── Parcours de l'élève : répondre, puis relire sa copie ──────────────
      //
      // ⚠ L'ordre compte peu (React Router classe par spécificité), mais la DISTINCTION entre
      // ces trois chemins, oui : `view/final-score/:id/` est plus précis que `view/:id/`, et
      // `view/:subjectId/:copyId/` (la correction vue par l'enseignant) a un segment de plus.
      { path: 'subject/copy/perform/:subjectCopyId/', element: deferred(<PerformCopy />) },
      { path: 'subject/copy/view/final-score/:subjectCopyId/', element: deferred(<CopyFinalScore />) },
      { path: 'subject/copy/view/:subjectCopyId/', element: deferred(<ViewCopy />) },

      // ── Écrans restant à porter ───────────────────────────────────────────
      // La correction d'une copie par l'enseignant, la passation d'un sujet « simple » (dépôt
      // d'un fichier) et l'aperçu d'un sujet gardent deux segments ou un préfixe propre : ils
      // sont donc bien distingués des routes ci-dessus.
      { path: 'subject/copy/view/:subjectId/:subjectCopyId/', element: <NotMigrated /> },
      { path: 'subject/copy/perform/simple/:subjectCopyId/', element: <NotMigrated /> },
      { path: 'subject/copy/preview/*', element: <NotMigrated /> },
      { path: 'dashboard/teacher/pilotage/:subjectScheduledId', element: <NotMigrated /> },
      { path: 'dashboard/teacher/archive', element: <NotMigrated /> },
      { path: 'dashboard/teacher/archive/*', element: <NotMigrated /> },
      { path: 'subject/*', element: <NotMigrated /> },
      { path: 'subject-sequence/*', element: <NotMigrated /> },
      { path: 'subject-sequence-scheduled/*', element: <NotMigrated /> },
      { path: 'linker/:subjectScheduledId', element: <NotMigrated /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
];

// Hash router : l'app est servie sous `/exercizer` (route serveur unique `@Get("")`), le routage se
// fait dans le fragment (`/exercizer#/…`). Évite les 404 sur accès direct / rechargement (F5) des
// sous-routes, que le `createBrowserRouter` provoquerait faute de fallback SPA côté backend —
// et c'est déjà la convention de l'IHM AngularJS, dont on reprend les chemins.
export const router = createHashRouter(routes);
