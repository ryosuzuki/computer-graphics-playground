COMPILER = g++
CFLAGS = -std=c++11 -Wno-c++11-extensions
TARGET = test
SOURCES = lscm.cpp
INCLUDE = -I/usr/local/opt/eigen/include/eigen3/ -I/Users/ryosuzuki/Dropbox/Piedmont/Code/libigl/include/

compile:
  $(COMPILER) $(CFLAGS) -o $(TARGET) $(SOURCES) $(INCLUDE)

all:
  compile

clean:
  -rm -f $(TARGET)