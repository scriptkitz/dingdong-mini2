var ThinkingLight = require('./platforms/' + iflyosPlatform + '/light/thinkingLight').ThinkingLight;
var VolumeDownLight = require('./platforms/' + iflyosPlatform + '/light/volumeDownLight').VolumeDownLight;
var VolumeUpLight = require('./platforms/' + iflyosPlatform + '/light/volumeUpLight').VolumeUpLight;
var BootLight = require('./platforms/' + iflyosPlatform + '/light/bootLight').BootLight;
var BootingLight = require('./platforms/' + iflyosPlatform + '/light/bootingLight').BootingLight;
var BootedLight = require('./platforms/' + iflyosPlatform + '/light/bootedLight').BootedLight;
var NetDissConnLight = require('./platforms/' + iflyosPlatform + '/light/netDissconnLight').NetDissConnLight;
var NetWaitLight = require('./platforms/' + iflyosPlatform + '/light/netWaitLight').NetWaitLight;
var NetExitLight = require('./platforms/' + iflyosPlatform + '/light/netExitLight').NetExitLight;
var NetSuccessLight = require('./platforms/' + iflyosPlatform + '/light/netSuccessLight').NetSuccessLight;
var NetFailedLight = require('./platforms/' + iflyosPlatform + '/light/netFailedLight').NetFailedLight;
var BtConnSuccessLight = require('./platforms/' + iflyosPlatform + '/light/btConnSuccessLight').BtConnSuccessLight;
var BtConnFailedLight = require('./platforms/' + iflyosPlatform + '/light/btConnFailedLight').BtConnFailedLight;
var ListeningLight = require('./platforms/' + iflyosPlatform + '/light/listeningLight').ListeningLight;
var SpeakingLight = require('./platforms/' + iflyosPlatform + '/light/speakingLight').SpeakingLight;
var MicDisableLight = require('./platforms/' + iflyosPlatform + '/light/micDisableLight').MicDisableLight;
var MicDisabledLight = require('./platforms/' + iflyosPlatform + '/light/micDisabledLight').MicDisabledLight;
var AlarmTimeOutLight = require('./platforms/' + iflyosPlatform + '/light/alarmTimeoutLight').AlarmTimeOutLight;
var TimerTimeOutLight = require('./platforms/' + iflyosPlatform + '/light/timerTimeoutLight').TimerTimeOutLight;
var SystemErrorLight = require('./platforms/' + iflyosPlatform + '/light/systemErrorLight').SystemErrorLight;
var UpdatingLight = require('./platforms/' + iflyosPlatform + '/light/updatingLight').UpdatingLight;
var UpdateSuccessLight = require('./platforms/' + iflyosPlatform + '/light/updateSuccessLight').UpdateSuccessLight;
var UpdateFailedLight = require('./platforms/' + iflyosPlatform + '/light/updateFailedLight').UpdateFailedLight;
var LedController = require('./platforms/' + iflyosPlatform + '/ledController').LedController;
var LightType = require('../../lightType').LightType;
var logger = require('logger').getLogger('LedFactory');

class LedFactory {
    constructor(callback) {
        this.callback = callback;
        this.lightList = [];
        this.ledController = new LedController();
    }

    GetLight(type) {
        var light = null;
        this.lightList.forEach(value => {
            if (type === value.getType()) {
                light = value;
            }
        });

        if (light) {
            return light;
        }

        switch(type) {
            case LightType.BOOT:
                light = new BootLight(this.callback, LightType.BOOT, this.ledController);
                break;
            case LightType.BOOTING:
                light = new BootingLight(this.callback, LightType.BOOTING, this.ledController);
                break;
            case LightType.BOOTEND:
                light = new BootedLight(this.callback, LightType.BOOTEND, this.ledController);
                break;
            case LightType.NETDISSCONN:
                light = new NetDissConnLight(this.callback, LightType.NETDISSCONN, this.ledController);
                break;
            case  LightType.NETWAIT:
                light = new NetWaitLight(this.callback, LightType.NETWAIT, this.ledController);
                break;
            case  LightType.NETEXIT:
                light = new NetExitLight(this.callback, LightType.NETEXIT, this.ledController);
                break;
            case  LightType.NETSUCCESS:
                light = new NetSuccessLight(this.callback, LightType.NETSUCCESS, this.ledController);
                break;
            case  LightType.NETFAILED:
                light = new NetFailedLight(this.callback, LightType.NETFAILED, this.ledController);
                break;
            case  LightType.BTCONNSUCCESS:
                light = new BtConnSuccessLight(this.callback, LightType.BTCONNSUCCESS, this.ledController);
                break;
            case  LightType.BTCONNFAILED:
                light = new BtConnFailedLight(this.callback, LightType.BTCONNFAILED, this.ledController);
                break;
            case  LightType.LISTENNING:
                light = new ListeningLight(this.callback, LightType.LISTENNING, this.ledController);
                break;
            case  LightType.SPEAKING:
                light = new SpeakingLight(this.callback, LightType.SPEAKING, this.ledController);
                break;
            case  LightType.MICDISABLE:
                light = new MicDisableLight(this.callback, LightType.MICDISABLE, this.ledController);
                break;
            case  LightType.MICDISABLED:
                light = new MicDisabledLight(this.callback, LightType.MICDISABLED, this.ledController);
                break;
            case  LightType.ALARMTIMEOUT:
                light = new AlarmTimeOutLight(this.callback, LightType.ALARMTIMEOUT, this.ledController);
                break;
            case  LightType.TIMERTIMEOUT:
                light = new TimerTimeOutLight(this.callback, LightType.TIMERTIMEOUT, this.ledController);
                break;
            case LightType.THINKING:
                light = new ThinkingLight(this.callback, LightType.THINKING, this.ledController);
                break;
            case LightType.VOLUMEDOWN:
                light = new VolumeDownLight(this.callback, LightType.VOLUMEDOWN, this.ledController);
                break;
            case LightType.VOLUMEUP:
                light = new VolumeUpLight(this.callback, LightType.VOLUMEUP, this.ledController);
                break;
            case LightType.SYSTEMERROR:
                light = new SystemErrorLight(this.callback, LightType.SYSTEMERROR, this.ledController);
                break;
            case LightType.UPDATING:
                light = new UpdatingLight(this.callback, LightType.UPDATING, this.ledController);
                break;
            case LightType.UPDATESUCCESS:
                light = new UpdateSuccessLight(this.callback, LightType.UPDATESUCCESS, this.ledController);
                break;
            case LightType.UPDATEFAILED:
                light = new UpdateFailedLight(this.callback, LightType.UPDATEFAILED, this.ledController);
                break;
            default:
                break;
        }

        if(light)  {
            this.lightList.push(light);
        }

        return light;
    }

}

module.exports.LightType = LightType;
module.exports.LedFactory = LedFactory;