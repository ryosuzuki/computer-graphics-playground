#include <node.h>
#include <v8.h>
#include <iostream>
#include <armadillo>

using namespace std;
using namespace arma;
using namespace arma;

extern "C" {
  int main();
}


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


/*
geometry unpack_geometry(Isolate * isolate, const Handle<Object> geometry_obj) {
  geometry geo;

  Handle<Array> array = Handle<Array>::Cast(geometry_obj->GET(String::NewFromUtf8(isolate, "faces")));
  int face_count = array->Length();
  for (int i=0; i<face_count; i++) {
    int plus = array->Get(i);
    geo.push_back(plus);
  }
  return geo;
}
*/

void PlusOne(const v8::FunctionCallbackInfo<v8::Value>& args) {
  Isolate *isolate = args.GetIsolate();
  // geometry geo = unpack_geometry(isolate, Handle<Object>::Cast(args[0]));
  args.GetReturnValue().Set(100);
}


void init(Handle <Object> exports, Handle<Object> module) {
  NODE_SET_METHOD(exports, "plusOne", PlusOne);
}

NODE_MODULE(binding, init)


