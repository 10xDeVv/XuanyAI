#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace cubevision {

// References come only from measured sticker interiors. The estimator neither
// fills a missing color nor requires any particular number of squares per color.
struct PhysicalPalette {
  std::array<double,6> hue{};
  bool valid=false;
};
enum class PhysicalPaletteEvidence { complete, incomplete, ambiguous };

inline double physicalHueDistance(double a,double b) {
  const double d=std::abs(a-b);return std::min(d,360-d);
}
inline double physicalMedian(std::vector<double> values) {
  std::sort(values.begin(),values.end());return values[values.size()/2];
}

// SquareRange is a collection of measured sticker patches. Each patch contains
// HSV pixels with OpenCV's byte scale (H: 0..179, S/V: 0..255); std::array pixels
// are also supported so the estimator can be tested independently of OpenCV.
template<class SquareRange>
PhysicalPaletteEvidence estimatePhysicalPalette(const SquareRange& squares,PhysicalPalette& palette) {
  palette=PhysicalPalette{};
  std::vector<double> colored;
  int white=0,valid=0;
  for(const auto& square:squares) {
    if(square.empty())continue;
    int whites=0,saturated=0;
    std::vector<double> hue;
    const double anchor=square[square.size()/2][0]*2.;
    for(const auto px:square) {
      const double s=px[1]/255.,v=px[2]/255.;
      if(s<.24&&v>.38)whites++;
      if(s>=.38&&v>=.23)saturated++;
      double h=px[0]*2.-anchor;if(h>180)h-=360;if(h<-180)h+=360;
      hue.push_back(h);
    }
    // A mixed or obscured patch is not a reference. Its pixels still receive
    // their own confidence scores if other complete references are available.
    if(whites>=square.size()*.90){white++;valid++;continue;}
    if(saturated<square.size()*.90)continue;
    const double h=physicalMedian(hue);
    std::vector<double> deviation;for(double v:hue)deviation.push_back(std::abs(v-h));
    std::sort(deviation.begin(),deviation.end());
    if(deviation[std::min(deviation.size()-1,size_t(deviation.size()*.90))]>6)continue;
    colored.push_back(std::fmod(anchor+h+360.,360.));valid++;
  }
  // Six distinct measured references are sufficient. A logo or another noisy
  // patch must not disable calibration of otherwise separable red/orange.
  if(!white||colored.size()<5||valid<6)return PhysicalPaletteEvidence::incomplete;
  std::sort(colored.begin(),colored.end());
  // Cut the hue circle at its largest empty arc, then cluster with a maximum
  // diameter rather than merging a chain of increasingly different hues.
  size_t start=0;double largest=-1;
  for(size_t i=0;i<colored.size();i++) {
    const double next=colored[(i+1)%colored.size()]+(i+1==colored.size()?360:0);
    if(next-colored[i]>largest){largest=next-colored[i];start=(i+1)%colored.size();}
  }
  std::vector<std::vector<double>> groups;
  for(size_t i=0;i<colored.size();i++) {
    const size_t index=(start+i)%colored.size();
    const double h=colored[index]+(index<start?360:0);
    if(groups.empty()||h-groups.back().front()>8)groups.push_back({h});
    else groups.back().push_back(h);
  }
  if(groups.size()<5)return PhysicalPaletteEvidence::incomplete;
  if(groups.size()>5)return PhysicalPaletteEvidence::ambiguous;
  std::array<double,5> references;
  for(int i=0;i<5;i++)references[i]=std::fmod(physicalMedian(groups[i]),360.);
  for(int i=0;i<5;i++)for(int j=i+1;j<5;j++)
    if(physicalHueDistance(references[i],references[j])<10)return PhysicalPaletteEvidence::ambiguous;

  const std::array<double,6> standard={0,0,130,56,26,220};
  std::array<int,5> permutation={1,2,3,4,5},best{};
  double first=1e9,second=1e9;
  do {
    double cost=0;bool plausible=true;
    for(int i=0;i<5;i++) {
      const double d=physicalHueDistance(references[i],standard[permutation[i]]);
      if(d>38)plausible=false;cost+=d*d;
    }
    if(plausible&&cost<first){second=first;first=cost;best=permutation;}
    else if(plausible)second=std::min(second,cost);
  }while(std::next_permutation(permutation.begin(),permutation.end()));
  if(first>=1e9||second-first<100)return PhysicalPaletteEvidence::ambiguous;
  for(int i=0;i<5;i++)palette.hue[best[i]]=references[i];
  palette.valid=true;return PhysicalPaletteEvidence::complete;
}

template<class Pixel>
int classifyPhysicalSample(const Pixel& px,const PhysicalPalette& palette,double& certainty) {
  certainty=0;if(!palette.valid)return 0;
  const double h=px[0]*2.,s=px[1]/255.,v=px[2]/255.;
  if(s<.24&&v>.38){certainty=1-s;return 0;}
  if(s<.30||v<.18)return 0;
  int best=1;double first=999,second=999;
  for(int c=1;c<6;c++) {
    const double d=physicalHueDistance(h,palette.hue[c]);
    if(d<first){second=first;first=d;best=c;}else second=std::min(second,d);
  }
  if(first<=18)certainty=(.60+.38*(second-first)/std::max(1.,second+first))*std::min(1.,s/.45);
  return best;
}

}
