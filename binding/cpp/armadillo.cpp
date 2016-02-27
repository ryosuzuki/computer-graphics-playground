extern "C" {
  int main();
}

#include <iostream>
#include <armadillo>

using namespace std;
using namespace arma;

int main() {
  int n = 100;
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
