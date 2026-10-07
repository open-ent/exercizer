// Instance affectée du Parcours — subject_sequence_scheduled, cf. SPEC-PARCOURS-multi-sequences.md §2/§3.2.
// Calqué sur SubjectScheduled.ts, en plus simple (pas de picture/max_score/scheduled_at/random_display :
// ces réglages vivent au niveau de chaque item enfant, un subject_scheduled classique inchangé).

export interface ISubjectSequenceScheduled {
    id: number;
    subject_sequence_id: number;
    owner: string;
    owner_username: string;
    created: string;
    modified: string;
    title: string;
    description: string;
    is_deleted: boolean;
    is_archived: boolean;
    begin_date: string;
    due_date: string;
}

export class SubjectSequenceScheduled implements ISubjectSequenceScheduled {

    id: number;
    subject_sequence_id: number;
    owner: string;
    owner_username: string;
    created: string;
    modified: string;
    title: string;
    description: string;
    is_deleted: boolean;
    is_archived: boolean;
    begin_date: string;
    due_date: string;

    constructor
    (
        id?: number,
        subject_sequence_id?: number,
        owner?: string,
        owner_username?: string,
        created?: string,
        modified?: string,
        title?: string,
        description?: string,
        is_deleted?: boolean,
        is_archived?: boolean,
        begin_date?: string,
        due_date?: string
    )
    {
        this.id = id;
        this.subject_sequence_id = subject_sequence_id;
        this.owner = owner;
        this.owner_username = owner_username;
        this.created = created;
        this.modified = modified;
        this.title = title;
        this.description = description;
        this.is_deleted = is_deleted;
        this.is_archived = is_archived;
        this.begin_date = begin_date;
        this.due_date = due_date;
    }
}

// Un subject_scheduled enfant du Parcours affecté, tel que renvoyé (camelCase, jsonb_build_object) par
// GET /subject-sequence-scheduled/:id (SubjectSequenceScheduledServiceSqlImpl#getById). Le statut détaillé
// de la copie de l'élève courant (submitted/corrected/...) n'est pas porté ici : il est croisé côté
// frontend avec SubjectCopyService.getListBySubjectScheduled({id}) déjà chargé pour l'élève (mêmes statuts
// exercizer.copy.state.* que la liste "à faire" existante, cf. SubjectCopyService#copyState).
export interface ISubjectSequenceScheduledChild {
    id: number;
    subjectId: number;
    title: string;
    sequenceOrderBy: number;
    beginDate: string;
    dueDate: string;
    isOver: boolean;
}

export interface ISubjectSequenceScheduledWithChildren {
    header: ISubjectSequenceScheduled;
    children: ISubjectSequenceScheduledChild[];
}

// GET /subject-sequence-scheduled/:id/progress (SubjectSequenceScheduledController#buildProgressResponse) :
// agrégat par élève, alimente le suivi enseignant (D5/D7). Le score global (moyenne simple des
// final_score déjà corrigés) est une décision produit ouverte (spec §7-pt.6) : affiché s'il existe, sans
// dépendance dessus côté écran élève (qui calcule sa propre progression localement, cf. contrôleur).
export interface ISubjectSequenceProgressStudent {
    studentId: string;
    studentName: string;
    submittedItems: number;
    correctedItems: number;
    averageScore: number;
    totalItems: number;
    completionRate: number;
}

export interface ISubjectSequenceProgress {
    totalItems: number;
    students: ISubjectSequenceProgressStudent[];
}
