#include <iostream>
#include <Eigen/Dense>
#include <Eigen/Sparse>

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


using namespace std;
using namespace Eigen;
using namespace rapidjson;

MatrixXd V;
MatrixXi F;
MatrixXd N;
MatrixXd V_uv;
VectorXi bnd;

MatrixXd initial_guess;
SparseMatrix<double> L;

extern "C" {
  typedef struct {
    int size;
    int count;
    int *row;
    int *col;
    double *val;
  } laplacianResult;

  typedef struct {
    double *uv;
  } mappingResult;

  void getLaplacian(char *json, laplacianResult *res) {
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
    igl::cotmatrix(V, F, L);
    // L.makeCompressed();
    // SimplicialLDLT< SparseMatrix<double> > ldl(L);
    // SparseMatrix<double> LD = ldl.matrixL();

    cout << "Get Cholesky" << endl;
    // LDLT<MatrixXd> chol(Ld);
    // MatrixXd LU = chol.matrixL();

    MatrixXd Ld = L;

    PartialPivLU<MatrixXd> lu(Ld);
    int r;
    MatrixXd P, Lp, Ltmp, U;
    P = lu.permutationP();
    lu.matrixLU();
    r = std::max(Ld.rows(), Ld.cols());
    U = lu.matrixLU().triangularView<Upper>();
    Ltmp = MatrixXd::Identity(r, r);
    Ltmp.block(0, 0 ,Ld.rows(), Ld.cols()).triangularView<StrictlyLower>() = lu.matrixLU();
    Lp = Ltmp.block(0, 0, P.cols(), U.rows());
    // cout << P.inverse() * Lp * U << endl;
    cout << P.inverse() << endl;

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


    // MatrixXd LU = LD;
    cout << Ld.rows() << endl;
    cout << Ld.cols() << endl;
    // Performs a Cholesky factorization of A
    // SimplicialCholesky<SparseMatrix<double>> chol(L);

    // cout << LU * LU.transpose() << endl;

    int size = Ld.rows();
    res->size = size;
    res->row = new int[L.nonZeros()];
    res->col = new int[L.nonZeros()];
    res->val = new double[L.nonZeros()];
    int index = 0;
    double epsilon = pow(10, -10);
    for (int col=0; col<Ld.cols(); col++) {
      for (int row=0; row<Ld.rows(); row++) {
        if (abs(Ld(row, col)) < epsilon) continue;
        res->col[index] = col;
        res->row[index] = row;
        res->val[index] = Ld(row, col);
        index++;
      }
    }
    int count = index;
    res->count = count;

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

  void getMapping(char *json, mappingResult *res) {
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

