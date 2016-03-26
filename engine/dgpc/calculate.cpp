#include <iostream>

#include <iostream>
#include <limits>

#include "Generator.h"
#include "Mesh.h"

#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"

using namespace std;
using namespace rapidjson;

extern "C" {
  typedef struct {
    int n;
    int *id;
    double *r;
    double *theta;
  } Result_Mapping;

  typedef DGPC::Vector3<double> Point;
  typedef DGPC::MeshOM<Point> Mesh;
  typedef DGPC::Generator<Mesh> DGPCgenerator;

  void getMapping(char *filename, int start, Result_Mapping *res) {

    double stopdist = -1;
    double epsilon = -1;

    Mesh my_mesh;
    my_mesh.openOBJ(filename);


    //Make a DGPC generator
    DGPCgenerator my_dgpc(my_mesh);

    //Set options
    if(stopdist > 0)
      my_dgpc.setStopDist(stopdist);

    if(epsilon > 0)
      my_dgpc.setEps(epsilon);

    //Set source node
    my_dgpc.setNodeSource(start);

    //Optionally, the library also supports to set the source point:
    //Point p = Point(0,0,0);  //R3 coordinate of source
    //int face_idx = 0;                 //Face index of mesh where point lies
    //my_dgpc.setSource(point, face_idx);

    //Compute DGPC
    int last_node = my_dgpc.run();

    //Fetch and print result
    // cout << "Computed distances until node " << last_node << endl;
    // cout << endl;
    // cout << "i      r      theta" << endl;
    // cout << "-------------------" << endl;
    int n = my_mesh.n_vertices();
    res->id = new int[n];
    res->r = new double[n];
    res->theta = new double[n];
    int count = 0;
    for(int i = 0; i < n; i++) {
      const double r = my_dgpc.getDistance(i);
      if(r < numeric_limits<double>::max()) {
        const double theta = my_dgpc.getAngle(i);
        res->id[i] = i;
        res->r[i] = r;
        res->theta[i] = theta;
        // cout << i << "    " << r << "    "<< theta << endl;
        count++;
      }
    }
    res->n = count;

  }

}

/*
typedef DGPC::Vector3<double> Point;
typedef DGPC::MeshOM<Point> Mesh;
typedef DGPC::Generator<Mesh> DGPCgenerator;

Document d;
d.Parse(json);
Value &start  = d["start"];
int source_idx = start.GetInt();

Mesh my_mesh;
my_mesh.openOBJ(json);
*/
