#include<iostream>
using namespace std;

#include"Eigen/Core"

int main(){
  cout<<"Hello world"<<endl;

  Eigen::MatrixXf A=Eigen::MatrixXf::Zero(2,2);
  A(0,0)=2;
  A(1,1)=5;

  cout<<A<<endl;

  return 0;
}