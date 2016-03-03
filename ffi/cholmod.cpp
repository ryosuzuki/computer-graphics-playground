/*
Makefile settings

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
 */

#include <iostream>
#include <Eigen/Dense>
#include <Eigen/Sparse>
#include <Eigen/CholmodSupport>

#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"

#include <math.h>
#include <igl/cotmatrix.h>
#include <igl/map_vertices_to_circle.h>
#include <igl/harmonic.h>
#include <igl/boundary_loop.h>
#include <igl/lscm.h>
#include <igl/arap.h>

#include "cholmod.h"


using namespace std;
using namespace Eigen;
using namespace rapidjson;

MatrixXd V;
MatrixXi F;
MatrixXd N;
MatrixXd V_uv;
VectorXi bnd;

MatrixXd initial_guess;
SparseMatrix<double> Lp;

extern "C" {
  typedef struct {
    int size;
    int count;
    int *row;
    int *col;
    double *val;
  } Result_Matrix;

  typedef struct {
    int count;
    int *index;
  } Result_Index;

  typedef struct {
    double *uv;
  } Result_Mapping;

  typedef struct {
    double *phi;
  } Result_Field;



  void getLaplacian(char *json, Result_Matrix *result_L, Result_Matrix *result_U, Result_Index *result_P, Result_Index *result_Pinv) {
    Document d;
    d.Parse(json);

    cout << "Hoge" << endl;

    Value &uniq  = d["uniq"];
    Value &faces = d["faces"];
    Value &map   = d["map"];
    V.resize(uniq.Size(), 3);
    F.resize(faces.Size(), 3);;

    for (SizeType i=0; i<uniq.Size(); i++) {
      Value &vertex = uniq[i]["vertex"];
      V(i, 0) = vertex["x"].GetDouble();
      V(i, 1) = vertex["y"].GetDouble();
      V(i, 2) = vertex["z"].GetDouble();
    }
    for (SizeType i=0; i<faces.Size(); i++) {
      Value &face = faces[i];
      int a = face["a"].GetInt();
      int b = face["b"].GetInt();
      int c = face["c"].GetInt();
      F(i, 0) = map[a].GetInt();
      F(i, 1) = map[b].GetInt();
      F(i, 2) = map[c].GetInt();
    }
    cout << "Get Laplacian" << endl;
    igl::cotmatrix(V, F, Lp);
    // L.makeCompressed();
    // SimplicialLDLT< SparseMatrix<double> > ldl(L);
    // SparseMatrix<double> LD = ldl.matrixL();

    cout << "Compute Cholesky" << endl;
    // SparseLU< SparseMatrix<double> > slu(Lp);
    // slu.analyzePattern(Lp);
    // slu.factorize(Lp);
    // SparseMatrix<double> LL = slu.matrixL<double, 0, int>();

    // cholmod_sparse A = viewAsCholmod(Lp);
    // cholmod_common c;
    // cholmod_start (&c);
    // cholmod_factor *CF = cholmod_analyze(&A, &c);
    // cholmod_factorize(&A, CF, &c);
    // cholmod_sparse *CL = cholmod_factor_to_sparse(CF, &c);
    // cholmod_finish(&c);
    // SparseMatrix<double> LL = viewAsEigen<double, 0, int>(*CL);
    // cout << LL << endl;

    cout << "Finish Sparse Cholesky" << endl;

    MatrixXd Ld = Lp;
    // LLT<MatrixXd> chol(Ld);
    // MatrixXd cholL, cholU;
    // cholL = chol.matrixL();
    // cout << cholL << endl;

    cout << "Start Dense Cholesky" << endl;

    PartialPivLU<MatrixXd> lu(Ld);
    int r;
    MatrixXd P, Pinv, L, Ltmp, U;
    P = lu.permutationP();
    lu.matrixLU();
    r = max(Ld.rows(), Ld.cols());
    U = lu.matrixLU().triangularView<Upper>();
    Ltmp = MatrixXd::Identity(r, r);
    Ltmp.block(0, 0 , Ld.rows(), Ld.cols()).triangularView<StrictlyLower>() = lu.matrixLU();
    L = Ltmp.block(0, 0, P.cols(), U.rows());
    Pinv = P.inverse();

    // cout << L << endl;
    cout << "Finish Cholesky" << endl;

    cout << "Convert LUP" << endl;

    int index;
    SparseMatrix<double> SpL = L.sparseView();
    SparseMatrix<double> SpU = U.sparseView();
    cout << SpL.rows() << endl;
    cout << SpL.nonZeros() << endl;


    int n = uniq.Size() * uniq.Size();
    double epsilon = pow(10, -10);

    result_L->size = L.rows();
    result_L->row = new int[n];
    result_L->col = new int[n];
    result_L->val = new double[n];
    index = 0;
    for (int col=0; col<L.cols(); col++) {
      for (int row=0; row<L.rows(); row++) {
        if (abs(L(row, col)) < epsilon) continue;
        result_L->col[index] = col;
        result_L->row[index] = row;
        result_L->val[index] = L(row, col);
        index++;
      }
    }
    result_L->count = index;

    cout << "Finish L" << endl;

    result_U->size = U.rows();
    result_U->row = new int[n];
    result_U->col = new int[n];
    result_U->val = new double[n];
    index = 0;
    for (int col=0; col<U.cols(); col++) {
      for (int row=0; row<U.rows(); row++) {
        if (abs(U(row, col)) < epsilon) continue;
        result_U->col[index] = col;
        result_U->row[index] = row;
        result_U->val[index] = U(row, col);
        index++;
      }
    }
    result_U->count = index;

    cout << "Finish U" << endl;

    result_P->count = P.rows();
    result_Pinv->count = P.rows();
    result_P->index = new int[P.rows()];
    result_Pinv->index = new int[Pinv.rows()];
    for (int row=0; row<P.rows(); row++) {
      for (int col=0; col<P.cols(); col++) {
        if (abs(P(row, col)) > epsilon) {
          result_P->index[row] = col;
        }
        if (abs(P(row, col)) > epsilon) {
          result_Pinv->index[row] = col;
        }
      }
    }
    cout << "Finish P and Pinv" << endl;

    /*
    m=
    5 2 1
    2 8 1
    1 1 5
    ###using PartialPivLU:
    P=lu.permutationP()=
    1 0 0
    0 1 0
    0 0 1
    lu.matrixLU()=
            5         2         1
          0.4       7.2       0.6
          0.2 0.0833333      4.75
    r=std::max(m.rows(),m.cols())=
    3
    U=lu.matrixLU().triangularView<Upper>()=
       5    2    1
       0  7.2  0.6
       0    0 4.75
    Ltmp= MatrixXd::Identity(r,r)
    Ltmp.block(0,0,m.rows(),m.cols()).triangularView<StrictlyLower>()= lu.matrixLU()
    Ltmp=
            1         0         0
          0.4         1         0
          0.2 0.0833333         1
    L=Ltmp.block(0,0,P.cols(),U.rows())=
            1         0         0
          0.4         1         0
          0.2 0.0833333         1
    P.inverse() * L * U=
    5 2 1
    2 8 1
    1 1 5
    */


    // FullPivLU<MatrixXd> lu(Ld);
    // int r;
    // MatrixXd P, Lp , Ltmp, U, Q;
    // P = lu.permutationP();
    // Q = lu.permutationQ();
    // lu.matrixLU();
    // r = std::max(Ld.rows(), Ld.cols());
    // U = lu.matrixLU().triangularView<Upper>();
    // Ltmp = MatrixXd::Identity(r, r);
    // Ltmp.block(0, 0, Ld.rows(), Ld.cols()).triangularView<StrictlyLower>() = lu.matrixLU();
    // Lp = Ltmp.block(0, 0, P.cols(), U.rows());
    // cout << P.inverse() * Lp * U * Q.inverse() << endl;

    /*
    m=
    5 2 1
    2 8 1
    1 1 5
    ###using FullPivLU:
    P=lu.permutationP()=
    0 1 0
    0 0 1
    1 0 0
    Q=lu.permutationQ()=
    0 0 1
    1 0 0
    0 1 0
    lu.matrixLU()=
           8        1        2
       0.125    4.875     0.75
        0.25 0.153846  4.38462
    r=std::max(m.rows(),m.cols())=
    3
    U=lu.matrixLU().triangularView<Upper>()=
          8       1       2
          0   4.875    0.75
          0       0 4.38462
    Ltmp= MatrixXd::Identity(r,r)
    Ltmp.block(0,0,m.rows(),m.cols()).triangularView<StrictlyLower>()= lu.matrixLU()
    Ltmp=
           1        0        0
       0.125        1        0
        0.25 0.153846        1
    L=Ltmp.block(0,0,P.cols(),U.rows())=
           1        0        0
       0.125        1        0
        0.25 0.153846        1
    P.inverse() * L * U * Q.inverse()=
    5 2 1
    2 8 1
    1 1 5
    */



    // res->row = new int[L.nonZeros()];
    // res->col = new int[L.nonZeros()];
    // res->val = new double[L.nonZeros()];
    // vector<int> v;
    // cout << "Start exporting Laplacian" << endl;
    // for (int k=0; k<L.outerSize(); ++k) {
    //   for (SparseMatrix<double>::InnerIterator it(L, k); it; ++it) {
    //     int i = v.size();
    //     int row = it.row();
    //     int col = it.col();
    //     double val = it.value();
    //     // cout << it.value() << endl;
    //     // res->row[i] = 10; //row; //it.row();
    //     // res->col[i] = 11; //col;
    //     res->val[i] = 0.12334; //val;
    //     v.push_back(it.value());
    //   }
    // }

    // // cout << res->row[110] << endl;
    // cout << "Finish" << endl;
  }




  void getField(char *json, Result_Field *res) {
    Document d;
    d.Parse(json);

    Value &uniq  = d["uniq"];
    Value &faces = d["faces"];
    Value &map   = d["map"];
    V.resize(uniq.Size(), 3);
    F.resize(faces.Size(), 3);;

    for (SizeType i=0; i<uniq.Size(); i++) {
      Value &vertex = uniq[i]["vertex"];
      V(i, 0) = vertex["x"].GetDouble();
      V(i, 1) = vertex["y"].GetDouble();
      V(i, 2) = vertex["z"].GetDouble();
    }
    for (SizeType i=0; i<faces.Size(); i++) {
      Value &face = faces[i];
      int a = face["a"].GetInt();
      int b = face["b"].GetInt();
      int c = face["c"].GetInt();
      F(i, 0) = map[a].GetInt();
      F(i, 1) = map[b].GetInt();
      F(i, 2) = map[c].GetInt();
    }
    cout << "Get Laplacian" << endl;
    igl::cotmatrix(V, F, Lp);

    cout << "Compute Cholesky" << endl;

    double w = 1000;
    int n = uniq.Size();
    int p = d["p"].GetInt();
    int q = d["q"].GetInt();
    VectorXd b = VectorXd::Zero(n);
    b(p) = w;

    SparseMatrix<double> G(n, n);
    G.insert(p, p) = w;
    G.insert(q, q) = w;

    Lp = Lp + G;
    SparseLU< SparseMatrix<double> > slu(Lp);
    slu.analyzePattern(Lp);
    slu.factorize(Lp);
    VectorXd phi = slu.solve(b);

    // MatrixXd Ld = Lp;
    // PartialPivLU<MatrixXd> lu(Ld);
    // VectorXd phi = lu.solve(b);

    // cout << phi << endl;
    for (int i=0; i<n; i++) {
      cout << phi(i) << endl;
      res->phi[i] = phi(i);
    }
  }


  void getMapping(char *json, Result_Mapping *res) {
    Document d;
    d.Parse(json);

    Value &uniq  = d["uniq"];
    Value &faces = d["faces"];
    Value &map   = d["map"];
    Value &boundary = d["boundary"];

    V.resize(uniq.Size(), 3);
    F.resize(faces.Size(), 3);;
    N.resize(faces.Size(), 3);;
    bnd.resize(boundary.Size());;

    for (SizeType i=0; i<uniq.Size(); i++) {
      Value &vertex = uniq[i]["vertex"];
      V(i, 0) = vertex["x"].GetDouble();
      V(i, 1) = vertex["y"].GetDouble();
      V(i, 2) = vertex["z"].GetDouble();
    }
    for (SizeType i=0; i<faces.Size(); i++) {
      Value &face = faces[i];
      int a = face["a"].GetInt();
      int b = face["b"].GetInt();
      int c = face["c"].GetInt();
      F(i, 0) = map[a].GetInt();
      F(i, 1) = map[b].GetInt();
      F(i, 2) = map[c].GetInt();

      N(i, 0) = face["normal"]["x"].GetDouble();
      N(i, 1) = face["normal"]["y"].GetDouble();
      N(i, 2) = face["normal"]["z"].GetDouble();
    }
    for (SizeType i=0; i<boundary.Size(); i++) {
      bnd(i) = boundary[i].GetInt();
    }

    MatrixXd bnd_uv;
    igl::map_vertices_to_circle(V, bnd, bnd_uv);
    cout << bnd_uv << endl;
    igl::harmonic(V, F, bnd, bnd_uv, 1, initial_guess);

    // LSCM parametrization
    // VectorXi b(2, 1);
    // b(0) = bnd(0);
    // b(1) = bnd(round(bnd.size()/2));
    // cout << b << endl;
    // MatrixXd bc(2,2);
    // bc<<0,0,1,0;
    // igl::lscm(V, F, b, bc, V_uv);

    V_uv = initial_guess;
    // V_uv *= 0.5;

    cout << "Start ARAP calculation" << endl;
    igl::ARAPData arap_data;
    arap_data.with_dynamics = true;
    VectorXi b  = VectorXi::Zero(0);
    MatrixXd bc = MatrixXd::Zero(0, 0);

    // Initialize ARAP
    arap_data.max_iter = 100;
    // 2 means that we're going to *solve* in 2d
    arap_precomputation(V, F, 2, b, arap_data);
    // Solve arap using the harmonic map as initial guess
    V_uv = initial_guess;
    arap_solve(bc, arap_data, V_uv);
    // Scale UV to make the texture more clear
    V_uv *= 0.5;

    cout << "Get V_uv with ARAP" << endl;
    cout << V_uv << endl;
    int nRow = V_uv.rows();
    int nCol = V_uv.cols();
    res->uv = new double[nRow * nCol];
    for (int i=0; i<nRow; i++) {
      for (int j=0; j<nCol; j++) {
        double val = V_uv(i, j) + 0.5;
        res->uv[nCol * i + j] = val;
      }
    }
  }

}

