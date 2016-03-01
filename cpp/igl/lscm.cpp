#include <igl/boundary_loop.h>
// #include <igl/readOFF.h>
#include <igl/readSTL.h>
// #include <igl/readOBJ.h>
#include <igl/lscm.h>
// #include <igl/harmonic.h>
// #include <igl/map_vertices_to_circle.h>

Eigen::MatrixXd V;
Eigen::MatrixXi F;
Eigen::MatrixXd V_uv;

Eigen::MatrixXd N;
Eigen::MatrixXd TC;
Eigen::MatrixXi FTC;
Eigen::MatrixXi FN;


int main(int argc, char *argv[])
{
  using namespace Eigen;
  using namespace std;

  // Load a mesh in OFF format
  // igl::readSTL("../../assets/marvin.stl", V, F, N);
  // igl::readSTL("../../assets/mini_knight.stl", V, F, N);
  igl::readSTL("./test.stl", V, F, N);
  // igl::readOFF("./camelhead.off", V, F);
  //
  // igl::readOFF("./cow.off", V, F);
  // igl::readOBJ("./armadillo.obj", V, TC, N, F, FTC, FN);
  // igl::readOBJ("./horse_quad.obj", V, TC, N, F, FTC, FN);

  // cout << V << endl;
  // cout << F << endl;
  // cout << N << endl;
  // Fix two points on the boundary
  // VectorXi bnd, b(2, 1);


  for (int i=0; i<F.rows(); i++) {
    int a = F(i, 0);
    int b = F(i, 1);
    int c = F(i, 2);

    ab, ac, bc


    for (int j=0; j<F.cols(); j++) {



    }
  }

  VectorXi bnd, b(2, 1);
  igl::boundary_loop(F, bnd);
  cout << bnd << endl;
  b(0) = bnd(0);
  b(1) = bnd(round(bnd.size()/2));
  MatrixXd bc(2,2);
  bc<<0,0,1,0;

  // Eigen::MatrixXd bnd_uv;
  // igl::map_vertices_to_circle(V, bnd, bnd_uv);
  // cout << bnd_uv << endl;
  // igl::harmonic(V,F,bnd,bnd_uv,1,V_uv);

  // LSCM parametrization
  // igl::lscm(V, F, b, bc, V_uv);
  // cout << V_uv << endl;

  // // Scale the uv
  // V_uv *= 5;

  // // Plot the mesh
  // igl::viewer::Viewer viewer;
  // viewer.data.set_mesh(V, F);
  // viewer.data.set_uv(V_uv);
  // viewer.callback_key_down = &key_down;

  // // Disable wireframe
  // viewer.core.show_lines = false;

  // // Draw checkerboard texture
  // viewer.core.show_texture = true;

  // // Launch the viewer
  // viewer.launch();
}