import {
  ActionBar,
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyScreen,
  Heading,
  MediaLibrary,
  SearchBar,
  Table,
  useEdificeClient,
  useMediaLibrary,
} from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  addCopyCorrectedFile,
  addSubjectDoc,
  correctCopy,
  excludeCopies,
  getCopiesAsTeacher,
  getGrainCopiesByCopies,
  getGrainsScheduled,
  getSubjectsScheduledAsTeacher,
  homeworkFileUrl,
  modifySchedule,
  removeCopyCorrectedFile,
  removeSubjectFile,
  reportCopy,
  scheduledFileUrl,
  simpleCopiesZipUrl,
  submitCopyAsTeacher,
  unscheduleSubject,
  uploadSubjectFile,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { RecipientsDialog } from '../components/RecipientsDialog';
import { ReminderDialog } from '../components/ReminderDialog';
import { canCorrectAsTeacher, copyStateColorClass, copyStateKey } from '../copies';
import { automaticCorrection } from '../correction';
import {
  copiesToScore,
  correctedAverage,
  isPilotageAvailable,
  nextSort,
  recipientsLabel,
  sortBy,
  SortState,
  submissionCount,
  submittedLate,
} from '../corrections';
import { SortHeader } from '../features/SortHeader';
import { ExportStatsDialog, StatsTable } from '../features/StatsTable';
import { sanitizeScore } from '../grains';
import { normaliseTime, toScheduleDate } from '../schedule';
import { displayScore } from '../stats';
import { SubjectCopy, SubjectCopyFile, SubjectDocument, SubjectScheduled } from '../types';
import { formatDateTime, fromDateInputValue, toDateInputValue } from '../utils';

/** Le serveur n'accepte pas plus de cinq corrigés par sujet. */
const MAX_FILES = 5;

type Dialog =
  | { kind: 'exclude' }
  | { kind: 'unschedule' }
  | { kind: 'recipients' }
  | { kind: 'reminder'; copies: SubjectCopy[] }
  | { kind: 'confirmDates' }
  | { kind: 'considerSubmitted' }
  | { kind: 'export' }
  | { kind: 'homeworks'; copy: SubjectCopy }
  | null;

type Field =
  | 'owner_username'
  | 'state'
  | 'submitted_date'
  | 'calculated_score'
  | 'final_score'
  | 'homework'
  | 'corrected';

const fileName = (file: SubjectCopyFile | SubjectDocument | undefined): string =>
  file?.metadata?.filename ?? file?.metadata?.name ?? '';

const clock = (value?: string): string => {
  if (!value) return '00:00';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '00:00';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * Les copies d'une distribution — portage de `teacherDashboardCorrectionCopyList` (sujet
 * interactif), de `teacherDashboardSimpleCorrectionCopyList` (sujet « simple ») et de
 * `teacherDashboardCorrectionStats`.
 *
 * Les deux listes partagent leur en-tête (bornes de la distribution, modifiables), leurs
 * relances et leurs exclusions ; elles diffèrent par ce qu'on y corrige : des questions notées
 * d'un côté, des fichiers rendus et des corrigés déposés de l'autre.
 */
export function CorrectionCopies({ subjectScheduledId }: { subjectScheduledId: number }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<number[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  const [sort, setSort] = useState<SortState<Field>>(() => storedSort(subjectScheduledId));

  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'teacher'],
    queryFn: getSubjectsScheduledAsTeacher,
  });
  const copiesQuery = useQuery({
    queryKey: ['exercizer', 'copies', 'teacher'],
    queryFn: getCopiesAsTeacher,
  });

  const scheduled = (scheduledQuery.data ?? []).find((s) => s.id === subjectScheduledId);
  const isSimple = scheduled?.type === 'simple';

  const copies = useMemo(
    () =>
      (copiesQuery.data ?? []).filter(
        (copy) => copy.subject_scheduled_id === subjectScheduledId && !copy.is_training_copy,
      ),
    [copiesQuery.data, subjectScheduledId],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'copies', 'teacher'] });
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'scheduled', 'teacher'] });
    setSelected([]);
    setDialog(null);
  };
  const fail = () => setMessage({ type: 'danger', text: t('exercizer.error') });

  /**
   * À l'ouverture, les copies rendues qui n'ont pas encore de score automatique en reçoivent un —
   * `CorrectionService#automaticCorrection`. Sans cela, la colonne « Score automatique » resterait
   * vide tant que l'enseignant n'a pas ouvert chaque copie.
   *
   * Une seule fois par distribution ouverte : le drapeau évite de recalculer à chaque rendu, et
   * de boucler sur l'invalidation qui suit.
   */
  const scored = useRef<number | null>(null);
  useEffect(() => {
    if (!scheduled || isSimple || copiesQuery.isLoading) return;
    if (scored.current === scheduled.id) return;
    scored.current = scheduled.id;
    const pending = copiesToScore(scheduled, copies);
    if (pending.length === 0) return;
    void (async () => {
      const [reference, grainCopies] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['exercizer', 'grains-scheduled', scheduled.id],
          queryFn: () => getGrainsScheduled(scheduled.id),
          staleTime: Infinity,
        }),
        getGrainCopiesByCopies(pending.map((copy) => copy.id)),
      ]);
      await Promise.all(
        pending.map((copy) => {
          let score = 0;
          for (const grainCopy of grainCopies.get(copy.id) ?? []) {
            const model = reference.find((grain) => grain.id === grainCopy.grain_scheduled_id);
            if (!model) continue;
            score += automaticCorrection(
              model.grain_type_id,
              sanitizeScore(model.grain_data.max_score),
              model.grain_data.custom_data,
              grainCopy.grain_copy_data.custom_copy_data,
            ).calculated_score;
          }
          // `Math.ceil`, et non un arrondi : c'est ce que faisait l'original, et deux interfaces
          // ne doivent pas afficher deux scores pour la même copie.
          return reportCopy({ ...copy, calculated_score: Math.ceil(score * 100) / 100 });
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'copies', 'teacher'] });
    })().catch(() => undefined);
  }, [scheduled, isSimple, copies, copiesQuery.isLoading, queryClient]);

  const exclude = useMutation({
    mutationFn: () => excludeCopies(selected),
    onSuccess: refresh,
    onError: fail,
  });
  const unschedule = useMutation({
    mutationFn: () => unscheduleSubject(subjectScheduledId),
    onSuccess: () => {
      refresh();
      navigate('/dashboard/teacher/correction');
    },
    onError: fail,
  });

  /** « Appliquer la note automatique » : les copies rendues choisies passent à « corrigée ». */
  const markCorrected = useMutation({
    mutationFn: () =>
      Promise.all(
        copies
          .filter((copy) => selected.includes(copy.id) && copy.submitted_date)
          .map((copy) =>
            correctCopy({
              ...copy,
              is_corrected: true,
              final_score: copy.final_score || copy.calculated_score,
            }),
          ),
      ),
    onSuccess: refresh,
    onError: fail,
  });

  const considerSubmitted = useMutation({
    mutationFn: () =>
      Promise.all(
        copies
          .filter((copy) => selected.includes(copy.id) && !copy.submitted_date)
          .map((copy) => submitCopyAsTeacher(copy)),
      ),
    onSuccess: refresh,
    onError: fail,
  });

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    const filtered = copies.filter((copy) =>
      text ? (copy.owner_username ?? '').toLowerCase().includes(text) : true,
    );
    return sortBy(
      filtered,
      (copy) => {
        switch (sort.field) {
          case 'state': {
            const key = copyStateKey(copy);
            return key ? t(key) : null;
          }
          case 'submitted_date':
            return copy.submitted_date ? new Date(copy.submitted_date).getTime() : null;
          case 'calculated_score':
            return copy.calculated_score;
          case 'final_score':
            return copy.final_score;
          case 'homework':
            return fileName(copy.homework_files?.[0]);
          case 'corrected':
            return fileName(copy.corrected_files?.[0]);
          default:
            return copy.owner_username;
        }
      },
      sort.direction,
    );
  }, [copies, search, sort, t]);

  if (scheduledQuery.isLoading || copiesQuery.isLoading) return null;
  if (!scheduled) {
    return (
      <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.empty.corrections')} size={200} />
    );
  }

  const at = t('exercizer.at');
  const { submitted, total } = submissionCount(copies);
  const notCorrected = copies.filter((copy) => !copy.is_corrected).length;
  const selectedCopies = copies.filter((copy) => selected.includes(copy.id));
  const anyUnsubmitted = selectedCopies.some((copy) => !copy.submitted_date);
  // « Exclure » ne vaut que pour des élèves qui n'ont rien rendu : on ne retire pas une copie
  // faite.
  const canExclude = selectedCopies.length > 0 && selectedCopies.every((c) => !c.submitted_date);
  const canMarkCorrected =
    selectedCopies.length > 0 &&
    selectedCopies.every((c) => canCorrectAsTeacher(scheduled, c) && !c.is_corrected);

  const onSort = (field: Field) => {
    const next = nextSort(sort, field);
    setSort(next);
    try {
      // Le tri est mémorisé PAR distribution, comme dans l'ancienne IHM — mêmes clés, pour que la
      // préférence suive l'usager d'une interface à l'autre.
      window.localStorage.setItem(`exercizer${scheduled.id}.sortcache`, field);
      window.localStorage.setItem(
        `exercizer${scheduled.id}.sortcache.asc`,
        next.direction === 'asc' ? 'true' : 'false',
      );
    } catch {
      // Stockage indisponible (navigation privée) : le tri vaut pour la session.
    }
  };

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  // « Tout cocher » ne prend que ce sur quoi une action groupée a un sens : les copies non
  // corrigées d'un sujet interactif, toutes celles d'un sujet simple (on y télécharge les rendus).
  const selectable = isSimple ? visible : visible.filter((copy) => !copy.is_corrected);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.includes(c.id));

  const remind = (candidates: SubjectCopy[]) => {
    const targets = candidates.filter((copy) => !copy.submitted_date);
    if (targets.length === 0) {
      setMessage({ type: 'danger', text: t('exercizer.service.check.reminder') });
      return;
    }
    setDialog({ kind: 'reminder', copies: targets });
  };

  const downloadSelected = () => {
    const ids = selectedCopies.filter((copy) => copy.submitted_date).map((copy) => copy.id);
    if (ids.length === 0) {
      setMessage({ type: 'danger', text: t('exercizer.service.check.download.copy') });
      return;
    }
    window.location.href = simpleCopiesZipUrl(ids);
  };

  const submittedCell = (copy: SubjectCopy) => {
    if (!copy.submitted_date) {
      return (
        <Button size="sm" color="primary" variant="outline" onClick={() => remind([copy])}>
          {t('exercizer.reminder')}
        </Button>
      );
    }
    return submittedLate(scheduled, copy) ? (
      <span className="text-danger">
        {t('exercizer.lag')} {formatDateTime(copy.submitted_date, at)}
      </span>
    ) : (
      <span className="text-success">{formatDateTime(copy.submitted_date, at)}</span>
    );
  };

  return (
    <div className="mt-16">
      <div className="d-flex align-items-center gap-8 mb-16">
        <Button
          color="tertiary"
          variant="ghost"
          onClick={() =>
            showStats ? setShowStats(false) : navigate('/dashboard/teacher/correction')
          }
        >
          {showStats ? t('exercizer.back') : t('exercizer.dashboard.instructer.tab2')}
        </Button>
        <Heading level="h2" headingStyle="h4" className="m-0">
          {scheduled.title}
        </Heading>
      </div>

      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)} className="mb-16">
          {message.text}
        </Alert>
      )}

      <div className="grid gap-24 mb-24">
        <ScheduleCard
          key={`${scheduled.begin_date}|${scheduled.due_date}|${scheduled.corrected_date}`}
          className="g-col-12 g-col-lg-6"
          scheduled={scheduled}
          readOnly={showStats}
          // Une fois la passation entamée, la date de début ne se déplace plus : des élèves ont
          // déjà ouvert le sujet. Pour un sujet simple, c'est le premier rendu qui la fige.
          beginLocked={
            isSimple
              ? copies.some((copy) => copy.submitted_date)
              : copies.some((copy) => copy.has_been_started)
          }
          onUnschedule={() => setDialog({ kind: 'unschedule' })}
          onSaved={() => {
            setMessage(null);
            refresh();
          }}
          onError={fail}
        />

        {isSimple ? (
          <CorrectedFilesCard
            className="g-col-12 g-col-lg-6"
            scheduled={scheduled}
            onChanged={(text) => {
              setMessage({ type: 'success', text });
              refresh();
            }}
            onError={fail}
          />
        ) : (
          <StatsCard
            className="g-col-12 g-col-lg-6"
            scheduled={scheduled}
            copies={copies}
            submitted={submitted}
            action={
              showStats ? (
                <Button
                  color="primary"
                  variant="outline"
                  onClick={() => setDialog({ kind: 'export' })}
                >
                  {t('exercizer.export.action')}
                </Button>
              ) : (
                <Button color="primary" variant="outline" onClick={() => setShowStats(true)}>
                  {t('exercizer.schedule.stats.more')}
                </Button>
              )
            }
          />
        )}
      </div>

      <div className="d-flex flex-wrap align-items-center gap-16 mb-16">
        {recipientsLabel(scheduled, 3) && (
          <Button color="tertiary" variant="ghost" onClick={() => setDialog({ kind: 'recipients' })}>
            {t('exercizer.schedule.at')} {recipientsLabel(scheduled, 3)}
          </Button>
        )}
        <em className="small">
          {t('exercizer.numbercopy.notcorrected')} <strong>{notCorrected}</strong>{' '}
          {t('exercizer.numbercopy.notcorrected2')}
        </em>
        {isSimple && (
          <em className="small ms-auto">
            {submitted} {t('exercizer.total.made')} {total} {t('exercizer.total.made2')}
          </em>
        )}
      </div>

      <div className="mb-16" style={{ maxWidth: 420 }}>
        <SearchBar
          isVariant
          size="md"
          clearable
          placeholder={t('exercizer.find.learner')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {showStats && !isSimple ? (
        <StatsTable scheduled={scheduled} copies={copies} filter={search} />
      ) : (
        <div className="table-responsive">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <Checkbox
                    aria-label={t('exercizer.select.all')}
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? [] : selectable.map((copy) => copy.id))
                    }
                  />
                </Table.Th>
                <SortHeader field="owner_username" sort={sort} onSort={onSort}>
                  {t(isSimple ? 'exercizer.homework.from' : 'exercizer.copy.from')}
                </SortHeader>
                {!isSimple && (
                  <SortHeader field="state" sort={sort} onSort={onSort}>
                    {t('exercizer.state')}
                  </SortHeader>
                )}
                <SortHeader field="submitted_date" sort={sort} onSort={onSort}>
                  {t('exercizer.submitted.date')}
                </SortHeader>
                {isSimple ? (
                  <>
                    <SortHeader field="homework" sort={sort} onSort={onSort}>
                      {t('exercizer.file')}
                    </SortHeader>
                    <SortHeader field="corrected" sort={sort} onSort={onSort}>
                      {t('exercizer.simple.individual.corrected')}
                    </SortHeader>
                  </>
                ) : (
                  <>
                    <SortHeader field="calculated_score" sort={sort} onSort={onSort}>
                      {t('exercizer.auto.score')}
                    </SortHeader>
                    <SortHeader field="final_score" sort={sort} onSort={onSort}>
                      {t('exercizer.final.score')}
                    </SortHeader>
                    <Table.Th />
                  </>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((copy) => {
                const stateKey = copyStateKey(copy);
                return (
                  <Table.Tr key={copy.id}>
                    <Table.Td>
                      <Checkbox
                        aria-label={copy.owner_username ?? String(copy.id)}
                        checked={selected.includes(copy.id)}
                        onChange={() => toggle(copy.id)}
                      />
                    </Table.Td>
                    <Table.Td>{copy.owner_username}</Table.Td>
                    {!isSimple && (
                      <Table.Td>
                        {stateKey && (
                          <Badge
                            variant={{
                              type: 'content',
                              level: copy.is_corrected ? 'success' : 'info',
                              background: true,
                            }}
                            className={copyStateColorClass(copy) ?? undefined}
                          >
                            {t(stateKey)}
                          </Badge>
                        )}
                      </Table.Td>
                    )}
                    <Table.Td>{submittedCell(copy)}</Table.Td>
                    {isSimple ? (
                      <>
                        <Table.Td>
                          <HomeworkCell
                            copy={copy}
                            onShowAll={() => setDialog({ kind: 'homeworks', copy })}
                          />
                        </Table.Td>
                        <Table.Td>
                          <IndividualCorrectedCell
                            copy={copy}
                            onChanged={(text) => {
                              setMessage({ type: 'success', text });
                              refresh();
                            }}
                            onError={fail}
                          />
                        </Table.Td>
                      </>
                    ) : (
                      <>
                        <Table.Td>
                          {displayScore(copy.calculated_score)} / {scheduled.max_score ?? 0}
                        </Table.Td>
                        <Table.Td>
                          {displayScore(copy.final_score)} / {scheduled.max_score ?? 0}
                        </Table.Td>
                        <Table.Td>
                          {canCorrectAsTeacher(scheduled, copy) && (
                            <Button
                              size="sm"
                              color="primary"
                              variant="outline"
                              onClick={() =>
                                navigate(`/subject/copy/view/${scheduled.subject_id}/${copy.id}/`)
                              }
                            >
                              {t('exercizer.see.copy')}
                            </Button>
                          )}
                        </Table.Td>
                      </>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {selected.length > 0 && !showStats && (
        <ActionBar>
          {isSimple && (
            <Button color="primary" variant="filled" onClick={downloadSelected}>
              {t('exercizer.downloads')}
            </Button>
          )}
          {!isSimple && canMarkCorrected && (
            <Button
              color="primary"
              variant="filled"
              isLoading={markCorrected.isPending}
              onClick={() => markCorrected.mutate()}
            >
              {t('exercizer.copies.make.corrected')}
            </Button>
          )}
          <Button color="primary" variant="filled" onClick={() => remind(selectedCopies)}>
            {t('exercizer.reminder.raise')}
          </Button>
          {canExclude && (
            <Button color="danger" variant="outline" onClick={() => setDialog({ kind: 'exclude' })}>
              {t('exercizer.exclude')}
            </Button>
          )}
          {!isSimple && anyUnsubmitted && (
            <Button
              color="primary"
              variant="outline"
              onClick={() => setDialog({ kind: 'considerSubmitted' })}
            >
              {t('exercizer.consider.submitted')}
            </Button>
          )}
        </ActionBar>
      )}

      {dialog?.kind === 'exclude' && (
        <ConfirmModal
          title={t('exercizer.exclude')}
          confirmLabel={t('exercizer.validate')}
          isLoading={exclude.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => exclude.mutate()}
        >
          <p>
            {t('exercizer.exclude.confirm')} <strong>{t('exercizer.exclude.info')}</strong>
          </p>
          <ul>
            {selectedCopies.map((copy) => (
              <li key={copy.id}>{copy.owner_username}</li>
            ))}
          </ul>
        </ConfirmModal>
      )}

      {dialog?.kind === 'unschedule' && (
        <ConfirmModal
          title={t('exercizer.unschedule.title')}
          confirmLabel={t('exercizer.unschedule')}
          isLoading={unschedule.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => unschedule.mutate()}
        >
          <p>{t('exercizer.unschedule.confirm')}</p>
        </ConfirmModal>
      )}

      {dialog?.kind === 'considerSubmitted' && (
        <ConfirmModal
          title={t('exercizer.consider.submitted')}
          confirmLabel={t('exercizer.validate')}
          isLoading={considerSubmitted.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => considerSubmitted.mutate()}
        >
          <p>
            {t('exercizer.confirm.submitted1')} {t('exercizer.confirm.submitted2')}
          </p>
          <ul>
            {selectedCopies
              .filter((copy) => !copy.submitted_date)
              .map((copy) => (
                <li key={copy.id}>{copy.owner_username}</li>
              ))}
          </ul>
        </ConfirmModal>
      )}

      {dialog?.kind === 'recipients' && (
        <RecipientsDialog scheduled={scheduled} onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'reminder' && (
        <ReminderDialog
          scheduled={scheduled}
          copies={dialog.copies}
          onClose={() => setDialog(null)}
          onSent={() => {
            setDialog(null);
            setSelected([]);
            setMessage({ type: 'success', text: t('exercizer.reminder.sent') });
          }}
        />
      )}

      {dialog?.kind === 'export' && (
        <ExportStatsDialog scheduled={scheduled} copies={copies} onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'homeworks' && (
        <ConfirmModal
          title={t('exercizer.file')}
          confirmLabel={t('exercizer.downloads')}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            window.location.href = simpleCopiesZipUrl([dialog.copy.id]);
            setDialog(null);
          }}
        >
          <ul className="list-unstyled d-flex flex-column gap-8 mb-0">
            {(dialog.copy.homework_files ?? []).map((file) => (
              <li key={file.file_id}>
                <a href={homeworkFileUrl(dialog.copy.id, file.file_id)}>{fileName(file)}</a>
              </li>
            ))}
          </ul>
        </ConfirmModal>
      )}
    </div>
  );
}

/** Le tri mémorisé pour cette distribution — mêmes clés que l'IHM AngularJS. */
function storedSort(subjectScheduledId: number): SortState<Field> {
  const fallback: SortState<Field> = { field: 'owner_username', direction: 'asc' };
  try {
    const field = window.localStorage.getItem(`exercizer${subjectScheduledId}.sortcache`);
    if (!field) return fallback;
    const known: Field[] = [
      'owner_username',
      'state',
      'submitted_date',
      'calculated_score',
      'final_score',
    ];
    if (!known.includes(field as Field)) return fallback;
    const asc = window.localStorage.getItem(`exercizer${subjectScheduledId}.sortcache.asc`);
    return { field: field as Field, direction: asc === 'false' ? 'desc' : 'asc' };
  } catch {
    return fallback;
  }
}

/**
 * Les bornes de la distribution, et leur modification.
 *
 * ⚠ Les dates partent dans la forme de `schedule.ts#toScheduleDate` — celle de la distribution
 * d'origine. La date de début ne se modifie plus une fois la passation entamée.
 */
function ScheduleCard({
  scheduled,
  className,
  readOnly,
  beginLocked,
  onUnschedule,
  onSaved,
  onError,
}: {
  scheduled: SubjectScheduled;
  className?: string;
  readOnly: boolean;
  beginLocked: boolean;
  onUnschedule: () => void;
  onSaved: () => void;
  onError: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const isSimple = scheduled.type === 'simple';
  const at = t('exercizer.at');

  const initial = () => ({
    beginDate: scheduled.begin_date ? new Date(scheduled.begin_date) : new Date(),
    beginTime: clock(scheduled.begin_date),
    dueDate: scheduled.due_date ? new Date(scheduled.due_date) : new Date(),
    dueTime: clock(scheduled.due_date),
    correctedDate: scheduled.corrected_date ? new Date(scheduled.corrected_date) : new Date(),
    correctedTime: clock(scheduled.corrected_date),
    trainingPermitted: scheduled.is_training_permitted === true,
  });

  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState(initial);

  const body = (): {
    beginDate: string;
    dueDate: string;
    correctedDate?: string;
    isTrainingPermitted?: boolean;
  } => ({
    beginDate: toScheduleDate(form.beginDate, form.beginTime),
    dueDate: toScheduleDate(form.dueDate, form.dueTime),
    ...(isSimple
      ? { correctedDate: toScheduleDate(form.correctedDate, form.correctedTime) }
      : { isTrainingPermitted: form.trainingPermitted }),
  });

  /** Les dates ont-elles bougé ? Sinon seule l'option d'entraînement change, et on ne prévient personne. */
  const datesChanged = () => {
    const next = body();
    return (
      !next.beginDate.startsWith(scheduled.begin_date ?? '\u0000') ||
      !next.dueDate.startsWith(scheduled.due_date ?? '\u0000') ||
      (isSimple &&
        !(next.correctedDate ?? '').startsWith(scheduled.corrected_date ?? '\u0000'))
    );
  };

  const save = useMutation({
    mutationFn: (notify: boolean) => modifySchedule(scheduled.id, { ...body(), notify }),
    onSuccess: () => {
      setEditing(false);
      setConfirm(false);
      onSaved();
    },
    onError,
  });

  const dateField = (
    label: string,
    date: Date,
    time: string,
    onDate: (value: Date) => void,
    onTime: (value: string) => void,
    fallback: string | undefined,
  ) => (
    <div className="d-flex flex-wrap align-items-center gap-8 mb-8">
      <span className="text-nowrap">{label}</span>
      <input
        type="date"
        className="form-control w-auto"
        aria-label={label}
        value={toDateInputValue(date)}
        onChange={(event) => {
          const value = fromDateInputValue(event.target.value);
          if (value) onDate(value);
        }}
      />
      <span>{at}</span>
      <input
        type="time"
        className="form-control w-auto"
        aria-label={`${label} — ${at}`}
        value={time}
        onChange={(event) => onTime(event.target.value)}
        // Une heure illisible revient à celle de la distribution, comme `checkTime`.
        onBlur={() => {
          if (normaliseTime(time) !== time) onTime(clock(fallback));
        }}
      />
    </div>
  );

  return (
    <section className={`card p-16 ${className ?? ''}`}>
      <Heading level="h3" headingStyle="h5" className="mb-8">
        {t('exercizer.schedule.info')} « {scheduled.title} »
      </Heading>

      {editing && beginLocked && (
        <Alert type="warning" className="mb-8">
          {t('exercizer.schedule.rule.copies')}
        </Alert>
      )}

      {editing && !beginLocked ? (
        dateField(
          t('exercizer.scheduled.start'),
          form.beginDate,
          form.beginTime,
          (beginDate) => setForm({ ...form, beginDate }),
          (beginTime) => setForm({ ...form, beginTime }),
          scheduled.begin_date,
        )
      ) : (
        <p className="mb-8">
          {t('exercizer.scheduled.start')} {formatDateTime(scheduled.begin_date, at)}
        </p>
      )}

      {editing ? (
        dateField(
          t('exercizer.scheduled.end'),
          form.dueDate,
          form.dueTime,
          (dueDate) => setForm({ ...form, dueDate }),
          (dueTime) => setForm({ ...form, dueTime }),
          scheduled.due_date,
        )
      ) : (
        <p className="mb-8">
          {t('exercizer.scheduled.end')} {formatDateTime(scheduled.due_date, at)}
        </p>
      )}

      {isSimple &&
        (editing ? (
          dateField(
            t('exercizer.scheduled.publish.corrected'),
            form.correctedDate,
            form.correctedTime,
            (correctedDate) => setForm({ ...form, correctedDate }),
            (correctedTime) => setForm({ ...form, correctedTime }),
            scheduled.corrected_date,
          )
        ) : (
          <p className="mb-8">
            {t('exercizer.scheduled.publish.corrected')}{' '}
            {formatDateTime(scheduled.corrected_date, at)}
          </p>
        ))}

      {!isSimple &&
        (editing ? (
          <Checkbox
            label={t('exercizer.scheduled.subject.training.forbid')}
            checked={!form.trainingPermitted}
            onChange={() => setForm({ ...form, trainingPermitted: !form.trainingPermitted })}
          />
        ) : (
          <p className="mb-8 fst-italic">
            {t(
              scheduled.is_training_permitted
                ? 'exercizer.scheduled.subject.training.authorized'
                : 'exercizer.scheduled.subject.training.unauthorized',
            )}
          </p>
        ))}

      {!readOnly && (
        <div className="d-flex flex-wrap justify-content-end gap-8 mt-8">
          {editing ? (
            <>
              <Button
                color="tertiary"
                variant="ghost"
                onClick={() => {
                  setForm(initial());
                  setEditing(false);
                }}
              >
                {t('exercizer.cancel')}
              </Button>
              <Button
                color="primary"
                variant="filled"
                isLoading={save.isPending}
                // Un changement de date prévient les élèves : on le fait confirmer. Une simple
                // bascule de l'entraînement part sans bruit.
                onClick={() => (datesChanged() ? setConfirm(true) : save.mutate(false))}
              >
                {t('exercizer.validate')}
              </Button>
            </>
          ) : (
            <>
              {isPilotageAvailable(scheduled) && (
                <Button
                  color="primary"
                  variant="filled"
                  onClick={() => navigate(`/dashboard/teacher/pilotage/${scheduled.id}`)}
                >
                  {t('exercizer.pilotage.access')}
                </Button>
              )}
              <Button color="danger" variant="outline" onClick={onUnschedule}>
                {t('exercizer.unschedule')}
              </Button>
              <Button color="primary" variant="outline" onClick={() => setEditing(true)}>
                {t('edit')}
              </Button>
            </>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title={t('exercizer.schedule.edit.title')}
          confirmLabel={t('exercizer.validate')}
          isLoading={save.isPending}
          onClose={() => setConfirm(false)}
          onConfirm={() => save.mutate(true)}
        >
          <p>
            {t('exercizer.schedule.edit.confirm')}{' '}
            {scheduled.is_notify && t('exercizer.schedule.edit.confirm.notif')}
          </p>
        </ConfirmModal>
      )}
    </section>
  );
}

/** L'encart « Statistiques du sujet » : moyenne des copies corrigées, et copies rendues. */
function StatsCard({
  scheduled,
  copies,
  submitted,
  className,
  action,
}: {
  scheduled: SubjectScheduled;
  copies: SubjectCopy[];
  submitted: number;
  className?: string;
  action: ReactNode;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { average, nb } = correctedAverage(copies);
  return (
    <section className={`card p-16 ${className ?? ''}`}>
      <Heading level="h3" headingStyle="h5" className="mb-8">
        {t('exercizer.schedule.stats')} « {scheduled.title} »
      </Heading>
      <p className="mb-8">
        {t('exercizer.schedule.stats.info1')} {nb} {t('exercizer.schedule.stats.info2')} :{' '}
        {displayScore(average)} / {scheduled.max_score ?? 0}
      </p>
      <p className="mb-8">
        {submitted} {t('exercizer.total.made')} {copies.length} {t('exercizer.total.made2')}
      </p>
      <div className="d-flex justify-content-end mt-8">{action}</div>
    </section>
  );
}

/**
 * Les corrigés d'un sujet « simple », communs à toute la distribution : dépôt d'un fichier du
 * poste, choix d'un document de l'espace documentaire, téléchargement, retrait.
 */
function CorrectedFilesCard({
  scheduled,
  className,
  onChanged,
  onError,
}: {
  scheduled: SubjectScheduled;
  className?: string;
  onChanged: (message: string) => void;
  onError: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { appCode } = useEdificeClient();
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const files = scheduled.files ?? [];

  const uploadFile = useMutation({
    mutationFn: (file: File) => uploadSubjectFile(scheduled.subject_id, file),
    onSuccess: () => onChanged(t('exercizer.service.save.corrected')),
    onError,
  });
  const attach = useMutation({
    mutationFn: (doc: { _id: string; metadata?: unknown }) =>
      addSubjectDoc(scheduled.subject_id, doc),
    onSuccess: () => onChanged(t('exercizer.service.save.corrected')),
    onError,
  });
  const remove = useMutation({
    mutationFn: (file: SubjectDocument) => removeSubjectFile(scheduled.subject_id, file.doc_id),
    onSuccess: () => onChanged(t('exercizer.service.delete.corrected')),
    onError,
  });

  return (
    <section className={`card p-16 ${className ?? ''}`}>
      <Heading level="h3" headingStyle="h5" className="mb-8">
        {t('exercizer.corrected.homework')}
      </Heading>
      <ul className="list-unstyled d-flex flex-column gap-8">
        {files.map((file) => (
          <li key={file.doc_id} className="d-flex align-items-center gap-8">
            <span className="flex-fill text-truncate">{fileName(file)}</span>
            <Button
              size="sm"
              color="tertiary"
              variant="ghost"
              onClick={() => {
                window.location.href = scheduledFileUrl(scheduled.id, file.doc_id);
              }}
            >
              {t('exercizer.scheduled.corrected.download')}
            </Button>
            <Button size="sm" color="danger" variant="ghost" onClick={() => remove.mutate(file)}>
              {t('exercizer.scheduled.corrected.delete')}
            </Button>
          </li>
        ))}
      </ul>

      {files.length < MAX_FILES && (
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
            const file = event.dataTransfer.files?.[0];
            if (file) uploadFile.mutate(file);
          }}
        >
          <p className="mb-8 fst-italic">{t(dragging ? 'exercizer.drop.help2' : 'exercizer.drop.help')}</p>
          <div className="d-flex flex-wrap justify-content-center gap-8">
            <Button
              color="primary"
              variant="outline"
              isLoading={uploadFile.isPending}
              onClick={() => input.current?.click()}
            >
              {t('exercizer.import.choose')}
            </Button>
            <Button
              color="primary"
              variant="outline"
              onClick={() => mediaLibraryRef.current?.show('attachment')}
            >
              {t('library.file.choose')}
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadFile.mutate(file);
              event.target.value = '';
            }}
          />
        </div>
      )}

      <MediaLibrary
        appCode={appCode}
        ref={mediaLibraryRef}
        visibility="protected"
        {...mediaLibraryHandlers}
        onSuccess={(result) => {
          const picked = Array.isArray(result) ? result[0] : result;
          if (picked) attach.mutate(picked as { _id: string; metadata?: unknown });
          mediaLibraryHandlers.onSuccess(result);
        }}
      />
    </section>
  );
}

/** Le ou les fichiers rendus par un élève. */
function HomeworkCell({ copy, onShowAll }: { copy: SubjectCopy; onShowAll: () => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const files = copy.homework_files ?? [];
  if (files.length === 0) return <em>{t('exercizer.none.student.file')}</em>;
  if (files.length === 1) {
    return (
      <a href={homeworkFileUrl(copy.id, files[0].file_id)} title={t('exercizer.file.download')}>
        {fileName(files[0])}
      </a>
    );
  }
  return (
    <Button size="sm" color="tertiary" variant="ghost" onClick={onShowAll}>
      {fileName(files[0])} + {files.length - 1}
    </Button>
  );
}

/** Le corrigé individuel d'une copie : on le dépose, ou on le retire. */
function IndividualCorrectedCell({
  copy,
  onChanged,
  onError,
}: {
  copy: SubjectCopy;
  onChanged: (message: string) => void;
  onError: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const input = useRef<HTMLInputElement>(null);
  const file = copy.corrected_files?.[0];

  const add = useMutation({
    mutationFn: (picked: File) => addCopyCorrectedFile(copy.id, picked),
    onSuccess: () => onChanged(t('exercizer.service.save.individual.corrected')),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => removeCopyCorrectedFile(copy.id, file!.file_id),
    onSuccess: () => onChanged(t('exercizer.service.delete.individual.corrected')),
    onError,
  });

  if (file) {
    return (
      <div className="d-flex align-items-center gap-8">
        <span className="text-truncate">{fileName(file)}</span>
        <Button size="sm" color="danger" variant="ghost" onClick={() => remove.mutate()}>
          {t('exercizer.scheduled.corrected.delete')}
        </Button>
      </div>
    );
  }
  // Pas de corrigé individuel sans copie rendue : il n'y aurait rien à corriger.
  if (!copy.submitted_date) return null;
  return (
    <>
      <Button
        size="sm"
        color="tertiary"
        variant="ghost"
        isLoading={add.isPending}
        onClick={() => input.current?.click()}
      >
        {t('exercizer.add.file')}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) add.mutate(picked);
          event.target.value = '';
        }}
      />
    </>
  );
}

export default CorrectionCopies;
