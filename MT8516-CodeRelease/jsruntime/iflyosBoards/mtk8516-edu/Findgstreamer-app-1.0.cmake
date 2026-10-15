set(GSTAPP_INCLUDE_DIRS
        ${CMAKE_SYSROOT}/usr/include/glib-2.0
        ${CMAKE_SYSROOT}/usr/include/glib-2.0/include
        ${CMAKE_SYSROOT}/usr/include/gstreamer-1.0
        )
set(GSTAPP_LDFLAGS "-L${A113X_USR_PATH}/lib -lgstreamer-1.0 -lgobject-2.0 -lglib-2.0 -lgstbase-1.0 -lgstapp-1.0")