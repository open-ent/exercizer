import {
  ActionBar,
  Button,
  Card,
  Checkbox,
  EmptyScreen,
  SearchBar,
  SegmentedControl,
  Table,
  useEdificeClient,
} from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  createFolder,
  duplicateSubjects,
  getFolders,
  getSubjects,
  moveSubjects,
  removeFolders,
  removeSubjects,
  updateFolder,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { FolderDialog } from '../components/FolderDialog';
import { MoveDialog } from '../components/MoveDialog';
import { FolderTree } from '../features/FolderTree';
import { Folder, Subject } from '../types';
import { formatDate } from '../utils';

/** Les deux rangements de l'ancienne IHM : ses propres sujets, et ceux qu'on lui a partagés. */
type SubjectScope = 'mine' | 'shared';

/** Vignettes ou tableau — préférence d'affichage, conservée le temps de la session. */
type DisplayMode = 'domino' | 'array';

type DialogState =
  | { kind: 'folder'; folder?: Folder }
  | { kind: 'move' }
  | { kind: 'remove' }
  | null;

/**
 * « Mes sujets » : l'arborescence des dossiers, la liste des sujets du dossier courant, et les
 * actions de rangement.
 *
 * Portage de `teacher-dashboard-subject-list.html` et de son « toaster » d'actions. Deux écarts
 * assumés avec l'IHM AngularJS, l'un et l'autre notés dans la documentation de migration :
 *  - le glisser-déposer d'un sujet sur un dossier n'est pas repris ; « Déplacer » le remplace,
 *    et reste la seule voie au clavier (l'ancienne IHM n'en offrait pas) ;
 *  - l'auto-complétion de recherche est remplacée par un filtre en place sur la liste, qui
 *    cherche dans TOUS les dossiers et non seulement le dossier courant.
 */
export function TeacherSubjects() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useEdificeClient();

  const [scope, setScope] = useState<SubjectScope>('mine');
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [display, setDisplay] = useState<DisplayMode>('domino');
  const [search, setSearch] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<number[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);

  const foldersQuery = useQuery({ queryKey: ['exercizer', 'folders'], queryFn: getFolders });
  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });

  const folders = foldersQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];

  /**
   * Le sujet appartient-il à l'usager courant ? Sinon, il lui a été partagé — et n'a pas de
   * place dans son arborescence de dossiers, qui est la sienne seule.
   * Tant que la session n'est pas connue, tout est considéré comme à soi : afficher brièvement
   * les sujets partagés dans « mes sujets » est moins déroutant qu'une liste vide.
   */
  const mine = (subject: Subject) => !user?.userId || subject.owner === user.userId;

  const visibleFolders = useMemo(
    () =>
      scope === 'shared'
        ? []
        : folders
            .filter((folder) => (folder.parent_folder_id ?? null) === currentFolderId)
            .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [folders, currentFolderId, scope],
  );

  const visibleSubjects = useMemo(() => {
    const text = search.trim().toLowerCase();
    return subjects
      .filter((subject) => (scope === 'shared' ? !mine(subject) : mine(subject)))
      // Une recherche cherche partout : elle s'affranchit du dossier courant, qu'elle
      // remplacerait mal — chercher dans un seul dossier n'aide personne.
      .filter((subject) =>
        text
          ? (subject.title ?? '').toLowerCase().includes(text)
          : (subject.folder_id ?? null) === currentFolderId,
      )
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'fr'));
  }, [subjects, currentFolderId, scope, search]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'folders'] });
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
    setSelectedSubjects([]);
    setSelectedFolders([]);
    setDialog(null);
  };

  const saveFolder = useMutation({
    mutationFn: (folder: { id?: number; label: string }) =>
      folder.id
        ? updateFolder({
            ...(folders.find((f) => f.id === folder.id) as Folder),
            label: folder.label,
          })
        : createFolder({ label: folder.label, parent_folder_id: currentFolderId }),
    onSuccess: refresh,
  });

  const move = useMutation({
    mutationFn: (targetFolderId: number | null) =>
      moveSubjects(selectedSubjects, targetFolderId),
    onSuccess: refresh,
  });

  const duplicate = useMutation({
    mutationFn: () => duplicateSubjects(selectedSubjects, currentFolderId),
    onSuccess: refresh,
  });

  /**
   * Suppression. Les dossiers partent DÉFINITIVEMENT (`POST /folders/delete`) alors que les
   * sujets vont à la corbeille (`PUT /subject/mark/delete`) : c'est le comportement du serveur,
   * et l'écart mérite d'être su de celui qui confirme — d'où le texte de la fenêtre.
   */
  const remove = useMutation({
    mutationFn: async () => {
      if (selectedSubjects.length) await removeSubjects(selectedSubjects);
      if (selectedFolders.length) await removeFolders(selectedFolders);
    },
    onSuccess: refresh,
  });

  const selectionCount = selectedSubjects.length + selectedFolders.length;
  const onlyOneSubject = selectedSubjects.length === 1 && selectedFolders.length === 0;
  const onlyOneFolder = selectedFolders.length === 1 && selectedSubjects.length === 0;

  const toggleSubject = (id: number) =>
    setSelectedSubjects((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const toggleFolder = (id: number) =>
    setSelectedFolders((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const openSubject = (subject: Subject) =>
    navigate(
      subject.type === 'simple'
        ? `/subject/edit/simple/${subject.id}/`
        : `/subject/edit/${subject.id}/`,
    );

  const empty = visibleFolders.length === 0 && visibleSubjects.length === 0;

  return (
    <div className="grid gap-24 mt-16">
      <aside className="g-col-12 g-col-lg-3">
        <SegmentedControl
          options={[
            { label: t('exercizer.dashboard.instructer.tab1'), value: 'mine' },
            { label: t('exercizer.shared'), value: 'shared' },
          ]}
          value={scope}
          onChange={(value) => {
            setScope(value as SubjectScope);
            setCurrentFolderId(null);
          }}
        />
        {scope === 'mine' && (
          <>
            <div className="mt-16">
              <FolderTree
                folders={folders}
                currentFolderId={currentFolderId}
                onSelect={setCurrentFolderId}
              />
            </div>
            <Button
              className="mt-16"
              color="tertiary"
              variant="ghost"
              onClick={() => setDialog({ kind: 'folder' })}
            >
              {t('exercizer.new.folder')}
            </Button>
          </>
        )}
      </aside>

      <section className="g-col-12 g-col-lg-9">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
          <div className="d-flex align-items-center gap-8 flex-wrap">
            <Button color="primary" variant="filled" onClick={() => navigate('/subject/create/simple/')}>
              {t('exercizer.new.subject')}
            </Button>
            <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard/teacher/archive')}>
              {t('exercizer.archive.open')}
            </Button>
          </div>
          <div className="d-flex align-items-center gap-16">
            <SearchBar
              isVariant
              size="md"
              clearable
              placeholder={t('exercizer.search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <SegmentedControl
              options={[
                { label: t('exercizer.display.cards'), value: 'domino' },
                { label: t('exercizer.display.list'), value: 'array' },
              ]}
              value={display}
              onChange={(value) => setDisplay(value as DisplayMode)}
            />
          </div>
        </div>

        {empty ? (
          <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.empty.subjects')} size={200} />
        ) : display === 'domino' ? (
          <div className="grid gap-16">
            {visibleFolders.map((folder) => (
              <Card
                key={`folder-${folder.id}`}
                className="g-col-12 g-col-md-6 g-col-xl-4"
                // `isSelectable` du socle pose une icône « ⋯ options » câblée sur `onSelect` :
                // c'est un menu contextuel, pas une sélection. On met donc une vraie case à
                // cocher dans la carte, visible et nommée.
                isSelectable={false}
                isSelected={selectedFolders.includes(folder.id)}
                isClickable
                onClick={() => setCurrentFolderId(folder.id)}
              >
                <Card.Body>
                  <SelectionCheckbox
                    label={folder.label}
                    checked={selectedFolders.includes(folder.id)}
                    onToggle={() => toggleFolder(folder.id)}
                  />
                  <Card.Title>{folder.label}</Card.Title>
                </Card.Body>
              </Card>
            ))}
            {visibleSubjects.map((subject) => (
              <Card
                key={`subject-${subject.id}`}
                className="g-col-12 g-col-md-6 g-col-xl-4"
                isSelectable={false}
                isSelected={selectedSubjects.includes(subject.id)}
                isClickable
                onClick={() => openSubject(subject)}
              >
                <Card.Body>
                  <SelectionCheckbox
                    label={subject.title}
                    checked={selectedSubjects.includes(subject.id)}
                    onToggle={() => toggleSubject(subject.id)}
                  />
                  <Card.Image imageSrc={subject.picture || illuExercizer} variant="small" />
                  <div className="d-flex flex-column gap-4">
                    <Card.Title>{subject.title}</Card.Title>
                    <Card.Text className="text-muted">
                      {subject.type === 'simple'
                        ? t('exercizer.simple.subject')
                        : t('exercizer.interactive.subject')}
                    </Card.Text>
                    {subject.modified && (
                      <Card.Text className="text-muted">
                        {t('exercizer.domino.modified')} {formatDate(subject.modified)}
                      </Card.Text>
                    )}
                    {scope === 'shared' && subject.owner_username && (
                      <Card.Text className="text-muted">
                        {t('exercizer.author')} : {subject.owner_username}
                      </Card.Text>
                    )}
                  </div>
                </Card.Body>
              </Card>
            ))}
          </div>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                <Table.Th>{t('exercizer.subject.title')}</Table.Th>
                <Table.Th>{t('exercizer.author')}</Table.Th>
                <Table.Th>{t('exercizer.domino.modified')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleFolders.map((folder) => (
                <Table.Tr key={`folder-${folder.id}`}>
                  <Table.Td>
                    <Checkbox
                      aria-label={folder.label}
                      checked={selectedFolders.includes(folder.id)}
                      onChange={() => toggleFolder(folder.id)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button color="tertiary" variant="ghost" onClick={() => setCurrentFolderId(folder.id)}>
                      {folder.label}
                    </Button>
                  </Table.Td>
                  <Table.Td />
                  <Table.Td>{formatDate(folder.modified)}</Table.Td>
                </Table.Tr>
              ))}
              {visibleSubjects.map((subject) => (
                <Table.Tr key={`subject-${subject.id}`}>
                  <Table.Td>
                    <Checkbox
                      aria-label={subject.title}
                      checked={selectedSubjects.includes(subject.id)}
                      onChange={() => toggleSubject(subject.id)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button color="tertiary" variant="ghost" onClick={() => openSubject(subject)}>
                      {subject.title}
                    </Button>
                  </Table.Td>
                  <Table.Td>{subject.owner_username}</Table.Td>
                  <Table.Td>{formatDate(subject.modified)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </section>

      {/* Barre d'actions sur la sélection — l'équivalent du « toaster » de l'ancienne IHM. Les
          actions qui ne valent que pour un seul élément ne s'affichent qu'alors. */}
      {selectionCount > 0 && (
        <ActionBar>
          {onlyOneSubject && (
            <Button
              color="primary"
              variant="filled"
              onClick={() => {
                const subject = subjects.find((s) => s.id === selectedSubjects[0]);
                if (subject) openSubject(subject);
              }}
            >
              {t('exercizer.instructer.toaster.open')}
            </Button>
          )}
          {onlyOneFolder && (
            <Button
              color="primary"
              variant="filled"
              onClick={() =>
                setDialog({
                  kind: 'folder',
                  folder: folders.find((f) => f.id === selectedFolders[0]),
                })
              }
            >
              {t('exercizer.instructer.toaster.property')}
            </Button>
          )}
          {selectedSubjects.length > 0 && selectedFolders.length === 0 && (
            <>
              <Button color="primary" variant="outline" onClick={() => duplicate.mutate()}>
                {t('exercizer.duplicate')}
              </Button>
              <Button color="primary" variant="outline" onClick={() => setDialog({ kind: 'move' })}>
                {t('exercizer.move')}
              </Button>
            </>
          )}
          <Button color="danger" variant="outline" onClick={() => setDialog({ kind: 'remove' })}>
            {t('exercizer.remove')}
          </Button>
        </ActionBar>
      )}

      {dialog?.kind === 'folder' && (
        <FolderDialog
          folder={dialog.folder}
          onClose={() => setDialog(null)}
          onSave={(label) => saveFolder.mutate({ id: dialog.folder?.id, label })}
        />
      )}

      {dialog?.kind === 'move' && (
        <MoveDialog
          folders={folders}
          onClose={() => setDialog(null)}
          onConfirm={(targetFolderId) => move.mutate(targetFolderId)}
        />
      )}

      {dialog?.kind === 'remove' && (
        <ConfirmModal
          title={t('exercizer.subject.remove.title')}
          confirmLabel={t('exercizer.subject.remove.action')}
          onClose={() => setDialog(null)}
          onConfirm={() => remove.mutate()}
        >
          <p>{t('exercizer.subject.remove.confirm')}</p>
          <ul>
            {selectedFolders.map((id) => (
              <li key={`f${id}`}>{folders.find((f) => f.id === id)?.label}</li>
            ))}
            {selectedSubjects.map((id) => (
              <li key={`s${id}`}>{subjects.find((s) => s.id === id)?.title}</li>
            ))}
          </ul>
          {selectedFolders.length > 0 && (
            // L'asymétrie corbeille / suppression définitive n'est pas visible de l'écran : la
            // dire au moment de confirmer est le seul endroit où elle sert.
            <p className="text-danger">{t('exercizer.folder.remove.permanent')}</p>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}

/**
 * Case à cocher posée DANS une carte cliquable.
 *
 * Le socle couvre toute la carte d'un bouton transparent en `z-1` pour l'ouvrir : sans se placer
 * au-dessus (`z-2`) et sans arrêter la propagation, cocher ouvrirait aussi l'élément.
 */
function SelectionCheckbox({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="position-relative z-2" onClick={(event) => event.stopPropagation()}>
      <Checkbox aria-label={label} checked={checked} onChange={onToggle} />
    </div>
  );
}

export default TeacherSubjects;
