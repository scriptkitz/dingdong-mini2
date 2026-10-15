#!/bin/sh

if uname -a | grep 'x86_64'; then
  adb shell mkdir /data/iotjs
  adb push /etc/iflyosBoards/edu/install/* /data/iotjs/
  exit
fi

chmod +x /data/iotjs/run.sh
export LD_LIBRARY_PATH=/data/iotjs/lib:/data/iotjs/usr/local/lib
cd /data/iotjs/smartSpeakerApp/src
/data/iotjs/bin/iotjs main.js /data/iotjs/iFLYOS.json
