#include <iostream>
#include <limits>
#include <Eigen/Dense>
#include <Eigen/Sparse>

#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"

#include <igl/readOBJ.h>
#include <igl/cotmatrix.h>

using namespace std;
using namespace Eigen;
using namespace rapidjson;

MatrixXd V;
MatrixXi F;
MatrixXd N;

MatrixXd initial_guess;
SparseMatrix<double> Lp;

extern "C" {
  typedef struct {
    double *phi;
  } Result_Field;

  void getHarmonicField(char *json, Result_Field *res) {
    Document d;
    d.Parse(json);

    cout << "Get Laplacian" << endl;
    const char *filename = d["filename"].GetString();
    igl::readOBJ(filename, V, F);
    igl::cotmatrix(V, F, Lp);

    cout << "Compute Harmonic Field" << endl;
    Value &q_edges = d["p_edges"];
    Value &p_edges = d["q_edges"];

    int n = V.rows();
    double w = 1000;
    VectorXd b = VectorXd::Zero(n);
    SparseMatrix<double> G(n, n);
    for (SizeType i=0; i<p_edges.Size(); i++) {
      int p = p_edges[i].GetInt();
      int q = q_edges[i].GetInt();
      b(p) = w;
      G.coeffRef(p, p) = w;
      G.coeffRef(q, q) = w;
    }

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

}

