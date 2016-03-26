COMPILER = g++
CFLAGS = -dynamiclib -std=c++11 -Wno-c++11-extensions -w
TARGET = dgpc.dylib
SOURCES = calculate.cpp
INCLUDE = -I../include/ \
	-I/usr/local/opt/open-mesh/include/
LIBS = -L/usr/local/opt/open-mesh/lib/ \
	./usr/local/opt/open-mesh/lib/libOpenMeshCore.a \
	./usr/local/opt/open-mesh/lib/libOpenMeshTools.a

compile:
	$(COMPILER) $(CFLAGS) -o $(TARGET) $(INCLUDE) $(LIBS) $(SOURCES)

all:
	compile
