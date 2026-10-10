#include "Detector.hpp"
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <array>
#include <algorithm>
#include <cmath>
#include <chrono>
#include <set>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace cubevision {
using P=cv::Point2f;
using Q=std::array<P,4>;
struct Cell {Q q;P center;double area;};
struct Face {Q q;std::array<int,9> colors;std::array<double,9> confidence;double sharpness,glare,score;int cells;};
static const char* names[]={"white","red","green","yellow","orange","blue"};
static P center(const Q&q) {return (q[0]+q[1]+q[2]+q[3])*0.25f;}
static Q order(const std::vector<cv::Point>& points) {
  Q q;for(int i=0;i<4;i++)q[i]=points[i];
  P c=center(q);
  std::sort(q.begin(),q.end(),[c](P a,P b){return std::atan2(a.y-c.y,a.x-c.x)<std::atan2(b.y-c.y,b.x-c.x);});
  auto first=std::min_element(q.begin(),q.end(),[](P a,P b){return a.x+a.y<b.x+b.y;});
  std::rotate(q.begin(),first,q.end());return q;
}
static P project(const cv::Mat& h,float x,float y) {
  double d=h.at<double>(2,0)*x+h.at<double>(2,1)*y+h.at<double>(2,2);
  if(std::abs(d)<1e-8)return {-9999,-9999};
  return {float((h.at<double>(0,0)*x+h.at<double>(0,1)*y+h.at<double>(0,2))/d),float((h.at<double>(1,0)*x+h.at<double>(1,1)*y+h.at<double>(1,2))/d)};
}
static cv::Mat fit(const std::vector<P>& src,const std::vector<P>& dst) {
  cv::Mat a(int(src.size())*2,8,CV_64F),b(int(src.size())*2,1,CV_64F),x;
  for(size_t i=0;i<src.size();i++) {
    double u=src[i].x,v=src[i].y,p=dst[i].x,q=dst[i].y;
    double r0[]={u,v,1,0,0,0,-p*u,-p*v},r1[]={0,0,0,u,v,1,-q*u,-q*v};
    for(int j=0;j<8;j++){a.at<double>(int(i)*2,j)=r0[j];a.at<double>(int(i)*2+1,j)=r1[j];}
    b.at<double>(int(i)*2)=p;b.at<double>(int(i)*2+1)=q;
  }
  if(!cv::solve(a,b,x,cv::DECOMP_SVD))return {};
  cv::Mat h=cv::Mat::eye(3,3,CV_64F);for(int i=0;i<8;i++)h.at<double>(i/3,i%3)=x.at<double>(i);return h;
}
static int classify(cv::Vec3b hsv,double& certainty) {
  double h=hsv[0]*2.,s=hsv[1]/255.,v=hsv[2]/255.;
  if(v<0.18){certainty=0;return 0;}
  if(s<0.23 && v>0.38){certainty=std::clamp(1.-s,0.,1.);return 0;}
  if(s<0.30){certainty=0.35;return 0;}
  // Broad initial hue bands; reject boundaries instead of silently changing a square's identity.
  const double hue[]={0,0,130,56,26,220};
  int best=1;double first=999,second=999;
  for(int c=1;c<6;c++){double d=std::abs(h-hue[c]);d=std::min(d,360-d);if(d<first){second=first;first=d;best=c;}else if(d<second)second=d;}
  certainty=std::clamp(0.60+(second-first)/75.,0.,0.98)*std::min(1.,s/0.45);
  return best;
}
static bool sample(const cv::Mat& rgb,const cv::Mat& gray,const Q&q,Face& face) {
  Q target={P(0,0),P(150,0),P(150,150),P(0,150)};
  cv::Mat h=cv::getPerspectiveTransform(q.data(),target.data()),patch,hsv,g;
  cv::warpPerspective(rgb,patch,h,{150,150});cv::cvtColor(patch,hsv,cv::COLOR_RGB2HSV);
  cv::warpPerspective(gray,g,h,{150,150});cv::Mat lap;cv::Laplacian(g,lap,CV_64F);
  cv::Scalar mean,sd;cv::meanStdDev(lap,mean,sd);face.sharpness=sd[0]*sd[0];
  int glaring=0,all=0;
  for(int row=0;row<3;row++)for(int col=0;col<3;col++) {
    std::array<int,6> counts{};std::array<double,6> confidence{};
    int n=0;
    for(int y=row*50+16;y<row*50+34;y+=2)for(int x=col*50+16;x<col*50+34;x+=2) {
      double certainty;const auto px=hsv.at<cv::Vec3b>(y,x);int color=classify(px,certainty);
      counts[color]++;confidence[color]+=certainty;n++;all++;
      // A few clipped pixels in a colored patch are glare. White stickers are not automatically glare.
      if(px[2]>252&&px[1]<15)glaring++;
    }
    int best=int(std::max_element(counts.begin(),counts.end())-counts.begin()),i=row*3+col;
    face.colors[i]=best;
    face.confidence[i]=(counts[best]/double(n))*(confidence[best]/std::max(1,counts[best]));
    if(face.confidence[i]<0.50)return false;
  }
  const int whites=std::count(face.colors.begin(),face.colors.end(),0);
  face.glare=std::max(0.,glaring/double(std::max(1,all))-whites/9.);
  face.q=q;return face.sharpness>=8;
}

std::string detect(const uint8_t* rgba,int width,int height,int stride) {
  const auto begin=std::chrono::steady_clock::now();
  if(!rgba||width<32||height<32||width>1920||height>1920||stride<width*4)throw std::invalid_argument("Invalid frame dimensions");
  cv::Mat input(height,width,CV_8UC4,const_cast<uint8_t*>(rgba),stride),rgb,gray,blur,edges;
  cv::cvtColor(input,rgb,cv::COLOR_RGBA2RGB);cv::cvtColor(rgb,gray,cv::COLOR_RGB2GRAY);
  cv::GaussianBlur(gray,blur,{3,3},0.6);cv::Canny(blur,edges,35,95);
  std::vector<std::vector<cv::Point>> contours;cv::findContours(edges,contours,cv::RETR_LIST,cv::CHAIN_APPROX_SIMPLE);
  // Acute sticker corners can leave Canny outlines open. Color regions provide
  // closed boundaries as well, including narrow seams on stickerless pieces.
  cv::Mat hsv;cv::cvtColor(rgb,hsv,cv::COLOR_RGB2HSV);
  std::array<cv::Mat,6> masks;for(auto& mask:masks)mask=cv::Mat::zeros(height,width,CV_8UC1);
  for(int y=0;y<height;y++)for(int x=0;x<width;x++){
    double certainty;int color=classify(hsv.at<cv::Vec3b>(y,x),certainty);
    if(certainty>=.65)masks[color].at<uint8_t>(y,x)=255;
  }
  for(auto& mask:masks){
    std::vector<std::vector<cv::Point>> regions;
    cv::findContours(mask,regions,cv::RETR_EXTERNAL,cv::CHAIN_APPROX_SIMPLE);
    contours.insert(contours.end(),regions.begin(),regions.end());
  }
  std::vector<Cell> cells;
  for(const auto& contour:contours) {
    double area=std::abs(cv::contourArea(contour));if(area<65||area>width*height*0.20)continue;
    std::vector<cv::Point> polygon;cv::approxPolyDP(contour,polygon,cv::arcLength(contour,true)*0.035,true);
    if(polygon.size()!=4||!cv::isContourConvex(polygon)){
      // Rounded stickers often have 6–8 contour corners. Preserve their center
      // for the lattice fit instead of requiring four sharp sticker corners.
      const auto rect=cv::minAreaRect(contour);
      if(rect.size.area()<=0||area/rect.size.area()<.72)continue;
      P corners[4];rect.points(corners);polygon.clear();
      for(auto p:corners)polygon.emplace_back(cvRound(p.x),cvRound(p.y));
    }
    Q q=order(polygon);const auto moments=cv::moments(contour);
    P c=std::abs(moments.m00)>1e-6?P(float(moments.m10/moments.m00),float(moments.m01/moments.m00)):center(q);
    double shortest=99999,longest=0;
    for(int i=0;i<4;i++){double d=cv::norm(q[i]-q[(i+1)%4]);shortest=std::min(shortest,d);longest=std::max(longest,d);}
    if(shortest<6||longest/shortest>4)continue;
    bool duplicate=false;for(const auto& old:cells)if(cv::norm(c-old.center)<std::sqrt(area)*0.18&&std::abs(std::log(area/old.area))<0.4){duplicate=true;break;}
    if(!duplicate)cells.push_back({q,c,area});
  }
  std::sort(cells.begin(),cells.end(),[](const Cell&a,const Cell&b){return a.area>b.area;});
  // Retain enough regions to distinguish a 96-sticker 4x4 diagram from 3x3
  // windows, while keeping work bounded on cluttered camera frames.
  if(cells.size()>140)cells.resize(140);
  std::vector<Face> found;
  int gridCandidates=0;
  bool largerGrid=false;
  const auto accept=[&](const std::vector<P>& src,const std::vector<P>& dst,double area){
    if(largerGrid)return;
    auto h=fit(src,dst);if(h.empty())return;
    Q q={project(h,0,0),project(h,3,0),project(h,3,3),project(h,0,3)};
    for(auto p:q)if(!std::isfinite(p.x)||!std::isfinite(p.y)||p.x<1||p.y<1||p.x>=width-1||p.y>=height-1)return;
    std::vector<P> polygon(q.begin(),q.end());if(!cv::isContourConvex(polygon))return;
    double error=0;for(size_t i=0;i<src.size();i++)error+=cv::norm(project(h,src[i].x,src[i].y)-dst[i]);
    error/=src.size()*std::sqrt(area);if(error>.13)return;
    // A diagonal/sheared lattice can connect centers from two different faces.
    // Its cell axes must agree with the actual sticker edges, not only centers.
    for(size_t i=0;i<src.size();i++){
      const auto cell=std::find_if(cells.begin(),cells.end(),[&](const Cell& c){return cv::norm(c.center-dst[i])<.01;});
      if(cell==cells.end())return;
      const float x=src[i].x,y=src[i].y;
      Q predicted={project(h,x-.5f,y-.5f),project(h,x+.5f,y-.5f),project(h,x+.5f,y+.5f),project(h,x-.5f,y+.5f)};
      double best=-1;
      for(int rotation=0;rotation<4;rotation++){
        double agreement=0;
        for(int k=0;k<4;k++){
          P a=predicted[(k+1)%4]-predicted[k],b=cell->q[(k+rotation+1)%4]-cell->q[(k+rotation)%4];
          const double length=cv::norm(a)*cv::norm(b);if(length<1)return;
          // Separate diagram panels can accidentally form a sparse 3x3 lattice.
          // A grid cell must fit the sticker it represents, not span two rows.
          const double ratio=cv::norm(a)/cv::norm(b);
          if(ratio<.70||ratio>1.80){agreement=-4;break;}
          agreement+=a.dot(b)/length;
        }
        best=std::max(best,agreement/4);
      }
      if(best<.90)return;
    }
    // A 4x4 face contains several convincing 3x3 windows. Require the whole
    // adjacent 4x4 lattice before flagging it; do not feed a window to a 3x3 solver.
    for(int dy:{-1,0})for(int dx:{-1,0}){
      std::set<int> extra;
      for(int row=0;row<4;row++)for(int col=0;col<4;col++){
        const P target=project(h,float(col+dx)+.5f,float(row+dy)+.5f);
        double best=std::sqrt(area)*.16;int chosen=-1;
        for(size_t n=0;n<cells.size();n++){
          const double ratio=cells[n].area/area;if(ratio<.55||ratio>1.8||extra.count(int(n)))continue;
          const double d=cv::norm(target-cells[n].center);if(d<best){best=d;chosen=int(n);}
        }
        if(chosen>=0)extra.insert(chosen);
      }
      if(extra.size()==16){largerGrid=true;return;}
    }
    gridCandidates++;
    // Neighbor pairs and grid rotations often describe exactly the same face.
    // Avoid repeatedly warping/sampling it on a phone's worker thread.
    for(const auto& old:found)for(int rotation=0;rotation<4;rotation++){
      double separation=0;for(int k=0;k<4;k++)separation+=cv::norm(old.q[(k+rotation)%4]-q[k]);
      if(separation/4<1.5)return;
    }
    Face f;if(!sample(rgb,gray,q,f))return;
    f.cells=int(src.size());
    f.score=src.size()-error+*std::min_element(f.confidence.begin(),f.confidence.end());
    auto duplicate=std::find_if(found.begin(),found.end(),[&](const Face&old){return cv::norm(center(old.q)-center(q))<cv::norm(q[0]-q[1])*.4;});
    if(duplicate==found.end())found.push_back(f);else if(f.score>duplicate->score)*duplicate=f;
  };
  // Fit a 3x3 lattice to sticker centers as well as sticker corners. A phone's
  // small, rounded, or slightly blurred stickers have unreliable corner angles
  // even when all nine centers are easy to locate. This route requires all nine
  // distinct regions and still passes the same geometry and color checks.
  for(const auto& seed:cells){
    if(largerGrid)break;
    std::vector<std::pair<double,int>> neighbors;
    const double scale=std::sqrt(seed.area);
    for(size_t i=0;i<cells.size();i++){
      const double d=cv::norm(cells[i].center-seed.center),ratio=cells[i].area/seed.area;
      if(d>scale*.65&&d<scale*2.4&&ratio>.4&&ratio<2.5)neighbors.emplace_back(d,int(i));
    }
    std::sort(neighbors.begin(),neighbors.end());if(neighbors.size()>8)neighbors.resize(8);
    if(neighbors.size()<4)continue;
    for(const auto& a:neighbors)for(const auto& b:neighbors){
      P u=cells[a.second].center-seed.center,v=cells[b.second].center-seed.center;
      const double lengths=a.first*b.first;
      if(u.x*v.y-u.y*v.x<lengths*.45||std::abs(u.dot(v))/lengths>.72)continue;
      std::vector<P> src,dst;std::set<int> used;
      for(int k=0;k<9;k++){
        P p=seed.center+u*float(k%3-1)+v*float(k/3-1);
        double best=scale*.38;int chosen=-1;
        for(size_t n=0;n<cells.size();n++){
          const double ratio=cells[n].area/seed.area;if(ratio<.3||ratio>3.3||used.count(int(n)))continue;
          double d=cv::norm(p-cells[n].center);if(d<best){best=d;chosen=int(n);}
        }
        if(chosen<0)break;
        used.insert(chosen);src.push_back({float(k%3)+.5f,float(k/3)+.5f});dst.push_back(cells[chosen].center);
      }
      if(src.size()==9)accept(src,dst,seed.area);
    }
  }
  for(const auto& seed:cells)for(float spacing:{1.10f,1.22f,1.36f})for(int slot=0;slot<9;slot++) {
    if(largerGrid)continue;
    float col=float(slot%3),row=float(slot/3);
    Q local={P(col,row),P(col+1,row),P(col+1,row+1),P(col,row+1)},expanded;
    for(int i=0;i<4;i++)expanded[i]=seed.center+(seed.q[i]-seed.center)*spacing;
    cv::Mat h=cv::getPerspectiveTransform(local.data(),expanded.data());
    std::vector<P> src,dst;std::set<int> used;
    for(int k=0;k<9;k++) {
      P p=project(h,float(k%3)+.5f,float(k/3)+.5f);
      double tolerance=std::sqrt(seed.area)*.34,best=tolerance;int chosen=-1;
      for(size_t n=0;n<cells.size();n++) {
        if(cells[n].area/seed.area<.30||cells[n].area/seed.area>3.3)continue;
        double d=cv::norm(p-cells[n].center);
        if(d<best&&!used.count(int(n))){best=d;chosen=int(n);}
      }
      if(chosen>=0){used.insert(chosen);src.push_back({float(k%3)+.5f,float(k/3)+.5f});dst.push_back(cells[chosen].center);}
    }
    if(src.size()<8)continue;
    accept(src,dst,seed.area);
  }
  std::sort(found.begin(),found.end(),[](const Face&a,const Face&b){return a.score>b.score;});
  std::vector<Face> distinct;
  for(const auto& face:found){
    if(std::any_of(distinct.begin(),distinct.end(),[&](const Face& other){
      double edge=0;for(int i=0;i<4;i++)edge=std::max(edge,cv::norm(face.q[(i+1)%4]-face.q[i]));
      std::vector<P> a(face.q.begin(),face.q.end()),b(other.q.begin(),other.q.end()),intersection;
      const double overlap=cv::intersectConvexConvex(a,b,intersection),smaller=std::min(std::abs(cv::contourArea(a)),std::abs(cv::contourArea(b)));
      return cv::norm(center(face.q)-center(other.q))<edge*.3 || (smaller>0&&overlap/smaller>.20);
    }))continue;
    // A live camera can see a printed/displayed six-face diagram as well as a
    // physical cube. Keep its spatially distinct panels, including equal centers.
    distinct.push_back(face);if(distinct.size()==6)break;
  }
  found=std::move(distinct);
  if(largerGrid)found.clear();
  std::ostringstream out;out.precision(7);
  std::string quality=found.empty()?"missing":"good";
  if(!found.empty()&&std::all_of(found.begin(),found.end(),[](const Face&f){return f.sharpness<18;}))quality="blur";
  if(!found.empty()&&std::all_of(found.begin(),found.end(),[](const Face&f){return f.glare>.22;}))quality="glare";
  out<<"{\"quality\":\""<<quality<<"\",\"faces\":[";
  for(size_t i=0;i<found.size();i++) {
    if(i)out<<',';const auto&f=found[i];out<<"{\"colors\":[";
    for(int j=0;j<9;j++){if(j)out<<',';out<<'\"'<<names[f.colors[j]]<<'\"';}
    out<<"],\"confidence\":[";for(int j=0;j<9;j++){if(j)out<<',';out<<f.confidence[j];}
    out<<"],\"quad\":[";for(int j=0;j<4;j++){if(j)out<<',';out<<"{\"x\":"<<f.q[j].x<<",\"y\":"<<f.q[j].y<<'}';}
    out<<"],\"sharpness\":"<<f.sharpness<<",\"glare\":"<<f.glare<<",\"cells\":"<<f.cells<<'}';
  }
  out<<"],\"largerGrid\":"<<(largerGrid?"true":"false")<<",\"diagnostics\":{\"regions\":"<<cells.size()<<",\"grids\":"<<gridCandidates<<"},\"processingMs\":"<<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count()<<'}';
  return out.str();
}
}
