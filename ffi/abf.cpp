#include <iostream>
#include <Eigen/Dense>
#include <Eigen/Sparse>

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
    SparseMatrix<double> Flag(V, 3*T);
    SparseMatrix<double> Lambda(3*T, 3*T);
    SparseMatrix<double> Lambda_inv(3*T, 3*T);
    SparseMatrix<double> J_1(T, 3*T);
    SparseMatrix<double> J_2(2*V, 3*T);

    for (SizeType i=0; i<V; i++) {
      Value &vertex = uniq[i]["vertex"];
      VI(i*3 + 0) = vertex["x"].GetDouble();
      VI(i*3 + 1) = vertex["y"].GetDouble();
      VI(i*3 + 2) = vertex["z"].GetDouble();

      // Compute A
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

      // Compute initial J_2
      Value &currentFaces = uniq[i]["faces"];
      for (SizeType j=0; j<currentFaces.Size(); j++) {
        int faceIndex = currentFaces[j].GetInt();
        Value &face = faces[faceIndex];
        int a = face["a"].GetInt();
        int b = face["b"].GetInt();
        int c = face["c"].GetInt();
        int ua = map[a].GetInt();
        int ub = map[b].GetInt();
        int uc = map[c].GetInt();
        if (uniq[i]["id"] == ua) {
          J_2.insert(i, 3*faceIndex + 0) = 1;
        }
        if (uniq[i]["id"] == ub) {
          J_2.insert(i, 3*faceIndex + 1) = 1;
        }
        if (uniq[i]["id"] == uc) {
          J_2.insert(i, 3*faceIndex + 2) = 1;
        }
      }

      // Compute Flag
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
        Flag.insert(i, 3*index + i1) = 1;
        Flag.insert(i, 3*index + i2) = -1;
        ei = ni;
      }
    }

    VectorXf FI(3*T);
    VectorXf FN(3*T);
    VectorXf beta(3*T);
    VectorXf w(3*T);
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
        Lambda.insert(3*i + j, 3*i + j) = (double) 2/w_ij;
        Lambda_inv.insert(3*i + j, 3*i + j) = (double) w_ij / 2;
        J_1.insert(i, 3*i + j) = 1;
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

    VectorXf x = beta; // (2*V + T);
    x = VectorXf::Ones(3*T);
    double delta_F = 100;
    double epsilon = pow(10.0, -2.0);

    SparseMatrix<double> J(T + 2*V, 3*T);
    VectorXf lambda = VectorXf::Ones(T + 2*V);

    for (int k=0; k<J_1.outerSize(); ++k) {
      for (SparseMatrix<double>::InnerIterator it(J_1, k); it; ++it) {
        int val = it.value();
        int row = it.row();
        int col = it.col();
        J.insert(row, col) = val;
      }
    }
    for (int k=0; k<J_2.outerSize(); ++k) {
      for (SparseMatrix<double>::InnerIterator it(J_2, k); it; ++it) {
        int val = it.value();
        int row = it.row();
        int col = it.col();
        J.insert(T + row, col) = val;
      }
    }


    int hoge = 0;
    while (delta_F > epsilon) {
      hoge += 1;
      cout << hoge << endl;

      VectorXf b_1 = VectorXf::Zero(3*T);
      VectorXf b_2 = VectorXf::Zero(T + 2*V);

      VectorXf lambda_1 = lambda.segment(0, T);
      VectorXf lambda_2 = lambda.segment(T, V);
      VectorXf lambda_3 = lambda.segment(T+V, V);

      // Update b_1
      for (int i=0; i<3*T; i++) {
        double E = (double) 2 * x(i) / w(i);
        Value &face = faces[i/3];
        int a = face["a"].GetInt();
        int b = face["b"].GetInt();
        int c = face["c"].GetInt();
        int vi;
        if (i % 3 == 0) vi = map[a].GetInt();
        if (i % 3 == 1) vi = map[b].GetInt();
        if (i % 3 == 2) vi = map[c].GetInt();
        double C_1 = lambda_1(vi);
        double C_2 = lambda_2(vi);

        double sum = 0;
        double C_3 = 0;
        for (int k=0; k<Flag.outerSize(); ++k) {
          for (SparseMatrix<double>::InnerIterator it(Flag, k); it; ++it) {
            int flag = it.value();
            int row = it.row();
            int col = it.col();
            C_3 += (flag * lambda_3[row]);
          }
        }
        C_3 *= cos(x(i));
        // C_3 = 0;
        b_1(i) = - (E + C_1 + C_2 + C_3);
        // b_1(i) = 0.00001;
      }

      // Update b_2
      for (int i=0; i<T; i++) {
        b_2(i) = - (x(3*i) + x(3*i + 1) + x(3*i + 2) - M_PI);
      }

      for (int i=0; i<V; i++) {
        int id = uniq[i]["id"].GetInt();
        Value &currentFaces = uniq[i]["faces"];
        for (SizeType j=0; j<currentFaces.Size(); j++) {
          int faceIndex = currentFaces[j].GetInt();
          Value &face = faces[faceIndex];
          int a = face["a"].GetInt();
          int b = face["b"].GetInt();
          int c = face["c"].GetInt();
          int k;
          if (id == map[a].GetInt()) k = 0;
          if (id == map[b].GetInt()) k = 1;
          if (id == map[c].GetInt()) k = 2;
          b_2(T + i) -= x(3*faceIndex + k);
        }
        b_2(T + i) += (2 * M_PI);
        // b_2(T + i) = 0.00001;//(2 * M_PI);
      }

      for (int k=0; k<Flag.outerSize(); ++k) {
        for (SparseMatrix<double>::InnerIterator it(Flag, k); it; ++it) {
          int flag = it.value();
          int row = it.row();
          int col = it.col();
          b_2(T + V + row) -= flag * sin(x(col));
        }
      }
      // cout << b_2 << endl;
      // break;

      // Update J_2
      // Flag(V, 3*T)
      // J_2(2*V, 3*T)
      // J(T + 2*V, 3*T)
      for (int k=0; k<Flag.outerSize(); ++k) {
        for (SparseMatrix<double>::InnerIterator it(Flag, k); it; ++it) {
          int flag = it.value();
          int row = it.row();
          int col = it.col();
          double val = flag * cos(x(col));
          J_2.coeffRef(V + row, col) = val;
          J.coeffRef(T + V + row, col) = val;
        }
      }

      MatrixXf Ld = Lambda_inv;
      MatrixXf Jd = J;
      MatrixXf Ad = Jd * Ld * Jd.transpose();
      VectorXf b_star = (Jd * Ld) * b_1 - b_2;
      VectorXf delta_lambda = Ad.inverse() * b_star;
      // VectorXf delta_lambda = Ad.inverse() * b_star;
      // cout << Ad.sparseView() << endl;
      cout << "===" << endl;
      cout << delta_lambda << endl;

      // if (hoge >1) break;



      VectorXf delta_x = Ld * ( b_1 - Jd.transpose() * delta_lambda );
      // SparseVector<double> b_1s = b_1.sparseView();
      // SparseVector<double> b_2s = b_2.sparseView();
      // SparseVector<double> b_stars = (J * Lambda_inv) * b_1s - b_2s;
      // SparseMatrix<double> A = J * Lambda_inv * J.transpose();
      // SimplicialLLT<SparseMatrix<double> > solver;
      // solver.compute(A);
      // cout << solver.solve(b_stars) << endl;

      // SparseVector<double> delta_lambda = solver.solve(b_star).sparseView();
      // SparseVector<double> delta_x = Lambda_inv * b_1s; // - J.transpose() * delta_lambda );

      lambda += delta_lambda;
      x += delta_x;
      delta_F = sqrt( b_1.dot(b_1) + b_2.dot(b_2) );
      cout << "------" << endl;
      cout << delta_F << endl;
      cout << "------" << endl;
    }


    // cout << *(res->array) << endl;
  }



}

