#include <iostream>
#include <Eigen/Dense>
#include <Eigen/SparseCore>

#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"

#include <math.h>

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

    Value &uniq  = d["uniq"];
    Value &faces = d["faces"];
    Value &map   = d["map"];

    int T = faces.Size();
    int V = uniq.Size();
    VectorXf VI(3*T);
    MatrixXf A = MatrixXf::Zero(V, V);
    MatrixXf Flag = MatrixXf::Zero(V, 3*T);
    for (SizeType i=0; i<V; i++) {
      Value &vertex = uniq[i]["vertex"];
      VI(i*3 + 0) = vertex["x"].GetDouble();
      VI(i*3 + 1) = vertex["y"].GetDouble();
      VI(i*3 + 2) = vertex["z"].GetDouble();

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
      Value &origin = uniq[i];
      vector<int> oFaces;
      for (SizeType j=0; j<origin["faces"].Size(); j++) {
        oFaces.push_back(origin["faces"][j].GetInt());
      }
      sort(oFaces.begin(), oFaces.end());
      int ei = origin["edges"][0].GetInt();
      vector<int> checked;
      while (true) {
        Value &current = uniq[ei];
        vector<int> cFaces;
        for (SizeType j=0; j<current["faces"].Size(); j++) {
          cFaces.push_back(current["faces"][j].GetInt());
        }
        sort(cFaces.begin(), cFaces.end());
        vector<int> common;
        std::set_intersection(
          oFaces.begin(), oFaces.end(),
          cFaces.begin(), cFaces.end(),
          std::back_inserter(common)
        );
        sort(common.begin(), common.end());
        sort(checked.begin(), checked.end());
        vector<int> difference;
        std::set_difference(
          common.begin(), common.end(),
          checked.begin(), checked.end(),
          std::back_inserter(difference)
        );
        if (difference.empty()) break;
        int index = difference[0];
        checked.push_back(index);

        Value& face = faces[index];
        int a = face["a"].GetInt();
        int b = face["b"].GetInt();
        int c = face["c"].GetInt();
        int ua = map[a].GetInt();
        int ub = map[b].GetInt();
        int uc = map[c].GetInt();
        int i0, i1, i2, ni;
        int oId = origin["id"].GetInt();
        int cId = current["id"].GetInt();
        if (oId == ua && cId == ub) {
          i0 = 0; i1 = 1; i2 = 2; ni = uc;
        }
        if (oId == ua && cId == uc) {
          i0 = 0; i1 = 2; i2 = 1; ni = ub;
        }
        if (oId == ub && cId == ua) {
          i0 = 1; i1 = 0; i2 = 2; ni = uc;
        }
        if (oId == ub && cId == uc) {
          i0 = 1; i1 = 2; i2 = 0; ni = ua;
        }
        if (oId == uc && cId == ua) {
          i0 = 2; i1 = 0; i2 = 1; ni = ub;
        }
        if (oId == uc && cId == ub) {
          i0 = 2; i1 = 1; i2 = 0; ni = ua;
        }
        Flag(i, 3*index + i1) = 1;
        Flag(i, 3*index + i2) = -1;
        ei = ni;
      }
    }
    cout << Flag << endl;

    VectorXf FI(3*T);
    VectorXf FN(3*T);
    VectorXf beta(3*T);
    VectorXf w(3*T);

    MatrixXf Lambda = MatrixXf::Zero(3*T, 3*T);
    MatrixXf J_1 = MatrixXf::Zero(T, 3*T);
    MatrixXf J_2 = MatrixXf::Zero(2*V, 3*T);

    for (SizeType i=0; i<T; i++) {
      int a = faces[i]["a"].GetInt();
      int b = faces[i]["b"].GetInt();
      int c = faces[i]["c"].GetInt();
      FI(3*i + 0) = a;
      FI(3*i + 1) = b;
      FI(3*i + 2) = c;

      Vector3f va(VI(a + 0), VI(a + 1), VI(a + 2));
      Vector3f vb(VI(b + 0), VI(b + 1), VI(b + 2));
      Vector3f vc(VI(c + 0), VI(c + 1), VI(c + 2));
      Vector3f *vertices[3] = { &va, &vb, &vc };
      for (int j=0; j<3; j++) {
        int k = (j + 1) % 3;
        int l = (j + 2) % 3;
        Vector3f vj = *vertices[j];
        Vector3f vk = *vertices[k];
        Vector3f vl = *vertices[l];

        Vector3f vjk = (vk - vj).normalized();
        Vector3f vjl = (vl - vj).normalized();
        double cos_ij = vjk.dot(vjl);
        double beta_ij = acos(cos_ij);
        double w_ij = (double) 1/(beta_ij*beta_ij);
        beta(3*i + j) = beta_ij;
        w(3*i + j) = w_ij;
        Lambda(3*i + j) = (double) 2/w_ij;
        J_1(i, 3*i + j) = 1;
      }

      Value &normal = faces[i]["normal"];
      FN(3*i + 0) = normal["x"].GetDouble();
      FN(3*i + 1) = normal["y"].GetDouble();
      FN(3*i + 2) = normal["z"].GetDouble();


    }

    LLT <MatrixXf> lltOfA(A);
    MatrixXf L = lltOfA.matrixL();
    MatrixXf LL = L * L.transpose();

    VectorXf b = VectorXf::Zero(V);
    MatrixXf GG = MatrixXf::Zero(V, V);
    int p = 0;
    int q = V-1;
    int weight = 1000;
    b(p) = weight;
    GG(p, p) = weight*weight;
    GG(q, q) = weight*weight;

    MatrixXf M = LL + GG;
    LLT <MatrixXf> llt;
    llt.compute(M);
    VectorXf phi = llt.solve(b);

    int n = V;
    res->array = new double[V];
    for (int i=0; i<V; i++) {
      res->array[i] = phi[i];
    }
    // cout << *(res->array) << endl;
  }

}

