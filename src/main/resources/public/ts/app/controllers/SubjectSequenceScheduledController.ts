import { ng, model, notify } from 'entcore';
import { ISubjectScheduled, ISubjectSequenceScheduled } from '../models/domain';
import { ISubjectScheduledService, ISubjectCopyService, ISubjectSequenceScheduledService } from '../services';

// Élève — navigation dans un Parcours affecté (cf. SPEC-PARCOURS-multi-sequences.md §4.4, §5.1).
// Zéro composant de passation dupliqué : chaque sujet du Parcours s'ouvre via les routes de
// passation/consultation déjà existantes (/subject/copy/perform..., /subject/copy/view...), réutilisées
// telles quelles - même logique d'accès que subject-copy-domino.ts (canPerformACopyAsStudent /
// canAccessViewAsStudent / copyState*, cf. SubjectCopyService.ts).
//
// La liste ordonnée des items est reconstruite depuis SubjectScheduledService.getList() (déjà résolu pour
// l'élève, cf. StudentDashboardController) filtré par subject_sequence_scheduled_id, plutôt que depuis les
// "children" de GET /subject-sequence-scheduled/:id : ces derniers ne portent pas is_one_shot_submit
// (nécessaire à canPerformACopyAsStudent) ni le type ('simple'/'interactive'), alors que la liste déjà
// résolue côté élève porte la ligne subject_scheduled complète (SELECT ss1.*, cf. rapport de tâche). Seul
// le header (titre/description du Parcours) est pris depuis GET /subject-sequence-scheduled/:id.
export class SubjectSequenceScheduledController {

    static $inject = [
        '$routeParams',
        '$location',
        'SubjectSequenceScheduledService',
        'SubjectScheduledService',
        'SubjectCopyService'
    ];

    private _id: number;
    private _header: ISubjectSequenceScheduled;
    private _itemList: ISubjectScheduled[] = [];
    private _hasDataLoaded = false;

    constructor
    (
        private _$routeParams,
        private _$location,
        private _subjectSequenceScheduledService: ISubjectSequenceScheduledService,
        private _subjectScheduledService: ISubjectScheduledService,
        private _subjectCopyService: ISubjectCopyService
    ) {
        this._id = parseInt(_$routeParams['subjectSequenceScheduledId'], 10);

        Promise.all([
            this._subjectSequenceScheduledService.getById(this._id),
            this._subjectScheduledService.resolve(false),
            this._subjectCopyService.resolve(false)
        ]).then(([data]) => {
            this._header = data.header;
            this._itemList = this._subjectScheduledService.getList()
                .filter((ss: ISubjectScheduled) => ss.subject_sequence_scheduled_id == this._id)
                .sort((a: ISubjectScheduled, b: ISubjectScheduled) => (a.sequence_order_by || 0) - (b.sequence_order_by || 0));
            this._hasDataLoaded = true;
        }, (err) => {
            notify.error(err);
            this.redirectToDashboard();
        });
    }

    public redirectToDashboard() {
        // '/dashboard' générique (pas '/dashboard/student') : cet écran est aussi accessible au
        // propriétaire enseignant du Parcours (cf. SubjectSequenceScheduledAccess.java, owner OR élève
        // avec une copie) ; ExercizerController#dashboard route déjà vers la bonne vue selon le profil.
        this._$location.path('/dashboard');
    }

    public getCopy(item: ISubjectScheduled) {
        const list = this._subjectCopyService.getListBySubjectScheduled(item);
        return list && list.length > 0 ? list[0] : undefined;
    }

    public copyStateColorClass(item: ISubjectScheduled) {
        return this._subjectCopyService.copyStateColorClass(this.getCopy(item));
    }

    public copyStateText(item: ISubjectScheduled) {
        return this._subjectCopyService.copyStateText(this.getCopy(item));
    }

    public isItemDone(item: ISubjectScheduled): boolean {
        const copy = this.getCopy(item);
        return !!copy && (!!copy.submitted_date || !!copy.is_corrected);
    }

    public canOpenItem(item: ISubjectScheduled): boolean {
        const copy = this.getCopy(item);
        if (!copy) {
            return false;
        }
        if (item.type === 'simple') {
            return true;
        }
        return this._subjectCopyService.canPerformACopyAsStudent(item, copy)
            || this._subjectCopyService.canAccessViewAsStudent(item, copy);
    }

    public openItem(item: ISubjectScheduled) {
        const copy = this.getCopy(item);
        if (!copy) {
            return;
        }
        if (item.type === 'simple') {
            this._$location.path('/subject/copy/perform/simple/' + copy.id);
            return;
        }
        if (this._subjectCopyService.canPerformACopyAsStudent(item, copy)) {
            this._$location.path('/subject/copy/perform/' + copy.id);
        } else if (this._subjectCopyService.canAccessViewAsStudent(item, copy)) {
            this._$location.path('/subject/copy/view/' + copy.id);
        }
    }

    get header(): ISubjectSequenceScheduled {
        return this._header;
    }

    get itemList(): ISubjectScheduled[] {
        return this._itemList;
    }

    get hasDataLoaded(): boolean {
        return this._hasDataLoaded;
    }

    get totalItems(): number {
        return this._itemList.length;
    }

    get doneItems(): number {
        return this._itemList.filter(item => this.isItemDone(item)).length;
    }

    get progressPercent(): number {
        if (this.totalItems === 0) {
            return 0;
        }
        return Math.round((this.doneItems / this.totalItems) * 100);
    }

    // Export CSV (D6) réservé au propriétaire enseignant : le backend le filtre déjà
    // (SubjectSequenceScheduledOwner), ce getter n'est qu'un affichage conditionnel du bouton.
    get isOwner(): boolean {
        return !!this._header && this._header.owner === model.me.userId;
    }

    public exportCsv() {
        window.open('/exercizer/subject-sequence-scheduled/' + this._id + '/export-csv', '_blank');
    }
}

export const subjectSequenceScheduledController = ng.controller('SubjectSequenceScheduledController', SubjectSequenceScheduledController);
