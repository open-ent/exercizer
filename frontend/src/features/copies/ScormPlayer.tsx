import { Alert } from '@open-ent/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Lecture d'un module SCORM pendant la passation.
 *
 * Le paquet est du JavaScript écrit par un tiers : il est servi depuis une ORIGINE DISTINCTE de
 * celle de l'ENT, et c'est le navigateur qui garantit alors qu'il ne peut rien faire au nom de
 * l'élève. Ce composant ne charge donc pas le contenu lui-même — il demande au serveur une URL
 * déjà porteuse de son jeton, puis l'encadre.
 *
 * Le module cherche une API SCORM dans ses fenêtres parentes ; il ne peut pas l'y atteindre,
 * l'origine étant différente. Un pont injecté dans sa page la lui fournit localement et relaie
 * chaque écriture ici par `postMessage`. C'est ce composant qui persiste, parce que lui seul est
 * sur le domaine de l'ENT et dispose de la session.
 */
export interface ScormPlayerProps {
  packageId?: number;
  /** Copie en cours, pour rattacher la progression à la bonne passation. */
  subjectCopyId?: number;
  readOnly?: boolean;
}

interface Session {
  contentUrl: string;
  scormVersion: string;
  title: string;
}

type BridgeMessage = {
  source?: string;
  type?: string;
  payload?: Record<string, unknown>;
};

function xsrfHeader(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? { 'X-XSRF-TOKEN': decodeURIComponent(match[1]) } : {};
}

export function ScormPlayer({ packageId, subjectCopyId, readOnly }: ScormPlayerProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* L'état courant du modèle CMI, tenu hors du rendu : le modifier ne doit rien redessiner,
     sans quoi l'iframe serait rechargée et le module repartirait de zéro. */
  const cmi = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (!packageId) {
      return;
    }
    let cancelled = false;
    fetch(`/exercizer/scorm/${packageId}/session`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Session) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setError('exercizer.scorm.session.error');
      });
    return () => {
      cancelled = true;
    };
  }, [packageId]);

  const persist = useCallback(() => {
    if (!packageId || readOnly) {
      return;
    }
    fetch(`/exercizer/scorm/${packageId}/state`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...xsrfHeader() },
      body: JSON.stringify({ cmi: cmi.current, subjectCopyId: subjectCopyId ?? null }),
    }).catch(() => {
      /* Une écriture perdue n'interrompt pas la passation : le module continue, et le prochain
         enregistrement reportera l'état complet, qui est cumulatif. */
    });
  }, [packageId, subjectCopyId, readOnly]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const contentOrigin = new URL(session.contentUrl).origin;

    const onMessage = (event: MessageEvent) => {
      /* Le contrôle d'origine est la seule chose qui distingue le module encadré de n'importe
         quelle autre page capable de nous envoyer un message. */
      if (event.origin !== contentOrigin) {
        return;
      }
      const message = event.data as BridgeMessage;
      if (!message || message.source !== 'openent-scorm') {
        return;
      }
      if (message.type === 'set' && message.payload) {
        const { key, value } = message.payload as { key?: string; value?: unknown };
        if (typeof key === 'string') {
          cmi.current[key] = value;
        }
      } else if (message.type === 'commit' || message.type === 'terminate') {
        const payload = message.payload as { cmi?: Record<string, unknown> } | undefined;
        if (payload?.cmi) {
          cmi.current = payload.cmi;
        }
        persist();
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [session, persist]);

  if (!packageId) {
    return <Alert type="warning">{t('exercizer.scorm.package.missing')}</Alert>;
  }
  if (error) {
    return <Alert type="danger">{t(error)}</Alert>;
  }
  if (!session) {
    return <p>{t('common.loading')}</p>;
  }

  return (
    <iframe
      src={session.contentUrl}
      title={session.title}
      style={{ width: '100%', minHeight: '32rem', border: 0 }}
      /* `allow-same-origin` est indispensable : sans lui le module n'aurait pas accès à son
         propre stockage ni à son propre document. Il reste cloisonné vis-à-vis de l'ENT par
         l'ORIGINE, pas par cet attribut. `allow-top-navigation` est délibérément absent : un
         module ne doit pas pouvoir faire sortir l'élève de l'ENT. */
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
