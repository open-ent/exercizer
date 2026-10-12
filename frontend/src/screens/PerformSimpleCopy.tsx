import { Alert, Button, EmptyScreen, Heading, LoadingScreen } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  addHomeworkFile,
  copyCorrectedDocUrl,
  getCopiesAsStudent,
  getCopyByScheduled,
  getSubjectsScheduledAsStudent,
  myHomeworkFileUrl,
  removeHomeworkFile,
  scheduledFileUrl,
  submitSimpleCopy,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { Unauthorized } from '../components/Unauthorized';
import { canPerformAsStudent, canViewAsStudent, isAfter } from '../copies';
import { PilotageBanner, usePilotage } from '../features/PilotageBanner';
import { RichTextEditor } from '../features/RichTextEditor';
import { SubjectCopy, SubjectCopyFile, SubjectDocument, SubjectScheduled } from '../types';
import { formatDateTime } from '../utils';

/** Un élève ne dépose pas plus de cinq fichiers par copie. */
const MAX_FILES = 5;

const fileName = (file: SubjectCopyFile | SubjectDocument): string =>
  file.metadata?.filename ?? file.metadata?.name ?? '';

/**
 * Les règles d'un « sujet à rendre », reprises de `PerformSimpleSubjectCopyController`.
 *
 * ⚠ La borne n'est PAS la date de rendu : l'élève peut déposer et rendre jusqu'à la date de
 * publication du corrigé, même en retard — c'est le rendu lui-même qui clôt la copie.
 */
export function simpleCopyRules(scheduled: SubjectScheduled, copy: SubjectCopy, now = new Date()) {
  const canUpdate =
    typeof copy.submitted_date !== 'string' && isAfter(scheduled.corrected_date, now, true);
  return {
    canUpdate,
    /** Rendre suppose en plus que le sujet soit ouvert. */
    canSubmit: canUpdate && isAfter(now, scheduled.begin_date, true),
    /** Le sujet n'est pas encore ouvert : on dit quand il le sera. */
    notOpenYet: isAfter(scheduled.begin_date, now, false),
    /** Les corrigés ne se téléchargent qu'une fois leur date de publication passée. */
    correctedAvailable: isAfter(now, scheduled.corrected_date, true),
  };
}

/**
 * Passation d'un sujet « simple » — portage de `PerformSimpleSubjectCopyController`.
 *
 * L'élève lit la consigne, dépose jusqu'à cinq fichiers, puis rend sa copie. Une fois la date
 * de publication passée, il retrouve ici le corrigé commun et son corrigé individuel.
 */
export function PerformSimpleCopy() {
  const { subjectCopyId: param } = useParams();
  const subjectCopyId = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);

  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger' | 'info'; text: string } | null>(
    null,
  );

  const copiesQuery = useQuery({ queryKey: ['exercizer', 'copies'], queryFn: getCopiesAsStudent });
  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'student'],
    queryFn: getSubjectsScheduledAsStudent,
  });

  const copy = (copiesQuery.data ?? []).find((item) => item.id === subjectCopyId);
  const scheduled = (scheduledQuery.data ?? []).find(
    (item) => item.id === copy?.subject_scheduled_id,
  );
  const pilotage = usePilotage(scheduled, copy);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['exercizer', 'copies'] });
  const fail = (status?: string) =>
    setMessage({
      type: 'danger',
      // 413 : le fichier dépasse la taille admise par la plateforme.
      text: t(status === '413' ? 'exercizer.notify.file.weight' : 'exercizer.error'),
    });

  const upload = useMutation({
    mutationFn: (file: File) => addHomeworkFile(subjectCopyId, file),
    onMutate: () => setMessage({ type: 'info', text: t('exercizer.notify.file.loading') }),
    onSuccess: () => {
      setMessage({ type: 'success', text: t('exercizer.navigation.success') });
      void refresh();
    },
    onError: (error) => fail(error instanceof Error ? error.message : undefined),
  });
  const remove = useMutation({
    mutationFn: (file: SubjectCopyFile) => removeHomeworkFile(subjectCopyId, file.file_id),
    onSuccess: () => void refresh(),
    onError: () => fail(),
  });
  const submit = useMutation({
    mutationFn: () => submitSimpleCopy(subjectCopyId),
    onSuccess: () => {
      void refresh();
      navigate('/dashboard/student?tab=finished');
    },
    onError: (error) => {
      setConfirming(false);
      fail(error instanceof Error ? error.message : undefined);
    },
  });

  if (copiesQuery.isLoading || scheduledQuery.isLoading) return <LoadingScreen position={false} />;
  if (!copy || !scheduled) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.error')} size={200} />
        <Button color="primary" variant="filled" onClick={() => navigate('/dashboard')}>
          {t('exercizer.title')}
        </Button>
      </div>
    );
  }

  const rules = simpleCopyRules(scheduled, copy);
  const at = t('exercizer.at');
  const homework = copy.homework_files ?? [];
  const commonCorrected = scheduled.files ?? [];
  const ownCorrected = copy.corrected_files ?? [];

  const add = (file: File | undefined) => {
    if (!file) return;
    if (pilotage.readOnly) {
      setMessage({ type: 'danger', text: t('exercizer.pilotage.copy.submitted') });
      return;
    }
    upload.mutate(file);
  };

  const askSubmit = () => {
    if (homework.length === 0) {
      setMessage({ type: 'danger', text: t('exercizer.simple.check') });
      return;
    }
    setConfirming(true);
  };

  const fileList = (files: SubjectCopyFile[], removable: boolean) => (
    <ul className="list-unstyled d-flex flex-column gap-8">
      {files.map((file) => (
        <li key={file.file_id} className="d-flex align-items-center gap-8">
          <a
            className="flex-fill text-truncate"
            href={myHomeworkFileUrl(copy.id, file.file_id)}
            title={t('exercizer.file.download')}
          >
            {fileName(file)}
          </a>
          {removable && (
            <Button size="sm" color="danger" variant="ghost" onClick={() => remove.mutate(file)}>
              {t('exercizer.remove')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mt-16">
      <PilotageBanner pilotage={pilotage} />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {scheduled.title}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard')}>
            {t('exercizer.back')}
          </Button>
          {rules.canSubmit && !pilotage.readOnly && (
            <Button color="primary" variant="filled" onClick={askSubmit}>
              {t('exercizer.simple.make.submit')}
            </Button>
          )}
        </div>
      </div>

      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)} className="mb-16">
          {message.text}
        </Alert>
      )}

      <section className="card p-16 mb-24">
        <Heading level="h3" headingStyle="h5" className="mb-8">
          {t('exercizer.simple.edit.description')}
        </Heading>
        <RichTextEditor content={scheduled.description} mode="read" />
      </section>

      <section className="card p-16 mb-24">
        {rules.notOpenYet && (
          <Alert type="info" className="mb-16">
            {t('exercizer.future.info')} <strong>{formatDateTime(scheduled.begin_date, at)}</strong>
          </Alert>
        )}

        {rules.canUpdate ? (
          <>
            <Heading level="h3" headingStyle="h5" className="mb-8">
              {t('exercizer.all.submitted.copies')}
            </Heading>
            <Alert type="info" className="mb-16">
              {t('exercizer.file.limit5')}
            </Alert>
            {fileList(homework, true)}
            {homework.length < MAX_FILES && !pilotage.readOnly && (
              <div
                className={`border rounded p-16 text-center ${dragging ? 'bg-light' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  add(event.dataTransfer.files?.[0]);
                }}
              >
                <p className="mb-8 fst-italic">{t('exercizer.drop.limit5')}</p>
                <Button
                  color="primary"
                  variant="outline"
                  isLoading={upload.isPending}
                  onClick={() => input.current?.click()}
                >
                  {t('exercizer.simple.upload.choose')}
                </Button>
                <input
                  ref={input}
                  type="file"
                  hidden
                  onChange={(event) => {
                    add(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <Heading level="h3" headingStyle="h5" className="mb-8">
              {t('exercizer.simple.make.title')}
            </Heading>
            {fileList(homework, false)}
          </>
        )}
      </section>

      <div className="grid gap-24">
        {commonCorrected.length > 0 && (
          <section className="card p-16 g-col-12 g-col-md-6">
            <Heading level="h3" headingStyle="h5" className="mb-8">
              {t('exercizer.simple.corrected')}
            </Heading>
            {rules.correctedAvailable ? (
              <ul className="list-unstyled d-flex flex-column gap-8 mb-0">
                {commonCorrected.map((doc) => (
                  <li key={doc.doc_id}>
                    <a href={scheduledFileUrl(scheduled.id, doc.doc_id)}>{fileName(doc)}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0">
                {t('exercizer.simple.consult.corrected')}{' '}
                {formatDateTime(scheduled.corrected_date, at)}
              </p>
            )}
          </section>
        )}
        {ownCorrected.length > 0 && (
          <section className="card p-16 g-col-12 g-col-md-6">
            <Heading level="h3" headingStyle="h5" className="mb-8">
              {t('exercizer.simple.individual.corrected')}
            </Heading>
            {rules.correctedAvailable ? (
              <ul className="list-unstyled d-flex flex-column gap-8 mb-0">
                {ownCorrected.map((file) => (
                  <li key={file.file_id}>
                    <a href={copyCorrectedDocUrl(copy.id, file.file_id)}>{fileName(file)}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0">
                {t('exercizer.simple.consult.corrected')}{' '}
                {formatDateTime(scheduled.corrected_date, at)}
              </p>
            )}
          </section>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          title={`${t('exercizer.simple.make.label')} ${scheduled.title}`}
          confirmLabel={t('exercizer.simple.make.label')}
          isLoading={submit.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            if (pilotage.readOnly) {
              setConfirming(false);
              setMessage({ type: 'danger', text: t('exercizer.pilotage.copy.submitted') });
              return;
            }
            submit.mutate();
          }}
        >
          <p>
            {t('exercizer.simple.make.confirm')} <em>{scheduled.title}</em> {t('exercizer.copy.to')}{' '}
            <strong>{scheduled.owner_username}</strong> ?
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

/**
 * Point d'entrée des liens fabriqués par le « linker » du portail — portage de
 * `redirectFromLinker`. Le lien ne porte que la DISTRIBUTION ; la route retrouve la copie de
 * l'usager et l'emmène là où il a le droit d'aller : la passation, ou la copie corrigée.
 */
export function Linker() {
  const { subjectScheduledId } = useParams();
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['exercizer', 'linker', subjectScheduledId],
    queryFn: () => getCopyByScheduled(Number(subjectScheduledId)),
  });

  const target = (() => {
    const scheduled = query.data?.subject_scheduled;
    const copy = query.data?.subject_copy;
    if (!scheduled || !copy) return null;
    if (scheduled.type === 'simple') return `/subject/copy/perform/simple/${copy.id}/`;
    if (canPerformAsStudent(scheduled, copy)) return `/subject/copy/perform/${copy.id}/`;
    if (canViewAsStudent(scheduled, copy)) return `/subject/copy/view/${copy.id}/`;
    return null;
  })();

  useEffect(() => {
    if (target) navigate(target, { replace: true });
  }, [target, navigate]);

  if (query.isLoading || target) return <LoadingScreen position={false} />;
  // Pas de copie pour cet usager, ou copie ni ouvrable ni consultable pour l'instant.
  return <Unauthorized text={t('exercizer.unauthorized')} />;
}

export default PerformSimpleCopy;
