import { ng, notify, idiom } from 'entcore';
import { ISubject, ISubjectSequence, ISubjectSequenceItem } from '../models/domain';
import { ISubjectService, ISubjectSequenceService } from '../services';

// Enseignant — édition d'un Parcours (titre/description + composition ordonnée de sujets existants),
// sur le modèle d'EditSubjectController.ts (composition d'un sujet à partir de blocs), en plus simple :
// pas de glisser-déposer (non obligatoire d'après la demande, boutons monter/descendre suffisent),
// items = des sujets existants entiers (pas de contenu propre à éditer ici, cf.
// SPEC-PARCOURS-multi-sequences.md §4.1).
export class EditSubjectSequenceController {

    static $inject = [
        '$routeParams',
        '$scope',
        '$location',
        'SubjectSequenceService',
        'SubjectService'
    ];

    private _subjectSequence: ISubjectSequence;
    private _itemList: ISubjectSequenceItem[] = [];
    private _hasDataLoaded = false;
    private _savingHeader = false;
    private _titleDescriptionTimeout: any = null;

    // picker "ajouter un sujet"
    private _autocompleteSubjectList: any[] = [];
    private _isModalRemoveItemDisplayed = false;
    private _itemToRemove: ISubjectSequenceItem;

    constructor
    (
        private _$routeParams,
        private _$scope,
        private _$location,
        private _subjectSequenceService: ISubjectSequenceService,
        private _subjectService: ISubjectService
    ) {
        const subjectSequenceId = parseInt(_$routeParams['subjectSequenceId'], 10);

        this._subjectSequenceService.resolve().then(() => {
            this._subjectSequence = this._subjectSequenceService.getById(subjectSequenceId);
            if (!this._subjectSequence) {
                this.redirectToList();
                return;
            }
            this._subjectSequenceService.listItems(subjectSequenceId).then((items) => {
                this._itemList = items;
                this._hasDataLoaded = true;
            }, (err) => {
                notify.error(err);
                this._hasDataLoaded = true;
            });
            this._subjectService.resolve().then(() => { });
        }, (err) => {
            notify.error(err);
            this.redirectToList();
        });
    }

    public translate = function (key) {
        return idiom.translate(key);
    };

    public redirectToList() {
        this._$location.path('/subject-sequence/list');
    }

    public scheduleSubjectSequence() {
        this._$scope.$broadcast('E_DISPLAY_MODAL_SCHEDULE_SUBJECT_SEQUENCE', this._subjectSequence);
    }

    /*
     * HEADER (titre/description), sauvegarde différée comme updateGrainDebounced (EditSubjectController)
     */
    public saveHeaderDebounced() {
        if (this._titleDescriptionTimeout) {
            clearTimeout(this._titleDescriptionTimeout);
        }
        this._titleDescriptionTimeout = setTimeout(() => {
            this.saveHeader();
            this._titleDescriptionTimeout = null;
        }, 1000);
    }

    public saveHeader() {
        if (!this._subjectSequence.title) {
            return;
        }
        this._savingHeader = true;
        this._subjectSequenceService.update(this._subjectSequence).then(() => {
            this._savingHeader = false;
        }, (err) => {
            this._savingHeader = false;
            notify.error(err);
        });
    }

    /*
     * ITEMS
     */

    public clickOnAutoComplete() {
        const alreadyIn = this._itemList.map(i => i.subject_id);
        this._autocompleteSubjectList = this._subjectService.getList()
            .filter((s: ISubject) => alreadyIn.indexOf(s.id) === -1)
            .map((s: ISubject) => ({
                id: s.id,
                title: s.title,
                description: s.description,
                max_score: s.max_score,
                toString: function () { return this.title; }
            }));
    }

    public addItem(selectedSubject) {
        if (!selectedSubject) {
            return;
        }
        const maxOrder = this._itemList.reduce((max, item) => Math.max(max, item.order_by || 0), 0);
        const orderBy = maxOrder + 1;

        this._subjectSequenceService.addItem(
            this._subjectSequence.id,
            selectedSubject.id,
            selectedSubject.title,
            selectedSubject.description,
            selectedSubject.max_score,
            orderBy
        ).then((item) => {
            this._itemList.push(item);
        }, (err) => {
            notify.error(err);
        });
    }

    public displayModalRemoveItem(item: ISubjectSequenceItem) {
        this._itemToRemove = item;
        this._isModalRemoveItemDisplayed = true;
    }

    public closeModalRemoveItem() {
        this._itemToRemove = undefined;
        this._isModalRemoveItemDisplayed = false;
    }

    public removeItem() {
        if (!this._itemToRemove) {
            return;
        }
        const item = this._itemToRemove;
        this._subjectSequenceService.removeItems(this._subjectSequence.id, [item.id]).then(() => {
            const index = this._itemList.indexOf(item);
            if (index !== -1) {
                this._itemList.splice(index, 1);
            }
            this.closeModalRemoveItem();
        }, (err) => {
            notify.error(err);
        });
    }

    public canMoveUp(item: ISubjectSequenceItem): boolean {
        const sorted = this.sortedItemList;
        return sorted.indexOf(item) > 0;
    }

    public canMoveDown(item: ISubjectSequenceItem): boolean {
        const sorted = this.sortedItemList;
        const index = sorted.indexOf(item);
        return index !== -1 && index < sorted.length - 1;
    }

    public moveUp(item: ISubjectSequenceItem) {
        const sorted = this.sortedItemList;
        const index = sorted.indexOf(item);
        if (index <= 0) {
            return;
        }
        this._swapOrder(item, sorted[index - 1]);
    }

    public moveDown(item: ISubjectSequenceItem) {
        const sorted = this.sortedItemList;
        const index = sorted.indexOf(item);
        if (index === -1 || index >= sorted.length - 1) {
            return;
        }
        this._swapOrder(item, sorted[index + 1]);
    }

    private _swapOrder(itemA: ISubjectSequenceItem, itemB: ISubjectSequenceItem) {
        const orderA = itemA.order_by;
        const orderB = itemB.order_by;
        itemA.order_by = orderB;
        itemB.order_by = orderA;

        this._subjectSequenceService.updateItem(this._subjectSequence.id, itemA).catch((err) => {
            notify.error(err);
        });
        this._subjectSequenceService.updateItem(this._subjectSequence.id, itemB).catch((err) => {
            notify.error(err);
        });
    }

    get subjectSequence(): ISubjectSequence {
        return this._subjectSequence;
    }

    get itemList(): ISubjectSequenceItem[] {
        return this._itemList;
    }

    get sortedItemList(): ISubjectSequenceItem[] {
        return this._itemList.slice().sort((a, b) => (a.order_by || 0) - (b.order_by || 0));
    }

    get hasDataLoaded(): boolean {
        return this._hasDataLoaded;
    }

    get isEmptyStateVisible(): boolean {
        return this._hasDataLoaded && this._itemList.length === 0;
    }

    get autocompleteSubjectList(): any[] {
        return this._autocompleteSubjectList;
    }

    get isModalRemoveItemDisplayed(): boolean {
        return this._isModalRemoveItemDisplayed;
    }

    get savingHeader(): boolean {
        return this._savingHeader;
    }
}

export const editSubjectSequenceController = ng.controller('EditSubjectSequenceController', EditSubjectSequenceController);
