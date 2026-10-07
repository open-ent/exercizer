import { ng, notify } from 'entcore';

// D4 (import de contenu externe, CCTP AO ENT ÉCLAT-BFC MOD03) : le professeur fournit une URL externe
// (PDF/document/image), le serveur la télécharge réellement et la dépose dans le stockage de l'ENT,
// cf. SubjectController.java#importExternalResource. Composant isolé (scope propre, service HTTP direct)
// plutôt qu'ajouté au très gros EditSubjectController.ts existant, pour ne pas risquer d'y introduire de
// régression sur un écran déjà complexe.
export const subjectExternalResources = ng.directive('subjectExternalResources',
    ['$http', ($http) => {
        return {
            restrict: 'E',
            scope: { subjectId: '=' },
            templateUrl: 'exercizer/public/ts/app/components/subject/subject_external_resources/templates/subject-external-resources.html',
            link: (scope: any) => {
                scope.resources = [];
                scope.newUrl = '';
                scope.newTitle = '';
                scope.importing = false;

                scope.load = function () {
                    if (!scope.subjectId) {
                        return;
                    }
                    $http.get('/exercizer/subject/' + scope.subjectId + '/external-resources').then((res) => {
                        scope.resources = res.data;
                    });
                };

                scope.importResource = function () {
                    if (!scope.newUrl || !scope.newTitle || scope.importing) {
                        return;
                    }
                    scope.importing = true;
                    $http.post('/exercizer/subject/' + scope.subjectId + '/external-resource', {
                        url: scope.newUrl,
                        title: scope.newTitle
                    }).then(() => {
                        scope.newUrl = '';
                        scope.newTitle = '';
                        scope.importing = false;
                        notify.info('exercizer.external.resource.imported');
                        scope.load();
                    }, (err) => {
                        scope.importing = false;
                        notify.error(err.data && err.data.error ? err.data.error : 'exercizer.external.resource.import.failed');
                    });
                };

                scope.startRename = function (resource) {
                    resource.editingTitle = resource.title;
                };

                scope.cancelRename = function (resource) {
                    delete resource.editingTitle;
                };

                scope.confirmRename = function (resource) {
                    if (!resource.editingTitle) {
                        return;
                    }
                    $http.put('/exercizer/subject/' + scope.subjectId + '/external-resource/' + resource.id, {
                        title: resource.editingTitle
                    }).then(() => {
                        delete resource.editingTitle;
                        scope.load();
                    }, () => {
                        notify.error('exercizer.external.resource.rename.failed');
                    });
                };

                scope.removeResource = function (resource) {
                    $http.delete('/exercizer/subject/' + scope.subjectId + '/external-resource/' + resource.id).then(() => {
                        scope.load();
                    }, () => {
                        notify.error('exercizer.external.resource.remove.failed');
                    });
                };

                scope.downloadUrl = function (resource) {
                    return '/exercizer/subject/' + scope.subjectId + '/external-resource/' + resource.id + '/download';
                };

                scope.$watch('subjectId', (newVal) => {
                    if (newVal) {
                        scope.load();
                    }
                });
            }
        };
    }]
);
