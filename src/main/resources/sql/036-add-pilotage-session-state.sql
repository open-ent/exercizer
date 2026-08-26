-- D3 : pilotage actif en direct d'une séance planifiée (SubjectScheduled).

-- État de la séance elle-même (distinct de l'état de chaque copie).
-- paused_at / paused_duration_seconds permettent de suspendre le décompte du temps
-- pendant une pause plutôt que de simplement le masquer côté client (cf. spec D3).
ALTER TABLE exercizer.subject_scheduled
ADD COLUMN session_state VARCHAR(20) NOT NULL DEFAULT 'en_cours',
ADD CONSTRAINT subject_scheduled_session_state_check CHECK (session_state IN ('en_cours', 'en_pause')),
ADD COLUMN paused_at TIMESTAMP NULL,
ADD COLUMN paused_duration_seconds INTEGER NOT NULL DEFAULT 0;

-- Prolongation de temps par élève (ajoutée à due_date de la séance) et traçabilité
-- d'une remise forcée par l'enseignant (pour distinguer d'une remise volontaire côté élève).
ALTER TABLE exercizer.subject_copy
ADD COLUMN extra_time_minutes INTEGER NOT NULL DEFAULT 0,
ADD COLUMN is_forced_submit BOOLEAN NOT NULL DEFAULT FALSE;
