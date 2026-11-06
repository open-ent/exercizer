-- Rattachement assisté du catalogue : un modérateur fait proposer, pour les sujets du catalogue qui ne
-- sont rattachés à aucun énoncé, les énoncés les plus proches (niveaux, matières, titre). Ces suggestions
-- entrent dans la file de validation comme celles des enseignants (proposed_by = 'suggestion').
--
-- Les rattachements refusés par un modérateur sont retenus : une nouvelle passe ne les repropose pas.
CREATE TABLE exercizer.subject_alignment_rejection (
	subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	cfitem_id VARCHAR(36) NOT NULL,
	rejected_at TIMESTAMP NOT NULL DEFAULT NOW(),
	PRIMARY KEY (subject_id, cfitem_id)
);
