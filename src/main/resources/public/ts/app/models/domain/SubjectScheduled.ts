import { ISubjectDocument } from "./SubjectDocument";

export interface ISubjectScheduled {
    id:number;
    subject_id:number;
    owner:string;
    owner_username:string;
    created:string;
    modified: string;
    title:string;
    description:string;
    picture:string;
    max_score:number;
    begin_date:string;
    due_date:string;
    corrected_date:string;
    estimated_duration:string;
    is_over:boolean;
    is_one_shot_submit:boolean;
    random_display:boolean;
    has_automatic_display: boolean;
    is_deleted:boolean;
    scheduled_at : string[];
    type:string;
    is_training_mode: boolean;
    is_training_permitted: boolean;
    files: Array<ISubjectDocument>;
    // D3 - pilotage actif en direct (migration 036-add-pilotage-session-state.sql) : ces 3 champs sont
    // déjà renvoyés tels quels par les endpoints élève existants (SELECT ss.* / SELECT ss1.*), donc déjà
    // présents à l'exécution même si absents de la classe ci-dessous avant ce commentaire - déclarés ici
    // pour que le typage TypeScript les connaisse (cf. subjectPerformCopyPilotage.ts).
    session_state?: string; // 'en_cours' | 'en_pause'
    paused_at?: string;
    paused_duration_seconds?: number;
    // Parcours (subject_sequence) : colonnes ajoutées par sql/037-add-subject-sequence.sql, nullables,
    // NULL = "hors Parcours" (cf. SPEC-PARCOURS-multi-sequences.md §2.3). Déjà renvoyées telles quelles par
    // les routes existantes (SELECT ss.*), donc déjà présentes à l'exécution même sans être déclarées ici
    // - déclarées pour que le typage TypeScript les connaisse (regroupement "Mes parcours" au dashboard
    // élève, cf. studentDashboardSubjectSequenceBanner.ts).
    subject_sequence_scheduled_id?: number;
    sequence_order_by?: number;
}

export class SubjectScheduled implements ISubjectScheduled {

    id:number;
    subject_id:number;
    owner:string;
    owner_username:string;
    created:string;
    modified: string;
    title:string;
    description:string;
    picture:string;
    max_score:number;
    begin_date:string;
    due_date:string;
    corrected_date:string;
    estimated_duration:string;
    is_over:boolean;
    random_display:boolean;
    has_automatic_display: boolean;
    is_one_shot_submit:boolean;
    is_deleted:boolean;
    scheduled_at: string[];
    type:string;
    is_training_mode: boolean;
    is_training_permitted: boolean;
    files: Array<ISubjectDocument>;
    
    constructor
    (
        id?:number,
        subject_id?:number,
        owner?:string,
        owner_username?:string,
        created?:string,
        modified?: string,
        title?:string,
        description?:string,
        picture?:string,
        max_score?:number,
        begin_date?:string,
        due_date?:string,
        corrected_date?:string,
        estimated_duration?:string,        
        is_over?:boolean,
        has_automatic_display?:boolean,
        random_display?:boolean,
        is_one_shot_submit?:boolean,
        is_deleted?:boolean,
        scheduled_at? : string[],
        type?:string,
        is_training_mode?: boolean,
        is_training_permitted?: boolean,
        files?: Array<ISubjectDocument>
    )
    {
        this.id = id;
        this.subject_id = subject_id;
        this.owner = owner;
        this.owner_username = owner_username;
        this.created = created;
        this.modified = modified;
        this.title = title;
        this.description = description;
        this.picture = picture;
        this.max_score = max_score;
        this.begin_date = begin_date;
        this.due_date = due_date;
        this.corrected_date = corrected_date;
        this.estimated_duration = estimated_duration;
        this.is_over = is_over;
        this.has_automatic_display = has_automatic_display;
        this.random_display = random_display;
        this.is_one_shot_submit = is_one_shot_submit;
        this.is_deleted = is_deleted;
        this.scheduled_at = scheduled_at || [];
        this.type = type;
        this.is_training_mode = is_training_mode;
        this.is_training_permitted = is_training_permitted;
        this.files = files || [];
    }
}