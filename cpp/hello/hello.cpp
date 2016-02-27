extern "C" {
  int hello();
}

#include <stdio.h>

int hello() {
  printf("hello world\n");
  return 0;
}