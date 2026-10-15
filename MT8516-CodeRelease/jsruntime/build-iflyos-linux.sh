#!/bin/bash
#把jsruntime mediaplayer 和 iflyosapp　三个工程都放到一个目录下．然后在这个目录下执行jsruntime/build-iflyos-linux.sh

#for i in `ls *.mp3`; do ffmpeg -i $i -ac 1 -f s16le -ar 16000 -acodec pcm_s16le `echo $i | cut -d'.' -f1`.raw; done

set -e

POSITIONAL=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    -c|--client)
    CLIENT_ID="$2"
    shift # past argument
    shift # past value
    ;;
    -s|--secret)
    CLIENT_SECRET="$2"
    shift # past argument
    shift # past value
    ;;
    -d|--device)
    DEVICE_ID="$2"
    shift # past argument
    shift # past value
    ;;
    -p|--platform)
    PLATFORM="$2"
    shift # past argument
    shift # past value
    ;;
    -r|--product)
    PRODUCT="$2"
    shift
    shift
    ;;
    -m|--microphone)
    MIC="$2"
    shift
    shift
    ;;
#    --default)
#    DEFAULT=YES
#    shift # past argument
#    ;;
    *)    # unknown option
    POSITIONAL+=("$1") # save it in an array for later
    shift # past argument
    ;;
esac
done

set -- "${POSITIONAL[@]}" # restore positional parameters

set -e

if [ -z "$PLATFORM" ]
then
  echo "no platform arg"
  exit 1
fi

if [ -z "$PRODUCT" ]
then
  echo "no product arg"
  #exit 1
fi

echo "use platform $PLATFORM"

if [ -z "$CLIENT_ID" ]
then
  echo "no client id set"
  exit 1
fi

echo "use client id $CLIENT_ID"

if [ -z "CLIENT_SECRET" ]
then
  echo "no client secret set"
  exit 1
fi

echo "use client secret $CLIENT_SECRET"

if [ -z "$DEVICE_ID" ]
then
  echo "device id not set, will use MAC address"
else
  echo "use device id $DEVICE_ID"
fi

if [ -z "$MIC" ]
then
  echo "no mic number set(-m)"
else
  echo "use microphone number $MIC"
fi

if [ ! -d jsruntime ]
then
  echo "no jsruntime folder"
  exit 1
fi

if [ ! -d smartSpeakerApp ]
then
  echo "no smartSpeakerApp folder"
  exit 1
fi

srcdir=$PWD
toolchain="$srcdir/jsruntime/iflyosBoards/$PLATFORM/toolchain.txt"
buildtype=Release
arch=arm

if [ $PLATFORM == "linuxHost" ]
then
buildtype=Debug
arch=x86_64
fi


if [[ $PLATFORM == "mtk8516"  ||  $PLATFORM == "mtk8516-edu" || $PLATFORM == "mtk8516-geek" ]]
then
export PATH=/etc/iflyosBoards/mtk8516/sysroots/x86_64-oesdk-linux/usr/bin:/etc/iflyosBoards/mtk8516/sysroots/x86_64-oesdk-linux/usr/sbin:/etc/iflyosBoards/mtk8516/sysroots/x86_64-oesdk-linux/bin:/etc/iflyosBoards/mtk8516/compiler/sysroots/x86_64-oesdk-linux/sbin:/etc/iflyosBoards/mtk8516/compiler/sysroots/x86_64-oesdk-linux/usr/bin/../x86_64-oesdk-linux/bin:/etc/iflyosBoards/mtk8516/compiler/sysroots/x86_64-oesdk-linux/usr/bin/aarch64-poky-linux:/etc/iflyosBoards/mtk8516/compiler/sysroots/x86_64-oesdk-linux/usr/bin/aarch64-poky-linux-musl:$PATH
arch=aarch64
fi

if [ ! -f $toolchain ]
then
  echo "no $toolchain"
  exit 1
fi

outdir=/etc/iflyosBoards/$PLATFORM/build
installdir=/etc/iflyosBoards/$PLATFORM/install
mkdir -p $outdir/jsruntime
mkdir -p $outdir/mediaplayer
mkdir -p $installdir/smartSpeakerApp

echo "building jsruntime to $outdir/jsruntime"
cd $outdir/jsruntime
echo "-DMIC${MIC}=ON" -DIFLYOS_PRODUCT=${PRODUCT}

cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$toolchain -DTARGET_ARCH=$arch \
"-DMIC_${MIC}=ON" \
-DIFLYOS_PRODUCT=${PRODUCT} \
-DTARGET_BOARD=None \
-DENABLE_LTO=OFF \
-DENABLE_MODULE_NAPI=OFF \
-DENABLE_SNAPSHOT=OFF \
-DEXPOSE_GC=OFF \
-DBUILD_LIB_ONLY=OFF \
-DCREATE_SHARED_LIB=ON \
-DFEATURE_MEM_STATS=OFF \
-DEXTERNAL_MODULES='' \
-DFEATURE_PROFILE=es2015-all \
-DMEM_HEAP_SIZE_KB=4096 \
-DEXTRA_JERRY_CMAKE_PARAMS='-DFEATURE_CPOINTER_32_BIT=ON' \
-DFEATURE_JS_BACKTRACE=ON \
-DEXTERNAL_LIBS='' \
-DEXTERNAL_COMPILE_FLAGS='' \
-DEXTERNAL_LINKER_FLAGS='' \
-DEXTERNAL_INCLUDE_DIR='' $srcdir/jsruntime

make -j4
make DESTDIR=$installdir install

if [[ ! $PLATFORM == "mtk8516" && ! $PLATFORM == "mtk8516-edu" && ! $PLATFORM == "r328" && ! $PLATFORM == "r328-pub" && ! $PLATFORM == "mtk8516-geek" ]] 
then
echo "building mediaplayer to $outdir/mediaplayer"
cd $outdir/mediaplayer
cmake -DCMAKE_BUILD_TYPE=$buildtype -DCMAKE_TOOLCHAIN_FILE=$toolchain $srcdir/mediaplayer
make -j4
make DESTDIR=$installdir install
fi

find $installdir -type d -name "include" | xargs rm -rf
rm -rf $installdir/usr/local/lib/pkgconfig

echo "=========successfuly built at $installdir============="
find $installdir -type f -name "*.so"
find $installdir -wholename '*/bin/*'

cp $srcdir/jsruntime/iflyosBoards/$PLATFORM/run.sh $installdir/
cp $srcdir/jsruntime/iflyosBoards/$PLATFORM/iFLYOS.json $installdir/
cp -rf $srcdir/smartSpeakerApp/src/*.js $installdir/smartSpeakerApp/
cp -rf $srcdir/smartSpeakerApp/sound_effect $installdir/sound_effect
mkdir -p $installdir/smartSpeakerApp/platforms
cp -rf $srcdir/smartSpeakerApp/src/platforms/`ls $srcdir/smartSpeakerApp/src/platforms | grep -i -m 1 ${PLATFORM}` $installdir/smartSpeakerApp/platforms
sed -i "s/__CLIENT__ID__/$CLIENT_ID/g" $installdir/iFLYOS.json
sed -i "s/__DEVICE__ID__/$DEVICE_ID/g" $installdir/iFLYOS.json
sed -i "s/__CLIENT__SECRET__/$CLIENT_SECRET/g" $installdir/iFLYOS.json
