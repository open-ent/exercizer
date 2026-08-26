import { ng } from 'entcore';
import { ISubjectSequenceProgress, ISubjectSequenceScheduledWithChildren } from '../models/domain';

// Affectation du Parcours (subject_sequence_scheduled), calqué sur SubjectScheduledService.ts#schedule
// (cf. SPEC-PARCOURS-multi-sequences.md §3.2, §4.2). POST /schedule-subject-sequence/:id réutilise le
// même schéma JSON scheduledAt (groupList/userList/exclude) que le sujet unique.

export interface IScheduleSubjectSequenceOption {
    beginDate: string;
    dueDate: string;
    estimatedDuration: string;
    isOneShotSubmit: boolean;
    randomDisplay: boolean;
    scheduledAt: { groupList: any[]; userList: any[]; exclude: any[] };
}

export interface ISubjectSequenceScheduledService {
    schedule(subjectSequenceId: number, option: IScheduleSubjectSequenceOption): Promise<{ id: number }>;
    unSchedule(id: number): Promise<boolean>;
    getById(id: number): Promise<ISubjectSequenceScheduledWithChildren>;
    getProgress(id: number): Promise<ISubjectSequenceProgress>;
}

export class SubjectSequenceScheduledService implements ISubjectSequenceScheduledService {

    static $inject = [
        '$q',
        '$http'
    ];

    constructor
    (
        private _$q,
        private _$http
    ) {
        this._$q = _$q;
        this._$http = _$http;
    }

    public schedule = function (subjectSequenceId: number, option: IScheduleSubjectSequenceOption): Promise<{ id: number }> {
        const deferred = this._$q.defer(),
            request = {
                method: 'POST',
                url: 'exercizer/schedule-subject-sequence/' + subjectSequenceId,
                data: {
                    beginDate: option.beginDate,
                    dueDate: option.dueDate,
                    estimatedDuration: option.estimatedDuration,
                    isOneShotSubmit: option.isOneShotSubmit,
                    isTrainingMode: false,
                    isTrainingPermitted: false,
                    randomDisplay: option.randomDisplay,
                    scheduledAt: option.scheduledAt
                }
            };

        this._$http(request).then(
            function (response) {
                deferred.resolve(response.data);
            },
            function (e) {
                deferred.reject(e && e.data ? e.data.error : 'exercizer.error');
            }
        );
        return deferred.promise;
    };

    public unSchedule = function (id: number): Promise<boolean> {
        const deferred = this._$q.defer(),
            request = {
                method: 'DELETE',
                url: 'exercizer/unschedule-subject-sequence/' + id
            };

        this._$http(request).then(
            function () {
                deferred.resolve(true);
            },
            function (e) {
                deferred.reject(e && e.data ? e.data.error : 'exercizer.error');
            }
        );
        return deferred.promise;
    };

    public getById = function (id: number): Promise<ISubjectSequenceScheduledWithChildren> {
        const deferred = this._$q.defer(),
            request = {
                method: 'GET',
                url: 'exercizer/subject-sequence-scheduled/' + id
            };

        this._$http(request).then(
            function (response) {
                deferred.resolve(response.data);
            },
            function () {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };

    public getProgress = function (id: number): Promise<ISubjectSequenceProgress> {
        const deferred = this._$q.defer(),
            request = {
                method: 'GET',
                url: 'exercizer/subject-sequence-scheduled/' + id + '/progress'
            };

        this._$http(request).then(
            function (response) {
                deferred.resolve(response.data);
            },
            function () {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };
}

export const subjectSequenceScheduledService = ng.service('SubjectSequenceScheduledService', SubjectSequenceScheduledService);
