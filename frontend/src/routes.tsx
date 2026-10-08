import { Navigate, RouteObject, createHashRouter } from 'react-router-dom';

import { DashboardRedirect } from './screens/DashboardRedirect';
import { NotMigrated } from './screens/NotMigrated';
import { Root } from './screens/Root';
import { StudentDashboard } from './screens/StudentDashboard';
import { TeacherCorrections } from './screens/TeacherCorrections';
import { TeacherSubjects } from './screens/TeacherSubjects';

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

      // ── Écrans restant à porter ───────────────────────────────────────────
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
