-- Qualité et confiance du catalogue d'exercices : signaux d'usage et modération des rattachements.
--
-- 1. Les copies faites depuis le catalogue (une ligne par copie) : le nombre de copies et le nombre
--    d'établissements qui s'en servent aident l'enseignant à choisir parmi plusieurs exercices d'un même
--    objectif. On garde les établissements de l'usager au moment de la copie (il peut en changer).
-- 2. Les avis des collègues : une note de 1 à 5 et un commentaire facultatif, un par usager et par sujet,
--    réservés à qui a copié le sujet (on juge un exercice qu'on a eu en main).
-- 3. Les rattachements proposés par les enseignants : publier ou reclasser un sujet du catalogue sans le
--    droit de modération (exercizer.catalog.manage) ne rattache plus directement l'exercice au programme,
--    la proposition attend qu'un modérateur la valide. Le rangement par programme (subject_alignment) ne
--    porte ainsi que des rattachements validés. Les rattachements déjà posés restent valides.

CREATE TABLE exercizer.subject_catalog_copy (
	id BIGSERIAL PRIMARY KEY,
	catalog_subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	-- Le sujet créé dans « Mes sujets » ; la copie compte toujours une fois ce sujet supprimé.
	subject_id BIGINT NULL REFERENCES exercizer.subject(id) ON DELETE SET NULL,
	user_id VARCHAR(36) NOT NULL,
	structure_ids VARCHAR(64)[] NOT NULL DEFAULT '{}',
	created TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX subject_catalog_copy_catalog_idx ON exercizer.subject_catalog_copy (catalog_subject_id);
CREATE INDEX subject_catalog_copy_user_idx ON exercizer.subject_catalog_copy (user_id);

CREATE TABLE exercizer.subject_catalog_review (
	catalog_subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	user_id VARCHAR(36) NOT NULL,
	username VARCHAR(255) NOT NULL,
	rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
	comment TEXT NULL,
	created TIMESTAMP NOT NULL DEFAULT NOW(),
	modified TIMESTAMP NOT NULL DEFAULT NOW(),
	PRIMARY KEY (catalog_subject_id, user_id)
);

CREATE TABLE exercizer.subject_alignment_proposal (
	subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	cfitem_id VARCHAR(36) NOT NULL,
	proposed_by VARCHAR(36) NOT NULL,
	proposed_by_name VARCHAR(255) NULL,
	proposed_at TIMESTAMP NOT NULL DEFAULT NOW(),
	PRIMARY KEY (subject_id, cfitem_id)
);
CREATE INDEX subject_alignment_proposal_date_idx ON exercizer.subject_alignment_proposal (proposed_at);
