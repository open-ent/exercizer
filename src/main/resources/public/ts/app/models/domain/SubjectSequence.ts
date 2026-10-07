// « Parcours » (nom fonctionnel) modèle — subject_sequence (nom technique), cf.
// SPEC-PARCOURS-multi-sequences.md §2/§3.1. Calqué sur Subject.ts (Subject/ISubject), en plus simple :
// pas de folder_id/picture/max_score/is_library_subject (aucun équivalent phase 1 pour un Parcours).

export interface ISubjectSequence {
    id: number;
    owner: string;
    owner_username: string;
    created: string;
    modified: string;
    title: string;
    description: string;
    is_deleted: boolean;
    selected: boolean;
}

export class SubjectSequence implements ISubjectSequence {

    id: number;
    owner: string;
    owner_username: string;
    created: string;
    modified: string;
    title: string;
    description: string;
    is_deleted: boolean;
    selected: boolean;

    constructor
    (
        id?: number,
        owner?: string,
        owner_username?: string,
        created?: string,
        modified?: string,
        title?: string,
        description?: string,
        is_deleted?: boolean,
        selected?: boolean
    )
    {
        this.id = id;
        this.owner = owner;
        this.owner_username = owner_username;
        this.created = created;
        this.modified = modified;
        this.title = title;
        this.description = description;
        this.is_deleted = is_deleted;
        this.selected = selected;
    }
}

// Sujet composant un Parcours modèle, ordonné (subject_sequence_item, analogue de Grain.order_by pour un
// subject). La lecture (GET /subject-sequence/:id/items) renvoie subject_title/subject_description/
// subject_max_score via une jointure serveur (SubjectSequenceItemServiceSqlImpl#list) pour éviter un
// aller-retour supplémentaire ; l'écriture (POST/PUT item) n'attend que subjectId/orderBy
// (jsonschema/subjectSequenceItem.json), traduit en camelCase par SubjectSequenceService.
export interface ISubjectSequenceItem {
    id: number;
    subject_sequence_id: number;
    subject_id: number;
    order_by: number;
    subject_title: string;
    subject_description: string;
    subject_max_score: number;
}

export class SubjectSequenceItem implements ISubjectSequenceItem {

    id: number;
    subject_sequence_id: number;
    subject_id: number;
    order_by: number;
    subject_title: string;
    subject_description: string;
    subject_max_score: number;

    constructor
    (
        id?: number,
        subject_sequence_id?: number,
        subject_id?: number,
        order_by?: number,
        subject_title?: string,
        subject_description?: string,
        subject_max_score?: number
    )
    {
        this.id = id;
        this.subject_sequence_id = subject_sequence_id;
        this.subject_id = subject_id;
        this.order_by = order_by;
        this.subject_title = subject_title;
        this.subject_description = subject_description;
        this.subject_max_score = subject_max_score;
    }
}
