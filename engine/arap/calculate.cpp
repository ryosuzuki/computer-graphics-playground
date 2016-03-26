#include <iostream>
#include <limits>
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

#include <igl/polyvector_field_cut_mesh_with_singularities.h>
#include <igl/dijkstra.h>
#include <igl/adjacency_list.h>


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

  typedef struct {
    double *cuts;
  } Result_Boundary;


  int minDistance(int V, int dist[], bool sptSet[]) {
    int min = INT_MAX, min_index;

    for (int v = 0; v < V; v++)
      if (sptSet[v] == false && dist[v] <= min)
        min = dist[v], min_index = v;

    return min_index;
  }

  void dijkstra(MatrixXd Graph, int src) {
    int V = Graph.rows();
    int dist[V];
    bool sptSet[V];
    for (int i = 0; i < V; i++) {
      dist[i] = INT_MAX, sptSet[i] = false;
    }
    dist[src] = 0;
    for (int count = 0; count < V-1; count++) {
      int u = minDistance(V, dist, sptSet);
      sptSet[u] = true;
      for (int v = 0; v < V; v++) {
        if (!sptSet[v] && Graph(u, v) && dist[u] != INT_MAX
            && dist[u] + Graph(u, v) < dist[v])
          dist[v] = dist[u] + Graph(u, v);
      }
    }
    cout << dist << endl;

    cout <<"Vertex   Distance from Source" << endl;
    for (int i = 0; i < V; i++) {
      if (dist[i] > 0)
        printf("%d \t\t %d\n", i, dist[i]);
    }

  }

  void getBoundary(char *json, Result_Boundary *res) {
    Document d;
    d.Parse(json);

    Value &uniq  = d["uniq"];
    Value &faces = d["faces"];
    Value &map   = d["map"];
    Value &edge_map = d["edge_map"];
    Value &boundary = d["boundary"];

    cout << "C++: Start getBoundary" << endl;

    V.resize(uniq.Size(), 3);
    F.resize(faces.Size(), 3);;

    MatrixXd E;
    E.resize(uniq.Size(), uniq.Size());

    VectorXi singularities;
    singularities.resize(boundary.Size());;

    for (SizeType i=0; i<uniq.Size(); i++) {
      Value &vertex = uniq[i]["vertex"];
      V(i, 0) = vertex["x"].GetDouble();
      V(i, 1) = vertex["y"].GetDouble();
      V(i, 2) = vertex["z"].GetDouble();

      Value &edges = edge_map[i];
      for (SizeType j=0; j<edges.Size(); j++) {
        int id = edges[j]["id"].GetInt();
        double dist = edges[j]["dist"].GetDouble();
        E(i, id) = dist;
      }
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

    VectorXi bnd;
    bnd.resize(boundary.Size());;
    MatrixXd Graph;
    Graph.resize(boundary.Size(), boundary.Size());


    vector<vector<int> > VV;
    igl::adjacency_list(F, VV);


    std::set<int> targets;
    for (int i =0; i<bnd.rows(); i++) {
      targets.insert(bnd(i));
    }
    vector<int> path;
    VectorXd min_distance;
    VectorXi previous;
    int i = 0;
    int vertex_found = igl::dijkstra_compute_paths(bnd[i], targets, VV, min_distance, previous);
    if(vertex_found ==-1) {
      path.push_back(singularities[i]);
    } else {
      igl::dijkstra_get_shortest_path_to(vertex_found, previous, path);
    }

    cout << min_distance << endl;
    for (int ii = 0; ii<path.size()-1; ii++) {
      const int &v0 = path[ii];
      const int &v1 = path[ii+1];
    }

    // for (SizeType i=0; i<boundary.Size(); i++) {
    //   int id_i = boundary[i].GetInt();
    //   bnd(i) = id_i;
    //   for (SizeType j=0; j<boundary.Size(); j++) {
    //     int id_j = boundary[j].GetInt();


    //     // double dist = dijkstra_dist(id_i, id_j);
    //     // Graph(i, j) = dist;
    //   }
    // }
    // cout << E << endl;
    // dijkstra(E, 0);
  }


  void getBoundary2(char *json, Result_Boundary *res) {
    Document d;
    d.Parse(json);

    Value &uniq  = d["uniq"];
    Value &faces = d["faces"];
    Value &map   = d["map"];
    Value &boundary = d["boundary"];

    V.resize(uniq.Size(), 3);
    F.resize(faces.Size(), 3);;

    VectorXi singularities;
    singularities.resize(boundary.Size());;

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
    for (SizeType i=0; i<boundary.Size(); i++) {
      singularities(i) = boundary[i].GetInt();
    }

    MatrixXi cuts;
    igl::polyvector_field_cut_mesh_with_singularities(V, F, singularities, cuts);
    cout << cuts << endl;
    cout << cuts.rows() << endl;

    int nRow = cuts.rows();
    int nCol = cuts.cols();
    res->cuts = new double[nRow * nCol];
    for (int i=0; i<nRow; i++) {
      for (int j=0; j<nCol; j++) {
        int val = cuts(i, j);
        res->cuts[nCol * i + j] = val;
      }
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
    /*
    bnd.resize(boundary.Size());;
    for (SizeType i=0; i<boundary.Size(); i++) {
      bnd(i) = boundary[i].GetInt();
    }
    */

    Eigen::VectorXi bnd;
    igl::boundary_loop(F, bnd);

    MatrixXd bnd_uv;
    igl::map_vertices_to_circle(V, bnd, bnd_uv);

    cout << bnd_uv << endl;

    igl::harmonic(V, F, bnd, bnd_uv, 1, initial_guess);
    V_uv = initial_guess;

    // // LSCM parametrization
    // VectorXi bm(2, 1);
    // bm(0) = bnd(0);
    // bm(1) = bnd(round(bnd.size()/2));
    // cout << bm << endl;
    // MatrixXd bcm(2,2);
    // bcm<<0,0,1,0;
    // igl::lscm(V, F, bm, bcm, V_uv);

    // V_uv *= 0.5;


    cout << "Start ARAP calculation" << endl;
    igl::ARAPData arap_data;
    arap_data.with_dynamics = true;
    VectorXi b  = VectorXi::Zero(0);
    MatrixXd bc = MatrixXd::Zero(0, 0);

    arap_data.max_iter = 100;
    arap_precomputation(V, F, 2, b, arap_data);
    // V_uv = initial_guess;
    arap_solve(bc, arap_data, V_uv);

    // Scale UV to make the texture more clear
    MatrixXd I = MatrixXd::Ones(V_uv.rows(), V_uv.cols());
    V_uv *= 0.5;
    V_uv = V_uv + 0.5 * I;


    cout << "Get V_uv with ARAP" << endl;
    cout << V_uv << endl;
    int nRow = V_uv.rows();
    int nCol = V_uv.cols();
    res->uv = new double[nRow * nCol];
    for (int i=0; i<nRow; i++) {
      for (int j=0; j<nCol; j++) {
        double val = V_uv(i, j);
        res->uv[nCol * i + j] = val;
      }
    }
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


}

