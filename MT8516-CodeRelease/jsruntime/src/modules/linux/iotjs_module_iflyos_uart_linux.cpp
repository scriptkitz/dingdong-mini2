#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <termios.h>
#include <pthread.h>
#include <sys/select.h>

#include "modules/linux/iotjs_module_iflyos_uart_linux.h"

#define FALSE 0
#define TRUE 1

#define UART_BLOCK   0//1:阻塞模式  0:非阻塞模式
#define USE_VTIME    1//1:打开VTIME功能  0:关闭VTIME功能

#define UART_BUFF_MAX_LEN  256 //串口回调的最大buff,即一帧数据最长256


typedef struct _uartData{
	uart_rec_fn uart_rec_cb;
	int fd;
	pthread_t thread_recv;
	void *thread_status;
	int running;
	void *user_data;
} uartData;

void* uart_recv(void* arg)
{
	struct timeval tv;
	fd_set readfd;
	
	uartData *uart = (uartData *)arg;
	char revbuff[UART_BUFF_MAX_LEN];
	int revlen = 0;

	#if USE_VTIME	
	char queue_revbuff[UART_BUFF_MAX_LEN];
	int queue_revlen = 0;
	int i = 0;
	#endif
	
	while(uart->running){
		memset(revbuff, 0, sizeof(revbuff));
		
#if (UART_BLOCK==1)
		printf("uart_recv,errno = %d \n", errno);
		if((revlen = read(uart->fd,revbuff,sizeof(revbuff))) == -1){
			printf("uart_recv error,errno = %d \n", errno);
			continue;
		}
		uart->uart_rec_cb(revbuff, revlen, uart->user_data);		
#else
		FD_ZERO(&readfd);
		FD_SET(uart->fd,&readfd);
#if USE_VTIME
		tv.tv_sec=0;    //SECOND
		tv.tv_usec=50*1000;	//USECOND
#else		
		tv.tv_sec=1;    //SECOND
		tv.tv_usec=0;	//USECOND
#endif		
		revlen=select(uart->fd+1,&readfd,NULL,NULL,&tv);
		if(revlen > 0){
			if((revlen = read(uart->fd,revbuff,sizeof(revbuff))) == -1){
				printf("uart_recv error,errno = %d \n", errno);
				continue;
			}
			
			#if USE_VTIME
			if((queue_revlen + revlen) > UART_BUFF_MAX_LEN){
				printf("uart_recv error,revlen too long \n");
				queue_revlen = 0;
				continue;
			}
			for(i=0;i<revlen;i++){
				queue_revbuff[queue_revlen + i] = revbuff[i];
			}
			queue_revlen += revlen;
			#else
			uart->uart_rec_cb(revbuff, revlen, uart->user_data);
			#endif
		}else if (revlen == 0){
			#if USE_VTIME
			if(queue_revlen != 0){
				uart->uart_rec_cb(queue_revbuff, queue_revlen, uart->user_data);
				queue_revlen = 0;
			}
			#endif
		}else{
			printf("uart_recv select error,errno = %d \n",errno);
		}
#endif		
	}
	return NULL;
}
/*******************************************************************
 * 名称：            UART_Set
 * 功能：            设置串口数据位，停止位和效验位
 * 入口参数：        fd         串口文件描述符
 *                   speed      串口速度
 *                   flow_ctrl  数据流控制
 *                   databits   数据位   取值为 7 或者8
 *                   stopbits   停止位   取值为 1 或者2
 *                   parity     效验类型 取值为N,E,O,,S
 *出口参数：         正确返回为1，错误返回为0
 *******************************************************************/
int uart_set(int fd, int speed,int flow_ctrl,int databits,int stopbits,int parity)
{
	unsigned int i = 0;
	int status;
	int speed_arr[] = {B115200, B38400, B19200, B9600, B4800, B2400, B1200, B300};
	int name_arr[] = {115200, 38400,  19200,  9600,  4800,  2400,  1200,  300};

	struct termios options;

	/*
	   tcgetattr(fd,&options)得到与fd指向对象的相关参数，并将它们保存于options。
	   该函数,还可以测试配置是否正确，该串口是否可用等。
	   若调用成功，函数返回值为0，若调用失败，函数返回值为1.
	 */

	//获取设备属性信息
	if( tcgetattr( fd, &options ) != 0)
	{
		printf("tcgetattr error\n");
		return -1;
	}

	//设置串口输入波特率和输出波特率 /i o 入和出
	for ( i= 0;  i < sizeof(speed_arr) / sizeof(int);  i++)
	{
		if  (speed == name_arr[i])
		{
			cfsetispeed(&options, speed_arr[i]);
			cfsetospeed(&options, speed_arr[i]);
		}
	}

	//修改控制模式，保证程序不会占用串口
	options.c_cflag |= CLOCAL;
	//修改控制模式，使得能够从串口中读取输入数据
	options.c_cflag |= CREAD;

	//设置数据流控制
	switch(flow_ctrl)
	{

		case 0 ://不使用流控制
			options.c_cflag &= ~CRTSCTS;
			break;

		case 1 ://使用硬件流控制
			options.c_cflag |= CRTSCTS;
			break;
		case 2 ://使用软件流控制
			options.c_cflag |= IXON | IXOFF | IXANY;
			break;
	}
	//设置数据位
	options.c_cflag &= ~CSIZE; //屏蔽其他标志位
	switch (databits)
	{
		case 5 :
			options.c_cflag |= CS5;
			break;
		case 6 :
			options.c_cflag |= CS6;
			break;
		case 7 :
			options.c_cflag |= CS7;
			break;
		case 8 :
			options.c_cflag |= CS8;
			break;
		default :
			printf("Unsupported data size \n");
			return -1;
	}
	//设置校验位
	switch (parity)
	{
		case 'n':
		case 'N': //无奇偶校验位。
			options.c_cflag &= ~PARENB;
			options.c_iflag &= ~INPCK;
			break;
		case 'o':
		case 'O'://设置为奇校验
			options.c_cflag |= (PARODD | PARENB);
			options.c_iflag |= INPCK;
			break;
		case 'e':
		case 'E'://设置为偶校验
			options.c_cflag |= PARENB;
			options.c_cflag &= ~PARODD;
			options.c_iflag |= INPCK;
			break;
		case 's':
		case 'S': //设置为空格
			options.c_cflag &= ~PARENB;
			options.c_cflag &= ~CSTOPB;
			break;
		default:
			printf("Unsupported parity \n");
			return -1;
	}
	// 设置停止位
	switch (stopbits)
	{
		case 1:
			options.c_cflag &= ~CSTOPB;
			break;
		case 2:
			options.c_cflag |= CSTOPB;
			break;
		default:
			printf("Unsupported stop bits \n");
			return -1;
	}

	//修改输出模式，原始数据输出
	options.c_oflag &= ~OPOST;

	options.c_lflag |= ~(ICANON|ECHOE|ECHO|ISIG);
	//(ICANON | ECHO | ECHOE);


	//设置等待时间和最小接收字符
	options.c_cc[VTIME] = 1; /* 读取一个字符等待1*(1/10)s */
	options.c_cc[VMIN] = 1; /* 读取字符的最少个数为1 */

	//如果发生数据溢出，接收数据，但是不再读取
	tcflush(fd,TCIFLUSH);

	//激活配置 (将修改后的termios数据设置到串口中）
	if (tcsetattr(fd,TCSANOW,&options) != 0)
	{
		printf("tcsetattr error \n");
		return -1;
	}
	return 0;
}
//uart初始化
int uart_init(UART_HANDLE *uart_hd, const char *device,int rate, uart_rec_fn uart_rec_cb, void *user_data,int databits,int stopbits,int parity)
{
	int ret = 0;
	void * unused;
	int flags;
	printf("uart_init in \n");
	//句柄检查
	if (NULL == device || NULL == uart_rec_cb || NULL == uart_hd){
		printf("NULL == device || NULL == uart_read_cb \n");
		return -1;
	}
	//申请结构体
	uartData *uart = (uartData*)malloc(sizeof(uartData));
	if (NULL == uart){
		ret = -1;
		goto error;
	}
	memset(uart, 0, sizeof(uartData));
	uart->uart_rec_cb = uart_rec_cb;
	uart->user_data = user_data;
	//打开设备
	uart->fd = open(device, O_RDWR | O_NOCTTY | O_NDELAY);
	if(uart->fd < 0){
		printf("open failed: %s \n", device);
		ret = -1;
		goto error;
	}

	
    flags = fcntl(uart->fd, F_GETFL, 0);
    if(flags < 0)
	{
        printf("fcntl get failed \n");
        goto error;
    }
#if (UART_BLOCK==1)
	//使用阻塞io	
    flags &= ~O_NONBLOCK;
#else	
    //使用非阻塞io	
    flags |= O_NONBLOCK;
#endif
	if(fcntl(uart->fd, F_SETFL, flags) < 0)
    {
        printf("fcntl set failed \n");
        goto error;
    }

//	struct termios options;
//	tcgetattr(uart->fd, &options);
//	/**2. 修改所获得的参数*/
//	options.c_cflag |= (CLOCAL | CREAD); //设置控制模式状态，本地连接，接收使能
//	options.c_cflag &= ~CSIZE; //字符长度，设置数据位之前一定要屏掉这个位
//	options.c_cflag &= ~CRTSCTS; //无硬件流控
//	options.c_cflag |= CS8; //8位数据长度
//	options.c_cflag &= ~CSTOPB; //1位停止位
//	options.c_iflag |= IGNPAR; //无奇偶检验位
//	options.c_oflag = 0; //输出模式
//	options.c_lflag = 0; //不激活终端模式
//	cfsetospeed(&options, B9600); //设置波特率
//	/**3. 设置新属性，TCSANOW：所有改变立即生效*/
//	tcflush(uart->fd, TCIFLUSH); //溢出数据可以接收，但不读
//	tcsetattr(uart->fd, TCSANOW, &options);

	uart_set(uart->fd, 9600, 0, 8, 1, 'n');


	uart->running = 1;
	
	//创建线程，接收数据
	ret = pthread_create(&(uart->thread_recv),NULL,uart_recv, uart);
	if(0 != ret){
		printf("uart recv thread create failed \n");
		goto error;
	}
	*uart_hd = uart;

	goto exit;
error:
	if (NULL != uart){
		uart->running = 0;
		if (uart->fd > 0){
			close(uart->fd);
		}
		if (NULL != uart->thread_recv){
			pthread_join(uart->thread_recv, &unused);
		}
		free(uart);
	}

exit:
	printf("uart_init out,ret = %d \n", ret);
	return ret;
}

int uart_send(UART_HANDLE uart_hd, const char *msg, int msglen)
{
	int sended_len = 0;
	uartData *uart = (uartData *)uart_hd;
	if (NULL == uart_hd){
		return -1;
	}

#if 0	
	//入参转换为字符串消息
	va_list args;	
	va_start(args, fmt);
	vsprintf(msg,fmt,args);	
	va_end(args);	
	
	msglen = strlen(msg);
#endif

	printf("\nsai ---> uart_send:");
	for (int i=0; i<msglen; i++) {
		printf("%02x ", msg[i]);
	}
	printf("\n");

	//反复发送，直到全部发完
	while(sended_len != msglen){
		int retlen = 0;
		retlen = write(uart->fd, msg + sended_len, msglen - sended_len);
		if (retlen < 0){
			printf("uart_send failed, errno = %d, uart->fd = %d\n", errno, uart->fd);
			return -1;
		}
		sended_len += retlen;
	}
	return 0;
}

void uart_uninit(UART_HANDLE uart_hd)
{
	void * unused;
	printf("uart_uninit in \n");
	if (NULL != uart_hd){
		uartData *uart = (uartData *)uart_hd;
		//关闭运行状态
		uart->running = 0;
		if (uart->fd > 0){
			//关闭设备
			close(uart->fd);
		}
		//关闭接收线程
		printf("before join\n");
		if (NULL != uart->thread_recv){
			//pthread_cancel(uart->thread_recv);
			pthread_join(uart->thread_recv, &unused);
		}
		printf("after join\n");
		//释放结构体
		free(uart);
	}
	printf("uart_uninit out \n");
}

