-- Site public d'entraînement (drapeau de configuration public-catalog.enabled, éteint par défaut).
--
-- 1. Un sujet du catalogue n'est montré hors connexion que si un modérateur l'a publié sur le site
--    public (is_public). Un sujet de pack réservé aux établissements abonnés ne l'est jamais, même
--    marqué : la garde des packs s'applique en plus (cf. CatalogSql.packAccessGuard).
-- 2. L'entraînement libre : une tentative par passage, corrigée PAR LE SERVEUR. On garde les
--    réponses pour que l'usager retrouve ce qu'il a répondu, jamais les réponses attendues.
--    Une tentative anonyme n'est pas enregistrée.

ALTER TABLE exercizer.subject ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS subject_public_idx ON exercizer.subject (id) WHERE is_public;

CREATE TABLE exercizer.practice_attempt (
	id BIGSERIAL PRIMARY KEY,
	user_id VARCHAR(36) NOT NULL,
	subject_id BIGINT NOT NULL REFERENCES exercizer.subject(id) ON DELETE CASCADE,
	score DOUBLE PRECISION NOT NULL,
	max_score DOUBLE PRECISION NOT NULL,
	answers JSONB NOT NULL DEFAULT '[]',
	created TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX practice_attempt_user_idx ON exercizer.practice_attempt (user_id, created DESC);
CREATE INDEX practice_attempt_subject_idx ON exercizer.practice_attempt (subject_id);
