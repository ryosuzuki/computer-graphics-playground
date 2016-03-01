#include <igl/avg_edge_length.h>
#include <igl/barycenter.h>
#include <igl/local_basis.h>
#include <igl/readOFF.h>
#include <igl/comiso/nrosy.h>

// Mesh
Eigen::MatrixXd V;
Eigen::MatrixXi F;

// Constrained faces id
Eigen::VectorXi b;

// Cosntrained faces representative vector
Eigen::MatrixXd bc;

// Degree of the N-RoSy field
int N = 4;

// Converts a representative vector per face in the full set of vectors that describe
// an N-RoSy field
void representative_to_nrosy(
  const Eigen::MatrixXd& V,
  const Eigen::MatrixXi& F,
  const Eigen::MatrixXd& R,
  const int N,
  Eigen::MatrixXd& Y)
{
  using namespace Eigen;
  using namespace std;
  MatrixXd B1, B2, B3;

  igl::local_basis(V,F,B1,B2,B3);

  Y.resize(F.rows()*N,3);
  for (unsigned i=0;i<F.rows();++i)
  {
    double x = R.row(i) * B1.row(i).transpose();
    double y = R.row(i) * B2.row(i).transpose();
    double angle = atan2(y,x);

    for (unsigned j=0; j<N;++j)
    {
      double anglej = angle + 2*M_PI*double(j)/double(N);
      double xj = cos(anglej);
      double yj = sin(anglej);
      Y.row(i*N+j) = xj * B1.row(i) + yj * B2.row(i);
    }
  }
}

int main(int argc, char *argv[])
{
  using namespace std;
  using namespace Eigen;

  // Load a mesh in OFF format
  igl::readOFF("./camelhead.off", V, F);

  // Threshold faces with high anisotropy
  b.resize(1);
  b << 0;
  bc.resize(1,3);
  bc << 1,1,1;

  MatrixXd R;
  VectorXd S;

  igl::comiso::nrosy(V,F,b,bc,VectorXi(),VectorXd(),MatrixXd(),N,0.5,R,S);
  // plot_mesh_nrosy(viewer,V,F,N,R,S,b);




}


/*
// Plots the mesh with an N-RoSy field and its singularities on top
// The constrained faces (b) are colored in red.
void plot_mesh_nrosy(
  igl::viewer::Viewer& viewer,
  Eigen::MatrixXd& V,
  Eigen::MatrixXi& F,
  int N,
  Eigen::MatrixXd& PD1,
  Eigen::VectorXd& S,
  Eigen::VectorXi& b)
{
  using namespace Eigen;
  using namespace std;
  // Clear the mesh
  viewer.data.clear();
  viewer.data.set_mesh(V,F);

  // Expand the representative vectors in the full vector set and plot them as lines
  double avg = igl::avg_edge_length(V, F);
  MatrixXd Y;
  representative_to_nrosy(V, F, PD1, N, Y);

  MatrixXd B;
  igl::barycenter(V,F,B);

  MatrixXd Be(B.rows()*N,3);
  for(unsigned i=0; i<B.rows();++i)
    for(unsigned j=0; j<N; ++j)
      Be.row(i*N+j) = B.row(i);

  viewer.data.add_edges(Be,Be+Y*(avg/2),RowVector3d(0,0,1));

  // Plot the singularities as colored dots (red for negative, blue for positive)
  for (unsigned i=0; i<S.size();++i)
  {
    if (S(i) < -0.001)
      viewer.data.add_points(V.row(i),RowVector3d(1,0,0));
    else if (S(i) > 0.001)
      viewer.data.add_points(V.row(i),RowVector3d(0,1,0));
  }

  // Highlight in red the constrained faces
  MatrixXd C = MatrixXd::Constant(F.rows(),3,1);
  for (unsigned i=0; i<b.size();++i)
    C.row(b(i)) << 1, 0, 0;
  // viewer.data.set_colors(C);
}
*/