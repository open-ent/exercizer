import { ng, notify } from 'entcore';
import { ISubjectScheduledService } from '../services/SubjectScheduledService';

class TeacherDashboardPilotageController {

    static $inject = [
        '$routeParams',
        '$scope',
        '$location',
        'SubjectScheduledService'
    ];

    constructor($routeParams, $scope, $location, SubjectScheduledService: ISubjectScheduledService) {
        SubjectScheduledService.resolve(true).then(function() {
            var subjectScheduled = SubjectScheduledService.getById($routeParams['subjectScheduledId']);
            if (subjectScheduled) {
                $scope.selectedSubjectScheduled = subjectScheduled;
            } else {
                notify.error('exercizer.error');
                $location.path('/dashboard/teacher/correction');
            }
        });
    }
}

export const teacherDashboardPilotageController = ng.controller('TeacherDashboardPilotageController', TeacherDashboardPilotageController);
