extern "C" {
#include "iotjs_def.h"
}

#include "iotjs_debuglog.h"
#include <sys/ioctl.h>
#include <net/if.h>
#include <unistd.h>
#include <openssl/sha.h>

#include <cstdlib>
#include <vector>
#include <string>
#include <algorithm>
#include "modules/linux/iotjs_module_iflyos_uart_linux.h"
#include "iotjs_binding_cpp_helper.h"

extern "C" {
#include "iotjs_module_buffer.h"
}

static void jsMemLeakGCCallback(void *nativePointer) {
    //never free audio instances once created, or let OS do
    assert(false);
}

static const jerry_object_native_info_t dummyNI ={
        &jsMemLeakGCCallback
};

struct uartrecv_c_context{
    std::shared_ptr<JHelper> jsObj;
    const char* buffer;
    int len;
};

static UART_HANDLE _uartHd_virtual = NULL;
static uv_async_t recvAsync;
static uartrecv_c_context recvAsyncContext;

static void receiveHandlerInReceiveThread(){
    printf("wakeupHandlerInWakeupThread() async send");
    uv_async_send(&recvAsync);
}

static void UartRecvCb(const void *msg, unsigned int msglen, void *user_data) {
    recvAsyncContext.buffer = (const char*)msg;
    recvAsyncContext.len = msglen;
    receiveHandlerInReceiveThread();
}

static void RecvAsyncCB(uv_async_t */*req*/){
    auto jBuffer = iotjs_bufferwrap_create_buffer(recvAsyncContext.len);
    auto buff_wrap = iotjs_bufferwrap_from_jbuffer(jBuffer);

    memcpy(buff_wrap->buffer, recvAsyncContext.buffer, recvAsyncContext.len);
    buff_wrap->length = recvAsyncContext.len;
    iotjs_jval_set_property_number(jBuffer, IOTJS_MAGIC_STRING_LENGTH, recvAsyncContext.len);

    auto jParamObj = JHelper::create(jBuffer);
    
    recvAsyncContext.jsObj->callMethod("_nativeRecv_Callback", {jParamObj});
}

JS_FUNCTION(Init) {
    DJS_CHECK_THIS();
    DJS_CHECK_ARGS(2, string, number);

    auto device = JString::acquire(jargv[0]);
    auto rate = jerry_get_number_value(jargv[1]);
    std::string deviceStr = *device;

    auto jsThis = JHelper::acquire(jthis);
    uv_async_init(uv_default_loop(), &recvAsync, RecvAsyncCB);
    recvAsync.data = &recvAsyncContext;
    recvAsyncContext.jsObj = jsThis;

    uart_init(&_uartHd_virtual, deviceStr.c_str(), rate, UartRecvCb, NULL, 8, 1, 'N');

    return JHelper::unmanagedUndefined();
}

JS_FUNCTION(Send) {
    DJS_CHECK_THIS();
    DJS_CHECK_ARGS(1, object);

    auto bufferWrapper = iotjs_bufferwrap_from_jbuffer(jargv[0]);
    std::string msgStr = bufferWrapper->buffer;
    int len = msgStr.length();
    printf("lional send msg = %s\n", msgStr.c_str());
    uart_send(_uartHd_virtual, msgStr.c_str(), len);
    return JHelper::unmanagedUndefined();

}

JS_FUNCTION(UnInit) {
    DJS_CHECK_THIS();
    uart_uninit(_uartHd_virtual);
    return JHelper::unmanagedUndefined();
}


extern "C" {
jerry_value_t InitiFLYOSUart(void) {
    jerry_value_t iflyosUart = jerry_create_object();

    iotjs_jval_set_method(iflyosUart, "init", Init);
    iotjs_jval_set_method(iflyosUart, "send", Send);
    iotjs_jval_set_method(iflyosUart, "uninit", UnInit);
    return iflyosUart;
}
}