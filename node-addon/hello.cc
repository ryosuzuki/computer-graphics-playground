// addon.cc
#include <node.h>

namespace demo {

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;

void CreateObject(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  Local<Object> obj = Object::New(isolate);
  obj->Set(String::NewFromUtf8(isolate, "msg"), args[0]->ToString());

  // Get the global object.
  // Same as using 'global' in Node
  Local<Object> global = v8::Context::GetCurrent()->Global();

  // Get JSON
  // Same as using 'global.JSON'
  Local<Object> JSON = Local<Object>::Cast(
      global->Get(String::New("JSON")));

  // Get stringify
  // Same as using 'global.JSON.stringify'
  Local<Function> stringify = Local<Function>::Cast(
      JSON->Get(String::New("stringify")));

  // Stringify the object
  // Same as using 'global.JSON.stringify.apply(global.JSON, [ obj ])
  Local<Value> hoge[] = { obj };
  Local<String> result = Local<String>::Cast(stringify->Call(JSON, 1, hoge));

  args.GetReturnValue().Set(obj);
}

void Init(Local<Object> exports, Local<Object> module) {
  NODE_SET_METHOD(module, "exports", CreateObject);
}

NODE_MODULE(addon, Init)

}