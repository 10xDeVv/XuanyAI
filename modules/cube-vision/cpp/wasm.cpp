#include "Detector.hpp"
#include <emscripten/bind.h>
#include <cstdint>
static std::string detectRGBA(uintptr_t address,int w,int h,int stride) {
  return cubevision::detect(reinterpret_cast<const uint8_t*>(address),w,h,stride);
}
static std::string detectPictureRGBA(uintptr_t address,int w,int h,int stride) {
  return cubevision::detect(reinterpret_cast<const uint8_t*>(address),w,h,stride,true);
}
EMSCRIPTEN_BINDINGS(cubevision) {emscripten::function("detectRGBA",&detectRGBA);emscripten::function("detectPictureRGBA",&detectPictureRGBA);}
