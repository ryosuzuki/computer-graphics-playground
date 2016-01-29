#include <cusp/hyb_matrix.h>
#include <cusp/io/matrix_market.h>
#include <cusp/krylov/cg.h>

int main(void)
{
  // create an empty sparse matrix structure (HYB format)
  cusp::hyb_matrix<int, float, cusp::device_memory> A;

  // load a matrix stored in MatrixMarket format
  cusp::io::read_matrix_market_file(A, "5pt_10x10.mtx");

  // allocate storage for solution (x) and right hand side (b)
  cusp::array1d<float, cusp::device_memory> x(A.num_rows, 0);
  cusp::array1d<float, cusp::device_memory> b(A.num_rows, 1);

  // solve the linear system A * x = b with the Conjugate Gradient method
  cusp::krylov::cg(A, x, b);

  return 0;
}
