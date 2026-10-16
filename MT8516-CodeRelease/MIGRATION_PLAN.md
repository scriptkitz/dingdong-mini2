# MT8516 iFLYOS 项目工具链迁移方案

> **文档用途**:本文件是完整的技术交接文档,供**另一个 AI 或开发者**独立执行本迁移任务。
> 所有结论均来自对仓库源码和rootfs 文件的实际核查(非推测),核查点与命令随文附上。
>
> 编写日期: 2026-10-16
> 目标平台: MT8516 (AArch64),glibc 2.24
> 项目路径(Windows): `J:\dingdongROM\iFLYOS\src\MT8516-CodeRelease`

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [关键事实核查(必读)](#2-关键事实核查必读)
3. [总体方案](#3-总体方案)
4. [任务 A:改CMake 工具链骨架](#4-任务-a改cmake-工具链骨架)
5. [任务 B:搭建 3rdparty_libs 并修改 Find 模块](#5-任务-b搭建-3rdparty_libs-并修改-find-模块)
6. [任务 C:移除 portaudio,改用 ALSA 直调](#6-任务-c移除-portaudio改用-alsa-直调)
7. [任务 D:编译 mbedTLS 2.x 动态库](#7-任务-d编译-mbedtls-2x-动态库)
8. [任务 E:完整构建与部署验证](#8-任务-e完整构建与部署验证)
9. [风险清单与已知坑](#9-风险清单与已知坑)
10. [附录:完整依赖清单](#10-附录完整依赖清单)

---

## 1. 背景与目标

### 1.1 现状

项目原始构建依赖 **科睿(Corellium) Yocto/OE SDK**:

| 项 | 值 |
|---|---|
| SDK 路径 | `/etc/iflyosBoards/mtk8516/` |
| 编译器 | `aarch64-poky-linux-gcc` |
| sysroot | `/etc/iflyosBoards/mtk8516/sysroots/aarch64-poky-linux` |
| sysroot glibc | 2.26 |
| 开发主机 | Linux |

### 1.2 目标

改为使用 **Bootlin Bootlin预编译工具链**,并且:

- **目标设备是 glibc 2.24**(不是原始开发环境 2.26)
- **完全不使用** Yocto SDK 的 sysroot(该sysroot 只属于 2.26 环境,与目标设备不匹配)
- 第三方库(`.so` + `.h`)从**目标设备 rootfs** 中提取,统一放在项目内`3rdparty_libs/` 目录
- 不使用的库直接去掉(见任务 C)

### 1.3 工具链选型(已验证,勿更改)

**选定:`aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2`**

官方 readme 实测内容(来源:`https://toolchains.bootlin.com/downloads/releases/toolchains/aarch64/readmes/aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2.txt`):

| 组件 | 版本 |
|---|---|
| **glibc** | **2.24** ← 与目标设备精确匹配 |
| gcc-final | 6.3.0 |
| gcc-initial | 6.3.0 |
| binutils | 2.28 |
| gdb | 7.12.1 |
| linux-headers | 4.9.30 |

**为什么必须用这个版本**:glibc 采用符号版本机制(`GLIBC_2.24`)。若工具链 glibc 版本高于目标设备的 2.24,编译产物会引用设备不存在的符号,**编译链接期完全无感,仅在设备上运行时才报错**:
```
symbol version `GLIBC_2.27' not found (required by ./libiotjs.so)
```

已核对Bootlin 其他版本(glibc 版本来自各自 readme):

| Bootlin 版本 | glibc | 能否用于 2.24 设备 |
|---|---|---|
| **bleeding-edge-2017.05-toolchains-1-2** | **2.24** | ✅ **精确匹配** |
| bleeding-edge-2018.02-1 | ~2.27 | ❌ 超出 |
| stable-2018.02-1 | ~2.27 | ❌ 超出 |
| bleeding-edge-2020.02-1 | 2.31 | ❌ |
| bleeding-edge-2021.11-1 | 2.34 | ❌ |
| bleeding-edge-2022.08-1 | 2.35 | ❌ |
| bleeding-edge-2025.08-1 | 2.41 | ❌ |
| bleeding-edge-2026.08-1 | 2.44 | ❌ |

> ⚠️ **重要警告**:Bootlin 目录里名字最新 ≠ glibc 最新。**`bleeding-edge` 系列包含从 2017 到 2026 的所有版本**,必须看 readme 确认实际 glibc 版本,不能按目录名猜。

**GCC 6.3.0 的附带优势**:原 Yocto sysroot 也是 GCC 6.3,`libstdc++` ABI 天然一致(设备 `GLIBCXX_3.4.22`,GCC 6.3 产出正好匹配)。

---

## 2. 关键事实核查(必读)

**执行本方案前,以下事实已全部核查完毕,不需要重新调查。**

### 2.1 项目不使用 Yocto 构建系统

`build_mt8516.sh` → `jsruntime/build-iflyos-linux.sh` → **CMake + Make**。仓库中**没有** bitbake、layer 或 `.bb` 文件。Yocto 仅提供编译器二进制和 sysroot。

### 2.2 目标设备 rootfs 现状

设备 rootfs 路径(Windows):`J:\dingdongROM\ubifs-root\ROOTFS1.bin\ubifs-root`

```
lib64/libc-2.24.so                       glibc 2.24
usr/lib64/libstdc++.so.6.0.22             GLIBCXX_3.4.22
```

### 2.3 设备 rootfs 已有的第三方库(实测)

| 库 | 文件 | 说明 |
|---|---|---|
| libcurl | `usr/lib64/libcurl.so.4` → `.4.5.0` | curl 7.61.0,**GnuTLS 后端** |
| libcrypto | `usr/lib64/libcrypto.so.1.1` | OpenSSL 1.1.0i |
| libssl | `usr/lib64/libssl.so.1.1` | OpenSSL 1.1.0i |
| libsqlite3 | `usr/lib64/libsqlite3.so.0` → `.0.8.6` | SQLite 3.26 |
| libasound | `usr/lib64/libasound.so.2` | alsa-lib |
| libz | `usr/lib64/libz.so.1` | zlib |
| libgnutls | `usr/lib64/libgnutls.so.30` | curl 的 TLS 后端 |
| libnettle | `usr/lib64/libnettle.so.6` | gnutls 依赖 |
| libhogweed | `usr/lib64/libhogweed.so.4` | gnutls 依赖 |
| libgmp | `usr/lib64/libgmp.so.10` | gnutls 依赖 |
| libidn | `usr/lib64/libidn.so.11` | curl 依赖 |
| libnghttp2 | `usr/lib64/libnghttp2.so.14` | curl 依赖 |

### 2.4 设备 rootfs **缺失**的库

| 库 | 处理方式 |
|---|---|
| **mbedtls / mbedx509 / mbedcrypto** | 自行编译(任务 D) |
| **libportaudio** | **不使用**,改ALSA 直调(任务 C) |
| libhlw | **不使用**,已关闭 CAE 宏(已完成) |
| libopus | **不使用**,死代码(见 2.7) |

### 2.5 ⚠️ 关键发现:设备 libcurl 是 GnuTLS 后端,不是 OpenSSL

实测`libcurl.so.4.5.0` 的真实依赖:
```
libc.so.6   libcurl.so.4   libgmp.so.10   libgnutls.so.30
libhogweed.so.4   libidn.so.11   libnettle.so.6
libnghttp2.so.14  libpthread.so.0   libz.so.1
```

**不含 `libssl.so.1.1`**。全盘反查确认,设备上 `libssl.so.1.1` 唯一消费方是 `libavformat.so.57.71.100`(ffmpeg),与 curl 无关。

**影响**:
- curl 的头文件 `curl/curl.h` 自包含,无需额外 TLS 头
- `cmake/iotjs.cmake:554` 硬编码的 `-lcrypto` 对 curl而言是多余的(那是原 openssl 后端 curl 所需),但设备上 `libcrypto.so.1.1` 存在,保留无害

### 2.6 项目源码层结构(编译必需信息)

**modules.json** (`jsruntime/src/modules.json`,482 行)定义全部 native 模块。第 272 行是唯一的 `external_libs` 声明:
```json
"external_libs": ["dl"]
```

**最终链接库** (`cmake/iotjs.cmake:547-557`):
```cmake
target_link_libraries(${TARGET_LIB_IOTJS}
  ${CMAKE_DL_LIBS}${JERRY_LIBS}${TUV_LIBS}
  libhttp-parser${MBEDTLS_LIBS}${EXTERNAL_LIBS}
  "-lstdc++ -lasound -lcrypto"
    ${CURL_LIBRARY}${SQLITE3_LIBRARY})
```

条件开关:
```cmake
if(R328SOURCE)  # 从未 set() → OFF
  target_link_libraries(... "-lr328record -lchannel")
if(SNOWBOY)     # 从未 set() → OFF
  target_link_libraries(... "snowboyc00abi -latlas -lcblas -lsox")
if(CAE)         # ← 已改为 OFF
  add_definitions("-DCAE")
  target_link_libraries(... "-lhlw")
if(WPA_CLIENT)  # 从未 set() → OFF
  target_link_libraries(... "-lwpa_client")
```

### 2.7 已排除的库(死代码,不要浪费时间)

以下库**在rootfs 中存在或CMake 中有定义,但源码零调用**,链接它们是浪费:

| 库 | 排除依据 |
|---|---|
| **libopus** | `iflyosBoards/mtk8516-edu/Findopus.cmake` 全文仅 2 行,定义的 `OPUS_LDFLAGS` **在 `cmake/` 和 `src/` 中零引用**;源码无任何 `opus_*` 调用 |
| gstreamer / glib | `Findgstreamer-1.0.cmake` 存在,但 `GST_LDFLAGS` 零引用;设备 rootfs 无 gstreamer 文件 |
| NE10 | `Findopus.cmake:2` 末尾注释掉的 `# -lNE10` |
| wpa_client / snowboy 系列 / r328record | 条件开关从未 `set()` |

### 2.8 仓库内自建静态库(5 个,无需外部依赖)

| CMake target | 产物 | 来源 |
|---|---|---|
| `jerry-core` | `libjerry-core.a` | `deps/jerry/jerry-core` |
| `jerry-ext` | `libjerry-ext.a` | `deps/jerry/jerry-ext` |
| `jerry-port-default` | `libjerry-port-default.a` | `deps/jerry/jerry-port/default` |
| `tuv` | `libtuv.a` | `deps/libtuv` |
| `libhttp-parser` | `libhttpparser.a` | `deps/http-parser` |

> `jerry-libm` **不会生成**:`cmake/jerry.cmake:75-93` 对 LINUX 平台传 `-DJERRY_LIBM=OFF`,改用系统 `libm.so.6`。
>
> 注意 CMake target 名与产物名不一致:`libhttp-parser` → `libhttpparser.a`(无连字符),因走 `IMPORTED` target 而非 `-l` 参数所以能通过。

### 2.9 已完成的修改

**文件**:`jsruntime/iflyosBoards/mtk8516-edu/toolchain.txt`(第15-18 行)

原:
```cmake
set(CAE ON)
```
改为:
```cmake
# CAE: 厂商私有唤醒引擎,需链 libhlw.so(闭源,仅 Yocto SDK 内有)
# 关闭后: 不定义 -DCAE、不链 -lhlw、不编译 IFlytekCAE 类
# 影响: 失去离线唤醒词功能; 业务层 audio.js 仍会调 iflyos.CAE(运行期会失败)
set(CAE OFF)
```

**效果**(`cmake/iotjs.cmake:572-575` 一个 `if` 控制两件事):不定义 `-DCAE`、不链 `-lhlw`。

自动摘除的代码:

| 文件 | 行号 | 内容 |
|---|---|---|
| `src/modules/iotjs_module_iFLYOS_audio.h` | 95-117 | `class IFlytekCAE` |
| `src/modules/iotjs_module_iFLYOS_audio.cpp` | 318-459 | 全部实现(含 `CAENew`/`CAEAudioWrite`/`CAEAuth` 调用) |
| `src/modules/iotjs_module_iFLYOS.cpp` | 652+ | 6 个 `JS_FUNCTION` + `iotjs_jval_set_method` 注册 |

**已知副作用(用户已确认接受)**:JS 层**没有**对应的宏保护。`src/js/iFLYOS.js:240-241` 无条件导出:
```js
exports.iFlytekCAE = iFlytekCAE;
exports.CAE = iFlytekCAE;
```
而 `native.iFlytekCAE_new` 已被 `#ifdef CAE` 移除 → **业务层调用 `iflyos.CAE` 时会抛 TypeError**。
受影响文件:`smartSpeakerApp/src/audio.js:37, 64, 94`(MTK8516 分支)。
编译不受影响,仅运行期。

---

## 3. 总体方案

```
┌──────────────────────────────────────────────────────────────┐
│ Bootlin aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2│
│   glibc 2.24 / GCC 6.3.0 / 自带 sysroot(匹配设备)             │
└──────────────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│ sysroot: Bootlin 自带 (不动)                                  │
│   └── 系统头文件 + glibc/libstdc++                             │
└──────────────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│ 3rdparty_libs/  (项目内,不污染 sysroot)                       │
│   include/  ← curl, sqlite3, openssl, mbedtls, alsa 的 .h     │
│   lib/← 从设备 rootfs 提取的 .so + 自编的 mbedtls .so        │
└──────────────────────────────────────────────────────────────┘
```

**核心原则**:
1. **sysroot 保持纯净** —— 系统层用 Bootlin 自带,第三方层独立管理
2. **第三方库可替换** —— 版本不匹配时只改 `3rdparty_libs/`,不动工具链
3. **已移除的库不再回来** —— portaudio / hlw / opus 全部剔除

---

## 4. 任务 A:改 CMake 工具链骨架

**目标文件**:`jsruntime/iflyosBoards/mtk8516-edu/toolchain.txt`

### 4.1 完整改后内容

```cmake
# ============================================================================
#  MT8516-EDU 工具链配置 —— Bootlin glibc 2.24
#  (glibc 2.24 精确匹配目标设备; 原 Yocto sysroot 为 2.26, 已弃用)
# ============================================================================

set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)

# ---------------------------------------------------------------------------
# 工具链路径 —— 通过环境变量传入,不硬编码
#   export BOOTLIN_TC=/opt/aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2
# ---------------------------------------------------------------------------
if(DEFINED ENV{BOOTLIN_TC})
  set(TC_PATH $ENV{BOOTLIN_TC})
else()
  set(TC_PATH /opt/aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2)
endif()

set(CMAKE_C_COMPILER   ${TC_PATH}/bin/aarch64-buildroot-linux-gnu-gcc)
set(CMAKE_CXX_COMPILER ${TC_PATH}/bin/aarch64-buildroot-linux-gnu-g++)

# ★ 不设置 CMAKE_SYSROOT
#   Bootlin 工具链自带匹配 glibc 2.24 的 sysroot,其内部路径已在工具链内固化。
#   显式设置会覆盖它并导致链接失败。

# ---------------------------------------------------------------------------
# 3rdparty_libs —— 第三方库统一目录(不含 sysroot)
#   本文件位于 jsruntime/iflyosBoards/mtk8516-edu/,故上溯三级到 jsruntime/
# ---------------------------------------------------------------------------
get_filename_component(JSRT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
set(THIRD_PARTY "${JSRT_ROOT}/3rdparty_libs")

# 在交叉编译的 ONLY 模式下追加搜索根
list(APPEND CMAKE_FIND_ROOT_PATH "${THIRD_PARTY}")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)

# CAE:厂商私有唤醒引擎,需链 libhlw.so(闭源,仅 Yocto SDK 内有)
# 关闭后: 不定义 -DCAE、不链 -lhlw、不编译 IFlytekCAE 类
# 影响: 失去离线唤醒词功能; 业务层 audio.js 仍会调 iflyos.CAE(运行期会失败)
set(CAE OFF)
add_definitions("-DIFLYOS_PLATFORM=\"MTK8516-EDU\"")

option(MIC_TWO "two mic" OFF)
option(MIC_FOUR "four mic" OFF)
option(MIC_SIX "six mic" ON)

if(MIC_TWO)
  message("2 mic")
  add_definitions("-DCAPTURE_CHANNEL_NUM=4")
elseif(MIC_FOUR)
  message("4 mic")
  add_definitions("-DCAPTURE_CHANNEL_NUM=6")
elseif(MIC_SIX)
  message("6 mic")
  add_definitions("-DCAPTURE_CHANNEL_NUM=8")
endif()

# ⚠️ 原来第 33 行有 bug: set(CMAKE_C_FLAGS"...") 引号前少空格,
#    导致变量名解析成畸形名字,C 的 flags 从未生效。已修正。
set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS} -O3 -pipe -mcpu=cortex-a72+crypto -mtune=cortex-a72")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -pipe -mcpu=cortex-a72+crypto -mtune=cortex-a72")

set(CMAKE_EXE_LINKER_FLAGS   "${CMAKE_EXE_LINKER_FLAGS} -Wl,-O3 -Wl,--hash-style=gnu -Wl,--as-needed")
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -Wl,-O3 -Wl,--hash-style=gnu -Wl,--as-needed")

message("THIRD_PARTY ${THIRD_PARTY}")
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_LIST_DIR})
set(IOTJS_PROFILE "${CMAKE_CURRENT_LIST_DIR}/mtk8516.profile")
```

### 4.2 相对原文件的改动清单

| 改动 | 原值 | 新值 | 原因 |
|---|---|---|---|
| 编译器路径 | `/etc/iflyosBoards/mtk8516/.../aarch64-poky-linux-gcc` | `${TC_PATH}/bin/aarch64-buildroot-linux-gnu-gcc` | Bootlin 工具链 |
| `CMAKE_SYSROOT` | `/etc/iflyosBoards/...` | **删除** | 用 Bootlin 自带 |
| `THIRD_PARTY` | — | 新增 | 第三方库根路径 |
| `CMAKE_FIND_ROOT_PATH` | — | 追加 THIRD_PARTY | ONLY 模式下搜索 |
| `CAЕ` | `ON` | `OFF` | 移除 libhlw 依赖 |
| `-feliminate-unused-debug-types` | 有 | **删除** | GCC 私有 flag,clang/GCC 6 会报错 |
| `-mcpu=cortex-a72.cortex-a53+crypto` | 有 | `-mcpu=cortex-a72+crypto` | GCC 大小核`.` 语法 → 标准 `+` |
| `-s` (strip) | 有 | **删除** | `CMAKE_BUILD_TYPE` 已管理 |
| `-Wl,--unresolved-symbols=ignore-in-shared-libs` | 有 | **删除** | 会掩盖真实链接错误 |
| `CMAKE_C_FLAGS` 缺空格 bug | 有 | 已修正 | 原代码 C flags 从未生效 |
| `--host=linuxHost` 分支 | 保留 | 保留 | 开发调试用 |

> **为什么删 `-mcpu=...a53...`**:GCC 用`.` 分隔 big.LITTLE 大小核,clang/标准语法用 `+`。但 `-mcpu` 一旦指定就是单一架构,MT8516 是 A72×4 + A53×4 大小核,具体调度由内核负责,只需保证 crypto 扩展(OpenSSL 用得到)。如果需要更保守,可改为 `-mcpu=generic+crypto`。

### 4.3 `build-iflyos-linux.sh` 也要改

**文件**:`jsruntime/build-iflyos-linux.sh`

原第 129 行(向 PATH 注入 Yocto SDK)必须删除:
```bash
if [[ $PLATFORM == "mtk8516" || $PLATFORM == "mtk8516-edu" || ... ]]
then
  export PATH=/etc/iflyosBoards/mtk8516/sysroots/...:$PATH   # ← 删除整段
  arch=aarch64
fi
```

替换为:
```bash
if [[ $PLATFORM == "mtk8516" || $PLATFORM == "mtk8516-edu" || $PLATFORM == "mtk8516-geek" ]]
then
  if [ -z "$BOOTLIN_TC" ]; then
    echo "BOOTLIN_TC not set, e.g. export BOOTLIN_TC=/opt/aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2"
    exit 1
  fi
  export PATH="$BOOTLIN_TC/bin:$PATH"
  arch=aarch64
fi
```

另外第 139-140 行:
```bash
outdir=/etc/iflyosBoards/$PLATFORM/build            # ← 改为可配置
installdir=/etc/iflyosBoards/$PLATFORM/install      # ← 该路径需写权限
```
建议改为:
```bash
OUT_ROOT="${OUT_ROOT:-/etc/iflyosBoards}"
outdir=$OUT_ROOT/$PLATFORM/build
installdir=$OUT_ROOT/$PLATFORM/install
```

---

## 5. 任务 B:搭建 3rdparty_libs 并修改 Find 模块

### 5.1 目录结构

在 `jsruntime/` 下创建:

```
3rdparty_libs/
├── include/          # 第三方头文件
│   ├── curl/
│   │   └── curl.h
│   ├── sqlite3.h
│   ├── openssl/      # OpenSSL 头文件(若需要)
│   ├── alsa/         # alsa-asoundlib.h 等
│   └── mbedtls/      # mbedTLS 头文件(任务 D 产出)
└── lib/                    # 第三方库
    ├── libcurl.so.4      ← 从设备 rootfs 拷贝
    ├── libssl.so.1.1
    ├── ...
    ├── libmbedtls.so.12← 任务 D 编译产出
    └── libmbedx509.so.0
    └── libmbedcrypto.so.*
```

**关键设计**:不要创建 `libxxx.so` 开发符号链接。CMake 的 `FIND_LIBRARY` 在 `CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY` 下,如果传`NAMES libcurl.so.4`就能直接找到带版本号的文件。避免符号链接问题(Windows 上也不便建软链)。

### 5.2 从设备 rootfs 提取库

Linux 上执行(在项目根目录):
```bash
DEV_ROOTFS=/path/to/ubifs-root/ROOTFS1.bin/ubifs-root
DEST=$(pwd)/jsruntime/3rdparty_libs/lib
mkdir -p "$DEST"

# curl + 其 TLS 后端与依赖链
for n in curl ssl crypto gnutls nettle hogweed gmp idn nghttp2 z sqlite3 asound; do
  f=$(find "$DEV_ROOTFS" -maxdepth 3 -name "lib${n}.so.*" 2>/dev/null | head -1)
  [ -n "$f" ] && cp -a "$f" "$DEST/" && echo "+ $(basename $f)" || echo "! lib$n 未找到"
done
```

> `libasound` 的依赖:设备上有 `usr/lib64/libasound.so.2` 和 `alsa-lib/libasound_module_*.so`(插件,运行时才需要,不参与链接)。
> 若目标设备实际播放走 MTK 插件路径,可能还需 `libasound_module_pcm_mtkfile.so` 等。

### 5.3 获取第三方头文件

需要 4 类头文件(系统头文件 glibc + alsa 已由 Bootlin sysroot 提供):

| 头文件 | 版本依据(来自设备 .so) | 来源 |
|---|---|---|
| `curl/curl.h` | `libcurl.so.4.5.0` → curl 7.61.0 | `https://curl.se/download/curl-7.61.0.tar.gz` |
| `sqlite3.h` | `libsqlite3.so.0.8.6` → 3.26 | `https://www.sqlite.org/2018/sqlite-amalgamation-3260000.zip` |
| `openssl/*` | `libcrypto.so.1.1` → OpenSSL 1.1.0i | `https://www.openssl.org/source/openssl-1.1.0i.tar.gz` |
| `alsa/asoundlib.h` | `libasound.so.2` → 1.1.x | `https://www.alsa-project.org/files/pub/lib/alsa-lib-1.1.6.tar.bz2` |
| `mbedtls/*` | 自行编译 | 任务 D |

**版本必须对齐** —— 结构体布局不一致会导致编译通过但运行崩溃。

安装:
```bash
THIRD=$(pwd)/jsruntime/3rdparty_libs
INC=$THIRD/include
mkdir -p $INC

# curl
tar xzf curl-7.61.0.tar.gz && mkdir -p $INC/curl && cp curl-7.61.0/include/curl/*.h $INC/curl/

# sqlite3
unzip -q sqlite-amalgamation-3260000.zip && cp sqlite-amalgamation-3260000/sqlite3.h $INC/

# openssl
tar xzf openssl-1.1.0i.tar.gz && mkdir -p $INC/openssl && cp openssl-1.1.0i/include/openssl/*.h $INC/openssl/

# alsa —— 头在 include/sound/,需平铺到 include/alsa/
tar xjf alsa-lib-1.1.6.tar.bz2 && mkdir -p $INC/alsa && cp alsa-lib-1.1.6/include/sound/*.h $INC/alsa/
```

> **OpenSSL 说明**:设备实际是 1.1.0i。用 1.1.0 系列任意小版本的头文件均可(同 ABI);**但绝对不能用 1.1.1+ 的头**,结构体布局已变。若 curl 用 gnutls 后端,则 openssl 头仅在项目其他地方需要时才装。

### 5.4 修改 Find 模块(必做)

**这是本任务最容易踩坑的地方。**

原文件用`FIND_PATH`/`FIND_LIBRARY` 并**显式传 `${CMAKE_SYSROOT}/usr` 作为首选前缀**:
```cmake
FIND_PATH(CURL_INCLUDE_DIR curl/curl.h ${CMAKE_SYSROOT}/usr)
```
删除 `CMAKE_SYSROOT` 后,这个路径会变成 `/usr` —— 指向**宿主机的 /usr**,会找到 x86 的头文件,交叉编译直接出错。

**必须改成指向 `THIRD_PARTY`:** `THIRD_PARTY` 由 toolchain.txt 定义,Find 模块可直接引用。

**`jsruntime/iflyosBoards/mtk8516-edu/FindCURL.cmake`** 全改为:
```cmake
FIND_PATH(CURL_INCLUDE_DIR
    NAMES curl/curl.h
    PATHS ${THIRD_PARTY}/include
    NO_DEFAULT_PATH)

FIND_LIBRARY(CURL_LIBRARY
    NAMES libcurl.so.4 libcurl.so.4.5.0 libcurl.so
    PATHS ${THIRD_PARTY}/lib
    NO_DEFAULT_PATH)

if (CURL_INCLUDE_DIR AND CURL_LIBRARY)
    set(CURL_FIND TRUE)
endif()
```

**`jsruntime/iflyosBoards/mtk8516-edu/Findsqlite3.cmake`**:
```cmake
FIND_PATH(SQLITE3_INCLUDE_DIR
    NAMES sqlite3.h
    PATHS ${THIRD_PARTY}/include
    NO_DEFAULT_PATH)

FIND_LIBRARY(SQLITE3_LIBRARY
    NAMES libsqlite3.so.0 libsqlite3.so
    PATHS ${THIRD_PARTY}/lib
    NO_DEFAULT_PATH)

if (SQLITE3_INCLUDE_DIR AND SQLITE3_LIBRARY)
    set(SQLITE3_FIND TRUE)
endif()
```

**`jsruntime/iflyosBoards/mtk8516-edu/Findportaudio.cmake`** —— 任务 C 会彻底移除 portaudio,此文件可删除,并从 `cmake/iotjs.cmake:24-26` 移除:
```cmake
if (PORTAUDIO)
    find_package(portaudio REQUIRED)
endif()
```

**`Findgstreamer-1.0.cmake` / `Findgstreamer-app-1.0.cmake`** —— 死代码(见 2.7),建议删除以免混淆。
**`Findopus.cmake`** —— 死代码,建议删除。

### 5.5 ⚠️ `-lz` 隐式依赖坑(必读)

`FindCURL.cmake` 原本定义:
```cmake
set(CURL_LIBRARIES "-lcurl -lcrypto -lz")   # ← 这行从未被使用!
```
但 `cmake/iotjs.cmake:555` 用的是 **`${CURL_LIBRARY}`(单数)**,`CURL_LIBRARIES` 全文只在定义处出现、从未被引用。

所以 `-lcrypto` 是靠 `iotjs.cmake:554` 的硬编码进去的:
```cmake
  "-lstdc++ -lasound -lcrypto"
```

而 **`-lz` 从未进过链接命令行**,当前靠 `libcurl.so.4` 的 `DT_NEEDED` 让运行时动态加载器兜底。

**处理建议**:在 `cmake/iotjs.cmake:554` 改为
```cmake
  "-lstdc++ -lasound -lcrypto -lz"
```
显式加 `-lz`,避免静态分析或 `--no-undefined` 检查时报 `undefined reference to deflate`。

---

## 6. 任务 C:移除 portaudio,改用 ALSA 直调

### 6.1 改动范围(已核查,耦合干净)

| 文件 | 行数 | portaudio 依赖程度 |
|---|---|---|
| `src/modules/iotjs_module_iFLYOS_portaudiowrapper.cpp` | 116 | **全部**(唯一重度使用者) |
| `src/modules/iotjs_module_iFLYOS_portaudiowrapper.h` | 38 | `Pa_*` 类型 + `paInt*` 常量 |
| `src/modules/iotjs_module_iFLYOS_pcmplayer.cpp` | 256 | **仅 4 处** `paInt8/16/24/32` |

### 6.2 关键前提:项目里已有 ALSA 采集实现可参考

`src/modules/iotjs_module_iFLYOS_audio.cpp:147` 已经在用 ALSA 采集:
```cpp
auto err = snd_pcm_open(&alsa, alsaDeviceName.c_str(), SND_PCM_STREAM_CAPTURE, 0);
```
**播放侧只需照搬这套参数设置,改 `SND_PCM_STREAM_PLAYBACK`。** 不要从零写。

### 6.3 现有 portaudio 封装的行为契约

`iotjs_module_iFLYOS_portaudiowrapper.cpp` 的接口(pcmplayer 依赖这些):
```cpp
PortAudioWrapper(numInput, numOutput, sampleFormat, sampleRate, streamCallback, finishCallback)
  .isStopped()  -> bool   // 流是否已停止
  .abortStream()         // 中止(丢弃剩余数据)
  .stopStream()          // 停止(播放完剩余数据)
```
`pcmplayer` 的使用模式(`iotjs_module_iFLYOS_pcmplayer.cpp:30-100`):
- 构造时创建流
- `play()` 时检查 `isStopped()`,若在播则 `abortStream()`
- 用 `Pa_StartStream` 启动,内部靠 `Pa_SetStreamFinishedCallback` 触发完成回调

### 6.4 ALSA 重写策略

**保留 `PortAudioWrapper` 的类名和接口签名**,内部实现从 portaudio 换成 ALSA。这样 `pcmplayer.cpp` 一行都不用改(除了那 4 处 `paInt*` 常量)。

核心逻辑:
```cpp
// 播放格式转换表 —— paInt* 魔数 → ALSA SND_PCM_FORMAT_*
// 注意: 这里的魔数必须与 src/js/pcm_player.js:72-75 保持一致
static snd_pcm_format_t pa_to_alsa(int paFmt) {
  switch (paFmt) {
    case 0x00000010: return SND_PCM_FORMAT_S8;          // paInt8
    case 0x00000008: return SND_PCM_FORMAT_S16_LE;      // paInt16
    case 0x00000004: return SND_PCM_FORMAT_S24_LE;      // paInt24
    case 0x00000002: return SND_PCM_FORMAT_S32_LE;      // paInt32
    default:         return SND_PCM_FORMAT_S16_LE;
  }
}
```
播放循环(`snd_pcm_writei` 是阻塞写,自动处理缓冲):
```cpp
snd_pcm_t* m_pcm = nullptr;
snd_pcm_uframes_t m_played = 0;

// 打开
snd_pcm_open(&m_pcm, "default", SND_PCM_STREAM_PLAYBACK, 0);
snd_pcm_set_params(m_pcm, fmt, SND_PCM_ACCESS_RW_INTERLEAVED,
                   channels, rate, 1, 100000/*latency us*/);
// 回调线程:在 std::thread 中循环 snd_pcm_writei,写完调 finishCallback
```

### 6.5 ⚠️ JS 层魔数必须保持不变

**文件**:`jsruntime/src/js/pcm_player.js:72-75`
```js
module.exports.paInt8  = 0x00000010;
module.exports.paInt16 = 0x00000008;
module.exports.paInt24 = 0x00000004;
module.exports.paInt32 = 0x00000002;
```

**这四个值来自 portaudio 的 `PaSampleFormat` 枚举,业务层 JS 依赖它们。**

**决定:保留这些魔数不变**,在 C++ 侧用上面 `pa_to_alsa()` 做映射。这样 `smartSpeakerApp` 的 JS 侧零改动。

### 6.6 需要删除的构建引用

| 位置 | 内容 |
|---|---|
| `cmake/iotjs.cmake:24-26` | `if (PORTAUDIO) find_package(portaudio REQUIRED) endif()` |
| `iflyosBoards/mtk8516-edu/Findportaudio.cmake` | 整个文件 |
| `3rdparty_libs/include/portaudio.h` | 不需要准备 |

---

## 7. 任务 D:编译 mbedTLS 2.x 动态库

### 7.1 为什么必须是 2.x

**版本铁律:使用 mbedTLS 2.x,不能用 3.x。**

依据:原始 iFLYOS rootfs 中 `libmbedtls.so.12`、`libmbedx509.so.0`、`libmbedcrypto.so.2.16.3` 均对应 **mbedTLS 2.x**。3.x 对 `mbedtls_ssl_config` 等结构体做了重构,ABI 与 2.x 不兼容。

项目实际引用的头文件(`iotjs_module_tls.c` 等):
```
mbedtls/certs.h      mbedtls/ctr_drbg.h    mbedtls/entropy.h
mbedtls/net.h        mbedtls/net_sockets.h mbedtls/ssl.h
mbedtls/pk.h         mbedtls/sha1.h        mbedtls/sha256.h
```

### 7.2 编译方式:CMake,输出共享库

```bash
export BOOTLIN_TC=/opt/aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2
export PATH=$BOOTLIN_TC/bin:$PATH

cd /tmp
tar xzf mbedtls-2.28.x.tar.gz && cd mbedtls-2.28.x

mkdir build && cd build

cmake .. \
  -DCMAKE_TOOLCHAIN_FILE=$BOOTLIN_TC/share/cmake/buildroot.cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=$(pwd)/../../mt8516-3rdparty/out \
  -DUSE_SHARED_MBEDTLS_LIBRARY=ON \
  -DUSE_STATIC_MBEDTLS_LIBRARY=OFF \
  -DENABLE_TESTING=OFF \
  -DENABLE_PROGRAMS=OFF \
  -DCMAKE_C_FLAGS="-O3 -mcpu=cortex-a72+crypto"

make -j$(nproc)
make install
```

产物(在 `out/lib/`):
```
libmbedtls.so     -> libmbedtls.so.12
libmbedx509.so    -> libmbedx509.so.0
libmbedcrypto.so  -> libmbedcrypto.so.2.x
```
头文件在 `out/include/mbedtls/`。

### 7.3 安装到 3rdparty_libs

```bash
THIRD=<项目路径>/jsruntime/3rdparty_libs
cp -a out/lib/libmbed*.so* $THIRD/lib/
cp -a out/include/mbedtls $THIRD/include/
```

### 7.4 修改 mbedtls.cmake

**文件**:`jsruntime/cmake/mbedtls.cmake`(第 19 行)
```cmake
set(MBEDTLS_LIBS "-lmbedtls -lmbedx509 -lmbedcrypto")
```

**问题**: `-l` 形式要求链接器能找到 `libmbedtls.so`。因为 `3rdparty_libs/lib/` 里是 `libmbedtls.so.12`,若建立了 `libmbedtls.so` 软链则 `-l` 可用;否则会失败。

**改法(推荐,显式全路径,最稳)**:
```cmake
# 第三方库统一目录,由 toolchain.txt 定义为 THIRD_PARTY
if(NOT DEFINED THIRD_PARTY)
  # 兜底:若未通过 toolchain.txt 传入则推导
  get_filename_component(JSRT_ROOT "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
  set(THIRD_PARTY "${JSRT_ROOT}/3rdparty_libs")
endif()

set(MBEDTLS_LIBS
  "${THIRD_PARTY}/lib/libmbedtls.so"
  "${THIRD_PARTY}/lib/libmbedx509.so"
  "${THIRD_PARTY}/lib/libmbedcrypto.so")
```

> **若用 `-l` 形式**,则需先创建符号链接:
> ```bash
> cd $THIRD/lib
> ln -sf libmbedtls.so.12    libmbedtls.so
> ln -sf libmbedx509.so.0    libmbedx509.so
> ln -sf libmbedcrypto.so.*  libmbedcrypto.so
> ```

### 7.5 ⚠️ mbedTLS 静态链接评估(用户已决定用动态)

用户决定:**能静态就静态,不能则动态,`.so` 随程序一起部署。**

**动态方案更稳妥,理由**:
- 符号缺失在**链接期**就会暴露,不会静默到运行期
- mbedTLS 2.x 依赖链会拉入 `asn1parse / x509_create / x509_crt / cipher_wrap / md / bignum / platform / timing` 等全套模块,"部分静态化"实际会变成"整套静态化",工作量与收益不成比例
- `.so` 随程序部署已有现成机制(见 8.3)

---

## 8. 任务 E:完整构建与部署验证

### 8.1 环境准备

```bash
export BOOTLIN_TC=/opt/aarch64--glibc--bleeding-edge-2017.05-toolchains-1-2
export PATH=$BOOTLIN_TC/bin:$PATH

# 确认工具链版本 —— 必须显示 gcc 6.3.0
aarch64-buildroot-linux-gnu-gcc --version
```

### 8.2 构建前核心验证(必做,失败则后续无意义)

```bash
# 1. 验证工具链 sysroot 的 glibc 版本
cat $BOOTLIN_TC/aarch64-buildroot-linux-gnu/sysroot/usr/include/features.h \
  | grep -E "__GLIBC__|__GLIBC_MINOR__"
# 期望: __GLIBC__ 2 / __GLIBC_MINOR__ 24

# 2. 编一个 C 程序并检查符号版本
cat > /tmp/t.c <<'EOF'
#include <stdio.h>
#include <pthread.h>
int main(){ printf("ok\n"); return 0; }
EOF
aarch64-buildroot-linux-gnu-gcc /tmp/t.c -o /tmp/t
aarch64-buildroot-linux-gnu-readelf -V /tmp/t | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -3
# ★ 最高必须是 GLIBC_2.24 或更低。若出现 GLIBC_2.27+ 则工具链选错了

# 3. 验证 C++
cat > /tmp/t.cpp <<'EOF'
#include <string>
#include <thread>
int main(){ std::string s="x"; std::thread t([&]{s+="y";}); t.join(); return 0; }
EOF
aarch64-buildroot-linux-gnu-g++ -std=c++11 /tmp/t.cpp -o /tmp/tcpp
aarch64-buildroot-linux-gnu-readelf -V /tmp/tcpp | grep -o 'GLIBCXX_[0-9.]*' | sort -uV | tail -1
# 期望 <= GLIBCXX_3.4.22(设备版本)
```

### 8.3 执行构建

```bash
cd <项目根>/MT8516-CodeRelease

# 输出目录(原脚本硬编码 /etc/iflyosBoards,需有写权限)
export OUT_ROOT=/tmp/iflyos-out
mkdir -p $OUT_ROOT/mtk8516-edu/{build,install}

./jsruntime/build-iflyos-linux.sh \
  -c <CLIENT_ID> -s <CLIENT_SECRET> -d <DEVICE_ID> \
  -p mtk8516-edu -m 6
```

### 8.4 部署到设备

`build-iflyos-linux.sh` 产出的 `install/` 目录结构:
```
install/
├── bin/iotjs              ← 主程序
├── lib/libiotjs.so        ← 核心库
├── lib/libmbed*.so        ← 需从 3rdparty_libs 一并拷贝
├── smartSpeakerApp/        ← JS 业务代码
├── sound_effect/           ← 音效 m4a
└── iFLYOS.json            ← 配置
```

**部署步骤**:
```bash
# 1. 把自编的 mbedtls .so 也放进 install/lib/
cp jsruntime/3rdparty_libs/lib/libmbed*.so* $OUT_ROOT/mtk8516-edu/install/lib/

# 2. 确认 run.sh 的 LD_LIBRARY_PATH 覆盖了这些目录
cat $OUT_ROOT/mtk8516-edu/install/run.sh
```

`run.sh` 现有内容(已包含正确的路径):
```sh
export LD_LIBRARY_PATH=/data/iotjs/lib:/data/iotjs/usr/local/lib
cd /data/iotjs/smartSpeakerApp/src
/data/iotjs/bin/iotjs main.js /data/iotjs/iFLYOS.json
```
`/data/iotjs/lib/` 已在 `LD_LIBRARY_PATH` 里,mbedtls `.so` 放这里即可,**无需改 run.sh**。

### 8.5 上板验证

```bash
# 1. 推送
adb shell mkdir -p /data/iotjs
adb push $OUT_ROOT/mtk8516-edu/install/* /data/iotjs/

# 2. 设备端检查动态库依赖是否全部满足
adb shell "cd /data/iotjs && LD_LIBRARY_PATH=/data/iotjs/lib ldd bin/iotjs"
adb shell "cd /data/iotjs && LD_LIBRARY_PATH=/data/iotjs/lib ldd lib/libiotjs.so"
# ★ 所有依赖必须解析成功,不能出现 "not found"

# 3. 确认 libmbedtls.so 已被正确链接
adb shell "cd /data/iotjs && readelf -d lib/libiotjs.so | grep NEEDED"

# 4. 运行
adb shell "cd /data/iotjs && chmod +x bin/iotjs lib/*.so && LD_LIBRARY_PATH=/data/iotjs/lib ./bin/iotjs main.js iFLYOS.json"
```

---

## 9. 风险清单与已知坑

### 9.1 阻断级风险

| 风险 | 后果 | 缓解 |
|---|---|---|
| **工具链 glibc 版本选错** | 上板报 `symbol version not found` | 已通过 readme 确认 2017.05 版= glibc 2.24。执行 8.2 的验证命令确认 |
| **`CMAKE_SYSROOT` 未正确删除** | 链接时找宿主 `/usr` 里的 x86 库 | 任务 A 明确删除 |
| **`Find*.cmake` 仍指向 `${CMAKE_SYSROOT}/usr`** | 找到宿主机头文件,交叉编译产出错误二进制 | 任务 B 5.4 全部改为 `PATHS ${THIRD_PARTY}/...` + `NO_DEFAULT_PATH` |
| **mbedTLS 用 3.x** | 运行期 ABI 崩溃 | 任务 D 明确 2.x |

### 9.2 功能性风险(已知并接受)

| 风险 | 说明 |
|---|---|
| **CAE 关闭 → 唤醒功能失效** | `libhlw.so` 闭源不可得。**编译不受影响**,但 `smartSpeakerApp/src/audio.js:37,64` 调用 `iflyos.CAE` 会抛 TypeError。用户已确认暂不管业务层 |
| **portaudio 移除 → TTS 播放需 ALSA 等价实现** | 任务 C 完成 |
| **`-lcrypto` 冗余** | 设备 curl 用 gnutls,`-lcrypto` 非必需。设备上 `libcrypto.so.1.1` 存在(ffmpeg 用),保留无害 |

### 9.3 已排查确认无风险的项

| 项 | 结论 |
|---|---|
| curl 版本差异(设备 7.61.0 vs 原 7.61.1) | 同 ABI,curl.h 自包含,无影响 |
| OpenSSL 版本(1.1.0i vs 1.1.0j) | 同 ABI 分支,头文件可混用 |
| `-feliminate-unused-debug-types` | 已从 toolchain.txt 删除,若报错即因未删干净 |
| GLIBCXX 版本(设备 3.4.22 / GCC 6.3 产出 3.4.22) | 精确匹配 |

### 9.4 原代码中的 bug(顺手修正)

`toolchain.txt` 原第 36 行(注:第 15-18 行的 CAE 注释块是本次迁移新增的,故行号相对原始文件 +3):
```cmake
set(CMAKE_C_FLAGS"${CMAKE_C_FLAGS} -s -O3 -pipe ...")   # ← "FLAGS" 与引号间缺空格
```
变量名被解析为 `CMAKE_C_FLAGS"..."` 这个畸形名字,**该行的 C 编译选项从未生效过**。第 37 行 CXX 版本有空格所以是生效的。已在任务 A 中修正。

> 全部需删除的 GCC 专有 flag 位于 `toolchain.txt` 第 36-39 行:
> - 第36/37 行:`-feliminate-unused-debug-types`(GCC 私有)、`-s`(strip)、`-mcpu=cortex-a72.cortex-a53+crypto`(大小核语法)
> - 第 38 行:`-Wl,--unresolved-symbols=ignore-in-shared-libs`(掩盖真实链接错误)

---

## 10. 附录:完整依赖清单

### 10.1 最终需要链接的第三方库(动态)

**从设备 rootfs 拷贝**(`/data/iotjs/lib/`):

| 库 | 文件 |
|---|---|
| libcurl | `libcurl.so.4` → `.4.5.0` |
| libgnutls | `libgnutls.so.30` |
| libnettle | `libnettle.so.6` |
| libhogweed | `libhogweed.so.4` |
| libgmp | `libgmp.so.10` |
| libidn | `libidn.so.11` |
| libnghttp2 | `libnghttp2.so.14` |
| libz | `libz.so.1` |
| libcrypto | `libcrypto.so.1.1` |
| libssl | `libssl.so.1.1` |
| libsqlite3 | `libsqlite3.so.0` → `.0.8.6` |
| libasound | `libasound.so.2` |

**自行编译**(任务 D):
| 库 | 文件 |
|---|---|
| libmbedtls | `libmbedtls.so.12` |
| libmbedx509 | `libmbedx509.so.0` |
| libmbedcrypto | `libmbedcrypto.so.2.x` |

### 10.2 系统库(Bootlin sysroot 提供,无需处理)

`libc.so.6` `libm.so.6` `libdl.so.2` `libpthread.so.0` `librt.so.1` `libresolv.so.2` `libgcc_s.so.1` `libstdc++.so.6`

### 10.3 仓库内自建静态库(5 个,无需外部依赖)

`libjerry-core.a` `libjerry-ext.a` `libjerry-port-default.a` `libtuv.a` `libhttpparser.a`

### 10.4 明确不使用

`libportaudio` `libhlw` `libopus` `libgstreamer*` `libNE10` `libwpa_client` `libsnowboy*` `libr328record` `libchannel` `libatlas` `libcblas` `libsox`

---

## 11. 执行顺序建议

```
1. 任务 A —— 改 toolchain.txt + build-iflyos-linux.sh      (骨架)
2. 8.2 核心验证 —— 确认 glibc 2.24 符号版本正确              (门禁)
3. 任务 B.2/B.3 —— 提取 .so + 下载 .h 到 3rdparty_libs      (准备)
4. 任务 B.4 —— 改三个 Find*.cmake                            (关键)
5. 任务 D —— 编 mbedtls 2.x + 改 mbedtls.cmake               (补缺)
6. 任务 C —— portaudio → ALSA 重写                          (功能)
7. 任务 E —— 完整构建 + 上板验证                              (验收)
```

**每一步完成后都应能独立验证,不要攒到最后一起编译** —— CMake 的错误会级联,早发现省时间。

---

## 12. 关键文件路径速查(相对项目根 `MT8516-CodeRelease/`)

| 用途 | 路径 |
|---|---|
| 构建入口 | `build_mt8516.sh` |
| 主构建脚本 | `jsruntime/build-iflyos-linux.sh` |
| CMake toolchain | `jsruntime/iflyosBoards/mtk8516-edu/toolchain.txt` |
| 顶层 CMake | `jsruntime/CMakeLists.txt` |
| 链接配置 | `jsruntime/cmake/iotjs.cmake`(第 547-582 行) |
| mbedtls 配置 | `jsruntime/cmake/mbedtls.cmake` |
| Find 模块 | `jsruntime/iflyosBoards/mtk8516-edu/Find{CURL,sqlite3,portaudio,alsa,opus,gstreamer-1.0,gstreamer-app-1.0}.cmake` |
| 模块清单 | `jsruntime/src/modules.json` |
| portaudio 封装 | `jsruntime/src/modules/iotjs_module_iFLYOS_portaudiowrapper.{cpp,h}` |
| PCM 播放 | `jsruntime/src/modules/iotjs_module_iFLYOS_pcmplayer.cpp` |
| ALSA 参考实现 | `jsruntime/src/modules/iotjs_module_iFLYOS_audio.cpp`(第 147 行起) |
| JS 魔数定义 | `jsruntime/src/js/pcm_player.js`(第 72-75 行) |
| CAE 接口声明 | `jsruntime/src/modules/cae_intf.h` |
| 业务层(需关注) | `smartSpeakerApp/src/audio.js` |

**外部资源路径**:
- 目标设备 rootfs: `J:\dingdongROM\ubifs-root\ROOTFS1.bin\ubifs-root`
- 原始参考 rootfs(2.26): `J:\dingdongROM\iFLYOS\ubifs-root-iflyos`