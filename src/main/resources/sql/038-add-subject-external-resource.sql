-- D4 (import de contenu externe, réf. CCTP AO ENT ÉCLAT-BFC MOD03) : ressource externe importée
-- (téléchargée côté serveur et déposée dans le stockage de l'ENT) et rattachée à un sujet.
CREATE TABLE exercizer.subject_external_resource (
    id BIGSERIAL PRIMARY KEY,
    subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
    file_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL,
    content_type VARCHAR(255),
    size BIGINT,
    owner VARCHAR(36) NOT NULL,
    created TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_subject_external_resource_subject_id ON exercizer.subject_external_resource(subject_id);
