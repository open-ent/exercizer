import { Alert, Badge, Button, Checkbox, FormControl, Input, Label, SearchBar } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getGroupMembers, getShareTargets } from '../api';
import { PickedGroup, PickedUser } from '../schedule';

/**
 * Le choix des destinataires d'une distribution — portage du couple
 * `drop-down` + `groups-users-selector` de `subject-schedule.html`.
 *
 * Choisir un GROUPE y ajoute aussi ses membres, pour qu'on puisse en retirer quelqu'un ; ces
 * membres ne sont pas renvoyés au serveur (il résout le groupe lui-même), seules les exclusions
 * le sont. Cette règle vit dans `schedule.ts#buildScheduledAt`, avec ses tests.
 */
export interface RecipientPickerProps {
  subjectId: number;
  groups: PickedGroup[];
  users: PickedUser[];
  onChange: (next: { groups: PickedGroup[]; users: PickedUser[] }) => void;
}

/** Au-dessous, la recherche serveur n'est pas déclenchée — c'est la règle de l'ancienne IHM. */
const MIN_SEARCH = 3;

export function RecipientPicker({ subjectId, groups, users, onChange }: RecipientPickerProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * La liste des destinataires possibles. On interroge le serveur avec les trois premiers
   * caractères : c'est ce que fait l'ancienne IHM pour un administrateur local, dont l'annuaire
   * visible est trop grand pour tenir en une réponse. Le filtrage fin se fait ensuite ici.
   */
  const prefix = search.trim().slice(0, MIN_SEARCH).toLowerCase();
  const targetsQuery = useQuery({
    queryKey: ['exercizer', 'share-targets', subjectId, prefix],
    queryFn: () => getShareTargets(subjectId, prefix.length >= MIN_SEARCH ? prefix : undefined),
    enabled: search.trim().length === 0 || prefix.length >= MIN_SEARCH,
    staleTime: 60_000,
  });

  const matches = useMemo(() => {
    const text = normalise(search);
    if (!text) return [];
    const targets = targetsQuery.data;
    if (!targets) return [];

    const chosenGroups = new Set(groups.map((group) => group._id));
    const chosenUsers = new Set(users.filter((user) => !user.groupId).map((user) => user._id));

    const groupMatches = (targets.groups?.visibles ?? [])
      .filter((group) => !chosenGroups.has(group.id))
      .map((group) => ({
        kind: 'group' as const,
        _id: group.id,
        name: group.groupDisplayName || group.name,
        detail: group.structureName ?? undefined,
      }));

    const userMatches = (targets.users?.visibles ?? [])
      .filter((user) => !chosenUsers.has(user.id))
      .map((user) => ({
        kind: 'user' as const,
        _id: user.id,
        name: user.username ?? `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim(),
        detail: user.profile,
      }));

    return [...groupMatches, ...userMatches]
      .filter((item) => normalise(item.name).includes(text))
      .slice(0, 30);
  }, [search, targetsQuery.data, groups, users]);

  /**
   * Ajoute un groupe ET ses membres. Un groupe vide est signalé plutôt qu'ajouté : distribuer à
   * personne ne produirait aucune copie, sans que rien ne le dise.
   */
  const addGroup = async (group: PickedGroup) => {
    setError(null);
    try {
      const members = await getGroupMembers(group._id);
      if (members.length === 0) {
        setError(t('exercizer.schedule.empty.group'));
        return;
      }
      // La liste de résultats se referme : sinon les membres proposés à l'exclusion, ajoutés
      // juste en dessous, se retrouvent repoussés hors de l'écran. L'ancienne IHM refermait
      // son `drop-down` de la même façon.
      setSearch('');
      onChange({
        groups: [...groups, group],
        users: [
          ...users,
          ...members
            // Quelqu'un déjà choisi nominativement reste nominatif : on ne le double pas.
            .filter((member) => !users.some((user) => user._id === member._id))
            .map((member) => ({
              _id: member._id,
              name: member.name,
              profile: member.profiles?.[0],
              groupId: group._id,
              exclude: false,
            })),
        ],
      });
    } catch {
      setError(t('exercizer.error'));
    }
  };

  const addUser = (user: PickedUser) => {
    setError(null);
    setSearch('');
    onChange({ groups, users: [...users, { ...user, groupId: undefined }] });
  };

  /** Retirer un groupe retire aussi les membres qu'il avait amenés. */
  const removeGroup = (group: PickedGroup) =>
    onChange({
      groups: groups.filter((item) => item._id !== group._id),
      users: users.filter((user) => user.groupId !== group._id),
    });

  const removeUser = (user: PickedUser) =>
    onChange({ groups, users: users.filter((item) => item !== user) });

  const toggleExclude = (user: PickedUser, exclude: boolean) =>
    onChange({
      groups,
      users: users.map((item) => (item === user ? { ...item, exclude } : item)),
    });

  const groupMembers = users.filter((user) => user.groupId !== undefined);
  const namedUsers = users.filter((user) => user.groupId === undefined);

  return (
    <div className="d-flex flex-column gap-16">
      <FormControl id="schedule-recipients-search">
        <Label>{t('exercizer.scheduled.subject.search')}</Label>
        <SearchBar
          isVariant
          size="md"
          clearable
          placeholder={t('exercizer.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </FormControl>

      {search.trim().length > 0 && prefix.length < MIN_SEARCH && (
        <p className="text-muted mb-0">
          <small>{t('exercizer.search.limit')}</small>
        </p>
      )}

      {error && (
        <Alert type="warning" isDismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {matches.length > 0 && (
        <ul className="list-unstyled d-flex flex-column gap-4" aria-label={t('exercizer.search')}>
          {matches.map((item) => (
            <li key={`${item.kind}-${item._id}`}>
              <Button
                color="tertiary"
                variant="ghost"
                className="w-100 text-start"
                onClick={() =>
                  item.kind === 'group'
                    ? addGroup({ _id: item._id, name: item.name })
                    : addUser({ _id: item._id, name: item.name, profile: item.detail })
                }
              >
                {item.name}
                {item.detail && <small className="text-muted ms-8">{item.detail}</small>}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {(groups.length > 0 || namedUsers.length > 0) && (
        <section>
          <p className="form-label mb-4">{t('exercizer.scheduled.subject.to')}</p>
          <ul className="list-unstyled d-flex flex-wrap gap-8">
            {groups.map((group) => (
              <li key={group._id}>
                <Badge variant={{ type: 'chip' }}>
                  {group.name}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost btn-danger ms-4"
                    aria-label={`${t('exercizer.remove')} ${group.name}`}
                    onClick={() => removeGroup(group)}
                  >
                    ×
                  </button>
                </Badge>
              </li>
            ))}
            {namedUsers.map((user) => (
              <li key={user._id}>
                <Badge variant={{ type: 'chip' }}>
                  {user.name}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost btn-danger ms-4"
                    aria-label={`${t('exercizer.remove')} ${user.name}`}
                    onClick={() => removeUser(user)}
                  >
                    ×
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Les membres venus d'un groupe : on peut en retirer, pas les ajouter un par un. */}
      {groupMembers.length > 0 && (
        <section>
          <p className="form-label mb-4">{t('exercizer.exclude')}</p>
          <ul className="list-unstyled d-flex flex-column gap-4" style={{ maxHeight: '14rem', overflowY: 'auto' }}>
            {groupMembers.map((user) => (
              <li key={`${user.groupId}-${user._id}`}>
                <Checkbox
                  label={user.name}
                  checked={user.exclude === true}
                  onChange={(event) => toggleExclude(user, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Comparaison insensible à la casse et aux accents, comme `idiom.removeAccents`. */
function normalise(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export default RecipientPicker;
