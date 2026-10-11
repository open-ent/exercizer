-- Lecteur SCORM : un paquet déposé, et l'état d'apprentissage de chaque élève.
--
-- Le paquet est dépaqueté dans le stockage de l'ENT ; cette table n'en retient que ce qu'il
-- faut pour le servir : la racine où il a été écrit et son point d'entrée.

CREATE TABLE exercizer.scorm_package (
    id BIGSERIAL PRIMARY KEY,
    subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    -- Table chemin relatif -> identifiant dans le stockage de l'ENT. Le stockage ne rend que
    -- des identifiants opaques ; sans cette table, un href relatif du paquet serait irrésoluble.
    -- La garder en base plutôt que sur disque local est ce qui permet de servir le paquet depuis
    -- n'importe quel nœud du cluster.
    files JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Chemin, relatif à la racine, du fichier que le lecteur doit ouvrir.
    entry_point TEXT NOT NULL,
    -- « 1.2 » ou « 2004 » : les deux versions n'emploient ni les mêmes noms d'API ni les mêmes
    -- clés du modèle CMI, et le lecteur doit savoir à laquelle il a affaire.
    scorm_version VARCHAR(8) NOT NULL,
    owner VARCHAR(36) NOT NULL,
    created TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX scorm_package_subject_id_idx ON exercizer.scorm_package(subject_id);

-- L'état d'apprentissage, tel que le SCO l'écrit par l'API SCORM.
--
-- Le modèle CMI est conservé TEL QUEL, en jsonb : un SCO y range des clés que la spécification
-- laisse libres (cmi.suspend_data notamment, qui porte son état interne), et les normaliser
-- reviendrait à casser la reprise de son parcours. Seuls le score et le statut sont extraits,
-- parce qu'exercizer en a besoin pour la note.
CREATE TABLE exercizer.scorm_state (
    id BIGSERIAL PRIMARY KEY,
    package_id BIGINT NOT NULL REFERENCES exercizer.scorm_package(id) ON DELETE CASCADE,
    owner VARCHAR(36) NOT NULL,
    -- Une même activité peut être jouée hors distribution (essai de l'enseignant) : la copie
    -- est donc facultative.
    subject_copy_id BIGINT NULL REFERENCES exercizer.subject_copy(id) ON DELETE CASCADE,
    cmi JSONB NOT NULL DEFAULT '{}'::jsonb,
    score_raw DOUBLE PRECISION NULL,
    score_max DOUBLE PRECISION NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    passed BOOLEAN NULL,
    updated TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL
);

-- Un seul état par paquet, par élève et par copie : sans cette contrainte, un enregistrement
-- concurrent créerait des lignes rivales et la reprise lirait l'une ou l'autre au hasard.
CREATE UNIQUE INDEX scorm_state_unique_idx
    ON exercizer.scorm_state(package_id, owner, COALESCE(subject_copy_id, -1));

-- Le type de grain qui porte un paquet SCORM.
-- isQuestion() d'exercizer repose sur grain_type_id > 3 : le type 13 est donc automatiquement
-- traité comme une question notée, ce qui est bien ce qu'on veut.
INSERT INTO exercizer.grain_type (id, name, public_name, illustration, is_in_list)
VALUES (13, 'scorm', 'exercizer.grain.type.scorm', '/exercizer/public/img/grain/scorm.svg', true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('exercizer.grain_type_id_seq', (SELECT MAX(id) FROM exercizer.grain_type));
