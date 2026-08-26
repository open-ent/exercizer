import { ng, notify } from 'entcore';
import { IPilotageService, IPilotageState, IPilotageStudent, IPilotageSocketHandle } from '../../../../../services/PilotageService';

// Repli HTTP si le WS échoue ou n'est jamais monté (proxy/pare-feu), cf. spec D3 "Canal technique".
const POLL_INTERVAL_MS = 20000;
// Délai laissé au WS pour s'ouvrir avant de considérer qu'il a échoué et de démarrer le polling.
const WS_OPEN_TIMEOUT_MS = 5000;

export const teacherDashboardPilotage = ng.directive('teacherDashboardPilotage',
    ['PilotageService', '$interval', '$timeout', (PilotageService: IPilotageService, $interval, $timeout) => {
        return {
            restrict: 'E',
            scope: {
                selectedSubjectScheduled: "="
            },
            templateUrl: 'exercizer/public/ts/app/components/dashboard/teacher_dashboard/teacher_dashboard_pilotage/templates/teacher-dashboard-pilotage.html',
            link: (scope: any) => {

                var pollTimer;
                var openTimer;
                var wsHandle: IPilotageSocketHandle;
                var subjectScheduledId;

                scope.loading = true;
                scope.wsConnected = false;
                scope.state = null;
                scope.lastFetchTime = null;

                scope.extend = { isDisplayed: false, scope: 'class', target: null, minutes: null };
                scope.messageForm = { isDisplayed: false, scope: 'class', target: null, text: '' };
                scope.forceSubmitConfirm = { isDisplayed: false, target: null };

                scope.reminderDisplayed = false;
                scope.reminderCopies = [];
                scope.excludeDisplayed = false;
                scope.excludeCopyList = [];
                scope.toasterDisplayedDummy = {};

                scope.$watch('selectedSubjectScheduled', function(newValue) {
                    if (newValue && newValue.id && subjectScheduledId !== newValue.id) {
                        subjectScheduledId = newValue.id;
                        init(subjectScheduledId);
                    }
                });

                function init(id) {
                    refresh(id);
                    connectWs(id);
                }

                function refresh(id) {
                    PilotageService.getState(id).then(
                        function(state: IPilotageState) {
                            scope.state = state;
                            scope.lastFetchTime = new Date();
                            scope.loading = false;
                        },
                        function(err) {
                            scope.loading = false;
                            notify.error(err);
                        }
                    );
                }

                function connectWs(id) {
                    openTimer = $timeout(function() {
                        if (!scope.wsConnected) {
                            startPolling(id);
                        }
                    }, WS_OPEN_TIMEOUT_MS);

                    wsHandle = PilotageService.connect(id,
                        function onEvent(event) {
                            // Le WS ne sert qu'à savoir QUAND redemander l'état consolidé : les calculs
                            // (remainingSeconds, state) restent uniquement du côté serveur (cf. spec D3).
                            if (event && event.type && event.type !== 'message') {
                                scope.$applyAsync(function() {
                                    refresh(id);
                                });
                            }
                        },
                        function onStatusChange(connected) {
                            scope.$applyAsync(function() {
                                scope.wsConnected = connected;
                                if (connected) {
                                    stopPolling();
                                } else {
                                    startPolling(id);
                                }
                            });
                        }
                    );
                }

                function startPolling(id) {
                    if (pollTimer) return;
                    pollTimer = $interval(function() {
                        refresh(id);
                    }, POLL_INTERVAL_MS);
                }

                function stopPolling() {
                    if (pollTimer) {
                        $interval.cancel(pollTimer);
                        pollTimer = null;
                    }
                }

                // Horloge d'affichage : ne recalcule rien côté client au-delà de l'interpolation entre
                // deux refresh(), la source de vérité (remainingSeconds) reste le backend.
                var clockTimer = $interval(function() { }, 1000);

                scope.$on('$destroy', function() {
                    stopPolling();
                    if (openTimer) $timeout.cancel(openTimer);
                    if (clockTimer) $interval.cancel(clockTimer);
                    if (wsHandle) wsHandle.close();
                });

                /**
                 * DISPLAY
                 */

                scope.remainingLabel = function(student: IPilotageStudent) {
                    if (student.remainingSeconds === undefined || student.remainingSeconds === null) {
                        return '';
                    }
                    var elapsed = 0;
                    if (scope.state && scope.state.sessionState === 'en_cours' && scope.lastFetchTime) {
                        elapsed = Math.floor((Date.now() - scope.lastFetchTime.getTime()) / 1000);
                    }
                    var remaining = student.remainingSeconds - elapsed;
                    var sign = remaining < 0 ? '-' : '';
                    remaining = Math.abs(remaining);
                    var minutes = Math.floor(remaining / 60);
                    var seconds = remaining % 60;
                    return sign + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
                };

                scope.stateKey = function(student: IPilotageStudent) {
                    return 'exercizer.copy.state.' + student.state;
                };

                scope.canAct = function(student: IPilotageStudent) {
                    return student.state !== 'submitted' && student.state !== 'corrected';
                };

                /**
                 * ACTIONS - session (globale)
                 */

                scope.pause = function() {
                    PilotageService.pause(subjectScheduledId).then(
                        function() { refresh(subjectScheduledId); },
                        function(err) { notify.error(err); }
                    );
                };

                scope.resume = function() {
                    PilotageService.resume(subjectScheduledId).then(
                        function() { refresh(subjectScheduledId); },
                        function(err) { notify.error(err); }
                    );
                };

                /**
                 * ACTIONS - prolongation
                 */

                scope.openExtendClass = function() {
                    scope.extend = { isDisplayed: true, scope: 'class', target: null, minutes: null };
                };

                scope.openExtendStudent = function(student: IPilotageStudent) {
                    scope.extend = { isDisplayed: true, scope: 'student', target: student, minutes: null };
                };

                scope.confirmExtend = function() {
                    var minutes = parseInt(scope.extend.minutes, 10);
                    if (!minutes || minutes <= 0) {
                        notify.error('exercizer.pilotage.extend.invalid.minutes');
                        return;
                    }
                    var studentId = scope.extend.scope === 'student' && scope.extend.target ? scope.extend.target.studentId : undefined;
                    PilotageService.extendTime(subjectScheduledId, minutes, studentId).then(
                        function() {
                            scope.extend.isDisplayed = false;
                            notify.info('exercizer.pilotage.extend.sent');
                            refresh(subjectScheduledId);
                        },
                        function(err) { notify.error(err); }
                    );
                };

                /**
                 * ACTIONS - remise forcée
                 */

                scope.openForceSubmit = function(student: IPilotageStudent) {
                    scope.forceSubmitConfirm = { isDisplayed: true, target: student };
                };

                scope.confirmForceSubmit = function() {
                    var target = scope.forceSubmitConfirm.target;
                    if (!target) return;
                    PilotageService.forceSubmit(subjectScheduledId, target.studentId).then(
                        function() {
                            scope.forceSubmitConfirm.isDisplayed = false;
                            notify.info('exercizer.pilotage.force.submit.done');
                            refresh(subjectScheduledId);
                        },
                        function(err) { notify.error(err); }
                    );
                };

                /**
                 * ACTIONS - message ciblé
                 */

                scope.openMessageClass = function() {
                    scope.messageForm = { isDisplayed: true, scope: 'class', target: null, text: '' };
                };

                scope.openMessageStudent = function(student: IPilotageStudent) {
                    scope.messageForm = { isDisplayed: true, scope: 'student', target: student, text: '' };
                };

                scope.confirmMessage = function() {
                    if (!scope.messageForm.text || scope.messageForm.text.trim() === '') {
                        notify.error('exercizer.pilotage.message.empty');
                        return;
                    }
                    var studentId = scope.messageForm.scope === 'student' && scope.messageForm.target ? scope.messageForm.target.studentId : undefined;
                    PilotageService.sendMessage(subjectScheduledId, scope.messageForm.text, studentId).then(
                        function() {
                            scope.messageForm.isDisplayed = false;
                            notify.info('exercizer.pilotage.message.sent');
                        },
                        function(err) { notify.error(err); }
                    );
                };

                /**
                 * ACTIONS - relance / exclusion (réutilisation telle quelle des directives existantes)
                 */

                scope.openReminder = function(student: IPilotageStudent) {
                    scope.reminderCopies = [{
                        id: student.copyId,
                        owner_username: student.studentName,
                        submitted_date: student.submittedDate
                    }];
                    scope.reminderDisplayed = true;
                };

                scope.openExclude = function(student: IPilotageStudent) {
                    scope.excludeCopyList = [{
                        id: student.copyId,
                        selected: true,
                        owner_username: student.studentName,
                        submitted_date: student.submittedDate
                    }];
                    scope.excludeDisplayed = true;
                };

                scope.$watch('excludeDisplayed', function(newValue, oldValue) {
                    if (oldValue === true && newValue === false) {
                        refresh(subjectScheduledId);
                    }
                });
            }
        };
    }]
);
