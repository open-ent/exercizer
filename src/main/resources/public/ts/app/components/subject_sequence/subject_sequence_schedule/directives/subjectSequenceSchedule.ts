import { ng, notify, idiom, DatepickerDelegate, Me } from 'entcore';
import { moment } from 'entcore';
import { _ } from 'entcore';
import { $ } from 'entcore';

// Affectation d'un Parcours à un groupe/des élèves, sur le modèle de
// components/subject/subject_schedule/directives/subjectSchedule.ts (recherche/sélection de
// destinataires réutilisée à l'identique, cf. SPEC-PARCOURS-multi-sequences.md §4.2). Simplifié par
// rapport au sujet unique : pas d'étape "type de distribution" (mode entraînement écarté pour un Parcours
// en phase 1, cf. spec §6) ni de distinction sujet simple/interactif (un Parcours n'a pas de type propre,
// c'est chaque sujet qui compose déjà le sien).
export const subjectSequenceSchedule = ng.directive('subjectSequenceSchedule',
    ['GroupService', '$q', '$location', 'SubjectSequenceScheduledService', (GroupService, $q, $location, SubjectSequenceScheduledService) => {
        return {
            restrict: 'E',
            scope: {},
            templateUrl: 'exercizer/public/ts/app/components/subject_sequence/subject_sequence_schedule/templates/subject-sequence-schedule.html',
            link: (scope: any) => {
                let dateModels = [];
                scope.datePickerDelegate = {
                    onDestroy(args) {
                        dateModels = dateModels.filter(test => test !== args.ngModel);
                    },
                    onInit(args) {
                        dateModels.push(args.ngModel);
                    },
                    onValidationChange() { }
                } as DatepickerDelegate;
                scope.now = new Date();
                const toMoment = (date: Date, time: string) => {
                    const formatted = moment(date).format("DD/MM/YYYY");
                    return moment(`${formatted} ${time}`, ["DD/MM/YYYY HH:mm"], true)
                }
                scope.isValidSubjectSequence = () => {
                    for (let modl of dateModels) {
                        if (modl.$invalid) return false;
                    }
                    if (!scope.lightbox || scope.lightbox.state != 'option') return false;
                    const begin = toMoment(scope.option.begin_date, scope.option.begin_time);
                    const due = toMoment(scope.option.due_date, scope.option.due_time);
                    return begin.isValid() && due.isValid() && begin.toDate() < due.toDate();
                }

                scope.subjectSequence = null;
                scope.scheduleInProgress = false;
                scope.selector = { loading: false };

                function reset() {
                    scope.lightbox = { state: 'assignSubjectSequence', isDisplayed: false };
                    scope.data = { groupList: [], userList: [], exclude: [] };
                    scope.option = {
                        begin_date: new Date(),
                        due_date: moment().add(7, 'days').toDate(),
                        begin_time: "00:00",
                        due_time: "23:59",
                        estimated_duration: ""
                    };
                    scope.selector.selectedGroup = false;
                    scope.search = {};
                    scope.clearSearch();
                }

                scope.clickOnItem = async function (selectedItem) {
                    if (scope.selector.loading) return;
                    scope.selector.loading = true;
                    scope.clearSearch();
                    await addItemList(selectedItem);
                    scope.selector.loading = false;
                };

                async function addItemList(selectedItem) {
                    var list = (selectedItem.groupOrUser == 'group') ? scope.data.groupList : scope.data.userList;
                    var index = list.indexOf(selectedItem);
                    if (index === -1) {
                        clearSelectedList(undefined);
                        selectedItem.selected = false;

                        if (selectedItem.groupOrUser == 'group') {
                            findMembers(selectedItem['_id'], isEmpty => {
                                if (isEmpty) {
                                    notify.info("exercizer.schedule.empty.group");
                                } else {
                                    list.push(selectedItem);
                                    scope.data.userList = _.sortBy(scope.data.userList, 'name');
                                }
                            });
                        } else if (selectedItem.groupOrUser == 'user') {
                            list.push(selectedItem);
                            scrollToUser(selectedItem['_id']);
                            scope.data.userList = _.sortBy(scope.data.userList, 'name');
                        } else {
                            var members = await GroupService.getMembersFromBookmark(selectedItem);
                            await members.groups.forEach(async function (item) {
                                await addItemList(_.findWhere(scope.data.lists, { _id: item.id }));
                            });
                            await members.users.forEach(async function (item) {
                                await addItemList(_.findWhere(scope.data.lists, { _id: item.id }));
                            });
                        }
                    } else {
                        console.error('item already in the list');
                    }
                };

                function findMembers(groupId, cb) {
                    GroupService.findMembers(groupId).then(
                        function (data) {
                            var isEmpty = data.length === 0;
                            _.forEach(data, function (user) {
                                scope.data.userList.push({
                                    _id: user['_id'],
                                    name: user.name,
                                    profile: user.profiles[0],
                                    selected: false,
                                    exclude: false,
                                    groupId: groupId
                                });
                            });
                            cb(isEmpty);
                        }, function (err) {
                            notify.error(err);
                        }
                    );
                };

                function scrollToUser(userId) {
                    setTimeout(() => $('#userScrollSequence').animate({ scrollTop: $('#userScrollSequence').scrollTop() - $('#userScrollSequence').offset().top + $('#user-sequence-' + userId).offset().top }, 500), 100);
                }

                scope.checkTime = function (time, def?) {
                    return time.match("^([01][0-9]|2[0-3]):[0-5][0-9]$") ? time : def ? "23:59" : "00:00";
                };

                function createSubjectSequenceScheduledAt(data) {
                    var res = { groupList: [], userList: [], exclude: [] };
                    angular.forEach(data.groupList, function (group) {
                        res.groupList.push({ _id: group['_id'], name: group.name });
                    });
                    angular.forEach(data.userList, function (user) {
                        if (user && user.groupId === undefined) {
                            res.userList.push({ _id: user['_id'], name: user.name, profile: user.profile });
                        } else if (user && user.exclude) {
                            res.exclude.push({ _id: user['_id'], name: user.name, profile: user.profile });
                        }
                    });
                    if (res.exclude.length > 0) res.exclude = _.uniq(res.exclude);
                    return res;
                }

                scope.scheduleSubjectSequence = function () {
                    scope.scheduleInProgress = true;
                    const beginDate = moment(scope.option.begin_date).hours(12).minutes(0).seconds(0)
                        .toISOString().replace(/T..:../, "T" + scope.option.begin_time);
                    const dueDate = moment(scope.option.due_date).hours(12).minutes(0).seconds(0)
                        .toISOString().replace(/T..:../, "T" + scope.option.due_time);

                    SubjectSequenceScheduledService.schedule(scope.subjectSequence.id, {
                        beginDate: beginDate,
                        dueDate: dueDate,
                        estimatedDuration: scope.option.estimated_duration,
                        isOneShotSubmit: !scope.option.allow_students_to_update_copy,
                        randomDisplay: !!scope.option.random_display,
                        scheduledAt: createSubjectSequenceScheduledAt(scope.data)
                    }).then(function () {
                        scope.scheduleInProgress = false;
                        notify.info("exercizer.service.save.schedule");
                        scope.hide();
                        $location.path('/subject-sequence/list');
                    }, function (err) {
                        scope.scheduleInProgress = false;
                        notify.error(err);
                    });
                };

                scope.$on("E_DISPLAY_MODAL_SCHEDULE_SUBJECT_SEQUENCE", async function (event, subjectSequence) {
                    scope.subjectSequence = subjectSequence;
                    reset();
                    scope.lightbox.isDisplayed = true;
                    scope.data.lists = await createLists(null);
                });

                scope.hide = function () {
                    $('[data-drop-down]').height("");
                    $('[data-drop-down]').addClass('hidden');
                    reset();
                    scope.$emit('E_RESET_SELECTED_LIST');
                };

                function clearSelectedList(selectedGroupItem) {
                    _.forEach(scope.data.groupList, group => {
                        if (selectedGroupItem && selectedGroupItem._id === group._id) return;
                        group.selected = false;
                    });
                    _.forEach(scope.data.userList, user => {
                        user.selected = false;
                    });
                }

                var PROFILE_SUFFIXES = ['Student', 'Teacher', 'Relative', 'Personnel', 'Guest'];
                function groupDisplayName(group) {
                    if (group.groupDisplayName) {
                        return idiom.translate(group.groupDisplayName);
                    }
                    var name = group.name || '';
                    var idx = name.lastIndexOf('-');
                    if (idx > 0) {
                        var suffix = name.substring(idx + 1);
                        if (PROFILE_SUFFIXES.indexOf(suffix) !== -1) {
                            var label = name.substring(0, idx);
                            var display = idiom.translate('exercizer.group.profile.' + suffix)
                                + ' ' + idiom.translate('exercizer.group.of') + ' ' + label;
                            if (group.structureName) {
                                display += ' (' + group.structureName + ')';
                            }
                            return display;
                        }
                    }
                    return name;
                }

                async function createLists(startSearch) {
                    var array = [];
                    await GroupService.getListForSubjectSequence(scope.subjectSequence, startSearch, (startSearch != null)).then(
                        function (data) {
                            angular.forEach(data.bookmarks, function (group) {
                                array.push(createObjectList(group.name, group.id, 'bookbark', null, null, true));
                            });
                            angular.forEach(data.groups.visibles, function (group) {
                                array.push(createObjectList(groupDisplayName(group), group.id, 'group', null, group.structureName, false));
                            });
                            angular.forEach(data.users.visibles, function (user) {
                                array.push(createObjectList(user.lastName + ' ' + user.firstName, user.id, 'user', user.profile, null, false));
                            })
                        }
                    );
                    return array;
                }

                function createObjectList(name, id, groupOrUser, profile, structureName, bookmark) {
                    return {
                        name: name,
                        _id: id,
                        groupOrUser: groupOrUser,
                        profile: profile,
                        structureName: structureName,
                        type: bookmark ? "sharebookmark" : null,
                        toString: function () { return this.name; }
                    };
                }

                scope.clearSearch = function () {
                    if (scope.search) {
                        scope.search.found = [];
                        scope.search.search = '';
                        scope.selector.search = '';
                    }
                    if (scope.data && !scope.selector.selectedGroup) {
                        clearSelectedList(undefined);
                    } else {
                        scope.selector.selectedGroup = false;
                    }
                };

                scope.safeApply = function (fn) {
                    const phase = this.$root.$$phase;
                    if (phase == '$apply' || phase == '$digest') {
                        if (fn && (typeof (fn) === 'function')) fn();
                    } else {
                        this.$apply(fn);
                    }
                };

                var searchCache = {};
                scope.isAdml = function () {
                    if (!Me.session) return false;
                    return Me.session.functions.ADMIN_LOCAL;
                };
                scope.canTriggerSearch = function () {
                    if (!scope.search || !scope.search.search || !Me.session) return false;
                    return Me.session.functions.ADMIN_LOCAL ? scope.search.search.length >= 3 : scope.search.search.length >= 1;
                };
                scope.updateFoundUsersGroups = async function () {
                    try {
                        scope.isSearching = true;
                        if (!scope.canTriggerSearch()) return [];
                        var searchTerm = idiom.removeAccents(scope.search.search).toLowerCase();
                        if (!searchTerm) return [];

                        var startSearch = Me.session.functions.ADMIN_LOCAL ? searchTerm.substr(0, 3) : '';
                        var list;
                        var doApply = false;
                        if (startSearch.length == 3) {
                            if (!searchCache[startSearch]) {
                                searchCache[startSearch] = await createLists(startSearch);
                                doApply = true;
                            }
                            list = searchCache[startSearch];
                        } else {
                            list = scope.data.lists;
                        }

                        scope.search.found = _.filter(list, function (item) {
                            let titleTest = idiom.removeAccents(item.name).toLowerCase();
                            return titleTest.indexOf(searchTerm) !== -1;
                        });

                        if (doApply == true) scope.safeApply();
                    } finally {
                        scope.isSearching = false;
                        scope.safeApply();
                    }
                };

                scope.confirmation = function () {
                    if (!scope.option) return '';
                    return idiom.translate('exercizer.schedule.confirm').replace(/\{0\}/g, moment(scope.option.begin_date).format('DD/MM/YYYY'))
                        .replace(/\{1\}/g, scope.option.begin_time)
                        .replace(/\{2\}/g, moment(scope.option.due_date).format('DD/MM/YYYY'))
                        .replace(/\{3\}/g, scope.option.due_time);
                }
            }
        };
    }]
);
