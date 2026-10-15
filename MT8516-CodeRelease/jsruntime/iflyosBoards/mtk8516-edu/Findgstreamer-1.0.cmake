set(GST_INCLUDE_DIRS
        ${CMAKE_SYSROOT}/usr/include/glib-2.0
        ${CMAKE_SYSROOT}/usr/include/glib-2.0/include
        ${CMAKE_SYSROOT}/usr/include/gstreamer-1.0
    )
set(GST_LDFLAGS "-lgstreamer-1.0 -lgobject-2.0 -lglib-2.0")