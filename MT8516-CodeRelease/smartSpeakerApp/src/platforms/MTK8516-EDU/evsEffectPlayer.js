var EVSMediaPlayer = require('../../evsMediaPlayer').EVSMediaPlayer;
var PlayerActivity = require('../../evsMediaPlayer').PlayerActivity;

class EVSEffectPlayer {
    constructor(dirPath) {
        this.path = dirPath;
        if (this.path[this.path.length - 1] !== '/') {
            this.path += '/';
        }

        this.playItem = null;
        this.nextItem = null;

        this.volume = 45;
        this.volLev = 0.6;
        this.isMuted = false;
        this.playerState = PlayerActivity.IDLE;
        this.playerAlive = true;

        this.player = new EVSMediaPlayer('mediaplayer', 'effect_player');
        this.player.setVolume(this.volume * this.volLev);
        this.player.on('state', this._onPlayerState.bind(this));
    }

    setPlayerState(playerAlive) {
        this.playerAlive = playerAlive;
        this.player.setPlayerState(this.playerAlive);
        if (!this.playerAlive
            && this.playerState !== PlayerActivity.STOPPED
            && this.playerState !== PlayerActivity.IDLE
            && this.playerState !== PlayerActivity.FINISHED) {
            this.player._onPlayStatus('effect_player', '1', 'stop');
        }
    }

    play(file, callback) {
        if (this.playerAlive) {
            this.nextItem = {file: this.path + file + '.m4a', 'cb': callback};
            if (this.playerState === PlayerActivity.PLAYING ||
                this.playerState === PlayerActivity.PAUSED) {
                this.player.stop();
            } else {
                this._playNext();
            }
        }
    }

    stop() {
        this.player.stop();
    }

    getName() {
        return 'effect_player';
    }

    getVolume() {
        return this.volume;
    }

    setVolume(vol) {
        this.volume = vol;
        if (this.isMuted) {
            this.setMute(false);
        }
        this.player.setVolume(this.volume * this.volLev);
    }

    adjustVolume(delta) {
        this.volume += delta;
        if (this.volume < 0) {
            this.volume = 0;
        } else if (this.volume > 100) {
            this.volume = 100;
        }

        if (this.isMuted) {
            this.setMute(false);
        }
        this.player.setVolume(this.volume * this.volLev);
    }

    setMute(mute) {
        this.isMuted = mute;
        this.player.setMute(mute);
    }

    _onPlayerState(state) {
        this.playerState = state;
        if (state === PlayerActivity.FINISHED ||
            state === PlayerActivity.STOPPED) {
            if (this.playItem.cb) {
                this.playItem.cb();
            }
            this._playNext();
        }
    }

    _playNext() {
        if (this.nextItem) {
            this.playItem = this.nextItem;
            this.nextItem = null;
            this.player.play(this.playItem.file, 0, 'mp3');
        }
    }
}

module.exports.EVSEffectPlayer = EVSEffectPlayer;
