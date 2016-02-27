COMPILER = g++
CFLAGS = -dynamiclib
TARGET = mylib.dylib
SOURCES = calculate.cpp
INCLUDE = -I/usr/local/opt/armadillo/include/armadillo -I/usr/local/opt/rapidjson/include/rapidjson/
LIBS = /usr/local/opt/armadillo/lib -larmadillo

compile:
	$(COMPILER) $(CFLAGS) -o $(TARGET) $(SOURCES) $(INCLUDE) -L $(LIBS)

all:
	compile

clean:
	-rm -f $(TARGET)
