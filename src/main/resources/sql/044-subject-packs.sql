-- Sujets installés par un pack pédagogique (OEIP 1.1, profil « pack ») et leur rattachement aux
-- programmes (référentiel CASE).
--
-- Un sujet de pack est un sujet du catalogue (is_library_subject) du compte technique
-- open-ent-catalogue, repéré par l'identifiant global de la ressource dans le pack : installer une
-- nouvelle version du pack le met à jour au lieu de le dupliquer.
--
-- Il n'est visible que des établissements qui ont accès au pack (subject_access), ou de tous si le
-- pack est offert à tous (structure_id = '*'). Les sujets publiés au catalogue par les enseignants
-- n'ont pas de pack_global_id : ils restent ouverts à tous, comme avant.

ALTER TABLE exercizer.subject ADD COLUMN pack_global_id VARCHAR(255) NULL;
CREATE UNIQUE INDEX subject_pack_global_id_uq ON exercizer.subject (pack_global_id)
	WHERE pack_global_id IS NOT NULL;

-- Énoncés du référentiel (CFItem CASE) que le sujet travaille.
CREATE TABLE exercizer.subject_alignment (
	subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	cfitem_id VARCHAR(36) NOT NULL,
	PRIMARY KEY (subject_id, cfitem_id)
);
CREATE INDEX subject_alignment_cfitem_idx ON exercizer.subject_alignment (cfitem_id);

-- Accès au sujet d'un pack : un établissement abonné, ou '*' pour l'abonnement offert à tous.
-- Réécrit en entier à chaque changement d'abonnement par le module d'interopérabilité.
CREATE TABLE exercizer.subject_access (
	subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	structure_id VARCHAR(64) NOT NULL,
	audience VARCHAR(32) NOT NULL,
	PRIMARY KEY (subject_id, structure_id)
);
