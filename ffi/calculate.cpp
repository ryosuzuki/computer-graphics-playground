#include <iostream>
#include <Eigen/Core>
#include <Eigen/Dense>
#include <Eigen/SparseCore>
#include <Eigen/LU>

#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"

using namespace std;
using namespace Eigen;
using namespace rapidjson;

extern "C" {

typedef void(*NodeCallback)(int);


  typedef struct {
    double *array;
  } result;

  void parseJSON(char *json, result *res) {
    Document d;
    d.Parse(json);

    Value &uniq = d["uniq"];
    Value &faces = d["faces"];

    int T = faces.Size();
    VectorXf FI(3*T);
    VectorXf FN(3*T);
    for (SizeType i=0; i<T; i++) {
      FI(i*3 + 0) = faces[i]["a"].GetInt();
      FI(i*3 + 1) = faces[i]["b"].GetInt();
      FI(i*3 + 2) = faces[i]["c"].GetInt();

      FN(i*3 + 0) = faces[i]["normal"]["x"].GetDouble();
      FN(i*3 + 1) = faces[i]["normal"]["y"].GetDouble();
      FN(i*3 + 2) = faces[i]["normal"]["z"].GetDouble();
    }

    int V = uniq.Size();
    VectorXf VI(3*T);
    MatrixXf A = MatrixXf::Zero(V, V);
    for (SizeType i=0; i<V; i++) {
      VI(i*3 + 0) = uniq[i]["vertex"]["x"].GetDouble();
      VI(i*3 + 1) = uniq[i]["vertex"]["y"].GetDouble();
      VI(i*3 + 2) = uniq[i]["vertex"]["z"].GetDouble();

      Value &edges = uniq[i]["edges"];
      int n = edges.Size();
      for (SizeType j=0; j<n; j++) {
        int e = edges[j].GetInt();
        if (i == e) {
          A(i, e) = 1;
        } else {
          double d = (double) 1/n;
          A(i, e) = -d;
        }
      }
    }

    LLT <MatrixXf> lltOfA(A);
    MatrixXf L = lltOfA.matrixL();
    MatrixXf LL = L * L.transpose();

    VectorXf b = VectorXf::Zero(V);
    MatrixXf GG = MatrixXf::Zero(V, V);
    int p = 0;
    int q = V-1;
    int w = 1000;
    b(p) = w;
    GG(p, p) = w*w;
    GG(q, q) = w*w;

    MatrixXf M = LL + GG;
    LLT <MatrixXf> llt;
    llt.compute(M);
    VectorXf phi = llt.solve(b);

    int n = V;
    res->array = new double[V];
    for (int i=0; i<V; i++) {
      res->array[i] = phi[i];
    }
    cout << *(res->array) << endl;
  }

}

