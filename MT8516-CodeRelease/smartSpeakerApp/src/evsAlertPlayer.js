var EVSPlayerHandler = require('evsPlayerHandler').EVSPlayerHandler;
var PlayerActivity = require('evsMediaPlayer').PlayerActivity;
var ChannelType = require('evsAudioMgr').ChannelType;
var FocusState = require('evsAudioMgr').FocusState;
var BGMode = require('./evsPlayerHandler').BGMode;
var LightType = require('./lightType').LightType;
var logger = require('logger').getLogger('AlertPlayer');

/**
 * @class
 * EVS alert player implementation
 */
class EVSAlertPlayer extends EVSPlayerHandler {
    /**
     * Create an EVSAlertPlayer instance
     * @param {EVSAudioMgr} audioMgr
     * @param {EVSClient} client
     */

    constructor(audioMgr, client, ledMgr) {
        super(audioMgr, ChannelType.ALERT, 'alert_player', BGMode.VOL_DOWN);

        this.client = client;
        this.ledMgr = ledMgr;
        this.on('playerstate', this._onPlayerStateEx.bind(this));
    }

    /**
     * process alert directive
     * @param {object} item - alert directive object
     */
    onDirective(item) {
        // 新的Alert直接打断当前正在播放的Alert
        if(typeof item.url == "undefined" || item.url == null || item.url == "") {
            return;
        } else {
            this.waitList.length = 0;
            this.waitList.push(item);
            this.stop(true);
    
            // 若当前无音频焦点，则尝试获取音频焦点
            if (this.focusState === FocusState.NONE) {
                this._acquireChannel();
            }
        }
    }

    _onPlayerStateEx(state) {
        if (state === PlayerActivity.PLAYING) {
            this.ledMgr.openLight(LightType.TIMERTIMEOUT);
        } else if (state === PlayerActivity.STOPPED || state === PlayerActivity.FINISHED) {
            this.ledMgr.closeLight(LightType.TIMERTIMEOUT);
        }
        if (state === PlayerActivity.PLAYING ||
            state === PlayerActivity.STOPPED ||
            state === PlayerActivity.FINISHED) {
            var procSync = {
                header: {
                    name: 'audio_player.ring.progress_sync',
                    request_id: this.playItem.request_id
                },
                payload: {
                    resource_id: this.playItem.resource_id,
                    type: state === PlayerActivity.PLAYING ? 'STARTED' : 'STOPPED'
                }
            };
            this.client.request(procSync);
        }
    }
}

module.exports.EVSAlertPlayer = EVSAlertPlayer;
