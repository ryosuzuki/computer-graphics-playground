COMPILER = g++
CFLAGS = -std=c++11 -Wno-c++11-extensions -w
TARGET = test
SOURCES = lscm.cpp
INCLUDE = -I/usr/local/opt/eigen/include/eigen3/ -I../../../libigl/include/ -I../../../libigl/external/CoMISo/ext/gmm-4.2/include/ -I../../../libigl/external/

compile:
	$(COMPILER) $(CFLAGS) -o $(TARGET) $(INCLUDE) $(SOURCES)

all:
	compile

clean:
	-rm -f $(TARGET)