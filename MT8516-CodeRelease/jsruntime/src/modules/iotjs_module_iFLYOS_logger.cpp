/* Copyright 2015-present Samsung Electronics Co., Ltd. and other contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

extern "C" {
#include "iotjs_def.h"
#include "iotjs_module_buffer.h"
}

#include "iotjs_module_iFLYOS_logger.h"

#include <iostream>
#include <unistd.h>

using namespace hola;

static HolaLogger *logger = nullptr;

jerry_value_t Log(const jerry_value_t* jargv, const jerry_length_t jargc, LogLevel level) {
    JS_CHECK_ARGS(1, string);
    iotjs_string_t msg = JS_GET_ARG(0, string);
    if (logger) {
        LogOne<HolaLogger>(*logger, level) << msg.data;
    } else {
        LogOne<std::ostream>(std::cout, level) << msg.data;
    }
    iotjs_string_destroy(&msg);
    return jerry_create_undefined();
}

JS_FUNCTION(Fatal) {
    return Log(jargv, jargc, LOG_FATAL);
}

JS_FUNCTION(Error) {
    return Log(jargv, jargc, LOG_ERROR);
}

JS_FUNCTION(Warn) {
    return Log(jargv, jargc, LOG_WARNING);
}

JS_FUNCTION(Info) {
    return Log(jargv, jargc, LOG_INFO);
}

JS_FUNCTION(Debug) {
    return Log(jargv, jargc, LOG_DEBUG);
}

JS_FUNCTION(Trace) {
    return Log(jargv, jargc, LOG_TRACE);
}

JS_FUNCTION(SetLogLevel) {
    JS_CHECK_ARGS(1, number);
    LogLevel level = (LogLevel)JS_GET_ARG(0, number);
    if (logger) {
        logger->setLogLevel(level);
    } else {
        LogOne<std::ostream>::setLogLevel(level);
    }
    return jerry_create_undefined();
}

JS_FUNCTION(EnableMilliSecond) {
    JS_CHECK_ARGS(1, boolean);
    bool enable = (LogLevel)JS_GET_ARG(0, boolean);
    if (logger) {
        logger->enableMilliSecond(enable);
    } else {
        LogOne<std::ostream>::enableMilliSecond(enable);
    }
    return jerry_create_undefined();
}

JS_FUNCTION(SetFileMaxKb) {
    JS_CHECK_ARGS(1, number);
    uint32_t size = (uint32_t)JS_GET_ARG(0, number);
    if (logger) {
        logger->setFileMaxKb(size);
    }
    return jerry_create_undefined();
}

JS_FUNCTION(SetFileMaxNum) {
    JS_CHECK_ARGS(1, number);
    uint32_t num = (uint32_t)JS_GET_ARG(0, number);
    if (logger) {
        logger->setFileMaxNum(num);
    }
    return jerry_create_undefined();
}

extern "C" {
jerry_value_t InitLogger(void) {
    jerry_value_t log = jerry_create_object();

    auto logFile = std::getenv("JS_LOG_FILE");
    printf("logger file %s", logFile ? logFile : "nullptr");
    if (logFile) {
        logger = new HolaLogger(logFile);
        if (!logger->isOpen()) {
            delete logger;
            logger = nullptr;
        }
    }

    iotjs_jval_set_method(log, "fatal", Fatal);
    iotjs_jval_set_method(log, "error", Error);
    iotjs_jval_set_method(log, "warn", Warn);
    iotjs_jval_set_method(log, "info", Info);
    iotjs_jval_set_method(log, "debug", Debug);
    iotjs_jval_set_method(log, "trace", Trace);
    iotjs_jval_set_method(log, "setLogLevel", SetLogLevel);
    iotjs_jval_set_method(log, "enableMilliSecond", EnableMilliSecond);
    iotjs_jval_set_method(log, "setFileMaxKb", SetFileMaxKb);
    iotjs_jval_set_method(log, "setFileMaxNum", SetFileMaxNum);
    return log;
}
}
