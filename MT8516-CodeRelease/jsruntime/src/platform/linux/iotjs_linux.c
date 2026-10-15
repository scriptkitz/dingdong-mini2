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

#include "iotjs.h"
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <pthread.h>

static void *keepPlayerAlive(void *arg) {
	while (1)
	{	
		sleep(5);
		int result = system("ps | grep iflyos-player | grep -v \"grep\"");
		printf("lional palyer alive result = %d\n", result);
		if(result != 0) {
			system("iflyos-player &");
		}
	}
	return 0;
}

int main(int argc, char** argv) {
	pthread_t playerAliveThread;
	pthread_create(&playerAliveThread, NULL,keepPlayerAlive, NULL);
	pthread_detach(playerAliveThread);
	return iotjs_entry(argc, argv);
}
