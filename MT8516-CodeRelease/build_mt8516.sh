# for MT8516
rm -rf /etc/iflyosBoards/mtk8516-edu/install/*
rm -rf /etc/iflyosBoards/mtk8516-edu/build/*

./jsruntime/build-iflyos-linux.sh -c bd25408a-345f-40ec-be79-bccda8145a98 -d fulfilment_of_mt8516_test -s 76ff7b05-6c46-4b28-b770-7a5284ab33e2 -p mtk8516-edu -m 6

