var EventEmitter = require('events');
var logger = require('logger').getLogger('CapSpeaker');
var LightType = require('./lightType').LightType;

/**
 * @class
 * EVS Speaker capability implementation
 */
class EVSCapSpeaker extends EventEmitter{
    /**
     * @param {EVSClient} client
     * @param {EVSContextMgr} cxtMgr
     * @param {EVSCapSystem} capSystem
     */
    constructor(client, cxtMgr, capSystem, led) {
        super();

        this.capSystem = capSystem;
        this.effectPlayer = null;
        this.players = [];
        this.led = led;
        this.isMuted = false;

        cxtMgr.addContextProvider(this._getContext.bind(this));
        client.onDirective('speaker.set_volume', this._onSetVolumeByServer.bind(this));
        client.on('disconnected', () => {
            this.players.forEach(p => {
                if (p.getName() !== 'sound_player') {
                    p.stop();
                }
            });
        });
    }

    /**
     * add audio player for volume control
     * @param {EVSAudioPlayer}player
     */
    addAudioPlayer(player) {
        this.players.push(player);
        if (player.getName() === 'effect_player') {
            this.effectPlayer = player;
        }
    }

    /**
     * volume changed locally
     * @param {number} volume
     */
    updateVolume(volume, noEffect) {
        this.isMuted = (volume === 0);
        if (this.isMuted) {
            this.players.forEach(p => p.setMute(true));
        } else {
            if (this.effectPlayer && !noEffect) {
                if (iflyosPlatform === "MTK8516-GEEK") {
                    var volumeLevel = parseInt((volume * 12) / 100);
                    this.led.openLight(LightType.VOLUMEUP, volumeLevel);
                }
                this.effectPlayer.play('sound_effect_ui_volume');
            }
            this.players.forEach(p => p.setVolume(volume));
        }
        this.capSystem.syncContext('volume changed');
    }

    /**
     * Adjust volume
     * @param {number} volume - the volume change value
     */
    adjustVolume(volume){
        if (this.effectPlayer) {
            this.effectPlayer.play('sound_effect_ui_volume');
        }
        this.players.forEach(p=>p.adjustVolume(volume));
        this.capSystem.syncContext('volume changed');
    }

    getVolume() {
        var volume = 10;
        this.players.forEach(player => {
            volume =  player.getVolume();
        });
        return volume;
    }

    _onSetVolumeByServer(response){
        this.updateVolume(response.payload.volume);
    }

    _getContext(){
        var vol = 100;
        for(var i = 0; i < this.players.length; i++){
            if(this.players[i].getVolume){
                vol = this.players[i].getVolume();
                break;
            }
        }

        return {
            speaker:{
                version:"1.0",
                volume: Math.floor(this.isMuted ? 0 : Number(vol)),
            }
        };
    }
}

exports.EVSCapSpeaker = EVSCapSpeaker;