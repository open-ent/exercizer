import {
  AppHeader,
  Breadcrumb,
  Button,
  LoadingScreen,
  Layout,
  Tabs,
  useEdificeClient,
  useHasWorkflow,
} from '@open-ent/react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { UiSwitchBanner } from '../features/UiSwitchBanner';
import { WORKFLOW } from '../rights';

/** Les deux sections de l'enseignant, et la route de chacune. */
const TEACHER_SECTIONS = {
  mySubjects: '/dashboard/teacher',
  correction: '/dashboard/teacher/correction',
} as const;
type TeacherSection = keyof typeof TEACHER_SECTIONS;

/**
 * Gabarit commun : bandeau ENT du socle, bascule création / apprenant, et sections de l'enseignant.
 *
 * L'IHM AngularJS posait ces onglets DANS chaque écran (`dashboard-teacher-tab`), ce qui les
 * faisait disparaître et revenir à chaque navigation. Ici ils vivent au-dessus de l'`Outlet` :
 * la barre reste en place, et c'est la route qui dit lequel est actif.
 */
export function Root() {
  const { t } = useTranslation(['exercizer', 'common']);
  const { init, currentApp } = useEdificeClient();
  const navigate = useNavigate();
  const location = useLocation();

  // Le droit de CRÉER un sujet, et non le profil ENT, distingue l'enseignant de l'élève — c'est
  // déjà lui qui gardait le bouton de bascule de l'ancienne IHM (`workflow="exercizer.create"`).
  const canCreate = useHasWorkflow(WORKFLOW.create) as boolean | undefined;

  if (!init) return <LoadingScreen position={false} />;

  const isStudentView = location.pathname.startsWith('/dashboard/student');
  const onTeacherDashboard = location.pathname.startsWith('/dashboard/teacher');
  const section: TeacherSection = location.pathname.startsWith(TEACHER_SECTIONS.correction)
    ? 'correction'
    : 'mySubjects';

  return (
    <Layout>
      <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>

      {canCreate && (
        <div className="d-flex justify-content-end mb-8">
          <Button
            color="primary"
            variant="outline"
            onClick={() => navigate(isStudentView ? '/dashboard/teacher' : '/dashboard/student')}
          >
            {t(isStudentView ? 'exercizer.switch.instructer' : 'exercizer.switch.learner')}
          </Button>
        </div>
      )}

      {/*
        Barre de sections, affichée UNIQUEMENT sur les routes du tableau de bord enseignant.
        Deux raisons, et la seconde est un piège coûteux :
         - une barre de sections n'a pas de sens sur un écran qui n'en fait pas partie (édition
           d'un sujet, passation d'une copie, écran non encore porté) ;
         - le `Tabs` du socle appelle `onChange` DÈS SON MONTAGE (`useEffect` sur `[activeTab]`,
           cf. `useTabs`), pas seulement sur un clic. Monté ailleurs, il renvoyait donc aussitôt
           l'usager sur « Mes sujets » : un lien profond vers n'importe quel autre écran ne
           s'ouvrait jamais.
      */}
      {canCreate && onTeacherDashboard && (
        <Tabs
          // Remontée quand la section change : l'onglet actif est un état INTERNE au composant,
          // seulement amorcé par `defaultId`. Sans cette clé, revenir en arrière dans le
          // navigateur laisserait l'onglet précédent surligné.
          key={section}
          items={[
            {
              id: 'mySubjects',
              icon: null,
              label: t('exercizer.dashboard.instructer.tab1'),
              content: null,
            },
            {
              id: 'correction',
              icon: null,
              label: t('exercizer.dashboard.instructer.tab2'),
              content: null,
            },
          ]}
          defaultId={section}
          onChange={(item) => {
            // L'appel du montage désigne la section COURANTE : on le laisse passer sans rien
            // faire. Comparer les sections, et non les chemins : depuis la correction d'une
            // distribution précise (`…/correction/42`), le chemin commence toujours par celui de
            // « Mes sujets », et un test par préfixe rendrait cet onglet inerte.
            if (item.id === section) return;
            const target = TEACHER_SECTIONS[item.id as TeacherSection];
            if (target) navigate(target);
          }}
        >
          {/* Seule la barre d'onglets est rendue ici : le contenu vient de l'`Outlet`, les
              sections étant de la NAVIGATION (chacune a sa route) et non un panneau. */}
          {() => <Tabs.List />}
        </Tabs>
      )}

      <Outlet />

      <UiSwitchBanner />
    </Layout>
  );
}

export default Root;
