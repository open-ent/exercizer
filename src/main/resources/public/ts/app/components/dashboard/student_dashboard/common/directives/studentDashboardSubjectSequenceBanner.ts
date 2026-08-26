import { ng } from 'entcore';

// Bandeau "Mes parcours" au dashboard élève (cf. SPEC-PARCOURS-multi-sequences.md §4.4) : regroupe les
// subject_scheduled dont subject_sequence_scheduled_id est renseigné (élève engagé dans un Parcours),
// point d'entrée unique vers l'écran de navigation dédié (SubjectSequenceScheduledController). N'affiche
// rien si l'élève n'a aucun Parcours affecté (ce qui est le cas de la quasi-totalité des sujets
// aujourd'hui, la fonctionnalité étant neuve) - composant conteneur léger, ne modifie aucun des
// composants d'affichage existants (subject-copy-domino inchangé, cf. contrainte de la tâche).
export const studentDashboardSubjectSequenceBanner = ng.directive('studentDashboardSubjectSequenceBanner',
    ['SubjectScheduledService', 'SubjectCopyService', 'SubjectSequenceScheduledService', '$location',
        (SubjectScheduledService, SubjectCopyService, SubjectSequenceScheduledService, $location) => {
            return {
                restrict: 'E',
                scope: {},
                templateUrl: 'exercizer/public/ts/app/components/dashboard/student_dashboard/common/templates/student-dashboard-subject-sequence-banner.html',
                link: (scope: any) => {
                    scope.parcoursList = [];

                    function computeProgress(childIds: number[]) {
                        let done = 0;
                        angular.forEach(childIds, function (childId) {
                            const list = SubjectCopyService.getListBySubjectScheduled({ id: childId });
                            const copy = list && list.length > 0 ? list[0] : undefined;
                            if (copy && (copy.submitted_date || copy.is_corrected)) {
                                done++;
                            }
                        });
                        return childIds.length > 0 ? Math.round((done / childIds.length) * 100) : 0;
                    }

                    Promise.all([
                        SubjectScheduledService.resolve(false),
                        SubjectCopyService.resolve(false)
                    ]).then(function () {
                        const bySequenceId: { [id: number]: number[] } = {};
                        angular.forEach(SubjectScheduledService.getList(), function (subjectScheduled) {
                            const sequenceId = subjectScheduled.subject_sequence_scheduled_id;
                            if (!sequenceId) {
                                return;
                            }
                            if (!bySequenceId[sequenceId]) {
                                bySequenceId[sequenceId] = [];
                            }
                            bySequenceId[sequenceId].push(subjectScheduled.id);
                        });

                        angular.forEach(Object.keys(bySequenceId), function (sequenceIdKey) {
                            const sequenceId = parseInt(sequenceIdKey, 10);
                            SubjectSequenceScheduledService.getById(sequenceId).then(function (data) {
                                scope.parcoursList.push({
                                    id: sequenceId,
                                    title: data.header.title,
                                    progressPercent: computeProgress(bySequenceId[sequenceId])
                                });
                            });
                        });
                    });

                    scope.openSequence = function (parcours) {
                        $location.path('/subject-sequence-scheduled/' + parcours.id + '/');
                    };
                }
            };
        }
    ]
);
