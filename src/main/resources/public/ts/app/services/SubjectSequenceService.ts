import { ng } from 'entcore';
import { ISubjectSequence, ISubjectSequenceItem, SubjectSequence, SubjectSequenceItem } from '../models/domain';
import { SerializationHelper, MapToListHelper } from '../models/helpers';

// CRUD du Parcours modèle (subject_sequence) + gestion de ses items ordonnés (subject_sequence_item),
// calqué sur SubjectService.ts/GrainService.ts (cf. SPEC-PARCOURS-multi-sequences.md §3.1, §4.1).

function cleanBeforeSave(subjectSequence: ISubjectSequence): any {
    const copy: any = { ...subjectSequence };
    if (copy.owner && copy.owner.userId) {
        copy.owner = copy.owner.userId;
    }
    delete copy['owner_username'];
    delete copy['created'];
    delete copy['modified'];
    delete copy['is_deleted'];
    delete copy['selected'];
    return copy;
}

export interface ISubjectSequenceService {
    resolve(force?: boolean): Promise<boolean>;
    persist(subjectSequence: ISubjectSequence): Promise<ISubjectSequence>;
    update(subjectSequence: ISubjectSequence): Promise<ISubjectSequence>;
    remove(subjectSequenceIds: number[]): Promise<boolean>;
    getList(): ISubjectSequence[];
    getById(id: number): ISubjectSequence;
    listItems(subjectSequenceId: number): Promise<ISubjectSequenceItem[]>;
    listScheduled(subjectSequenceId: number): Promise<any[]>;
    addItem(subjectSequenceId: number, subjectId: number, subjectTitle: string, subjectDescription: string, subjectMaxScore: number, orderBy: number): Promise<ISubjectSequenceItem>;
    updateItem(subjectSequenceId: number, item: ISubjectSequenceItem): Promise<ISubjectSequenceItem>;
    removeItems(subjectSequenceId: number, itemIds: number[]): Promise<boolean>;
}

export class SubjectSequenceService implements ISubjectSequenceService {

    static $inject = [
        '$q',
        '$http'
    ];

    private _listMappedById: { [id: number]: ISubjectSequence; };

    constructor
    (
        private _$q,
        private _$http
    ) {
        this._$q = _$q;
        this._$http = _$http;
    }

    public resolve = function (force: boolean = false): Promise<boolean> {
        const self = this,
            deferred = this._$q.defer(),
            request = {
                method: 'GET',
                url: 'exercizer/subject-sequences'
            };

        if (this._listMappedById !== undefined && !force) {
            deferred.resolve(true);
        } else {
            this._$http(request).then(
                function (response) {
                    self._listMappedById = {};
                    angular.forEach(response.data, function (subjectSequenceObject) {
                        const subjectSequence = SerializationHelper.toInstance(new SubjectSequence(), JSON.stringify(subjectSequenceObject)) as any;
                        self._listMappedById[subjectSequence.id] = subjectSequence;
                    });
                    deferred.resolve(true);
                },
                function () {
                    deferred.reject('exercizer.error');
                }
            );
        }

        return deferred.promise;
    };

    public persist = function (subjectSequence: ISubjectSequence): Promise<ISubjectSequence> {
        const self = this,
            deferred = this._$q.defer(),
            request = {
                method: 'POST',
                url: 'exercizer/subject-sequence',
                data: cleanBeforeSave(subjectSequence)
            };

        if (!this._listMappedById) {
            this._listMappedById = {};
        }

        this._$http(request).then(
            function (response) {
                const created = SerializationHelper.toInstance(new SubjectSequence(), JSON.stringify(response.data)) as any;
                self._listMappedById[created.id] = created;
                deferred.resolve(created);
            },
            function () {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };

    public update = function (subjectSequence: ISubjectSequence): Promise<ISubjectSequence> {
        const self = this,
            deferred = this._$q.defer(),
            request = {
                method: 'PUT',
                url: 'exercizer/subject-sequence/' + subjectSequence.id,
                data: cleanBeforeSave(subjectSequence)
            };

        this._$http(request).then(
            function (response) {
                subjectSequence.modified = response.data.modified;
                self._listMappedById[subjectSequence.id] = subjectSequence;
                deferred.resolve(subjectSequence);
            },
            function () {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };

    public remove = function (subjectSequenceIds: number[]): Promise<boolean> {
        const self = this,
            deferred = this._$q.defer(),
            request = {
                method: 'PUT',
                url: 'exercizer/subject-sequence/mark/delete',
                data: { ids: subjectSequenceIds }
            };

        this._$http(request).then(
            function () {
                angular.forEach(subjectSequenceIds, function (id) {
                    delete self._listMappedById[id];
                });
                deferred.resolve(true);
            },
            function () {
                deferred.reject('exercizer.error');
            }
        );

        return deferred.promise;
    };

    public getList = function (): ISubjectSequence[] {
        if (!angular.isUndefined(this._listMappedById)) {
            return MapToListHelper.toList(this._listMappedById);
        } else {
            return [];
        }
    };

    public getById = function (id: number): ISubjectSequence {
        return this._listMappedById && this._listMappedById[id];
    };

    public listItems = function (subjectSequenceId: number): Promise<ISubjectSequenceItem[]> {
        const deferred = this._$q.defer(),
            request = {
                method: 'GET',
                url: 'exercizer/subject-sequence/' + subjectSequenceId + '/items'
            };

        this._$http(request).then(
            function (response) {
                const items: ISubjectSequenceItem[] = [];
                angular.forEach(response.data, function (itemObject) {
                    items.push(SerializationHelper.toInstance(new SubjectSequenceItem(), JSON.stringify(itemObject)) as any);
                });
                deferred.resolve(items);
            },
            function () {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };

    // Distributions (subject_sequence_scheduled) d'un Parcours modèle : seul point d'entrée IHM vers
    // l'écran de suivi (D5) une fois quitté, cf. gap constaté en recette - aucun lien n'y menait.
    public listScheduled = function (subjectSequenceId: number): Promise<any[]> {
        const deferred = this._$q.defer(),
            request = {
                method: 'GET',
                url: 'exercizer/subject-sequence/' + subjectSequenceId + '/scheduled'
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

    public addItem = function (subjectSequenceId: number, subjectId: number, subjectTitle: string, subjectDescription: string, subjectMaxScore: number, orderBy: number): Promise<ISubjectSequenceItem> {
        const deferred = this._$q.defer(),
            request = {
                method: 'POST',
                url: 'exercizer/subject-sequence/' + subjectSequenceId + '/item',
                data: { subjectId: subjectId, orderBy: orderBy }
            };

        this._$http(request).then(
            function (response) {
                const item = new SubjectSequenceItem(response.data.id, subjectSequenceId, subjectId, orderBy, subjectTitle, subjectDescription, subjectMaxScore);
                deferred.resolve(item);
            },
            function (e) {
                deferred.reject(e && e.data ? e.data.error : 'exercizer.error');
            }
        );
        return deferred.promise;
    };

    public updateItem = function (subjectSequenceId: number, item: ISubjectSequenceItem): Promise<ISubjectSequenceItem> {
        const deferred = this._$q.defer(),
            request = {
                method: 'PUT',
                url: 'exercizer/subject-sequence/' + subjectSequenceId + '/item/' + item.id,
                data: { subjectId: item.subject_id, orderBy: item.order_by }
            };

        this._$http(request).then(
            function () {
                deferred.resolve(item);
            },
            function (e) {
                deferred.reject(e && e.data ? e.data.error : 'exercizer.error');
            }
        );
        return deferred.promise;
    };

    public removeItems = function (subjectSequenceId: number, itemIds: number[]): Promise<boolean> {
        const deferred = this._$q.defer();
        let url = 'exercizer/subject-sequence/' + subjectSequenceId + '/items?';
        angular.forEach(itemIds, function (id) {
            url += 'itemId=' + id + '&';
        });
        url = url.slice(0, -1);

        this._$http({ method: 'DELETE', url: url }).then(
            function () {
                deferred.resolve(true);
            },
            function () {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };
}

export const subjectSequenceService = ng.service('SubjectSequenceService', SubjectSequenceService);
