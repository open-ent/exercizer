-- Affichage grand format pour les jeunes élèves (cycles 1 et 2) : gros caractères, une question à
-- l'écran, lecture de l'énoncé à voix haute. Choisi sur le sujet par l'enseignant, recopié sur la
-- distribution au moment où elle est créée — c'est elle que lit l'écran de l'élève.
ALTER TABLE exercizer.subject ADD COLUMN large_display BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exercizer.subject_scheduled ADD COLUMN large_display BOOLEAN NOT NULL DEFAULT FALSE;
