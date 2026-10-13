-- Jeu d'exercices du catalogue Open ENT : exercices ORIGINAUX, classés par niveau et matière.
-- Fichier GÉNÉRÉ par deployment/catalog-seed/catalog_seed.py — ne pas modifier à la main.
-- Les sujets appartiennent à un usager technique (pas de compte ENT) : ils ne dépendent d'aucun
-- établissement, et seul un modérateur du catalogue (exercizer.catalog.manage) peut les retirer.

INSERT INTO exercizer.users (id, username, is_deleted) VALUES ('open-ent-catalogue', 'Open ENT', false)
	ON CONFLICT (id) DO NOTHING;

-- Les couleurs et les formes
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les couleurs et les formes', '<p>Reconnaître des formes simples et associer des objets à leur couleur. À faire avec l''adulte qui lit les consignes.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['MS', 'GS']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['EXPLORER_LE_MONDE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(3, 1, '{"title": "Consigne", "max_score": 0, "custom_data": {"title": "Consigne", "statement": "<p>L''adulte lit chaque question à voix haute. L''enfant montre ou dit sa réponse.</p>"}}'),
		(8, 2, '{"title": "Chaque objet a sa couleur", "max_score": 2, "statement": "<p>Relie chaque objet à sa couleur habituelle.</p>", "custom_data": {"correct_answer_list": [{"text_left": "La banane", "text_right": "jaune"}, {"text_left": "La fraise", "text_right": "rouge"}, {"text_left": "L''herbe", "text_right": "verte"}, {"text_left": "Le ciel sans nuage", "text_right": "bleu"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 3, '{"title": "Une forme ronde", "max_score": 1, "statement": "<p>Quelle forme est toute ronde ?</p>", "custom_data": {"correct_answer_list": [{"text": "Le cercle", "isChecked": true}, {"text": "Le carré", "isChecked": false}, {"text": "Le triangle", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 4, '{"title": "Trois côtés", "max_score": 1, "statement": "<p>Quelle forme a trois côtés ?</p>", "custom_data": {"correct_answer_list": [{"text": "Le cercle", "isChecked": false}, {"text": "Le rectangle", "isChecked": false}, {"text": "Le triangle", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 5, '{"title": "Compter les côtés", "max_score": 1, "statement": "<p>Combien de côtés a un carré ? (écris le nombre en chiffres)</p>", "custom_data": {"correct_answer": "4"}}')
	) AS v(t, o, d);

-- Les sons du début des mots
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les sons du début des mots', '<p>Entendre le premier son d''un mot : une étape vers la lecture.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['GS', 'CP']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['LANGAGE', 'FRANCAIS']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Le son [m]", "max_score": 1, "statement": "<p>Quel mot commence par le son [m] ?</p>", "custom_data": {"correct_answer_list": [{"text": "vélo", "isChecked": false}, {"text": "train", "isChecked": false}, {"text": "moto", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 2, '{"title": "Le son [s]", "max_score": 1, "statement": "<p>Quel mot commence par le son [s] ?</p>", "custom_data": {"correct_answer_list": [{"text": "lune", "isChecked": false}, {"text": "nuage", "isChecked": false}, {"text": "soleil", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(6, 3, '{"title": "Le son [p]", "max_score": 2, "statement": "<p>Écris deux mots de cette liste qui commencent par le son [p] : papa, maman, pomme, tomate.</p>", "custom_data": {"correct_answer_list": [{"text": "papa"}, {"text": "pomme"}], "no_error_allowed": false}}'),
		(8, 4, '{"title": "Même premier son", "max_score": 2, "statement": "<p>Associe les mots qui commencent par le même son.</p>", "custom_data": {"correct_answer_list": [{"text_left": "lapin", "text_right": "lune"}, {"text_left": "chat", "text_right": "chapeau"}, {"text_left": "bateau", "text_right": "ballon"}], "no_error_allowed": false, "show_left_column": true}}')
	) AS v(t, o, d);

-- Additions jusqu'à 10
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Additions jusqu''à 10', '<p>Calculer de petites sommes et décomposer les nombres jusqu''à 10.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CP']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(3, 1, '{"title": "Consigne", "max_score": 0, "custom_data": {"title": "Consigne", "statement": "<p>Calcule de tête. Tu peux t''aider de tes doigts.</p>"}}'),
		(4, 2, '{"title": "3 + 4", "max_score": 1, "statement": "<p>Combien font 3 + 4 ?</p>", "custom_data": {"correct_answer": "7"}}'),
		(4, 3, '{"title": "5 + 5", "max_score": 1, "statement": "<p>Combien font 5 + 5 ?</p>", "custom_data": {"correct_answer": "10"}}'),
		(4, 4, '{"title": "Le complément à 10", "max_score": 1, "statement": "<p>6 + ... = 10. Quel nombre manque ?</p>", "custom_data": {"correct_answer": "4"}, "answer_hint": "Compte de 6 jusqu''à 10."}'),
		(7, 5, '{"title": "Une autre écriture de 8", "max_score": 1, "statement": "<p>Quelle addition est égale à 8 ?</p>", "custom_data": {"correct_answer_list": [{"text": "3 + 4", "isChecked": false}, {"text": "6 + 3", "isChecked": false}, {"text": "4 + 4", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(9, 6, '{"title": "Du plus petit au plus grand", "max_score": 2, "statement": "<p>Range ces nombres du plus petit au plus grand.</p>", "custom_data": {"correct_answer_list": [{"text": "2", "order_by": 1}, {"text": "5", "order_by": 2}, {"text": "7", "order_by": 3}, {"text": "9", "order_by": 4}], "no_error_allowed": false}}')
	) AS v(t, o, d);

-- Lire des mots simples
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Lire des mots simples', '<p>Lire des syllabes et des mots courts, reconnaître les mots-outils.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CP']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['FRANCAIS']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Syllabes et mots", "max_score": 2, "statement": "<p>Associe chaque début de mot à sa fin pour former un mot.</p>", "custom_data": {"correct_answer_list": [{"text_left": "la", "text_right": "pin"}, {"text_left": "mou", "text_right": "ton"}, {"text_left": "vé", "text_right": "lo"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 2, '{"title": "Le bon mot", "max_score": 1, "statement": "<p>Quel mot désigne un animal ?</p>", "custom_data": {"correct_answer_list": [{"text": "table", "isChecked": false}, {"text": "porte", "isChecked": false}, {"text": "chat", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 3, '{"title": "Le mot manquant", "max_score": 1, "statement": "<p>Complète : « Le chat ... sur le lit. » (dort / dorts)</p>", "custom_data": {"correct_answer": "dort"}}'),
		(7, 4, '{"title": "Le petit mot", "max_score": 1, "statement": "<p>Complète : « Je joue ... mon ami. »</p>", "custom_data": {"correct_answer_list": [{"text": "sous", "isChecked": false}, {"text": "avec", "isChecked": true}, {"text": "sur", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Le jour et la nuit, les saisons
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le jour et la nuit, les saisons', '<p>Se repérer dans le temps : jours de la semaine et saisons.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CP', 'CE1']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['QUESTIONNER_LE_MONDE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(9, 1, '{"title": "Les jours de la semaine", "max_score": 2, "statement": "<p>Range ces jours dans l''ordre, en commençant par lundi.</p>", "custom_data": {"correct_answer_list": [{"text": "lundi", "order_by": 1}, {"text": "mardi", "order_by": 2}, {"text": "mercredi", "order_by": 3}, {"text": "jeudi", "order_by": 4}, {"text": "vendredi", "order_by": 5}], "no_error_allowed": false}}'),
		(4, 2, '{"title": "Après dimanche", "max_score": 1, "statement": "<p>Quel jour vient après dimanche ?</p>", "custom_data": {"correct_answer": "lundi"}}'),
		(9, 3, '{"title": "Les saisons", "max_score": 2, "statement": "<p>Range les saisons dans l''ordre, en commençant par le printemps.</p>", "custom_data": {"correct_answer_list": [{"text": "printemps", "order_by": 1}, {"text": "été", "order_by": 2}, {"text": "automne", "order_by": 3}, {"text": "hiver", "order_by": 4}], "no_error_allowed": false}}'),
		(7, 4, '{"title": "La saison froide", "max_score": 1, "statement": "<p>En quelle saison fait-il le plus froid en France ?</p>", "custom_data": {"correct_answer_list": [{"text": "le printemps", "isChecked": false}, {"text": "l''hiver", "isChecked": true}, {"text": "l''été", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Additions et soustractions jusqu'à 100
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Additions et soustractions jusqu''à 100', '<p>Calcul posé ou mental avec des nombres à deux chiffres.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CE1']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Une somme", "max_score": 1, "statement": "<p>Calcule 23 + 15.</p>", "custom_data": {"correct_answer": "38"}}'),
		(4, 2, '{"title": "Une différence", "max_score": 1, "statement": "<p>Calcule 47 - 12.</p>", "custom_data": {"correct_answer": "35"}}'),
		(4, 3, '{"title": "Avec une retenue", "max_score": 1, "statement": "<p>Calcule 38 + 27.</p>", "custom_data": {"correct_answer": "65"}, "answer_hint": "8 + 7 = 15 : pose 5 et retiens 1."}'),
		(7, 4, '{"title": "Le problème des billes", "max_score": 1, "statement": "<p>Léa a 30 billes. Elle en gagne 12. Combien en a-t-elle maintenant ?</p>", "custom_data": {"correct_answer_list": [{"text": "18", "isChecked": false}, {"text": "32", "isChecked": false}, {"text": "42", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 5, '{"title": "Les dizaines", "max_score": 1, "statement": "<p>Combien y a-t-il de dizaines dans 70 ?</p>", "custom_data": {"correct_answer": "7"}}')
	) AS v(t, o, d);

-- Le nom et le verbe
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le nom et le verbe', '<p>Repérer le verbe et le nom dans une phrase simple.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CE1', 'CE2']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['FRANCAIS']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(3, 1, '{"title": "Rappel", "max_score": 0, "custom_data": {"title": "Rappel", "statement": "<p>Le <strong>verbe</strong> dit ce que l''on fait. Le <strong>nom</strong> désigne une personne, un animal ou une chose.</p>"}}'),
		(7, 2, '{"title": "Trouver le verbe", "max_score": 1, "statement": "<p>Dans la phrase « Le chien court dans le jardin », quel est le verbe ?</p>", "custom_data": {"correct_answer_list": [{"text": "court", "isChecked": true}, {"text": "chien", "isChecked": false}, {"text": "jardin", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(6, 3, '{"title": "Trouver les noms", "max_score": 2, "statement": "<p>Écris les deux noms de la phrase : « La fille mange une pomme. »</p>", "custom_data": {"correct_answer_list": [{"text": "fille"}, {"text": "pomme"}], "no_error_allowed": false}}'),
		(8, 4, '{"title": "Nom ou verbe ?", "max_score": 2, "statement": "<p>Associe chaque mot à sa nature.</p>", "custom_data": {"correct_answer_list": [{"text_left": "chanter", "text_right": "verbe"}, {"text_left": "maison", "text_right": "nom"}, {"text_left": "sauter", "text_right": "verbe"}, {"text_left": "oiseau", "text_right": "nom"}], "no_error_allowed": false, "show_left_column": true}}')
	) AS v(t, o, d);

-- Les animaux et leur milieu
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les animaux et leur milieu', '<p>Associer les animaux à leur milieu de vie et à leur alimentation.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CE1', 'CE2']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['QUESTIONNER_LE_MONDE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Où vivent-ils ?", "max_score": 2, "statement": "<p>Associe chaque animal à son milieu de vie.</p>", "custom_data": {"correct_answer_list": [{"text_left": "Le poisson", "text_right": "l''eau"}, {"text_left": "La taupe", "text_right": "sous la terre"}, {"text_left": "L''écureuil", "text_right": "la forêt"}, {"text_left": "Le chameau", "text_right": "le désert"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 2, '{"title": "Un herbivore", "max_score": 1, "statement": "<p>Quel animal mange uniquement des végétaux ?</p>", "custom_data": {"correct_answer_list": [{"text": "le loup", "isChecked": false}, {"text": "le renard", "isChecked": false}, {"text": "le lapin", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 3, '{"title": "Les mammifères", "max_score": 2, "statement": "<p>Quels animaux sont des mammifères ?</p>", "custom_data": {"correct_answer_list": [{"text": "le requin", "isChecked": false}, {"text": "la vache", "isChecked": true}, {"text": "la baleine", "isChecked": true}, {"text": "la poule", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": true}}'),
		(5, 4, '{"title": "Observer", "max_score": 2, "statement": "<p>Cite un animal que tu peux observer près de chez toi et décris où il vit.</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- Les nombres en anglais
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les nombres en anglais', '<p>Compter de 1 à 10 en anglais.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CE1', 'CE2']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['LANGUES_VIVANTES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Les nombres", "max_score": 2, "statement": "<p>Associe chaque nombre à son nom en anglais.</p>", "custom_data": {"correct_answer_list": [{"text_left": "1", "text_right": "one"}, {"text_left": "3", "text_right": "three"}, {"text_left": "5", "text_right": "five"}, {"text_left": "8", "text_right": "eight"}, {"text_left": "10", "text_right": "ten"}], "no_error_allowed": false, "show_left_column": true}}'),
		(4, 2, '{"title": "Two", "max_score": 1, "statement": "<p>Écris en chiffres : two.</p>", "custom_data": {"correct_answer": "2"}}'),
		(7, 3, '{"title": "Seven", "max_score": 1, "statement": "<p>Comment dit-on 7 en anglais ?</p>", "custom_data": {"correct_answer_list": [{"text": "nine", "isChecked": false}, {"text": "seven", "isChecked": true}, {"text": "six", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Les tables de multiplication
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les tables de multiplication', '<p>Mémoriser les tables de 2, 3, 4 et 5.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CE2']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Table de 2", "max_score": 1, "statement": "<p>Combien font 2 x 7 ?</p>", "custom_data": {"correct_answer": "14"}}'),
		(4, 2, '{"title": "Table de 3", "max_score": 1, "statement": "<p>Combien font 3 x 6 ?</p>", "custom_data": {"correct_answer": "18"}}'),
		(4, 3, '{"title": "Table de 4", "max_score": 1, "statement": "<p>Combien font 4 x 8 ?</p>", "custom_data": {"correct_answer": "32"}}'),
		(4, 4, '{"title": "Table de 5", "max_score": 1, "statement": "<p>Combien font 5 x 9 ?</p>", "custom_data": {"correct_answer": "45"}}'),
		(8, 5, '{"title": "Résultats", "max_score": 2, "statement": "<p>Associe chaque multiplication à son résultat.</p>", "custom_data": {"correct_answer_list": [{"text_left": "3 x 4", "text_right": "12"}, {"text_left": "5 x 5", "text_right": "25"}, {"text_left": "2 x 9", "text_right": "18"}, {"text_left": "4 x 6", "text_right": "24"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 6, '{"title": "Le problème des boîtes", "max_score": 1, "statement": "<p>Une boîte contient 6 œufs. Combien d''œufs y a-t-il dans 5 boîtes ?</p>", "custom_data": {"correct_answer_list": [{"text": "30", "isChecked": true}, {"text": "11", "isChecked": false}, {"text": "25", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Le présent de l'indicatif
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le présent de l''indicatif', '<p>Conjuguer les verbes du 1er groupe et être, avoir au présent.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CE2', 'CM1']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['FRANCAIS']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Chanter", "max_score": 1, "statement": "<p>Conjugue « chanter » avec « nous » au présent : nous ...</p>", "custom_data": {"correct_answer": "chantons"}}'),
		(4, 2, '{"title": "Être", "max_score": 1, "statement": "<p>Conjugue « être » avec « vous » au présent : vous ...</p>", "custom_data": {"correct_answer": "êtes"}}'),
		(7, 3, '{"title": "Avoir", "max_score": 1, "statement": "<p>Complète : « Ils ... un chien. »</p>", "custom_data": {"correct_answer_list": [{"text": "on", "isChecked": false}, {"text": "ont", "isChecked": true}, {"text": "sont", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(8, 4, '{"title": "Sujets et verbes", "max_score": 2, "statement": "<p>Associe chaque sujet au verbe « jouer » bien conjugué.</p>", "custom_data": {"correct_answer_list": [{"text_left": "je", "text_right": "joue"}, {"text_left": "tu", "text_right": "joues"}, {"text_left": "nous", "text_right": "jouons"}, {"text_left": "ils", "text_right": "jouent"}], "no_error_allowed": false, "show_left_column": true}}')
	) AS v(t, o, d);

-- Le cycle de l'eau
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le cycle de l''eau', '<p>Comprendre les états de l''eau et son parcours dans la nature.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CE2', 'CM1']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['QUESTIONNER_LE_MONDE', 'SCIENCES_TECHNO']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Les états de l''eau", "max_score": 2, "statement": "<p>Associe chaque forme de l''eau à son état.</p>", "custom_data": {"correct_answer_list": [{"text_left": "la glace", "text_right": "solide"}, {"text_left": "la pluie", "text_right": "liquide"}, {"text_left": "la vapeur", "text_right": "gazeux"}], "no_error_allowed": false, "show_left_column": true}}'),
		(9, 2, '{"title": "Le parcours de l''eau", "max_score": 2, "statement": "<p>Remets les étapes du cycle de l''eau dans l''ordre, en partant de la mer.</p>", "custom_data": {"correct_answer_list": [{"text": "évaporation de l''eau de mer", "order_by": 1}, {"text": "formation des nuages", "order_by": 2}, {"text": "pluie", "order_by": 3}, {"text": "ruissellement vers les rivières", "order_by": 4}], "no_error_allowed": false}}'),
		(7, 3, '{"title": "La température de fusion", "max_score": 1, "statement": "<p>À quelle température la glace fond-elle ?</p>", "custom_data": {"correct_answer_list": [{"text": "100 °C", "isChecked": false}, {"text": "0 °C", "isChecked": true}, {"text": "10 °C", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Les fractions simples
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les fractions simples', '<p>Lire, écrire et comparer des fractions simples.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM1']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(3, 1, '{"title": "Rappel", "max_score": 0, "custom_data": {"title": "Rappel", "statement": "<p>Dans la fraction 3/4, le <strong>dénominateur</strong> 4 indique en combien de parts égales on partage ; le <strong>numérateur</strong> 3 indique combien de parts on prend.</p>"}}'),
		(7, 2, '{"title": "La moitié", "max_score": 1, "statement": "<p>Quelle fraction représente la moitié ?</p>", "custom_data": {"correct_answer_list": [{"text": "2/3", "isChecked": false}, {"text": "1/2", "isChecked": true}, {"text": "1/3", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 3, '{"title": "Le dénominateur", "max_score": 1, "statement": "<p>Quel est le dénominateur de la fraction 5/8 ?</p>", "custom_data": {"correct_answer": "8"}}'),
		(7, 4, '{"title": "Comparer", "max_score": 1, "statement": "<p>Quelle fraction est la plus grande ?</p>", "custom_data": {"correct_answer_list": [{"text": "3/4", "isChecked": true}, {"text": "1/4", "isChecked": false}, {"text": "2/4", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(8, 5, '{"title": "Fractions et écritures", "max_score": 2, "statement": "<p>Associe chaque fraction à son écriture en lettres.</p>", "custom_data": {"correct_answer_list": [{"text_left": "1/2", "text_right": "un demi"}, {"text_left": "1/4", "text_right": "un quart"}, {"text_left": "3/4", "text_right": "trois quarts"}, {"text_left": "1/3", "text_right": "un tiers"}], "no_error_allowed": false, "show_left_column": true}}')
	) AS v(t, o, d);

-- Les grandes périodes de l'histoire
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les grandes périodes de l''histoire', '<p>Situer les grandes périodes historiques dans l''ordre.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM1', 'CM2']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['HISTOIRE_GEO']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(9, 1, '{"title": "La frise", "max_score": 2, "statement": "<p>Range les périodes de l''histoire dans l''ordre chronologique.</p>", "custom_data": {"correct_answer_list": [{"text": "la Préhistoire", "order_by": 1}, {"text": "l''Antiquité", "order_by": 2}, {"text": "le Moyen Âge", "order_by": 3}, {"text": "les Temps modernes", "order_by": 4}, {"text": "l''époque contemporaine", "order_by": 5}], "no_error_allowed": false}}'),
		(7, 2, '{"title": "Le début de l''Antiquité", "max_score": 1, "statement": "<p>Quel événement marque le début de l''Antiquité ?</p>", "custom_data": {"correct_answer_list": [{"text": "la prise de la Bastille", "isChecked": false}, {"text": "l''invention de l''écriture", "isChecked": true}, {"text": "la découverte du feu", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(8, 3, '{"title": "Personnages", "max_score": 2, "statement": "<p>Associe chaque personnage à sa période.</p>", "custom_data": {"correct_answer_list": [{"text_left": "Vercingétorix", "text_right": "l''Antiquité"}, {"text_left": "Charlemagne", "text_right": "le Moyen Âge"}, {"text_left": "Louis XIV", "text_right": "les Temps modernes"}], "no_error_allowed": false, "show_left_column": true}}'),
		(4, 4, '{"title": "Une date", "max_score": 1, "statement": "<p>En quelle année a eu lieu la prise de la Bastille ?</p>", "custom_data": {"correct_answer": "1789"}}')
	) AS v(t, o, d);

-- Les accords dans le groupe nominal
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les accords dans le groupe nominal', '<p>Accorder le déterminant, le nom et l''adjectif.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM1', 'CM2']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['FRANCAIS']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Au pluriel", "max_score": 1, "statement": "<p>Quel groupe nominal est bien accordé ?</p>", "custom_data": {"correct_answer_list": [{"text": "des chevaux blanc", "isChecked": false}, {"text": "des chevaux blancs", "isChecked": true}, {"text": "des cheval blancs", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 2, '{"title": "Au féminin", "max_score": 1, "statement": "<p>Écris au féminin : « un chat gris » → « une chatte ... »</p>", "custom_data": {"correct_answer": "grise"}}'),
		(4, 3, '{"title": "Le pluriel en -aux", "max_score": 1, "statement": "<p>Écris le pluriel de « un journal » : des ...</p>", "custom_data": {"correct_answer": "journaux"}}'),
		(5, 4, '{"title": "À toi d''écrire", "max_score": 2, "statement": "<p>Écris une phrase avec un groupe nominal au féminin pluriel contenant un adjectif.</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- Daily routine
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Daily routine', '<p>Décrire sa journée en anglais avec des verbes du quotidien.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM1', 'CM2']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['LANGUES_VIVANTES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Les verbes", "max_score": 2, "statement": "<p>Associe chaque verbe anglais à sa traduction.</p>", "custom_data": {"correct_answer_list": [{"text_left": "to wake up", "text_right": "se réveiller"}, {"text_left": "to eat", "text_right": "manger"}, {"text_left": "to go to school", "text_right": "aller à l''école"}, {"text_left": "to sleep", "text_right": "dormir"}], "no_error_allowed": false, "show_left_column": true}}'),
		(9, 2, '{"title": "Ma journée", "max_score": 2, "statement": "<p>Range ces actions dans l''ordre d''une journée.</p>", "custom_data": {"correct_answer_list": [{"text": "I wake up", "order_by": 1}, {"text": "I have breakfast", "order_by": 2}, {"text": "I go to school", "order_by": 3}, {"text": "I go to bed", "order_by": 4}], "no_error_allowed": false}}'),
		(7, 3, '{"title": "Quelle heure ?", "max_score": 1, "statement": "<p>« It''s seven o''clock » signifie :</p>", "custom_data": {"correct_answer_list": [{"text": "Il est sept heures", "isChecked": true}, {"text": "Il est six heures", "isChecked": false}, {"text": "Il est sept heures et demie", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Les nombres décimaux
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les nombres décimaux', '<p>Comprendre, comparer et calculer avec les nombres décimaux.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM2', '6E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Le chiffre des dixièmes", "max_score": 1, "statement": "<p>Dans 12,47, quel est le chiffre des dixièmes ?</p>", "custom_data": {"correct_answer_list": [{"text": "7", "isChecked": false}, {"text": "2", "isChecked": false}, {"text": "4", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 2, '{"title": "Comparer", "max_score": 1, "statement": "<p>Quel nombre est le plus grand ?</p>", "custom_data": {"correct_answer_list": [{"text": "3,45", "isChecked": false}, {"text": "3,09", "isChecked": false}, {"text": "3,5", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}, "answer_hint": "Compare d''abord les dixièmes."}'),
		(7, 3, '{"title": "Une addition", "max_score": 1, "statement": "<p>Combien font 2,5 + 1,25 ?</p>", "custom_data": {"correct_answer_list": [{"text": "3,30", "isChecked": false}, {"text": "4,75", "isChecked": false}, {"text": "3,75", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(9, 4, '{"title": "Ranger", "max_score": 2, "statement": "<p>Range ces nombres du plus petit au plus grand.</p>", "custom_data": {"correct_answer_list": [{"text": "0,8", "order_by": 1}, {"text": "1,05", "order_by": 2}, {"text": "1,5", "order_by": 3}, {"text": "2", "order_by": 4}], "no_error_allowed": false}}'),
		(7, 5, '{"title": "Multiplier par 10", "max_score": 1, "statement": "<p>Combien font 3,14 x 10 ?</p>", "custom_data": {"correct_answer_list": [{"text": "31,4", "isChecked": true}, {"text": "3,140", "isChecked": false}, {"text": "314", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Les grands repères de la géographie de la France
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les grands repères de la géographie de la France', '<p>Se repérer sur la carte de France : fleuves, montagnes, villes.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM2', '6E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['HISTOIRE_GEO']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Le plus long fleuve", "max_score": 1, "statement": "<p>Quel est le plus long fleuve entièrement français ?</p>", "custom_data": {"correct_answer_list": [{"text": "la Loire", "isChecked": true}, {"text": "la Seine", "isChecked": false}, {"text": "le Rhône", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(8, 2, '{"title": "Fleuves et villes", "max_score": 2, "statement": "<p>Associe chaque fleuve à une ville qu''il traverse.</p>", "custom_data": {"correct_answer_list": [{"text_left": "la Seine", "text_right": "Paris"}, {"text_left": "la Garonne", "text_right": "Bordeaux"}, {"text_left": "le Rhône", "text_right": "Lyon"}, {"text_left": "la Loire", "text_right": "Nantes"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 3, '{"title": "Le plus haut sommet", "max_score": 1, "statement": "<p>Quel est le plus haut sommet de France ?</p>", "custom_data": {"correct_answer_list": [{"text": "le puy de Dôme", "isChecked": false}, {"text": "le Vignemale", "isChecked": false}, {"text": "le mont Blanc", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(6, 4, '{"title": "Les massifs", "max_score": 2, "statement": "<p>Cite deux massifs montagneux français.</p>", "custom_data": {"correct_answer_list": [{"text": "les Alpes"}, {"text": "les Pyrénées"}], "no_error_allowed": false}, "answer_explanation": "<p>Autres réponses acceptables : le Massif central, le Jura, les Vosges.</p>"}')
	) AS v(t, o, d);

-- L'énergie et ses sources
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'L''énergie et ses sources', '<p>Distinguer les sources d''énergie renouvelables et non renouvelables.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM2', '6E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['SCIENCES_TECHNO', 'TECHNOLOGIE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Renouvelables", "max_score": 2, "statement": "<p>Quelles sources d''énergie sont renouvelables ?</p>", "custom_data": {"correct_answer_list": [{"text": "le pétrole", "isChecked": false}, {"text": "le charbon", "isChecked": false}, {"text": "le vent", "isChecked": true}, {"text": "le soleil", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": true}}'),
		(8, 2, '{"title": "Énergie et appareil", "max_score": 2, "statement": "<p>Associe chaque source d''énergie à l''installation qui l''utilise.</p>", "custom_data": {"correct_answer_list": [{"text_left": "le vent", "text_right": "l''éolienne"}, {"text_left": "le soleil", "text_right": "le panneau solaire"}, {"text_left": "l''eau d''une rivière", "text_right": "le barrage"}], "no_error_allowed": false, "show_left_column": true}}'),
		(5, 3, '{"title": "Économiser", "max_score": 2, "statement": "<p>Donne deux gestes pour économiser l''énergie à l''école.</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- Proportionnalité
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Proportionnalité', '<p>Reconnaître une situation de proportionnalité et calculer une quatrième proportionnelle.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['6E', '5E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Le prix des stylos", "max_score": 1, "statement": "<p>3 stylos coûtent 4,50 €. Combien coûtent 5 stylos ?</p>", "custom_data": {"correct_answer_list": [{"text": "7,50 €", "isChecked": true}, {"text": "6,50 €", "isChecked": false}, {"text": "9,00 €", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}, "answer_hint": "Calcule d''abord le prix d''un stylo.", "answer_explanation": "<p>Un stylo coûte 4,50 : 3 = 1,50 € ; 5 stylos coûtent 5 x 1,50 = 7,50 €.</p>"}'),
		(7, 2, '{"title": "Proportionnel ?", "max_score": 1, "statement": "<p>Quelle situation est proportionnelle ?</p>", "custom_data": {"correct_answer_list": [{"text": "La pointure et l''âge", "isChecked": false}, {"text": "Le prix payé et la quantité de pain achetée au même prix au kilo", "isChecked": true}, {"text": "L''âge et la taille d''un enfant", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 3, '{"title": "Un pourcentage", "max_score": 1, "statement": "<p>Combien font 20 % de 50 ?</p>", "custom_data": {"correct_answer": "10"}}'),
		(4, 4, '{"title": "L''échelle", "max_score": 1, "statement": "<p>Sur une carte au 1/100 000, 1 cm représente combien de kilomètres ?</p>", "custom_data": {"correct_answer": "1"}}')
	) AS v(t, o, d);

-- Les nombres relatifs
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les nombres relatifs', '<p>Comparer et additionner des nombres relatifs.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['5E', '4E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(9, 1, '{"title": "Ranger", "max_score": 2, "statement": "<p>Range du plus petit au plus grand.</p>", "custom_data": {"correct_answer_list": [{"text": "-7", "order_by": 1}, {"text": "-2", "order_by": 2}, {"text": "0", "order_by": 3}, {"text": "3", "order_by": 4}], "no_error_allowed": false}}'),
		(4, 2, '{"title": "Une somme", "max_score": 1, "statement": "<p>Calcule (-5) + 8.</p>", "custom_data": {"correct_answer": "3"}}'),
		(4, 3, '{"title": "Une différence", "max_score": 1, "statement": "<p>Calcule 4 - 9.</p>", "custom_data": {"correct_answer": "-5"}}'),
		(7, 4, '{"title": "Le produit", "max_score": 1, "statement": "<p>Quel est le signe du produit (-3) x (-4) ?</p>", "custom_data": {"correct_answer_list": [{"text": "positif", "isChecked": true}, {"text": "négatif", "isChecked": false}, {"text": "nul", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Le théorème de Pythagore
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le théorème de Pythagore', '<p>Calculer une longueur dans un triangle rectangle.</p>', 3,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['4E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(3, 1, '{"title": "Rappel", "max_score": 0, "custom_data": {"title": "Rappel", "statement": "<p>Dans un triangle rectangle, le carré de l''hypoténuse est égal à la somme des carrés des deux autres côtés.</p>"}}'),
		(4, 2, '{"title": "L''hypoténuse", "max_score": 1, "statement": "<p>Un triangle est rectangle ; ses côtés de l''angle droit mesurent 3 cm et 4 cm. Combien mesure l''hypoténuse (en cm) ?</p>", "custom_data": {"correct_answer": "5"}, "answer_explanation": "<p>3² + 4² = 9 + 16 = 25, et √25 = 5.</p>"}'),
		(4, 3, '{"title": "Un côté", "max_score": 1, "statement": "<p>L''hypoténuse mesure 13 cm et un côté 5 cm. Combien mesure le troisième côté (en cm) ?</p>", "custom_data": {"correct_answer": "12"}, "answer_explanation": "<p>13² - 5² = 169 - 25 = 144, et √144 = 12.</p>"}'),
		(7, 4, '{"title": "Rectangle ?", "max_score": 1, "statement": "<p>Un triangle a pour côtés 6 cm, 8 cm et 10 cm. Est-il rectangle ?</p>", "custom_data": {"correct_answer_list": [{"text": "non", "isChecked": false}, {"text": "on ne peut pas savoir", "isChecked": false}, {"text": "oui", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Équations du premier degré
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Équations du premier degré', '<p>Résoudre des équations simples.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['4E', '3E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Équation 1", "max_score": 1, "statement": "<p>Résous : x + 7 = 12. x = ?</p>", "custom_data": {"correct_answer": "5"}}'),
		(4, 2, '{"title": "Équation 2", "max_score": 1, "statement": "<p>Résous : 3x = 21. x = ?</p>", "custom_data": {"correct_answer": "7"}}'),
		(4, 3, '{"title": "Équation 3", "max_score": 1, "statement": "<p>Résous : 2x + 3 = 11. x = ?</p>", "custom_data": {"correct_answer": "4"}}'),
		(7, 4, '{"title": "La bonne méthode", "max_score": 1, "statement": "<p>Pour résoudre 5x - 2 = 13, on commence par :</p>", "custom_data": {"correct_answer_list": [{"text": "soustraire 13 aux deux membres", "isChecked": false}, {"text": "ajouter 2 aux deux membres", "isChecked": true}, {"text": "diviser par 5 le seul membre de gauche", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Les fonctions affines
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les fonctions affines', '<p>Lire et calculer avec une fonction affine.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['3E', '2NDE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Une image", "max_score": 1, "statement": "<p>Soit f(x) = 2x + 1. Calcule f(3).</p>", "custom_data": {"correct_answer": "7"}}'),
		(7, 2, '{"title": "Le coefficient directeur", "max_score": 1, "statement": "<p>Quel est le coefficient directeur de f(x) = -3x + 5 ?</p>", "custom_data": {"correct_answer_list": [{"text": "3", "isChecked": false}, {"text": "-3", "isChecked": true}, {"text": "5", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 3, '{"title": "Une fonction linéaire", "max_score": 1, "statement": "<p>Laquelle de ces fonctions est linéaire ?</p>", "custom_data": {"correct_answer_list": [{"text": "h(x) = 4x + 1", "isChecked": false}, {"text": "k(x) = x²", "isChecked": false}, {"text": "g(x) = 4x", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 4, '{"title": "Un antécédent", "max_score": 1, "statement": "<p>Soit f(x) = 2x - 4. Quel est l''antécédent de 0 ?</p>", "custom_data": {"correct_answer": "2"}}')
	) AS v(t, o, d);

-- Les classes grammaticales
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les classes grammaticales', '<p>Identifier la nature des mots dans une phrase.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['6E', '5E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['FRANCAIS']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Nature des mots", "max_score": 3, "statement": "<p>Associe chaque mot de la phrase « Le petit chat dort paisiblement » à sa nature.</p>", "custom_data": {"correct_answer_list": [{"text_left": "Le", "text_right": "déterminant"}, {"text_left": "petit", "text_right": "adjectif"}, {"text_left": "chat", "text_right": "nom"}, {"text_left": "dort", "text_right": "verbe"}, {"text_left": "paisiblement", "text_right": "adverbe"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 2, '{"title": "Pronom", "max_score": 2, "statement": "<p>Dans « Elle lui parle », quels mots sont des pronoms ?</p>", "custom_data": {"correct_answer_list": [{"text": "Elle", "isChecked": true}, {"text": "lui", "isChecked": true}, {"text": "parle", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": true}}'),
		(5, 3, '{"title": "Rédaction", "max_score": 2, "statement": "<p>Écris une phrase contenant un adverbe et souligne-le (écris-le en majuscules).</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- Les figures de style
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Les figures de style', '<p>Reconnaître comparaison, métaphore, personnification et hyperbole.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['4E', '3E', '2NDE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['FRANCAIS']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Identifier", "max_score": 4, "statement": "<p>Associe chaque phrase à la figure de style qu''elle contient.</p>", "custom_data": {"correct_answer_list": [{"text_left": "Il est fort comme un lion.", "text_right": "comparaison"}, {"text_left": "Cet homme est un lion.", "text_right": "métaphore"}, {"text_left": "Le vent hurlait dans la nuit.", "text_right": "personnification"}, {"text_left": "Je meurs de faim.", "text_right": "hyperbole"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 2, '{"title": "Le mot-outil", "max_score": 1, "statement": "<p>Quel mot signale souvent une comparaison ?</p>", "custom_data": {"correct_answer_list": [{"text": "comme", "isChecked": true}, {"text": "et", "isChecked": false}, {"text": "donc", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(5, 3, '{"title": "Créer", "max_score": 2, "statement": "<p>Invente une métaphore pour décrire la mer.</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- La Révolution française
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'La Révolution française', '<p>Les grandes étapes de la Révolution française.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['4E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['HISTOIRE_GEO']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(9, 1, '{"title": "Chronologie", "max_score": 2, "statement": "<p>Range ces événements dans l''ordre chronologique.</p>", "custom_data": {"correct_answer_list": [{"text": "réunion des États généraux (mai 1789)", "order_by": 1}, {"text": "prise de la Bastille (juillet 1789)", "order_by": 2}, {"text": "Déclaration des droits de l''homme et du citoyen (août 1789)", "order_by": 3}, {"text": "proclamation de la République (septembre 1792)", "order_by": 4}], "no_error_allowed": false}}'),
		(7, 2, '{"title": "La Déclaration", "max_score": 1, "statement": "<p>Quel texte est adopté en août 1789 ?</p>", "custom_data": {"correct_answer_list": [{"text": "la Déclaration des droits de l''homme et du citoyen", "isChecked": true}, {"text": "le Code civil", "isChecked": false}, {"text": "la Constitution de la Ve République", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 3, '{"title": "La fête nationale", "max_score": 1, "statement": "<p>Quel jour de l''année célèbre-t-on la fête nationale ? (jour et mois)</p>", "custom_data": {"correct_answer": "14 juillet"}}'),
		(5, 4, '{"title": "Expliquer", "max_score": 3, "statement": "<p>Explique en quelques lignes pourquoi l''abolition des privilèges (4 août 1789) est un tournant.</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- La Première Guerre mondiale
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'La Première Guerre mondiale', '<p>Repères et caractéristiques d''une guerre totale.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['3E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['HISTOIRE_GEO']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(6, 1, '{"title": "Les dates", "max_score": 2, "statement": "<p>Donne l''année du début puis l''année de la fin de la Première Guerre mondiale.</p>", "custom_data": {"correct_answer_list": [{"text": "1914"}, {"text": "1918"}], "no_error_allowed": false}}'),
		(7, 2, '{"title": "Verdun", "max_score": 1, "statement": "<p>En quelle année a eu lieu la bataille de Verdun ?</p>", "custom_data": {"correct_answer_list": [{"text": "1914", "isChecked": false}, {"text": "1918", "isChecked": false}, {"text": "1916", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 3, '{"title": "L''armistice", "max_score": 1, "statement": "<p>Quelle est la date de l''armistice ?</p>", "custom_data": {"correct_answer_list": [{"text": "14 juillet 1919", "isChecked": false}, {"text": "11 novembre 1918", "isChecked": true}, {"text": "8 mai 1945", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(5, 4, '{"title": "Guerre totale", "max_score": 3, "statement": "<p>Pourquoi parle-t-on de « guerre totale » ? Donne deux arguments.</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- La cellule, unité du vivant
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'La cellule, unité du vivant', '<p>Les constituants de la cellule animale et végétale.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['6E', '5E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['SVT']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(6, 1, '{"title": "Constituants communs", "max_score": 3, "statement": "<p>Cite trois constituants communs aux cellules animales et végétales.</p>", "custom_data": {"correct_answer_list": [{"text": "noyau"}, {"text": "cytoplasme"}, {"text": "membrane"}], "no_error_allowed": false}}'),
		(7, 2, '{"title": "Propre aux végétaux", "max_score": 1, "statement": "<p>Quel élément trouve-t-on seulement dans la cellule végétale ?</p>", "custom_data": {"correct_answer_list": [{"text": "le noyau", "isChecked": false}, {"text": "la membrane", "isChecked": false}, {"text": "la paroi", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 3, '{"title": "Observer", "max_score": 1, "statement": "<p>Quel instrument faut-il pour observer une cellule ?</p>", "custom_data": {"correct_answer_list": [{"text": "un microscope", "isChecked": true}, {"text": "une loupe à main", "isChecked": false}, {"text": "une paire de jumelles", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- La digestion
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'La digestion', '<p>Le trajet des aliments et le rôle des organes digestifs.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['5E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['SVT']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(9, 1, '{"title": "Le trajet", "max_score": 2, "statement": "<p>Range les organes dans l''ordre du trajet des aliments.</p>", "custom_data": {"correct_answer_list": [{"text": "la bouche", "order_by": 1}, {"text": "l''œsophage", "order_by": 2}, {"text": "l''estomac", "order_by": 3}, {"text": "l''intestin grêle", "order_by": 4}, {"text": "le gros intestin", "order_by": 5}], "no_error_allowed": false}}'),
		(7, 2, '{"title": "L''absorption", "max_score": 1, "statement": "<p>Dans quel organe les nutriments passent-ils dans le sang ?</p>", "custom_data": {"correct_answer_list": [{"text": "l''estomac", "isChecked": false}, {"text": "l''œsophage", "isChecked": false}, {"text": "l''intestin grêle", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 3, '{"title": "Les enzymes", "max_score": 1, "statement": "<p>Quel est le rôle des enzymes digestives ?</p>", "custom_data": {"correct_answer_list": [{"text": "fabriquer des globules", "isChecked": false}, {"text": "découper les aliments en nutriments", "isChecked": true}, {"text": "transporter l''oxygène", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- États et changements d'état de la matière
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'États et changements d''état de la matière', '<p>Solide, liquide, gaz et les changements d''état.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['5E', '4E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['PHYSIQUE_CHIMIE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Changements d''état", "max_score": 4, "statement": "<p>Associe chaque changement d''état à son nom.</p>", "custom_data": {"correct_answer_list": [{"text_left": "solide → liquide", "text_right": "fusion"}, {"text_left": "liquide → solide", "text_right": "solidification"}, {"text_left": "liquide → gaz", "text_right": "vaporisation"}, {"text_left": "gaz → liquide", "text_right": "liquéfaction"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 2, '{"title": "La masse", "max_score": 1, "statement": "<p>Lors d''un changement d''état, la masse :</p>", "custom_data": {"correct_answer_list": [{"text": "se conserve", "isChecked": true}, {"text": "augmente", "isChecked": false}, {"text": "diminue", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 3, '{"title": "Ébullition", "max_score": 1, "statement": "<p>À quelle température l''eau pure bout-elle à pression normale ? (en °C, nombre seul)</p>", "custom_data": {"correct_answer": "100"}}')
	) AS v(t, o, d);

-- Le circuit électrique
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le circuit électrique', '<p>Réaliser et lire un circuit électrique simple.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['5E', '4E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['PHYSIQUE_CHIMIE', 'TECHNOLOGIE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Circuit fermé", "max_score": 1, "statement": "<p>Pour qu''une lampe brille, le circuit doit être :</p>", "custom_data": {"correct_answer_list": [{"text": "fermé", "isChecked": true}, {"text": "ouvert", "isChecked": false}, {"text": "coupé", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 2, '{"title": "Conducteurs", "max_score": 2, "statement": "<p>Quels matériaux sont des conducteurs électriques ?</p>", "custom_data": {"correct_answer_list": [{"text": "le plastique", "isChecked": false}, {"text": "le verre", "isChecked": false}, {"text": "le cuivre", "isChecked": true}, {"text": "l''aluminium", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": true}}'),
		(4, 3, '{"title": "La loi d''Ohm", "max_score": 1, "statement": "<p>U = R x I. Avec R = 10 Ω et I = 0,5 A, combien vaut U (en volts) ?</p>", "custom_data": {"correct_answer": "5"}}')
	) AS v(t, o, d);

-- Algorithmique et programmation
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Algorithmique et programmation', '<p>Lire un algorithme simple et prévoir son résultat.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['5E', '4E', '3E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['TECHNOLOGIE', 'MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Une boucle", "max_score": 1, "statement": "<p>Un lutin avance de 10 pas, et l''on répète cette instruction 4 fois. De combien de pas a-t-il avancé ?</p>", "custom_data": {"correct_answer": "40"}}'),
		(7, 2, '{"title": "Une condition", "max_score": 1, "statement": "<p>Quelle instruction exécute une action seulement si une condition est vraie ?</p>", "custom_data": {"correct_answer_list": [{"text": "répéter 10 fois", "isChecked": false}, {"text": "attendre 1 seconde", "isChecked": false}, {"text": "si … alors", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(4, 3, '{"title": "Une variable", "max_score": 1, "statement": "<p>On met 5 dans la variable n, puis on ajoute 3 à n. Que vaut n ?</p>", "custom_data": {"correct_answer": "8"}}'),
		(9, 4, '{"title": "Un carré", "max_score": 2, "statement": "<p>Remets dans l''ordre le programme qui trace un carré.</p>", "custom_data": {"correct_answer_list": [{"text": "stylo en position d''écriture", "order_by": 1}, {"text": "répéter 4 fois", "order_by": 2}, {"text": "avancer de 50", "order_by": 3}, {"text": "tourner de 90 degrés", "order_by": 4}], "no_error_allowed": false}}')
	) AS v(t, o, d);

-- Talking about the past
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Talking about the past', '<p>Le prétérit des verbes réguliers et irréguliers.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['4E', '3E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['LANGUES_VIVANTES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Irregular verbs", "max_score": 2, "statement": "<p>Associe chaque verbe à son prétérit.</p>", "custom_data": {"correct_answer_list": [{"text_left": "go", "text_right": "went"}, {"text_left": "see", "text_right": "saw"}, {"text_left": "eat", "text_right": "ate"}, {"text_left": "take", "text_right": "took"}], "no_error_allowed": false, "show_left_column": true}}'),
		(4, 2, '{"title": "Regular verb", "max_score": 1, "statement": "<p>Mets au prétérit : « I play football. » → « I ... football. »</p>", "custom_data": {"correct_answer": "played"}}'),
		(7, 3, '{"title": "Negative", "max_score": 1, "statement": "<p>Quelle est la forme négative de « She went to London » ?</p>", "custom_data": {"correct_answer_list": [{"text": "She don''t go to London", "isChecked": false}, {"text": "She didn''t go to London", "isChecked": true}, {"text": "She didn''t went to London", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Statistiques descriptives
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Statistiques descriptives', '<p>Moyenne, médiane et étendue d''une série.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['2NDE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(3, 1, '{"title": "La série", "max_score": 0, "custom_data": {"title": "La série", "statement": "<p>Notes d''un élève : 8 ; 12 ; 15 ; 10 ; 15.</p>"}}'),
		(4, 2, '{"title": "La moyenne", "max_score": 1, "statement": "<p>Quelle est la moyenne de la série ?</p>", "custom_data": {"correct_answer": "12"}}'),
		(4, 3, '{"title": "La médiane", "max_score": 1, "statement": "<p>Quelle est la médiane de la série ?</p>", "custom_data": {"correct_answer": "12"}}'),
		(4, 4, '{"title": "L''étendue", "max_score": 1, "statement": "<p>Quelle est l''étendue de la série ?</p>", "custom_data": {"correct_answer": "7"}}'),
		(7, 5, '{"title": "Le mode", "max_score": 1, "statement": "<p>Quelle valeur apparaît le plus souvent ?</p>", "custom_data": {"correct_answer_list": [{"text": "12", "isChecked": false}, {"text": "8", "isChecked": false}, {"text": "15", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Le second degré
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le second degré', '<p>Forme développée, racines et signe d''un trinôme.</p>', 4,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['1ERE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Le discriminant", "max_score": 1, "statement": "<p>Calcule le discriminant de x² - 5x + 6.</p>", "custom_data": {"correct_answer": "1"}}'),
		(6, 2, '{"title": "Les racines", "max_score": 2, "statement": "<p>Donne les deux racines de x² - 5x + 6.</p>", "custom_data": {"correct_answer_list": [{"text": "2"}, {"text": "3"}], "no_error_allowed": false}}'),
		(7, 3, '{"title": "Pas de racine", "max_score": 1, "statement": "<p>Si le discriminant est strictement négatif, le trinôme a :</p>", "custom_data": {"correct_answer_list": [{"text": "une racine double", "isChecked": false}, {"text": "deux racines réelles", "isChecked": false}, {"text": "aucune racine réelle", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Dérivation
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Dérivation', '<p>Calculer des dérivées usuelles.</p>', 6,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['1ERE', 'TLE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['MATHEMATIQUES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Dérivées usuelles", "max_score": 4, "statement": "<p>Associe chaque fonction à sa dérivée.</p>", "custom_data": {"correct_answer_list": [{"text_left": "x²", "text_right": "2x"}, {"text_left": "x³", "text_right": "3x²"}, {"text_left": "1/x", "text_right": "-1/x²"}, {"text_left": "√x", "text_right": "1/(2√x)"}], "no_error_allowed": false, "show_left_column": true}}'),
		(4, 2, '{"title": "Un polynôme", "max_score": 1, "statement": "<p>Quelle est la dérivée de f(x) = 3x² + 2x ? (écris sous la forme ax+b, ex. 6x+2)</p>", "custom_data": {"correct_answer": "6x+2"}}'),
		(7, 3, '{"title": "Sens de variation", "max_score": 1, "statement": "<p>Si f''(x) > 0 sur un intervalle, f est sur cet intervalle :</p>", "custom_data": {"correct_answer_list": [{"text": "décroissante", "isChecked": false}, {"text": "constante", "isChecked": false}, {"text": "croissante", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- La conscience et l'inconscient
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'La conscience et l''inconscient', '<p>Notions et auteurs : un premier parcours de philosophie.</p>', 8,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['TLE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['PHILOSOPHIE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Auteurs et thèses", "max_score": 3, "statement": "<p>Associe chaque auteur à une idée qui lui est attachée.</p>", "custom_data": {"correct_answer_list": [{"text_left": "Descartes", "text_right": "« Je pense, donc je suis »"}, {"text_left": "Freud", "text_right": "l''inconscient psychique"}, {"text_left": "Socrate", "text_right": "« Connais-toi toi-même »"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 2, '{"title": "Le cogito", "max_score": 1, "statement": "<p>Le cogito cartésien établit d''abord la certitude :</p>", "custom_data": {"correct_answer_list": [{"text": "de l''existence des autres", "isChecked": false}, {"text": "de l''existence du sujet pensant", "isChecked": true}, {"text": "de l''existence du monde extérieur", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(5, 3, '{"title": "Dissertation (introduction)", "max_score": 4, "statement": "<p>Rédige une problématique pour le sujet : « Peut-on se connaître soi-même ? »</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- Le marché et la formation des prix
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Le marché et la formation des prix', '<p>Offre, demande et équilibre de marché.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['2NDE', '1ERE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['SES']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "La demande", "max_score": 1, "statement": "<p>Toutes choses égales par ailleurs, quand le prix augmente, la quantité demandée :</p>", "custom_data": {"correct_answer_list": [{"text": "diminue", "isChecked": true}, {"text": "augmente", "isChecked": false}, {"text": "ne change pas", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(7, 2, '{"title": "L''équilibre", "max_score": 1, "statement": "<p>Le prix d''équilibre est le prix pour lequel :</p>", "custom_data": {"correct_answer_list": [{"text": "l''offre est égale à la demande", "isChecked": true}, {"text": "l''offre est maximale", "isChecked": false}, {"text": "la demande est nulle", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(8, 3, '{"title": "Vocabulaire", "max_score": 3, "statement": "<p>Associe chaque terme à sa définition.</p>", "custom_data": {"correct_answer_list": [{"text_left": "offreur", "text_right": "celui qui vend un bien ou un service"}, {"text_left": "demandeur", "text_right": "celui qui souhaite acheter"}, {"text_left": "pénurie", "text_right": "demande supérieure à l''offre"}], "no_error_allowed": false, "show_left_column": true}}')
	) AS v(t, o, d);

-- Mouvement et vitesse
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Mouvement et vitesse', '<p>Calculer une vitesse moyenne et décrire un mouvement.</p>', 3,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['2NDE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['PHYSIQUE_CHIMIE']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(4, 1, '{"title": "Vitesse moyenne", "max_score": 1, "statement": "<p>Un cycliste parcourt 30 km en 1,5 h. Quelle est sa vitesse moyenne en km/h ?</p>", "custom_data": {"correct_answer": "20"}}'),
		(4, 2, '{"title": "Conversion", "max_score": 1, "statement": "<p>Convertis 36 km/h en m/s (nombre seul).</p>", "custom_data": {"correct_answer": "10"}, "answer_hint": "Divise par 3,6."}'),
		(7, 3, '{"title": "Le référentiel", "max_score": 1, "statement": "<p>Un passager assis dans un train qui roule est immobile par rapport :</p>", "custom_data": {"correct_answer_list": [{"text": "aux arbres", "isChecked": false}, {"text": "au train", "isChecked": true}, {"text": "au quai", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- Internet et le Web
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Internet et le Web', '<p>Distinguer Internet et le Web, comprendre une adresse.</p>', 5,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['2NDE']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['SNT']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(7, 1, '{"title": "Internet ou Web ?", "max_score": 1, "statement": "<p>Le Web est :</p>", "custom_data": {"correct_answer_list": [{"text": "un service qui fonctionne grâce à Internet", "isChecked": true}, {"text": "un synonyme exact d''Internet", "isChecked": false}, {"text": "un câble sous-marin", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(8, 2, '{"title": "Protocoles", "max_score": 3, "statement": "<p>Associe chaque protocole à son rôle.</p>", "custom_data": {"correct_answer_list": [{"text_left": "HTTP", "text_right": "transférer des pages web"}, {"text_left": "IP", "text_right": "adresser et acheminer les paquets"}, {"text_left": "DNS", "text_right": "traduire un nom de domaine en adresse IP"}], "no_error_allowed": false, "show_left_column": true}}'),
		(7, 3, '{"title": "HTTPS", "max_score": 1, "statement": "<p>Que garantit le « S » de HTTPS ?</p>", "custom_data": {"correct_answer_list": [{"text": "la gratuité du site", "isChecked": false}, {"text": "le chiffrement des échanges", "isChecked": true}, {"text": "la rapidité du site", "isChecked": false}], "no_error_allowed": false, "multipleAnswers": false}}')
	) AS v(t, o, d);

-- La Guerre froide
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'La Guerre froide', '<p>Un monde bipolaire de 1947 à 1991.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['TLE', '3E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['HISTOIRE_GEO']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(8, 1, '{"title": "Les deux blocs", "max_score": 2, "statement": "<p>Associe chaque bloc à sa puissance dominante.</p>", "custom_data": {"correct_answer_list": [{"text_left": "bloc de l''Ouest", "text_right": "les États-Unis"}, {"text_left": "bloc de l''Est", "text_right": "l''URSS"}], "no_error_allowed": false, "show_left_column": true}}'),
		(9, 2, '{"title": "Chronologie", "max_score": 2, "statement": "<p>Range ces événements dans l''ordre chronologique.</p>", "custom_data": {"correct_answer_list": [{"text": "blocus de Berlin (1948)", "order_by": 1}, {"text": "crise de Cuba (1962)", "order_by": 2}, {"text": "chute du mur de Berlin (1989)", "order_by": 3}, {"text": "disparition de l''URSS (1991)", "order_by": 4}], "no_error_allowed": false}}'),
		(5, 3, '{"title": "Expliquer", "max_score": 3, "statement": "<p>Pourquoi parle-t-on de guerre « froide » ?</p>", "custom_data": {}}')
	) AS v(t, o, d);

-- Citoyenneté et institutions
WITH s AS (
	INSERT INTO exercizer.subject (folder_id, owner, owner_username, title, description, max_score,
		is_library_subject, is_deleted, authors_contributors, type)
	VALUES (NULL, 'open-ent-catalogue', 'Open ENT', 'Citoyenneté et institutions', '<p>Les principes et institutions de la République.</p>', 7,
		true, false, 'Équipe pédagogique Open ENT', 'interactive')
	RETURNING id
), l AS (
	INSERT INTO exercizer.subject_level (subject_id, level_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_level AS x WHERE x.code = ANY(ARRAY['CM2', '3E']::varchar[])
), d AS (
	INSERT INTO exercizer.subject_discipline (subject_id, discipline_id)
	SELECT s.id, x.id FROM s, exercizer.subject_lesson_type AS x WHERE x.code = ANY(ARRAY['EMC']::varchar[])
)
INSERT INTO exercizer.grain (subject_id, grain_type_id, order_by, grain_data)
SELECT s.id, v.t, v.o, v.d FROM s, (VALUES
		(6, 1, '{"title": "La devise", "max_score": 3, "statement": "<p>Cite les trois mots de la devise de la République française.</p>", "custom_data": {"correct_answer_list": [{"text": "Liberté"}, {"text": "Égalité"}, {"text": "Fraternité"}], "no_error_allowed": false}}'),
		(7, 2, '{"title": "Le vote", "max_score": 1, "statement": "<p>À partir de quel âge peut-on voter en France ?</p>", "custom_data": {"correct_answer_list": [{"text": "16 ans", "isChecked": false}, {"text": "21 ans", "isChecked": false}, {"text": "18 ans", "isChecked": true}], "no_error_allowed": false, "multipleAnswers": false}}'),
		(8, 3, '{"title": "Institutions", "max_score": 3, "statement": "<p>Associe chaque institution à son rôle.</p>", "custom_data": {"correct_answer_list": [{"text_left": "le Parlement", "text_right": "vote les lois"}, {"text_left": "le Gouvernement", "text_right": "conduit la politique de la nation"}, {"text_left": "les juges", "text_right": "rendent la justice"}], "no_error_allowed": false, "show_left_column": true}}')
	) AS v(t, o, d);
