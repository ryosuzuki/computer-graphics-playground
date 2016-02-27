#include <iostream>
#include <armadillo>
#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"

using namespace std;
using namespace arma;
using namespace rapidjson;

extern "C" {

typedef void(*NodeCallback)(int);

  int parseJSON(char *json) {
    Document d;
    d.Parse(json);

    Value &uniq = d["uniq"];
    Value &faces = d["faces"];

    int T = faces.Size();
    vec FI = zeros<vec>(3*T);
    vec FN = zeros<vec>(3*T);
    for (SizeType i=0; i<T; i++) {
      FI(i*3 + 0) = faces[i]["a"].GetInt();
      FI(i*3 + 1) = faces[i]["b"].GetInt();
      FI(i*3 + 2) = faces[i]["c"].GetInt();

      FN(i*3 + 0) = faces[i]["normal"]["x"].GetDouble();
      FN(i*3 + 1) = faces[i]["normal"]["y"].GetDouble();
      FN(i*3 + 2) = faces[i]["normal"]["z"].GetDouble();
    }

    int V = uniq.Size();
    vec VI = zeros<vec>(3*V);
    mat A = zeros<mat>(V, V);

    for (SizeType i=0; i<V; i++) {
      VI(i*3 + 0) = uniq[i]["vertex"]["x"].GetDouble();
      VI(i*3 + 1) = uniq[i]["vertex"]["y"].GetDouble();
      VI(i*3 + 2) = uniq[i]["vertex"]["z"].GetDouble();

      Value &edges = uniq[i]["edges"];
      int n = edges.Size();
      for (SizeType j=0; j<n; j++) {
        if (i == j) {
          A(i, j) = 1;
        } else {
          double d = (double) 1/n;
          A(i, j) = -d;
        }
      }
    }

    mat L, U, P;
    lu(L, U, P, A);
    cout << L.t() << endl;

    vec b = zeros<vec>(V);
    mat G = zeros<mat>(V, V);

    int p = 0;
    int q = V-1;
    int w = 1000;
    b(p) = w;
    G(p, p) = w*w;
    G(q, q) = w*w;




    return 0;
  }

  int *createMatrix(int uniq[], int faces[], int edges[][20]) {
    int n = sizeof(*uniq);
    int w = 1000;

    const char* json = "{\"project\":\"rapidjson\",\"stars\":10}";
    Document d;
    d.Parse(json);

    Value& s = d["stars"];

    StringBuffer buffer;
    Writer<StringBuffer> writer(buffer);
    d.Accept(writer);

    cout << buffer.GetString() << endl;

    sp_mat L = zeros<sp_mat>(n, n);
    int p = 0;
    int q = n-1;
    sp_mat b = zeros<sp_mat>(1, n);
    b(0, p) = w;
    sp_mat G = zeros<sp_mat>(n, n);
    G(p, p) = w*w;
    G(q, q) = w*w;

    cout << G.t() << endl;
    cout << edges[0] << endl;


    return edges[0];
  }

}

