import { ng, notify, idiom as lang, model } from 'entcore';

const PAGE_SIZE = 24;
const MANAGE_ACTION = 'fr.openent.exercizer.controllers.CatalogController|manage';

interface CatalogLevel { id: number; label: string; rank: number | null; level_group: string | null; }
interface CatalogDiscipline { id: number; code: string | null; label: string; }
interface CatalogSubject {
    id: number; title: string; description?: string; owner: string; owner_username: string; authors_contributors?: string;
    question_count: number; level_ids: number[]; discipline_ids: number[];
}

/**
 * Onglet « Catalogue » : les exercices partagés entre tous les établissements (même fonction que dans la nouvelle interface).
 * On cherche par mots-clés, niveau et matière, on prévisualise un sujet avec ses réponses attendues, puis on le copie dans
 * « Mes sujets » pour l'adapter. Le sujet du catalogue n'est jamais distribué en place : chacun travaille sur sa copie.
 */
export const teacherDashboardCatalogTabController = ng.controller('TeacherDashboardCatalogTabController', ['$scope', '$http', '$timeout', '$location',
    ($scope, $http, $timeout, $location) => {

    const t = (key: string, params?: any) => lang.translate(key);
    $scope.t = t;
    /** Libellé contenant [[count]] : le nombre est inséré à la main, la directive translate l'ignorait. */
    $scope.countLabel = (key: string, count: number) => t(key).replace('[[count]]', String(count));
    $scope.search = { q: '', levelId: null, disciplineId: null };
    $scope.page = 1;
    $scope.total = 0;
    $scope.subjects = [] as CatalogSubject[];
    $scope.levels = [] as CatalogLevel[];
    $scope.disciplines = [] as CatalogDiscipline[];
    $scope.loading = true;
    $scope.failed = false;
    $scope.preview = null;
    $scope.toRemove = null;
    $scope.isModerator = !!model.me && model.me.hasWorkflow && model.me.hasWorkflow(MANAGE_ACTION);

    const safeApply = () => { if (!$scope.$$phase && !$scope.$root.$$phase) $scope.$apply(); };

    // Le référentiel garde des libellés en clés de traduction : on traduit toujours avant de trier ou d'afficher.
    $http.get('/exercizer/catalog/referential').then((res) => {
        const levels: CatalogLevel[] = res.data.levels || [];
        $scope.levels = levels.slice().sort((a, b) => ((a.rank == null ? 1e9 : a.rank) - (b.rank == null ? 1e9 : b.rank)) || (a.id - b.id));
        const disciplines: CatalogDiscipline[] = (res.data.disciplines || []).slice();
        $scope.disciplines = disciplines.sort((a, b) => a.code === 'AUTRE' ? 1 : b.code === 'AUTRE' ? -1 : t(a.label).localeCompare(t(b.label), 'fr'));
    });

    $scope.levelGroup = (level: CatalogLevel) => t('exercizer.catalog.group.' + (level.level_group || 'other'));

    $scope.labels = (ids: number[], referential: Array<{ id: number; label: string }>) =>
        referential.filter(item => (ids || []).indexOf(item.id) >= 0).map(item => t(item.label));

    /** Texte brut d'une description HTML, pour la vignette. */
    $scope.plain = (html: string) => {
        if (!html) return '';
        const body = new DOMParser().parseFromString(html, 'text/html').body;
        return (body.textContent || '').trim();
    };

    $scope.canManage = (subject: CatalogSubject) => $scope.isModerator || (!!model.me && subject.owner === model.me.userId);

    $scope.pageCount = () => Math.max(1, Math.ceil($scope.total / PAGE_SIZE));

    const load = () => {
        $scope.loading = true;
        $scope.failed = false;
        const params: any = { limit: PAGE_SIZE, offset: ($scope.page - 1) * PAGE_SIZE };
        if ($scope.search.q && $scope.search.q.trim()) params.q = $scope.search.q.trim();
        if ($scope.search.levelId) params.levels = $scope.search.levelId;
        if ($scope.search.disciplineId) params.disciplines = $scope.search.disciplineId;
        $http.get('/exercizer/catalog/subjects', { params }).then((res) => {
            $scope.subjects = res.data.subjects || [];
            $scope.total = res.data.total || 0;
            $scope.loading = false;
        }, () => {
            $scope.failed = true;
            $scope.loading = false;
        });
    };

    // Un nouveau critère ramène à la première page ; la saisie n'est envoyée qu'une fois la frappe arrêtée.
    let timer: any = null;
    $scope.criteriaChanged = (immediately?: boolean) => {
        $scope.page = 1;
        if (timer) $timeout.cancel(timer);
        timer = $timeout(load, immediately ? 0 : 300);
    };
    $scope.goTo = (page: number) => {
        if (page < 1 || page > $scope.pageCount()) return;
        $scope.page = page;
        load();
    };

    $scope.openPreview = (subject: CatalogSubject) => {
        $scope.preview = { subject, grains: [], loading: true };
        $http.get('/exercizer/catalog/subject/' + subject.id).then((res) => {
            const grains = (res.data.grains || []).map((grain: any) => {
                if (typeof grain.grain_data === 'string') {
                    try { grain = { ...grain, grain_data: JSON.parse(grain.grain_data) }; } catch (e) { grain = { ...grain, grain_data: {} }; }
                }
                return grain;
            });
            $scope.preview.grains = grains;
            $scope.preview.loading = false;
        }, () => {
            $scope.preview.loading = false;
            notify.error('exercizer.error');
        });
    };
    $scope.closePreview = () => { $scope.preview = null; };

    $scope.copy = (subject: CatalogSubject) => {
        $scope.copying = subject.id;
        $http.post('/exercizer/catalog/subject/' + subject.id + '/copy', { folder_id: null }).then(() => {
            $scope.copying = null;
            $scope.preview = null;
            notify.success('exercizer.catalog.copied');
        }, () => {
            $scope.copying = null;
            notify.error('exercizer.error');
        });
    };

    $scope.askRemove = (subject: CatalogSubject) => { $scope.toRemove = subject; };
    $scope.cancelRemove = () => { $scope.toRemove = null; };
    $scope.remove = () => {
        const subject: CatalogSubject = $scope.toRemove;
        $scope.toRemove = null;
        $http.delete('/exercizer/catalog/subject/' + subject.id).then(() => {
            $scope.preview = null;
            load();
        }, () => notify.error('exercizer.error'));
    };

    load();
}]);
