#include <igl/avg_edge_length.h>
#include <igl/barycenter.h>
#include <igl/frame_field_deformer.h>
#include <igl/frame_to_cross_field.h>
#include <igl/jet.h>
#include <igl/local_basis.h>
#include <igl/readDMAT.h>
#include <igl/readOBJ.h>
#include <igl/rotate_vectors.h>
#include <igl/comiso/nrosy.h>
#include <igl/comiso/miq.h>
#include <igl/comiso/frame_field.h>


// Input mesh
Eigen::MatrixXd V;
Eigen::MatrixXi F;

// Face barycenters
Eigen::MatrixXd B;

// Scale for visualizing the fields
double global_scale;

// Input frame field constraints
Eigen::VectorXi b;
Eigen::MatrixXd bc1;
Eigen::MatrixXd bc2;

// Interpolated frame field
Eigen::MatrixXd FF1, FF2;

// Deformed mesh
Eigen::MatrixXd V_deformed;
Eigen::MatrixXd B_deformed;

// Frame field on deformed
Eigen::MatrixXd FF1_deformed;
Eigen::MatrixXd FF2_deformed;

// Cross field on deformed
Eigen::MatrixXd X1_deformed;
Eigen::MatrixXd X2_deformed;

// Global parametrization
Eigen::MatrixXd V_uv;
Eigen::MatrixXi F_uv;


int main(int argc, char *argv[])
{
  using namespace Eigen;

  // Load a mesh in OBJ format
  igl::readOBJ("./armadillo.obj", V, F);

  // Compute face barycenters
  igl::barycenter(V, F, B);

  // Compute scale for visualizing fields
  global_scale =  .2*igl::avg_edge_length(V, F);

  // Load constraints
  MatrixXd temp;
  igl::readDMAT("./bumpy-cube.dmat",temp);

  b   = temp.block(0,0,temp.rows(),1).cast<int>();
  bc1 = temp.block(0,1,temp.rows(),3);
  bc2 = temp.block(0,4,temp.rows(),3);

  // Interpolate the frame field
  igl::comiso::frame_field(V, F, b, bc1, bc2, FF1, FF2);

  // Deform the mesh to transform the frame field in a cross field
  igl::frame_field_deformer(
    V,F,FF1,FF2,V_deformed,FF1_deformed,FF2_deformed);

  // Compute face barycenters deformed mesh
  igl::barycenter(V_deformed, F, B_deformed);

  // Find the closest crossfield to the deformed frame field
  igl::frame_to_cross_field(V_deformed,F,FF1_deformed,FF2_deformed,X1_deformed);

  // Find a smooth crossfield that interpolates the deformed constraints
  MatrixXd bc_x(b.size(),3);
  for (unsigned i=0; i<b.size();++i)
    bc_x.row(i) = X1_deformed.row(b(i));

  VectorXd S;
  igl::comiso::nrosy(
             V,
             F,
             b,
             bc_x,
             VectorXi(),
             VectorXd(),
             MatrixXd(),
             4,
             0.5,
             X1_deformed,
             S);

  // The other representative of the cross field is simply rotated by 90 degrees
  MatrixXd B1,B2,B3;
  igl::local_basis(V_deformed,F,B1,B2,B3);
  X2_deformed =
    igl::rotate_vectors(X1_deformed, VectorXd::Constant(1,M_PI/2), B1, B2);

  // Global seamless parametrization
  igl::comiso::miq(V_deformed,
           F,
           X1_deformed,
           X2_deformed,
           V_uv,
           F_uv,
           60.0,
           5.0,
           false,
           2);

}