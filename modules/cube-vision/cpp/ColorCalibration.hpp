#pragma once
#include <opencv2/core.hpp>
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace cubevision {
// Estimate a neutral reference from measured bright, low-chroma pixels. This is
// a bounded von Kries correction, not an assumption about which stickers exist.
// Relative channel ratios remove exposure gradients; clipped highlights are
// excluded because their ratios no longer describe the illumination.
inline bool balanceNeutral(cv::Mat& rgb) {
  if(rgb.empty()||rgb.type()!=CV_8UC3)return false;
  std::vector<std::array<double,2>> samples;
  const int step=std::max(1,std::max(rgb.cols,rgb.rows)/480);
  for(int y=0;y<rgb.rows;y+=step)for(int x=0;x<rgb.cols;x+=step){
    const auto p=rgb.at<cv::Vec3b>(y,x);
    const double high=std::max({p[0],p[1],p[2]}),low=std::min({p[0],p[1],p[2]});
    if(high<150||high>250||(high-low)/high>.32)continue;
    samples.push_back({std::log(double(p[0])/p[1]),std::log(double(p[2])/p[1])});
  }
  const size_t minimum=std::max<size_t>(96,size_t(rgb.total()/size_t(step*step)/2000));
  if(samples.size()<minimum)return false;
  const auto median=[](std::vector<double> values){
    const auto middle=values.begin()+values.size()/2;
    std::nth_element(values.begin(),middle,values.end());return *middle;
  };
  std::vector<double> red,blue;
  red.reserve(samples.size());blue.reserve(samples.size());
  for(const auto s:samples){red.push_back(s[0]);blue.push_back(s[1]);}
  const double r=median(red),b=median(blue);
  red.clear();blue.clear();
  for(const auto s:samples)if(std::abs(s[0]-r)<=.10&&std::abs(s[1]-b)<=.10){red.push_back(s[0]);blue.push_back(s[1]);}
  // Mixed light or several competing tinted surfaces do not establish a single
  // white point. Leave those pixels unchanged rather than force a correction.
  if(red.size()<minimum||red.size()<samples.size()*.72)return false;
  const double lr=median(red),lb=median(blue),gainR=std::exp(-lr),gainB=std::exp(-lb);
  if(gainR<.8||gainR>1.25||gainB<.8||gainB>1.25)return false;
  // Nearly neutral whites are already distinct from saturated cube colors.
  // Correcting a harmless paper/white-sticker tint perturbs quantized screen
  // seams without improving color evidence. Require a material reference tint.
  const double channelRatio=std::exp(std::max({0.,lr,lb})-std::min({0.,lr,lb}));
  if(channelRatio<1.12)return false;
  cv::transform(rgb,rgb,cv::Matx33f(float(gainR),0,0,0,1,0,0,0,float(gainB)));
  return true;
}
}
