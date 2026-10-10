#pragma once
#include <cstdint>
#include <string>
namespace cubevision {
// Input is upright, unmirrored RGBA. Output coordinates are in these input pixels.
std::string detect(const uint8_t* rgba, int width, int height, int stride, bool picture=false);
}
