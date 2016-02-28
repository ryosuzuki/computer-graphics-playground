COMPILER = g++
CFLAGS = -dynamiclib -g -std=c++11 -Wno-c++11-extensions
TARGET = mylib.dylib
SOURCES = calculate.cpp
INCLUDE = -I/usr/local/opt/eigen/include/eigen3/ -I/usr/local/opt/rapidjson/include/rapidjson/ -I/usr/local/opt/armadillo/include/armadillo
LIBS = /usr/local/opt/armadillo/lib -larmadillo

compile:
	$(COMPILER) $(CFLAGS) -o $(TARGET) $(SOURCES) $(INCLUDE) -L $(LIBS)

all:
	compile

clean:
	-rm -f $(TARGET)
