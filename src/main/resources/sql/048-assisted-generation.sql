-- Création assistée en arrière-plan : le devoir, lu dans le navigateur, est confié au serveur, qui
-- demande le brouillon à l'IA du dashboard pendant que l'enseignant fait autre chose. Il est prévenu
-- par le fil d'actualité, puis relit le brouillon avant que le sujet ne soit créé.
--
-- `input` garde ce qu'il faut pour rejouer le brouillon à la relecture (lignes lues avec leurs
-- coordonnées, figures) ; les images des pages ne sont pas conservées. `draft` est la réponse de
-- l'IA, telle que la route du dashboard la rend. Une génération est supprimée à la création du sujet.
CREATE TABLE exercizer.assisted_generation (
	id BIGSERIAL PRIMARY KEY,
	owner VARCHAR(36) NOT NULL,
	title VARCHAR(255),
	folder_id BIGINT,
	document_id VARCHAR(36),
	document_name VARCHAR(255),
	status VARCHAR(16) NOT NULL DEFAULT 'pending',
	input JSONB,
	draft JSONB,
	error TEXT,
	created TIMESTAMP NOT NULL DEFAULT NOW(),
	modified TIMESTAMP NOT NULL DEFAULT NOW(),
	CONSTRAINT assisted_generation_status_check CHECK (status IN ('pending', 'ready', 'error'))
);

CREATE INDEX assisted_generation_owner_idx ON exercizer.assisted_generation (owner, created DESC);
