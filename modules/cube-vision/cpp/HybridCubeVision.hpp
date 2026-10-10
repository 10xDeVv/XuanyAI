#pragma once
#include "HybridCubeVisionSpec.hpp"
#include "Detector.hpp"
#include <opencv2/imgproc.hpp>
#include <stdexcept>
namespace margelo::nitro::cubevision {
class HybridCubeVision final: public HybridCubeVisionSpec {
public:
  HybridCubeVision():HybridObject(TAG){}
  std::string detect(const std::shared_ptr<ArrayBuffer>& buffer,double width,double height,double stride,bool bgra,double rotation,bool mirrored,bool picture) override {
    int w=int(width),h=int(height),s=int(stride);
    if(w<=0||h<=0||w>8192||h>8192||s<w*4||buffer->size()<size_t(s)*h)throw std::invalid_argument("Invalid camera buffer");
    cv::Mat image(h,w,CV_8UC4,buffer->data(),s),rgba;
    if(bgra)cv::cvtColor(image,rgba,cv::COLOR_BGRA2RGBA);else rgba=image;
    if(rotation==90)cv::rotate(rgba,rgba,cv::ROTATE_90_CLOCKWISE);
    else if(rotation==180)cv::rotate(rgba,rgba,cv::ROTATE_180);
    else if(rotation==270)cv::rotate(rgba,rgba,cv::ROTATE_90_COUNTERCLOCKWISE);
    if(mirrored)cv::flip(rgba,rgba,1);
    // Frame output selects 640 for physical tracking, 1280 for six-face pictures.
    // Do not silently discard the picture resolution requested by the camera.
    if(std::max(rgba.cols,rgba.rows)>1280){double scale=1280./std::max(rgba.cols,rgba.rows);cv::resize(rgba,rgba,{},scale,scale,cv::INTER_AREA);}
    auto json=::cubevision::detect(rgba.data,rgba.cols,rgba.rows,int(rgba.step),picture);
    json.pop_back();return json+",\"width\":"+std::to_string(rgba.cols)+",\"height\":"+std::to_string(rgba.rows)+"}";
  }
};
}
