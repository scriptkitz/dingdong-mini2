var LedFactory = require('./platforms/' + iflyosPlatform + '/ledFactory').LedFactory;
var logger = require('logger').getLogger('LedManager');

class LedManager {

	constructor() {
        if (iflyosPlatform === "MTK8516-EDU" || iflyosPlatform === "R328-PUB"
            || iflyosPlatform === "MTK8516-GEEK") {
			this.ledFactory = new LedFactory(this._onLightClose.bind(this));
		}
		this.currentLight = null;
		this.lightResumeList = [];
	}

	openLight(type, volume, position) {    
        if (iflyosPlatform === "MTK8516-EDU" || iflyosPlatform === "R328-PUB"
            || iflyosPlatform === "MTK8516-GEEK") {
			var light = this.ledFactory.GetLight(type);
			if (light) {
                if (volume) {
                    light.setVolume(volume);
                } 
                logger.info('volume = ', volume);
                logger.info('position = ', position);
                if (position) {
                    light.setPosition(position);
                }
                
				this._handleOpenLight(light);
			}
		}
	}

	closeLight(type) {
        if (iflyosPlatform === "MTK8516-EDU" || iflyosPlatform === "R328-PUB"
            || iflyosPlatform === "MTK8516-GEEK") {
			var light = this.ledFactory.GetLight(type);
			if (light) {
				this._handleCloseLight(light);
			}
		}
    }

    closeAllLight() {
        this.lightResumeList = [];
        if(this.currentLight) {
            this.currentLight.close();
        }
    }
    
    _handleOpenLight(light) {
        if (this.currentLight) {
            if (this.currentLight.getType() === light.getType()) {
                this.currentLight.reStart();
                return;
            } else if (this._contains(light) >= 0) {
                // 灯光已经在需要待恢复列表中，从列表中剔除，重新开启
                var index = this._contains(light);
                this.lightResumeList.splice(index, 1);
            } else if (this.currentLight.needPause(light)) {
                // 当前灯效需要恢复时，暂停当前灯效，加入待恢复列表
                this.currentLight.pause();
                this.lightResumeList.push(this.currentLight);
            } else if (light.getPriority() > this.currentLight.getPriority()) {
                //  优先级低的灯光不处理
                return;
            } else {
                // 当前灯效不需要恢复，关闭灯效
                this.currentLight.close();
            }
        }
        this.currentLight = light;
        this.currentLight.open();
    }

    _handleCloseLight(light) {
        if (this.currentLight && light.getType() === this.currentLight.getType()) {
            this.currentLight.close();
        } else if (this._contains(light) >= 0) {
            light.close();
        }
    }

    _onLightClose(light) {
        if (this.currentLight && light.getType() === this.currentLight.getType()) {
            // 要关闭的灯光是当前的灯光
            if (this.lightResumeList.length > 0) {
                // 从待恢复列表找到最近的灯光，恢复
                this.currentLight = this.lightResumeList.pop();
                this.currentLight.resume();
            } else {
                // 无待恢复的灯光，当前灯光置空
                this.currentLight = null;
            }
        } else {
            if (this.lightResumeList.length > 0) {
                var index = this._contains(light);
                this.lightResumeList.splice(index, 1);
            }
        }
    }

    _contains(light) {
        var lightIndex = -1;
        this.lightResumeList.forEach((value, index) => {
            if (value.getType() === light.getType()) {
                lightIndex = index;
            }
        });
        return lightIndex;
    }

}

module.exports.LedManager = LedManager;