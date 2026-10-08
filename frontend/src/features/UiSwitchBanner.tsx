import { Button, FormControl, Input, Label } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getUiPreference, setUiPreference, UiPreference } from '../api';

/** Au-delà, l'information a été transmise : continuer à occuper le bas de l'écran serait pénible. */
const MAX_DISPLAYS = 5;

/**
 * Réglage durable du choix d'interface, dans le dashboard — hors de cette application, à dessein.
 * Un lien permanent vers l'ancienne version, posé dans la nouvelle, y laisserait une trace de
 * l'interface qu'on remplace ; et il faudrait l'y poser puis l'en retirer pour chaque module migré.
 * Ce bandeau fait découvrir le changement et s'efface ; la page de réglages gouverne.
 * Chemin figé : le module n'a aucun moyen de découvrir le `basePath` du dashboard, qui vaut
 * `/dashboard` en local comme en production.
 */
const SETTINGS_URL = '/dashboard/account/settings';

/**
 * Bandeau de retour vers l'IHM AngularJS, pendant la période de cohabitation des deux interfaces.
 *
 * Symétrique de l'invitation posée sur l'ancienne IHM (`public/ui-switch.js`) : celle-ci propose
 * d'essayer la nouvelle, celui-ci laisse la porte ouverte dans l'autre sens — personne ne doit se
 * sentir enfermé dans une interface qu'il n'a pas choisie. Le retour en arrière passe par une
 * question en une ligne : c'est le seul moment où l'on saura POURQUOI quelqu'un repart.
 *
 * La réponse est stockée dans la préférence elle-même, faute de collecteur dédié. Pour la relire :
 * {@code MATCH (u:User)-[:PREFERS]->(uac:UserAppConf) WHERE uac.exercizerUi CONTAINS 'feedback'
 *  RETURN u.id, uac.exercizerUi}
 */
export function UiSwitchBanner() {
  const { t } = useTranslation(['exercizer', 'common']);
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [hidden, setHidden] = useState(false);

  const preferenceQuery = useQuery({
    queryKey: ['exercizer', 'ui-preference'],
    queryFn: getUiPreference,
    staleTime: Infinity,
  });

  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (preference: UiPreference) => setUiPreference(preference),
    // La préférence est réécrite ENTIÈRE à chaque fois : sans remettre le résultat en cache, une
    // seconde écriture repartirait de la version d'avant et effacerait la première (le compteur
    // d'affichages, typiquement).
    onSuccess: (_data, preference) =>
      queryClient.setQueryData(['exercizer', 'ui-preference'], preference),
  });

  const preference = preferenceQuery.data;
  const visible =
    !!preference &&
    !hidden &&
    !preference.returnDismissed &&
    (preference.returnShown ?? 0) < MAX_DISPLAYS;

  // Un affichage compté une seule fois par chargement de page, et jamais pendant le rendu.
  const counted = useRef(false);
  useEffect(() => {
    if (!visible || counted.current || !preference) return;
    counted.current = true;
    save.mutate({ ...preference, returnShown: (preference.returnShown ?? 0) + 1 });
    // `save` est stable (useMutation) ; le ref garantit l'unicité, inutile de l'ajouter aux
    // dépendances au risque d'une boucle d'écriture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, preference]);

  // Tant que la préférence n'est pas connue, on n'affiche rien : un bandeau qui apparaît puis
  // disparaît une seconde plus tard est plus déroutant qu'un bandeau qui arrive tard.
  if (!visible || !preference) return null;

  const goBack = (withFeedback: boolean) => {
    const answer = feedback.trim();
    void save
      .mutateAsync({
        ...preference,
        ui: 'angular',
        ...(withFeedback && answer
          ? { feedback: answer, feedbackAt: new Date().toISOString() }
          : {}),
      })
      .finally(() => {
        // `?ui=angular` double l'enregistrement : la préférence écrite à l'instant peut manquer au
        // cache de la session, la dérogation d'URL est honorée sans condition.
        window.location.href = '/exercizer?ui=angular';
      });
  };

  const dismiss = () => {
    setHidden(true);
    save.mutate({ ...preference, returnDismissed: true });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    goBack(true);
  };

  return (
    <div
      className="exercizer-ui-switch card shadow p-16"
      role="region"
      aria-label={t('exercizer.switch.return.title')}
    >
      {asking ? (
        <form className="d-flex flex-column gap-8" onSubmit={onSubmit}>
          <FormControl id="exercizer-ui-switch-feedback">
            <Label>{t('exercizer.switch.feedback.question')}</Label>
            <Input
              type="text"
              size="md"
              autoFocus
              placeholder={t('exercizer.switch.feedback.placeholder')}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </FormControl>
          <div className="d-flex justify-content-end gap-8">
            <Button type="button" color="tertiary" variant="ghost" onClick={() => goBack(false)}>
              {t('exercizer.switch.feedback.skip')}
            </Button>
            <Button type="submit" color="primary" variant="filled">
              {t('exercizer.switch.feedback.send')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="d-flex align-items-center gap-16 flex-wrap">
          <div className="flex-fill">
            <div>{t('exercizer.switch.return.title')}</div>
            <small className="text-muted">
              {t('exercizer.switch.return.where')}{' '}
              <a href={SETTINGS_URL}>{t('exercizer.switch.return.settings')}</a>.
            </small>
          </div>
          <div className="d-flex align-items-center gap-8">
            <Button type="button" color="tertiary" variant="ghost" onClick={dismiss}>
              {t('exercizer.switch.return.dismiss')}
            </Button>
            <Button type="button" color="primary" variant="outline" onClick={() => setAsking(true)}>
              {t('exercizer.switch.return.back')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UiSwitchBanner;
