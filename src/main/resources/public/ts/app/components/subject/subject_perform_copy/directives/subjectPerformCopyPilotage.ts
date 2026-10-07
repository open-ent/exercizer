import { ng, notify, model } from 'entcore';
import { IPilotageService, IPilotageSocketHandle } from '../../../../services/PilotageService';
import { IDateService } from '../../../../services/DateService';
import { ISubjectScheduled, ISubjectCopy } from '../../../../models/domain';

/**
 * D3 - Pilotage actif en direct, écran élève (cf. spec D3 "Écran élève (réaction en direct)").
 * Se branche sur le MÊME canal WebSocket que l'écran enseignant (PilotageService.connect, cf.
 * teacherDashboardPilotage.ts), scopé par subjectScheduledId, avec le même repli par sondage si le WS
 * n'est pas ouvert sous WS_OPEN_TIMEOUT_MS.
 *
 * Différence avec l'écran enseignant : cette directive ne peut pas appeler GET
 * /subject-scheduled/:id/pilotage (ResourceFilter SubjectScheduledOwner, réservé à l'enseignant). L'état
 * initial est donc lu directement sur subjectScheduled/subjectCopy (session_state, paused_at,
 * paused_duration_seconds, extra_time_minutes, is_forced_submit - migration
 * 036-add-pilotage-session-state.sql, déjà renvoyés tels quels par les endpoints élève existants), et
 * mis à jour en local à chaque événement WS reçu (mêmes formules que le backend, cf.
 * buildPilotageStateResponse / setSessionState côté Java). Le repli HTTP réinterroge ces deux mêmes
 * endpoints élève (exercizer/subjects-scheduled-by-subjects-copy, exercizer/subjects-copy) plutôt qu'un
 * nouvel endpoint dédié : aucun changement backend n'était nécessaire ni dans le périmètre de cette
 * tâche.
 */

const POLL_INTERVAL_MS = 20000;
const WS_OPEN_TIMEOUT_MS = 5000;

interface IPilotageMessage {
    id: string;
    text: string;
}

export const subjectPerformCopyPilotage = ng.directive('subjectPerformCopyPilotage',
    ['PilotageService', 'DateService', '$interval', '$timeout', '$http',
    (PilotageService: IPilotageService, DateService: IDateService, $interval, $timeout, $http) => {
        return {
            restrict: 'E',
            scope: {
                subjectScheduled: '=',
                subjectCopy: '=',
                // two-way : répercuté sur performSubjectCopyController.pilotageReadOnly, qui verrouille
                // les écritures (E_UPDATE_GRAIN_COPY / E_SUBJECT_COPY_SUBMITTED) et isCanSubmit.
                readOnly: '='
            },
            templateUrl: 'exercizer/public/ts/app/components/subject/subject_perform_copy/templates/subject-perform-copy-pilotage.html',
            link: (scope: any) => {

                var wsHandle: IPilotageSocketHandle;
                var pollTimer;
                var openTimer;
                var clockTimer;
                var extraTimeMinutes = (scope.subjectCopy as ISubjectCopy).extra_time_minutes || 0;

                scope.wsConnected = false;
                scope.sessionState = (scope.subjectScheduled as ISubjectScheduled).session_state || 'en_cours';
                scope.isForcedSubmit = !!(scope.subjectCopy as ISubjectCopy).is_forced_submit;
                scope.messages = [] as IPilotageMessage[];
                scope.remainingLabel = null;

                function applyReadOnly() {
                    scope.readOnly = scope.sessionState === 'en_pause' || scope.isForcedSubmit;
                }
                applyReadOnly();

                /**
                 * DÉCOMPTE
                 * Même formule que backend#buildPilotageStateResponse : due_date + extra_time_minutes +
                 * (paused_duration_seconds déjà écoulée + pause en cours éventuelle). Le résultat est
                 * donc gelé pendant une pause (la part "pause en cours" grandit aussi vite que "now").
                 */
                function computeRemainingLabel(): string {
                    var subjectScheduled = scope.subjectScheduled as ISubjectScheduled;
                    if (!subjectScheduled || !subjectScheduled.due_date) {
                        return null;
                    }
                    var now = Date.now();
                    var dueMs = DateService.isoToDate(subjectScheduled.due_date).getTime();
                    var pausedMs = (subjectScheduled.paused_duration_seconds || 0) * 1000;
                    if (scope.sessionState === 'en_pause' && subjectScheduled.paused_at) {
                        pausedMs += Math.max(0, now - DateService.isoToDate(subjectScheduled.paused_at).getTime());
                    }
                    var remainingMs = dueMs + (extraTimeMinutes * 60000) + pausedMs - now;
                    var remainingSec = Math.floor(remainingMs / 1000);
                    var sign = remainingSec < 0 ? '-' : '';
                    remainingSec = Math.abs(remainingSec);
                    var minutes = Math.floor(remainingSec / 60);
                    var seconds = remainingSec % 60;
                    return sign + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
                }

                function tickClock() {
                    // une fois la copie rendue (normalement ou de force), le décompte n'a plus de sens.
                    var subjectCopy = scope.subjectCopy as ISubjectCopy;
                    scope.remainingLabel = (subjectCopy && subjectCopy.submitted_date) ? null : computeRemainingLabel();
                }
                tickClock();
                clockTimer = $interval(tickClock, 1000);

                /**
                 * ÉVÉNEMENTS DE PILOTAGE
                 */

                function onPause() {
                    if (scope.sessionState === 'en_pause') return;
                    var subjectScheduled = scope.subjectScheduled as ISubjectScheduled;
                    subjectScheduled.session_state = 'en_pause';
                    subjectScheduled.paused_at = new Date().toISOString();
                    scope.sessionState = 'en_pause';
                    applyReadOnly();
                }

                function onResume() {
                    if (scope.sessionState !== 'en_pause') return;
                    var subjectScheduled = scope.subjectScheduled as ISubjectScheduled;
                    var pausedAtMs = subjectScheduled.paused_at ? DateService.isoToDate(subjectScheduled.paused_at).getTime() : Date.now();
                    var elapsedSeconds = Math.max(0, Math.floor((Date.now() - pausedAtMs) / 1000));
                    subjectScheduled.paused_duration_seconds = (subjectScheduled.paused_duration_seconds || 0) + elapsedSeconds;
                    subjectScheduled.paused_at = null;
                    subjectScheduled.session_state = 'en_cours';
                    scope.sessionState = 'en_cours';
                    applyReadOnly();
                }

                function onExtendTime(event: any) {
                    var updatedCopies = event.updatedCopies || [];
                    var mine = updatedCopies.filter(function(c) { return c.owner === model.me.userId; })[0];
                    if (!mine) return; // ne concerne pas cet élève (copie déjà rendue, ou classe sans lui)
                    extraTimeMinutes = mine.extra_time_minutes;
                    (scope.subjectCopy as ISubjectCopy).extra_time_minutes = extraTimeMinutes;
                    tickClock();
                    notify.info('exercizer.pilotage.student.extend.received');
                }

                function onForceSubmit(event: any) {
                    if (event.studentId !== model.me.userId) return;
                    scope.isForcedSubmit = true;
                    var subjectCopy = scope.subjectCopy as ISubjectCopy;
                    if (!subjectCopy.submitted_date) {
                        subjectCopy.submitted_date = new Date().toISOString();
                    }
                    applyReadOnly();
                }

                function onMessage(event: any) {
                    if (event.studentId && event.studentId !== model.me.userId) return;
                    scope.messages.push({
                        id: Date.now() + '-' + scope.messages.length,
                        text: event.message
                    });
                }

                function handleEvent(event: any) {
                    if (!event || !event.type) return;
                    switch (event.type) {
                        case 'pause': onPause(); break;
                        case 'resume': onResume(); break;
                        case 'extend-time': onExtendTime(event); break;
                        case 'force-submit': onForceSubmit(event); break;
                        case 'message': onMessage(event); break;
                        default: break;
                    }
                }

                scope.dismissMessage = function(message: IPilotageMessage) {
                    scope.messages = scope.messages.filter(function(m) { return m.id !== message.id; });
                };

                /**
                 * CONNEXION WS + REPLI SONDAGE (même stratégie que teacherDashboardPilotage.ts)
                 */

                function connectWs() {
                    var subjectScheduledId = (scope.subjectScheduled as ISubjectScheduled).id;
                    openTimer = $timeout(function() {
                        if (!scope.wsConnected) startPolling();
                    }, WS_OPEN_TIMEOUT_MS);

                    wsHandle = PilotageService.connect(subjectScheduledId,
                        function onEvent(event) {
                            scope.$applyAsync(function() {
                                handleEvent(event);
                            });
                        },
                        function onStatusChange(connected) {
                            scope.$applyAsync(function() {
                                scope.wsConnected = connected;
                                if (connected) {
                                    stopPolling();
                                } else {
                                    startPolling();
                                }
                            });
                        }
                    );
                }

                function startPolling() {
                    if (pollTimer) return;
                    pollTimer = $interval(poll, POLL_INTERVAL_MS);
                }

                function stopPolling() {
                    if (pollTimer) {
                        $interval.cancel(pollTimer);
                        pollTimer = null;
                    }
                }

                function poll() {
                    var subjectScheduledId = (scope.subjectScheduled as ISubjectScheduled).id;
                    var subjectCopyId = (scope.subjectCopy as ISubjectCopy).id;

                    $http({
                        method: 'GET',
                        url: 'exercizer/subjects-scheduled-by-subjects-copy/' + (-1 * new Date().getTimezoneOffset())
                    }).then(function(response) {
                        var fresh = (response.data || []).filter(function(s) { return s.id === subjectScheduledId; })[0];
                        if (fresh) {
                            var subjectScheduled = scope.subjectScheduled as ISubjectScheduled;
                            subjectScheduled.session_state = fresh.session_state;
                            subjectScheduled.paused_at = fresh.paused_at;
                            subjectScheduled.paused_duration_seconds = fresh.paused_duration_seconds;
                            scope.sessionState = fresh.session_state || 'en_cours';
                            applyReadOnly();
                        }
                    });

                    $http({ method: 'GET', url: 'exercizer/subjects-copy' }).then(function(response) {
                        var fresh = (response.data || []).filter(function(c) { return c.id === subjectCopyId; })[0];
                        if (fresh) {
                            extraTimeMinutes = fresh.extra_time_minutes || 0;
                            (scope.subjectCopy as ISubjectCopy).extra_time_minutes = extraTimeMinutes;
                            scope.isForcedSubmit = !!fresh.is_forced_submit;
                            applyReadOnly();
                        }
                    });
                }

                connectWs();

                scope.$on('$destroy', function() {
                    stopPolling();
                    if (openTimer) $timeout.cancel(openTimer);
                    if (clockTimer) $interval.cancel(clockTimer);
                    if (wsHandle) wsHandle.close();
                });
            }
        };
    }]
);
