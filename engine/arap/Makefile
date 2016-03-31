COMPILER = g++
CFLAGS = -dynamiclib -std=c++11 -Wno-c++11-extensions -w
TARGET = compute.dylib
SOURCES = calculate.cpp
INCLUDE = -I../include/ \
	-I/usr/local/opt/eigen/include/eigen3/ \
	-I/usr/local/opt/rapidjson/include/

compile:
	$(COMPILER) $(CFLAGS) -o $(TARGET) $(INCLUDE) $(SOURCES)

all:
	compile

clean:
	-rm -f $(TARGET)
