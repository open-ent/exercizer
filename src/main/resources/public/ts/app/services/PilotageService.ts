import { ng } from 'entcore';

/**
 * D3 - Pilotage actif en direct.
 * Formes des payloads alignées sur SubjectScheduledController.java (buildPilotageStateResponse)
 * et PilotageWebSocketController.java (backend déjà fait, non modifié ici).
 */
export interface IPilotageStudent {
    copyId: number;
    studentId: string;
    studentName: string;
    hasBeenStarted: boolean;
    submittedDate: string;
    isCorrectionOnGoing: boolean;
    isCorrected: boolean;
    extraTimeMinutes: number;
    isForcedSubmit: boolean;
    state: string; // 'not_started' | 'started' | 'submitted' | 'corrected'
    remainingSeconds?: number;
}

export interface IPilotageState {
    subjectScheduledId: number;
    title: string;
    sessionState: string; // 'en_cours' | 'en_pause'
    beginDate: string;
    dueDate: string;
    pausedDurationSeconds: number;
    students: IPilotageStudent[];
}

export interface IPilotageSocketHandle {
    close(): void;
}

export interface IPilotageService {
    getState(subjectScheduledId: number | string): Promise<IPilotageState>;
    pause(subjectScheduledId: number | string): Promise<any>;
    resume(subjectScheduledId: number | string): Promise<any>;
    extendTime(subjectScheduledId: number | string, minutes: number, studentId?: string): Promise<any>;
    forceSubmit(subjectScheduledId: number | string, studentId: string): Promise<any>;
    sendMessage(subjectScheduledId: number | string, message: string, studentId?: string): Promise<any>;
    connect(subjectScheduledId: number | string, onEvent: (event: any) => void, onStatusChange: (connected: boolean) => void): IPilotageSocketHandle;
}

// Port dédié du serveur WebSocket applicatif du pilotage (cf. deployment/exercizer/conf.json.template,
// bloc "real-time" / Exercizer.java). Même principe que collaborative-wall qui code en dur son port
// (9091) côté front dans useWsMode.ts : pas d'endpoint pour le découvrir dynamiquement.
const PILOTAGE_WS_PORT = 8106;

export class PilotageService implements IPilotageService {

    static $inject = [
        '$q',
        '$http'
    ];

    constructor(
        private _$q,
        private _$http
    ) {
        this._$q = _$q;
        this._$http = _$http;
    }

    public getState = function(subjectScheduledId: number | string): Promise<IPilotageState> {
        var deferred = this._$q.defer(),
            request = {
                method: 'GET',
                url: 'exercizer/subject-scheduled/' + subjectScheduledId + '/pilotage'
            };

        this._$http(request).then(
            function(response) {
                deferred.resolve(response.data);
            },
            function() {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };

    public pause = function(subjectScheduledId: number | string): Promise<any> {
        var deferred = this._$q.defer(),
            request = {
                method: 'PUT',
                url: 'exercizer/subject-scheduled/' + subjectScheduledId + '/pilotage/pause',
                data: {}
            };

        this._$http(request).then(
            function(response) {
                deferred.resolve(response.data);
            },
            function() {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };

    public resume = function(subjectScheduledId: number | string): Promise<any> {
        var deferred = this._$q.defer(),
            request = {
                method: 'PUT',
                url: 'exercizer/subject-scheduled/' + subjectScheduledId + '/pilotage/resume',
                data: {}
            };

        this._$http(request).then(
            function(response) {
                deferred.resolve(response.data);
            },
            function() {
                deferred.reject('exercizer.error');
            }
        );
        return deferred.promise;
    };

    public extendTime = function(subjectScheduledId: number | string, minutes: number, studentId?: string): Promise<any> {
        var deferred = this._$q.defer(),
            request = {
                method: 'PUT',
                url: 'exercizer/subject-scheduled/' + subjectScheduledId + '/pilotage/extend-time',
                data: { minutes: minutes, studentId: studentId || null }
            };

        this._$http(request).then(
            function(response) {
                deferred.resolve(response.data);
            },
            function(e) {
                deferred.reject(e && e.data && e.data.error ? e.data.error : 'exercizer.error');
            }
        );
        return deferred.promise;
    };

    public forceSubmit = function(subjectScheduledId: number | string, studentId: string): Promise<any> {
        var deferred = this._$q.defer(),
            request = {
                method: 'PUT',
                url: 'exercizer/subject-scheduled/' + subjectScheduledId + '/pilotage/force-submit',
                data: { studentId: studentId }
            };

        this._$http(request).then(
            function(response) {
                deferred.resolve(response.data);
            },
            function(e) {
                deferred.reject(e && e.data && e.data.error ? e.data.error : 'exercizer.pilotage.force.submit.refused');
            }
        );
        return deferred.promise;
    };

    public sendMessage = function(subjectScheduledId: number | string, message: string, studentId?: string): Promise<any> {
        var deferred = this._$q.defer(),
            request = {
                method: 'POST',
                url: 'exercizer/subject-scheduled/' + subjectScheduledId + '/pilotage/message',
                data: { message: message, studentId: studentId || null }
            };

        this._$http(request).then(
            function(response) {
                deferred.resolve(response.data);
            },
            function(e) {
                deferred.reject(e && e.data && e.data.error ? e.data.error : 'exercizer.error');
            }
        );
        return deferred.promise;
    };

    /**
     * Repli HTTP (polling) à la charge de l'appelant si le WS échoue (cf. spec D3) : ce service ne fait
     * que remonter les changements de statut de connexion via onStatusChange, il ne poll pas lui-même.
     */
    public connect = function(subjectScheduledId: number | string, onEvent: (event: any) => void, onStatusChange: (connected: boolean) => void): IPilotageSocketHandle {
        var closedByCaller = false;
        // any plutôt que le type WebSocket global : le @types/node embarqué par ce toolchain
        // legacy (gulp/ts-loader) entre en conflit avec lib.dom.d.ts et fait échouer la
        // résolution du type (TS2304), sans rapport avec le code applicatif lui-même.
        var socket: any;

        function buildUrl(): string {
            var isLocalhost = window.location.hostname === 'localhost';
            return isLocalhost
                ? 'ws://' + window.location.hostname + ':' + PILOTAGE_WS_PORT + '/exercizer/pilotage/' + subjectScheduledId
                : 'wss://' + window.location.host + '/exercizer/pilotage/realtime/' + subjectScheduledId;
        }

        try {
            socket = new WebSocket(buildUrl());
        } catch (e) {
            onStatusChange(false);
            return { close: function() { } };
        }

        socket.onopen = function() {
            if (!closedByCaller) onStatusChange(true);
        };
        socket.onmessage = function(evt) {
            try {
                onEvent(JSON.parse(evt.data));
            } catch (e) {
                // trame malformée, on l'ignore : le repli poll continuera de toute façon à faire
                // avancer l'affichage
            }
        };
        socket.onclose = function() {
            if (!closedByCaller) onStatusChange(false);
        };
        socket.onerror = function() {
            if (!closedByCaller) onStatusChange(false);
        };

        return {
            close: function() {
                closedByCaller = true;
                try {
                    socket.close();
                } catch (e) { /* noop */ }
            }
        };
    };
}

export const pilotageService = ng.service('PilotageService', PilotageService);
