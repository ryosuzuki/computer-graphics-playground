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

