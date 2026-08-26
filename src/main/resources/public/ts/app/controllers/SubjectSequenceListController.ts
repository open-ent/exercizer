import { ng, notify, idiom } from 'entcore';
import { ISubjectSequence, SubjectSequence } from '../models/domain';
import { ISubjectSequenceService } from '../services';

// Enseignant — liste des Parcours (calqué sur TeacherDashboardSubjectTabController.ts, en plus simple :
// pas de dossiers/partage/duplication pour un Parcours en phase 1, cf. SPEC-PARCOURS-multi-sequences.md
// §4.1, §7-pt.9). Création inline (titre/description) puis redirection vers l'écran d'édition des items,
// sur le modèle de la création d'un sujet (EditSimpleSubjectController "create" puis redirection vers
// "edit").
export class SubjectSequenceListController {

    static $inject = [
        '$location',
        'SubjectSequenceService'
    ];

    private _subjectSequenceList: ISubjectSequence[] = [];
    private _hasDataLoaded = false;
    private _isCreateModalDisplayed = false;
    private _isRemoveModalDisplayed = false;
    private _newSubjectSequence: ISubjectSequence = new SubjectSequence();
    private _subjectSequenceToRemove: ISubjectSequence;
    private _creating = false;

    constructor
    (
        private _$location,
        private _subjectSequenceService: ISubjectSequenceService
    ) {
        this._subjectSequenceService.resolve(true).then(() => {
            this._subjectSequenceList = this._subjectSequenceService.getList();
            this._hasDataLoaded = true;
        }, (err) => {
            notify.error(err);
            this._hasDataLoaded = true;
        });
    }

    public translate = function (key) {
        return idiom.translate(key);
    };

    public redirectToDashboard() {
        this._$location.path('/dashboard');
    }

    public openEdit(subjectSequence: ISubjectSequence) {
        this._$location.path('/subject-sequence/edit/' + subjectSequence.id + '/');
    }

    public openCreateModal() {
        this._newSubjectSequence = new SubjectSequence();
        this._isCreateModalDisplayed = true;
    }

    public closeCreateModal() {
        this._isCreateModalDisplayed = false;
    }

    public create() {
        if (!this._newSubjectSequence.title || this._creating) {
            return;
        }
        this._creating = true;
        this._subjectSequenceService.persist(this._newSubjectSequence).then((created) => {
            this._creating = false;
            this._isCreateModalDisplayed = false;
            this._subjectSequenceList = this._subjectSequenceService.getList();
            this.openEdit(created);
        }, (err) => {
            this._creating = false;
            notify.error(err);
        });
    }

    public openRemoveModal(subjectSequence: ISubjectSequence) {
        this._subjectSequenceToRemove = subjectSequence;
        this._isRemoveModalDisplayed = true;
    }

    public closeRemoveModal() {
        this._subjectSequenceToRemove = undefined;
        this._isRemoveModalDisplayed = false;
    }

    public confirmRemove() {
        if (!this._subjectSequenceToRemove) {
            return;
        }
        this._subjectSequenceService.remove([this._subjectSequenceToRemove.id]).then(() => {
            this._subjectSequenceList = this._subjectSequenceService.getList();
            this.closeRemoveModal();
        }, (err) => {
            notify.error(err);
        });
    }

    get subjectSequenceList(): ISubjectSequence[] {
        return this._subjectSequenceList;
    }

    get hasDataLoaded(): boolean {
        return this._hasDataLoaded;
    }

    get isEmptyStateVisible(): boolean {
        return this._hasDataLoaded && this._subjectSequenceList.length === 0;
    }

    get isCreateModalDisplayed(): boolean {
        return this._isCreateModalDisplayed;
    }

    get isRemoveModalDisplayed(): boolean {
        return this._isRemoveModalDisplayed;
    }

    get newSubjectSequence(): ISubjectSequence {
        return this._newSubjectSequence;
    }

    get creating(): boolean {
        return this._creating;
    }
}

export const subjectSequenceListController = ng.controller('SubjectSequenceListController', SubjectSequenceListController);
