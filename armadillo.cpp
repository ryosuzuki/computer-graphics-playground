#include <iostream>
#include <armadillo>

using namespace std;
using namespace arma;

int main()
{
  // sp_mat A = sprandu<sp_mat>(5000, 5000, 0.1);
  // sp_mat B = sprandu<sp_mat>(5000, 5000, 0.1);
  int n = 10000;
  sp_mat A = zeros<sp_mat>(n, n);
  sp_mat B = zeros<sp_mat>(n, n);
  for (int i =0; i<n; i = i+1) {
    A(i, i) = rand();
    B(i, i) = rand();
  }
  sp_mat C = A*B;
  cout << C.t() << endl;

  return 0;
}