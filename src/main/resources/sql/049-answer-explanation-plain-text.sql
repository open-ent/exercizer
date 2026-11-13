-- L'explication d'une réponse (grain_data.answer_explanation) est du TEXTE : zone de texte dans les
-- deux éditeurs, affichée telle quelle à la correction et à l'impression. Le générateur des packs
-- pédagogiques l'enveloppait dans un <p>, et les élèves voyaient les balises (près de 2 000
-- questions). Le générateur et l'installation des packs sont corrigés ; on ramène ici au texte ce
-- qui est déjà en base : les sujets (catalogue, copies faites par les enseignants) et les sujets
-- distribués (grain_scheduled). Les copies d'élèves (grain_copy) ne portent pas l'explication.
--
-- Même règle que fr.openent.exercizer.utils.PlainText : fins de bloc et <br> → saut de ligne,
-- balises retirées, entités courantes décodées. Seules les valeurs qui portent une balise connue
-- sont touchées : un « x < 3 » écrit à la main reste tel quel. Une ligne dont grain_data n'est pas
-- du JSON lisible est laissée de côté plutôt que de faire échouer la migration.

CREATE OR REPLACE FUNCTION exercizer._html_to_text(html TEXT) RETURNS TEXT AS $$
  SELECT btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(html, '</(p|div|li|h[1-6])>\s*|<br\s*/?>', E'\n', 'gi'),
        '</?(p|br|strong|em|b|i|u|span|div|ul|ol|li|sup|sub|h[1-6]|a)([\s/][^>]*)?>', '', 'gi'),
      '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&#x27;', ''''),
      '&amp;', '&'),
    E'\n{3,}', E'\n\n', 'g'), E' \n\t');
$$ LANGUAGE sql IMMUTABLE;

DO $$
DECLARE
  r RECORD;
  d JSONB;
  tag CONSTANT TEXT := '</?(p|br|strong|em|b|i|u|span|div|ul|ol|li|sup|sub|h[1-6]|a)([\s/][^>]*)?>';
BEGIN
  FOR r IN SELECT id, grain_data FROM exercizer.grain WHERE grain_data LIKE '%answer_explanation%' LOOP
    BEGIN
      d := r.grain_data::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(d) = 'object' AND jsonb_typeof(d -> 'answer_explanation') = 'string'
        AND (d ->> 'answer_explanation') ~* tag THEN
      UPDATE exercizer.grain
         SET grain_data = jsonb_set(d, '{answer_explanation}',
                                    to_jsonb(exercizer._html_to_text(d ->> 'answer_explanation')))::text
       WHERE id = r.id;
    END IF;
  END LOOP;

  FOR r IN SELECT id, grain_data FROM exercizer.grain_scheduled WHERE grain_data LIKE '%answer_explanation%' LOOP
    BEGIN
      d := r.grain_data::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(d) = 'object' AND jsonb_typeof(d -> 'answer_explanation') = 'string'
        AND (d ->> 'answer_explanation') ~* tag THEN
      UPDATE exercizer.grain_scheduled
         SET grain_data = jsonb_set(d, '{answer_explanation}',
                                    to_jsonb(exercizer._html_to_text(d ->> 'answer_explanation')))::text
       WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION exercizer._html_to_text(TEXT);
