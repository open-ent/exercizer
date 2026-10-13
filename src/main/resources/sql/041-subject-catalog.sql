-- Catalogue d'exercices partagé entre établissements, et classement des sujets par niveau et matière.
--
-- Le catalogue reprend la « bibliothèque » historique (subject.is_library_subject = true) : un sujet du
-- catalogue n'appartient à aucun dossier, aucun partage ni aucun établissement ; tout enseignant le
-- consulte et le copie dans ses sujets. L'ancienne bibliothèque ne portait qu'UN niveau et UNE matière
-- (subject_library_main_information) : un même sujet vaut souvent pour le CE2 et le CM1, ou pour les
-- mathématiques et la technologie. D'où deux tables de liaison, valables pour TOUT sujet — l'enseignant
-- classe ses propres sujets, et le classement suit le sujet quand il est copié ou publié.
--
-- Les référentiels gardent leurs libellés en clés i18n ; on leur ajoute un code stable (les données de
-- démonstration s'y réfèrent, jamais aux id), un rang d'affichage et un groupe (maternelle, élémentaire…).

ALTER TABLE exercizer.subject_lesson_level
	ADD COLUMN code VARCHAR(16) NULL,
	ADD COLUMN rank INTEGER NULL,
	ADD COLUMN level_group VARCHAR(16) NULL;

UPDATE exercizer.subject_lesson_level AS l SET code = v.code, rank = v.rank, level_group = v.grp
FROM (VALUES
	('exercizer.subject.lesson.level1',  '6E',      20, 'college'),
	('exercizer.subject.lesson.level2',  '5E',      21, 'college'),
	('exercizer.subject.lesson.level3',  '4E',      22, 'college'),
	('exercizer.subject.lesson.level4',  '3E',      23, 'college'),
	('exercizer.subject.lesson.level5',  '4E_PRO',  24, 'college'),
	('exercizer.subject.lesson.level6',  '3E_PRO',  25, 'college'),
	('exercizer.subject.lesson.level7',  '2NDE',    30, 'lycee'),
	('exercizer.subject.lesson.level8',  '1ERE',    31, 'lycee'),
	('exercizer.subject.lesson.level9',  'TLE',     32, 'lycee'),
	('exercizer.subject.lesson.level18', '2NDE_PRO', 40, 'lycee_pro'),
	('exercizer.subject.lesson.level19', '1ERE_PRO', 41, 'lycee_pro'),
	('exercizer.subject.lesson.level20', 'TLE_PRO', 42, 'lycee_pro'),
	('exercizer.subject.lesson.level14', 'CAP1',    43, 'lycee_pro'),
	('exercizer.subject.lesson.level15', 'CAP2',    44, 'lycee_pro'),
	('exercizer.subject.lesson.level16', 'BP1',     45, 'lycee_pro'),
	('exercizer.subject.lesson.level17', 'BP2',     46, 'lycee_pro'),
	('exercizer.subject.lesson.level10', 'BTS1',    50, 'superieur'),
	('exercizer.subject.lesson.level11', 'BTS2',    51, 'superieur'),
	('exercizer.subject.lesson.level12', 'CPGE1',   52, 'superieur'),
	('exercizer.subject.lesson.level13', 'CPGE2',   53, 'superieur')
) AS v(label, code, rank, grp)
-- Un libellé présent en double ne reçoit son code qu'une fois (le plus ancien) : l'index unique tient.
WHERE l.label = v.label AND l.id = (SELECT min(x.id) FROM exercizer.subject_lesson_level AS x WHERE x.label = v.label);

INSERT INTO exercizer.subject_lesson_level (label, code, rank, level_group) VALUES
	('exercizer.subject.lesson.level21', 'PS',  1, 'maternelle'),
	('exercizer.subject.lesson.level22', 'MS',  2, 'maternelle'),
	('exercizer.subject.lesson.level23', 'GS',  3, 'maternelle'),
	('exercizer.subject.lesson.level24', 'CP',  10, 'elementaire'),
	('exercizer.subject.lesson.level25', 'CE1', 11, 'elementaire'),
	('exercizer.subject.lesson.level26', 'CE2', 12, 'elementaire'),
	('exercizer.subject.lesson.level27', 'CM1', 13, 'elementaire'),
	('exercizer.subject.lesson.level28', 'CM2', 14, 'elementaire');

CREATE UNIQUE INDEX subject_lesson_level_code_uq ON exercizer.subject_lesson_level (code);

ALTER TABLE exercizer.subject_lesson_type ADD COLUMN code VARCHAR(32) NULL;

UPDATE exercizer.subject_lesson_type AS t SET code = v.code
FROM (VALUES
	('exercizer.subject.lesson.type1',  'ARTS_APPLIQUES'),
	('exercizer.subject.lesson.type2',  'ARTS_PLASTIQUES'),
	('exercizer.subject.lesson.type3',  'BIOTECH_ST2S'),
	('exercizer.subject.lesson.type4',  'DOCUMENTATION'),
	('exercizer.subject.lesson.type5',  'ECO_GESTION'),
	('exercizer.subject.lesson.type6',  'EDUCATION_MUSICALE'),
	('exercizer.subject.lesson.type7',  'EPS'),
	('exercizer.subject.lesson.type8',  'HISTOIRE_GEO'),
	('exercizer.subject.lesson.type9',  'LANGUES_VIVANTES'),
	('exercizer.subject.lesson.type10', 'LCA'),
	('exercizer.subject.lesson.type11', 'MATHEMATIQUES'),
	('exercizer.subject.lesson.type12', 'PHYSIQUE_CHIMIE'),
	('exercizer.subject.lesson.type13', 'SES'),
	('exercizer.subject.lesson.type14', 'SVT'),
	('exercizer.subject.lesson.type15', 'TECHNOLOGIE'),
	('exercizer.subject.lesson.type16', 'ENS_PRO'),
	('exercizer.subject.lesson.type17', 'ENS_TECHNO'),
	('exercizer.subject.lesson.type18', 'PHILOSOPHIE'),
	('exercizer.subject.lesson.type19', 'METHODOLOGIE'),
	('exercizer.subject.lesson.type20', 'EMC'),
	('exercizer.subject.lesson.type21', 'DROIT'),
	('exercizer.subject.lesson.type22', 'AUTRE'),
	('exercizer.subject.lesson.type23', 'SNT'),
	('exercizer.subject.lesson.type24', 'SI')
) AS v(label, code)
WHERE t.label = v.label AND t.id = (SELECT min(x.id) FROM exercizer.subject_lesson_type AS x WHERE x.label = v.label);

-- Matières du premier degré et du français, absentes du référentiel d'origine (pensé pour le second degré).
INSERT INTO exercizer.subject_lesson_type (label, code) VALUES
	('exercizer.subject.lesson.type25', 'FRANCAIS'),
	('exercizer.subject.lesson.type26', 'QUESTIONNER_LE_MONDE'),
	('exercizer.subject.lesson.type27', 'SCIENCES_TECHNO'),
	('exercizer.subject.lesson.type28', 'EXPLORER_LE_MONDE'),
	('exercizer.subject.lesson.type29', 'LANGAGE');

CREATE UNIQUE INDEX subject_lesson_type_code_uq ON exercizer.subject_lesson_type (code);

CREATE TABLE exercizer.subject_level (
	subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	level_id BIGINT NOT NULL REFERENCES exercizer.subject_lesson_level(id) ON DELETE CASCADE,
	PRIMARY KEY (subject_id, level_id)
);
CREATE INDEX subject_level_level_idx ON exercizer.subject_level (level_id);

CREATE TABLE exercizer.subject_discipline (
	subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	discipline_id BIGINT NOT NULL REFERENCES exercizer.subject_lesson_type(id) ON DELETE CASCADE,
	PRIMARY KEY (subject_id, discipline_id)
);
CREATE INDEX subject_discipline_discipline_idx ON exercizer.subject_discipline (discipline_id);

-- Reprise du classement de l'ancienne bibliothèque, s'il en reste.
INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT DISTINCT subject_id, subject_lesson_level_id FROM exercizer.subject_library_main_information
	ON CONFLICT DO NOTHING;
INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT DISTINCT subject_id, subject_lesson_type_id FROM exercizer.subject_library_main_information
	ON CONFLICT DO NOTHING;
