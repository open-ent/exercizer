-- Sections d'un sujet interactif (« Partie 1 – Calcul », …), sur le modèle Chapitre → Activités de LearnHouse.
--
-- grain.order_by reste un ordre GLOBAL et continu sur tout le sujet : les grains d'une même section se
-- suivent. L'IHM AngularJS, qui ignore les sections, continue donc d'afficher une séquence cohérente.
-- section_id NULL = grain « hors section », affiché en tête : un sujet existant n'a aucune section et se
-- comporte exactement comme avant.
--
-- Suppressions en cascade : un sujet ou une distribution supprimés physiquement (dépublication de
-- bibliothèque, déprogrammation) emportent leurs sections sans que le code Java ait à les connaître.

CREATE TABLE exercizer.subject_section(
	id BIGSERIAL NOT NULL PRIMARY KEY,
	subject_id BIGINT NOT NULL,
	title VARCHAR(255) NOT NULL DEFAULT '',
	description TEXT NULL,
	order_by INTEGER NOT NULL,
	created TIMESTAMP DEFAULT NOW(),
	modified TIMESTAMP DEFAULT NOW(),
	CONSTRAINT subject_section_subject_fk FOREIGN KEY(subject_id) REFERENCES exercizer.subject(id) ON UPDATE NO ACTION ON DELETE CASCADE,
	-- Différée : la réécriture de l'arbre permute les rangs dans une seule transaction.
	CONSTRAINT subject_section_order_uq UNIQUE (subject_id, order_by) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE exercizer.grain
ADD COLUMN section_id BIGINT NULL
	REFERENCES exercizer.subject_section(id) ON UPDATE NO ACTION ON DELETE SET NULL;

-- Copie figée des sections à la distribution (analogue de grain → grain_scheduled).
CREATE TABLE exercizer.subject_section_scheduled(
	id BIGSERIAL NOT NULL PRIMARY KEY,
	subject_scheduled_id BIGINT NOT NULL,
	title VARCHAR(255) NOT NULL DEFAULT '',
	description TEXT NULL,
	order_by INTEGER NOT NULL,
	CONSTRAINT subject_section_scheduled_subject_scheduled_fk FOREIGN KEY(subject_scheduled_id) REFERENCES exercizer.subject_scheduled(id) ON UPDATE NO ACTION ON DELETE CASCADE
);

ALTER TABLE exercizer.grain_scheduled
ADD COLUMN section_scheduled_id BIGINT NULL
	REFERENCES exercizer.subject_section_scheduled(id) ON UPDATE NO ACTION ON DELETE SET NULL;

-- Affichage pour l'élève : une question par page (comportement historique) ou une section par page.
ALTER TABLE exercizer.subject_scheduled
ADD COLUMN display_mode VARCHAR(16) NOT NULL DEFAULT 'grain',
ADD CONSTRAINT subject_scheduled_display_mode_check CHECK (display_mode IN ('grain', 'section'));

CREATE INDEX IF NOT EXISTS subject_section_subject_id_idx ON exercizer.subject_section USING btree (subject_id);
CREATE INDEX IF NOT EXISTS grain_section_id_idx ON exercizer.grain USING btree (section_id);
CREATE INDEX IF NOT EXISTS subject_section_scheduled_subject_scheduled_id_idx ON exercizer.subject_section_scheduled USING btree (subject_scheduled_id);
CREATE INDEX IF NOT EXISTS grain_scheduled_section_scheduled_id_idx ON exercizer.grain_scheduled USING btree (section_scheduled_id);

-- Partages : un droit de ressource est stocké méthode par méthode dans subject_shares
-- (« <Contrôleur>|<méthode> », lu par le filtre ShareAndOwner). Les sujets DÉJÀ partagés n'ont donc
-- aucune ligne pour les routes de SectionController, et un contributeur autre que le propriétaire en
-- serait exclu jusqu'au prochain re-partage. On recopie le droit existant équivalent :
-- modifier un grain → gérer les sections ; lire les grains → lire les sections.
INSERT INTO exercizer.subject_shares (member_id, resource_id, action)
SELECT sh.member_id, sh.resource_id, m.action
FROM exercizer.subject_shares AS sh
INNER JOIN (VALUES
	('fr.openent.exercizer.controllers.SubjectController|grainUpdate', 'fr.openent.exercizer.controllers.SectionController|create'),
	('fr.openent.exercizer.controllers.SubjectController|grainUpdate', 'fr.openent.exercizer.controllers.SectionController|update'),
	('fr.openent.exercizer.controllers.SubjectController|grainUpdate', 'fr.openent.exercizer.controllers.SectionController|remove'),
	('fr.openent.exercizer.controllers.SubjectController|grainUpdate', 'fr.openent.exercizer.controllers.SectionController|duplicate'),
	('fr.openent.exercizer.controllers.SubjectController|grainUpdate', 'fr.openent.exercizer.controllers.SectionController|saveStructure'),
	('fr.openent.exercizer.controllers.SubjectController|grainList', 'fr.openent.exercizer.controllers.SectionController|list')
) AS m(source, action) ON m.source = sh.action
ON CONFLICT DO NOTHING;
