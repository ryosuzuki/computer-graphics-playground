
#include <iostream>
#include <armadillo>

using namespace std;
using namespace arma;

extern "C" {

typedef void(*NodeCallback)(int);

int twice(int a) {
  return a * 2;
}

int *createMatrix(int n, int arr[], int size) {
  sp_mat A = zeros<sp_mat>(n, n);
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