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
import { useQuery } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getPublicConf, getServerNow } from '../api';
import { UiSwitchBanner } from '../features/UiSwitchBanner';
import { WORKFLOW } from '../rights';
import { Unauthorized } from '../components/Unauthorized';

/**
 * L'horloge du poste est-elle à l'heure ? Le module décide de ce qu'un élève peut ouvrir en
 * comparant des échéances à l'heure du navigateur : une horloge déréglée ouvrirait un sujet avant
 * l'heure, ou le fermerait trop tôt. La plateforme peut désactiver ce contrôle.
 *
 * L'ancienne IHM exigeait la MÊME heure ronde des deux côtés, et refusait donc l'accès quelques
 * instants à chaque changement d'heure ; on tolère ici moins d'une heure d'écart. Une réponse
 * illisible ne bloque personne.
 */
export function isClockReliable(serverDate: string | undefined, now: number = Date.now()): boolean {
  if (!serverDate) return true;
  const server = new Date(serverDate).getTime();
  if (Number.isNaN(server)) return true;
  return Math.abs(server - now) < 60 * 60 * 1000;
}

function useClockCheck(): boolean {
  const confQuery = useQuery({
    queryKey: ['exercizer', 'conf'],
    queryFn: getPublicConf,
    staleTime: Infinity,
  });
  const skipped = confQuery.data?.['disable-timezone-check'] === true;
  const nowQuery = useQuery({
    queryKey: ['exercizer', 'now'],
    queryFn: getServerNow,
    enabled: confQuery.isSuccess && !skipped,
    staleTime: Infinity,
  });
  return skipped || nowQuery.isError || isClockReliable(nowQuery.data?.date);
}

/**
 * Garde des écrans de l'enseignant : sans le droit de créer des sujets, on n'y voit qu'un refus —
 * l'équivalent du gabarit `401-exercizer`. Le serveur reste seul juge ; ce garde-fou évite
 * seulement d'afficher un écran dont toutes les requêtes échoueraient.
 */
export function TeacherOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const canCreate = useHasWorkflow(WORKFLOW.create) as boolean | undefined;
  if (canCreate === undefined) return <LoadingScreen position={false} />;
  return canCreate ? <>{children}</> : <Unauthorized text={t('exercizer.unauthorized')} />;
}

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
  const canPublish = useHasWorkflow(WORKFLOW.publish) as boolean | undefined;
  const clockReliable = useClockCheck();
  const confQuery = useQuery({
    queryKey: ['exercizer', 'conf'],
    queryFn: getPublicConf,
    staleTime: Infinity,
  });

  if (!init) return <LoadingScreen position={false} />;

  const isStudentView = location.pathname.startsWith('/dashboard/student');
  const onCorrection = location.pathname.startsWith(TEACHER_SECTIONS.correction);
  // Les sections ne coiffent que leurs deux écrans : les archives et le pilotage ont leur propre
  // fil d'Ariane, et y laisser la barre surlignerait « Mes sujets » à tort.
  const onTeacherDashboard =
    onCorrection || /^\/dashboard\/teacher\/?$/.test(location.pathname);
  const section: TeacherSection = onCorrection ? 'correction' : 'mySubjects';
  // La bibliothèque est un service EXTERNE à l'ENT, que la plateforme déclare ou non.
  const libraryHost = confQuery.data?.libraryHost;

  return (
    <Layout>
      <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>

      {canCreate && (
        <div className="d-flex justify-content-end gap-8 mb-8">
          {libraryHost && canPublish && onTeacherDashboard && (
            <Button
              color="tertiary"
              variant="ghost"
              onClick={() =>
                window.open(
                  `${libraryHost}?platformURL=${encodeURIComponent(window.location.hostname)}`,
                  '_blank',
                )
              }
            >
              {t('exercizer.dashboard.instructer.tab3')}
            </Button>
          )}
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

      {clockReliable ? <Outlet /> : <Unauthorized text={t('exercizer.error.date')} />}

      <UiSwitchBanner />
    </Layout>
  );
}

export default Root;
