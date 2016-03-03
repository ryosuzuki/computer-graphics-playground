COMPILER = g++
CFLAGS = -dynamiclib -std=c++11 -Wno-c++11-extensions -w
TARGET = mylib.dylib
SOURCES = calculate.cpp
INCLUDE = -I./include/ \
	-I/usr/local/opt/eigen/include/eigen3/ \
	-I/usr/local/opt/rapidjson/include/ \
	-I/usr/local/opt/suite-sparse/include/ \
	-I/usr/local/opt/openblas/include/
LIBS = -L/usr/local/opt/suite-sparse/lib/ \
	-L/usr/local/opt/openblas/lib/ \
	/usr/local/opt/suite-sparse/lib/libamd.a \
	/usr/local/opt/suite-sparse/lib/libcholmod.a \
	/usr/local/opt/suite-sparse/lib/libcolamd.a \
	/usr/local/opt/suite-sparse/lib/libklu.a \
	/usr/local/opt/suite-sparse/lib/libldl.a \
	/usr/local/opt/suite-sparse/lib/librbio.a \
	/usr/local/opt/suite-sparse/lib/libspqr.a \
	/usr/local/opt/suite-sparse/lib/libsuitesparseconfig.a \
	/usr/local/opt/suite-sparse/lib/libumfpack.a \
	/Users/ryosuzuki/Desktop/suitesparse/SuiteSparse_config/libsuitesparseconfig.a

F77 = gfortran
CF = $(CFLAGS) -O3 -fno-common -fexceptions -DNTIMER
BLAS = -framework Accelerate
LAPACK = -framework Accelerate
LIB = -lm


compile:
	$(COMPILER) $(CFLAGS) $(CF) -o $(TARGET) $(INCLUDE) $(BLAS) $(LAPACK) $(LIB) $(LIBS) $(SOURCES)

all:
	compile

clean:
	-rm -f $(TARGET)
