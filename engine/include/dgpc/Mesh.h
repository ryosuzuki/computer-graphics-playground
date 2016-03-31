/************************************************************
 * This file is part of the DGPC library. The library computes
 * Discrete Geodesic Polar Coordinates on a polygonal mesh.
 *
 * More info:
 *   http://folk.uio.no/eivindlm/dgpc/
 *
 * Authors: Eivind Lyche Melvær and Martin Reimers
 * Centre of Mathematics and Department of Informatics
 * University of Oslo, Norway, 2012
 ************************************************************/
#ifndef DGPC_MESH_H
#define DGPC_MESH_H

#include <limits>
#include <fstream>

#include <OpenMesh/Core/Mesh/PolyMesh_ArrayKernelT.hh>

#include "Vector3.h"

#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"

using namespace std;
using namespace rapidjson;

namespace DGPC {

  template<class P>
  struct OpenMeshTraits : OpenMesh::DefaultTraits {
    typedef P Point;
  };

  template<class Point>
    class MeshOM : public OpenMesh::PolyMesh_ArrayKernelT< OpenMeshTraits<Point> > {
  public:
    typedef Point point_type;

    bool openOBJ(char* json) {
      int maxpoly = 0;

      Document d;
      d.Parse(json);

      Value &uniq  = d["uniq"];
      Value &faces = d["faces"];
      Value &map   = d["map"];

      for (SizeType i=0; i<uniq.Size(); i++) {
        typename point_type::value_type x, y, z;
        Value &vertex = uniq[i]["vertex"];
        x = vertex["x"].GetDouble();
        y = vertex["y"].GetDouble();
        z = vertex["z"].GetDouble();
        this->add_vertex(Point(x, y, z));
      }

      for (SizeType i=0; i<faces.Size(); i++) {
        vector< typename MeshOM<Point>::VertexHandle > face;

        Value &f = faces[i];
        int a = f["a"].GetInt();
        int b = f["b"].GetInt();
        int c = f["c"].GetInt();
        int va = map[a].GetInt();
        int vb = map[b].GetInt();
        int vc = map[c].GetInt();
        face.push_back( this->vertex_handle(va) );
        face.push_back( this->vertex_handle(vb) );
        face.push_back( this->vertex_handle(vc) );

        this->add_face(face);
        int poly = face.size();
        if(poly > maxpoly) maxpoly = poly;
      }

      const int nv = this->n_vertices();
      const int nf = this->n_faces();
      printf("Geometry Info: %d vertices and %d faces (most complex face has %d nodes)\n", nv, nf, maxpoly);

      return true;
    }
  };

} //end namespace DGPC

#endif //DGPC_MESH_H
