-- Objet « Parcours » multi-séquences (cf. demo-openent/doc/.../SPEC-PARCOURS-multi-sequences.md).
-- Modèle : subject_sequence (Parcours modèle) / subject_sequence_item (sujets ordonnés du modèle) /
-- subject_sequence_scheduled (instance affectée), sur le patron déjà en place subject / subject_scheduled.
-- Le pilotage D3 (036) n'est pas concerné : il reste scopé au subject_scheduled individuel.

-- Le Parcours modèle (analogue de exercizer.subject). Partage entre enseignants sur le même modèle que
-- subject (subject_sequence_shares + ShareAndOwner), pas de folder_id en phase 1 (hors périmètre spec).
CREATE TABLE exercizer.subject_sequence(
	id BIGSERIAL NOT NULL PRIMARY KEY,
	owner VARCHAR(36) NOT NULL,
	owner_username VARCHAR(255) NOT NULL,
	created TIMESTAMP DEFAULT NOW(),
	modified TIMESTAMP DEFAULT NOW(),
	title VARCHAR(255) NOT NULL,
	description TEXT NULL,
	is_deleted BOOL DEFAULT FALSE,
	CONSTRAINT subject_sequence_owner_fk FOREIGN KEY(owner) REFERENCES exercizer.users(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE exercizer.subject_sequence_shares (
	member_id VARCHAR(36) NOT NULL,
	resource_id BIGINT NOT NULL,
	action VARCHAR(255) NOT NULL,
	CONSTRAINT subject_sequence_shares_pk PRIMARY KEY (member_id, resource_id, action),
	CONSTRAINT subject_sequence_shares_resource_fk FOREIGN KEY(resource_id) REFERENCES exercizer.subject_sequence(id) ON UPDATE CASCADE ON DELETE NO ACTION,
	CONSTRAINT subject_sequence_shares_member_fk FOREIGN KEY(member_id) REFERENCES exercizer.members(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Sujets qui composent le Parcours modèle, dans l'ordre (analogue de exercizer.grain / grain.order_by).
-- Un même subject peut figurer dans plusieurs subject_sequence : pas de contrainte d'unicité sur
-- subject_id seul, réutilisation d'un sujet dans plusieurs Parcours modèles volontairement permise.
CREATE TABLE exercizer.subject_sequence_item(
	id BIGSERIAL NOT NULL PRIMARY KEY,
	subject_sequence_id BIGINT NOT NULL,
	subject_id BIGINT NOT NULL,
	order_by INTEGER NOT NULL,
	created TIMESTAMP DEFAULT NOW(),
	CONSTRAINT subject_sequence_item_subject_sequence_fk FOREIGN KEY(subject_sequence_id) REFERENCES exercizer.subject_sequence(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
	CONSTRAINT subject_sequence_item_subject_fk FOREIGN KEY(subject_id) REFERENCES exercizer.subject(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);

-- Instance affectée du Parcours (analogue de exercizer.subject_scheduled). begin_date/due_date sont
-- dénormalisés (min/max des subject_scheduled enfants), rafraîchis à chaque (dé)planification d'un item
-- plutôt que recalculés par agrégat SQL à chaque liste de tableau de bord.
CREATE TABLE exercizer.subject_sequence_scheduled(
	id BIGSERIAL NOT NULL PRIMARY KEY,
	subject_sequence_id BIGINT NOT NULL,
	owner VARCHAR(36) NOT NULL,
	owner_username VARCHAR(255) NOT NULL,
	created TIMESTAMP DEFAULT NOW(),
	modified TIMESTAMP DEFAULT NOW(),
	title VARCHAR(255) NOT NULL,
	description TEXT NULL,
	is_deleted BOOL DEFAULT FALSE,
	is_archived BOOL DEFAULT FALSE,
	begin_date TIMESTAMP NULL,
	due_date TIMESTAMP NULL,
	CONSTRAINT subject_sequence_scheduled_subject_sequence_fk FOREIGN KEY(subject_sequence_id) REFERENCES exercizer.subject_sequence(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);

-- Rattachement d'un subject_scheduled à son Parcours planifié : colonnes nullables directement sur
-- subject_scheduled, pas de table de jointure (relation 1-N réelle, cf. spec §2.3). NULL = subject_scheduled
-- hors Parcours (comportement actuel inchangé) ; aucune donnée existante à migrer (spec §7-pt.8).
ALTER TABLE exercizer.subject_scheduled
ADD COLUMN subject_sequence_scheduled_id BIGINT NULL
	REFERENCES exercizer.subject_sequence_scheduled(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
ADD COLUMN sequence_order_by INTEGER NULL;

CREATE INDEX IF NOT EXISTS subject_sequence_item_subject_sequence_id_idx ON exercizer.subject_sequence_item USING btree (subject_sequence_id);
CREATE INDEX IF NOT EXISTS subject_sequence_item_subject_id_idx ON exercizer.subject_sequence_item USING btree (subject_id);
CREATE INDEX IF NOT EXISTS subject_sequence_scheduled_subject_sequence_id_idx ON exercizer.subject_sequence_scheduled USING btree (subject_sequence_id);
CREATE INDEX IF NOT EXISTS subject_scheduled_subject_sequence_scheduled_id_idx ON exercizer.subject_scheduled USING btree (subject_sequence_scheduled_id);
