#include <iostream>
#include <armadillo>

using namespace std;
using namespace arma;

extern "C" {

typedef void(*NodeCallback)(int);

int *createMatrix(int uniq[], int faces[]) {
  int n = sizeof(uniq);
  int w = 1000;
  sp_mat L = zeros<sp_mat>(n, n);

  int p = 0;
  int q = n-1;




  sp_mat b = zeros<sp_mat>(1, n);
  b(0, p) = w;

  sp_mat G = zeros<sp_mat>(n, n);
  G(p, p) = w*w;
  G(q, q) = w*w;






  sp_mat B = zeros<sp_mat>(n, n);
  for (int i =0; i<size; ++i) {
    A(i, i) = arr[i]+1;
    B(i, i) = arr[i];
  }
  sp_mat C = A*B;
  cout << C.t() << endl;
  for (int i=0; i< size; ++i) {
    arr[i] = C(i, i);
  }
  return arr;
}

int doSomething(NodeCallback callback, int arr[], int size) {
  callback(20);
  return 0;
}

}