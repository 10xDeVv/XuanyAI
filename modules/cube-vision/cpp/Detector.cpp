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
struct Face {Q q;std::array<int,9> colors;std::array<double,9> confidence;std::array<std::array<cv::Vec3b,81>,9> samples;double sharpness,glare,score;int cells;bool calibrated=false;};
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
static bool sample(const cv::Mat& rgb,const cv::Mat& gray,const Q&q,Face& face,bool enhanced=false) {
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
      face.samples[row*3+col][n]=px;
      counts[color]++;confidence[color]+=certainty;n++;all++;
      // A few clipped pixels in a colored patch are glare. White stickers are not automatically glare.
      if(px[2]>252&&px[1]<15)glaring++;
    }
    int best=int(std::max_element(counts.begin(),counts.end())-counts.begin()),i=row*3+col;
    face.colors[i]=best;
    face.confidence[i]=(counts[best]/double(n))*(confidence[best]/std::max(1,counts[best]));
    if(face.confidence[i]<(enhanced?.35:.50))return false;
  }
  const int whites=std::count(face.colors.begin(),face.colors.end(),0);
  face.glare=std::max(0.,glaring/double(std::max(1,all))-whites/9.);
  face.q=q;return face.sharpness>=8;
}

static double hueDistance(double a,double b){const double d=std::abs(a-b);return std::min(d,360-d);}
// A complete six-face picture provides its own color references. Do not force
// duplicate/missing centers into six colors: require one white and five well
// separated, saturated centers before estimating a palette.
static void calibrateDiagram(std::vector<Face>& faces) {
  if(faces.size()!=6)return;
  std::array<cv::Vec3d,6> centers;int white=-1;
  for(int f=0;f<6;f++){
    std::array<int,81> hs,ss,vs;
    const int anchor=faces[f].samples[4][40][0];
    for(int i=0;i<81;i++){const auto px=faces[f].samples[4][i];int d=int(px[0])-anchor;if(d>90)d-=180;if(d<-90)d+=180;hs[i]=d;ss[i]=px[1];vs[i]=px[2];}
    std::sort(hs.begin(),hs.end());std::sort(ss.begin(),ss.end());std::sort(vs.begin(),vs.end());
    centers[f]={double((anchor+hs[40]+180)%180)*2,ss[40]/255.,vs[40]/255.};
    if(centers[f][1]<.25&&centers[f][2]>.38){if(white>=0)return;white=f;}
    else if(centers[f][1]<.40||centers[f][2]<.25)return;
  }
  if(white<0)return;
  std::vector<int> colored;for(int f=0;f<6;f++)if(f!=white)colored.push_back(f);
  for(int a:colored)for(int b:colored)if(a<b&&hueDistance(centers[a][0],centers[b][0])<12)return;
  const double reference[]={0,0,130,56,26,220};
  std::array<int,5> permutation={1,2,3,4,5},best{};double cost=1e9,second=1e9;
  do {
    double sum=0;bool plausible=true;
    for(int i=0;i<5;i++){double d=hueDistance(centers[colored[i]][0],reference[permutation[i]]);if(d>38)plausible=false;sum+=d*d;}
    if(plausible&&sum<cost){second=cost;cost=sum;best=permutation;}else if(plausible)second=std::min(second,sum);
  }while(std::next_permutation(permutation.begin(),permutation.end()));
  if(cost>=1e9||second-cost<100)return;
  std::array<int,6> labels{};for(int i=0;i<5;i++)labels[colored[i]]=best[i];
  for(auto& face:faces){
    for(int k=0;k<9;k++){
      std::array<int,6> counts{};std::array<double,6> confidence{};
      for(const auto px:face.samples[k]){
        const double h=px[0]*2.,s=px[1]/255.,v=px[2]/255.;int color=0;double certainty=0;
        if(s<.25&&v>.38)certainty=1-s;
        else if(s>=.30&&v>=.18){
          double first=999,next=999;int nearest=-1;
          for(int f:colored){double d=hueDistance(h,centers[f][0]);if(d<first){next=first;first=d;nearest=f;}else next=std::min(next,d);}
          color=labels[nearest];certainty=first>30?0:.60+.38*(next-first)/std::max(1.,next+first);
          certainty*=std::min(1.,s/.45);
        }
        counts[color]++;confidence[color]+=certainty;
      }
      const int bestColor=int(std::max_element(counts.begin(),counts.end())-counts.begin());
      face.colors[k]=bestColor;face.confidence[k]=confidence[bestColor]/81.;
    }
    face.calibrated=true;
  }
}

// Blurred seams can merge equal-colored stickers into one contour. Confirm
// proposed squares against local color transitions or dark seam valleys instead
// of treating a missing contour as permission to invent a square.
static bool squareEdges(const cv::Mat& rgb,const cv::Mat& h,float x,float y) {
  int supported=0;
  for(int side=0;side<4;side++) {
    std::array<cv::Vec3d,17> profile{};
    bool visible=true;
    for(int a=0;a<9&&visible;a++)for(int b=0;b<17;b++) {
      const float along=.23f+.54f*a/8,across=-.20f+.40f*b/16;
      const P uv=side==0?P(along,across):side==1?P(1+across,along):side==2?P(along,1+across):P(across,along);
      const P p=project(h,x+uv.x,y+uv.y);
      if(!std::isfinite(p.x)||!std::isfinite(p.y)||p.x<1||p.y<1||p.x>=rgb.cols-1||p.y>=rgb.rows-1){visible=false;break;}
      const int px=int(p.x),py=int(p.y);const double u=p.x-px,v=p.y-py;
      profile[b]+=(cv::Vec3d(rgb.at<cv::Vec3b>(py,px))*(1-u)*(1-v)+cv::Vec3d(rgb.at<cv::Vec3b>(py,px+1))*u*(1-v)+
        cv::Vec3d(rgb.at<cv::Vec3b>(py+1,px))*(1-u)*v+cv::Vec3d(rgb.at<cv::Vec3b>(py+1,px+1))*u*v)/9.;
    }
    if(!visible)continue;
    cv::Vec3d left{},right{};double lv=0,rv=0,low=255;
    const auto value=[](cv::Vec3d p){return std::max({p[0],p[1],p[2]});};
    for(int i=0;i<3;i++){left+=profile[i]/3.;right+=profile[16-i]/3.;lv+=value(profile[i])/3.;rv+=value(profile[16-i])/3.;}
    for(int i=5;i<=11;i++)low=std::min(low,value(profile[i]));
    double contrast=0;for(int c=0;c<3;c++)contrast=std::max(contrast,std::abs(left[c]-right[c]));
    if(contrast>=12||std::min(lv,rv)-low>=2.5)supported++;
  }
  return supported>=3;
}
static bool gridEdges(const cv::Mat& rgb,const cv::Mat& h,float x=0,float y=0) {
  for(int r=0;r<3;r++)for(int c=0;c<3;c++)if(!squareEdges(rgb,h,x+c,y+r))return false;
  return true;
}

// Use the whole coplanar net to refine tiny face proposals. This avoids
// independent perspective fits stretching faint white squares out of place.
static bool refineNet(std::vector<Face>& faces,const cv::Mat& rgb,const cv::Mat& gray) {
  if(faces.size()<4||faces.size()>6)return false;
  const std::vector<P> slots={P(1,0),P(0,1),P(1,1),P(2,1),P(3,1),P(1,2)};
  // Local proposals can include one shifted window. Fit consistent subsets,
  // then measure every square in the full net; never fill in a missing color.
  for(int count=int(faces.size());count>=4;count--)for(int selected=1;selected<(1<<faces.size());selected++){
  if(__builtin_popcount(unsigned(selected))!=count)continue;
  for(int mask=1;mask<64;mask++){
  if(__builtin_popcount(unsigned(mask))!=count)continue;
  if(count==4&&(!(mask&1)||!(mask&32)))continue; // Four anchors must span all three rows.
  std::vector<Face> ordered;for(size_t i=0;i<faces.size();i++)if(selected&(1<<i))ordered.push_back(faces[i]);
  std::vector<P> src;for(int i=0;i<6;i++)if(mask&(1<<i))src.push_back(slots[i]);
  std::sort(ordered.begin(),ordered.end(),[](const Face&a,const Face&b){return center(a.q).y<center(b.q).y;});
  int offset=0;for(int row=0;row<3;row++){
    const int n=int(std::count_if(src.begin(),src.end(),[&](P p){return p.y==row;}));
    std::sort(ordered.begin()+offset,ordered.begin()+offset+n,[](const Face&a,const Face&b){return center(a.q).x<center(b.q).x;});offset+=n;
  }
  std::vector<P> dst;double width=0,height=0;
  for(const auto& f:ordered){dst.push_back(center(f.q));width+=cv::norm(f.q[1]-f.q[0])/ordered.size();height+=cv::norm(f.q[3]-f.q[0])/ordered.size();}
  auto h=fit(src,dst);if(h.empty())continue;
  const P origin=project(h,0,0),axisX=project(h,1,0)-origin,axisY=project(h,0,1)-origin;
  if(axisX.x<=std::abs(axisX.y)||axisY.y<=std::abs(axisY.x))continue;
  double alpha=0,beta=0;
  bool aligned=true;
  for(size_t i=0;i<src.size();i++){
    const auto p=src[i];
    if(cv::norm(project(h,p.x,p.y)-dst[i])>std::min(width,height)*.12){aligned=false;break;}
    const double dx=cv::norm(project(h,p.x+.5,p.y)-project(h,p.x-.5,p.y)),dy=cv::norm(project(h,p.x,p.y+.5)-project(h,p.x,p.y-.5));
    if(dx<=0||dy<=0){aligned=false;break;}
    alpha+=cv::norm(ordered[i].q[1]-ordered[i].q[0])/dx/src.size();beta+=cv::norm(ordered[i].q[3]-ordered[i].q[0])/dy/src.size();
  }
  if(!aligned||alpha<.45||alpha>1.05||beta<.45||beta>1.05)continue;
  std::vector<Face> refined;
  for(const auto p:slots){
    cv::Mat local=cv::Mat::eye(3,3,CV_64F);local.at<double>(0,0)=alpha/3;local.at<double>(1,1)=beta/3;
    local.at<double>(0,2)=p.x-alpha/2;local.at<double>(1,2)=p.y-beta/2;
    cv::Mat fith=h*local;Q q={project(fith,0,0),project(fith,3,0),project(fith,3,3),project(fith,0,3)};
    if(std::any_of(q.begin(),q.end(),[&](P p){return !std::isfinite(p.x)||!std::isfinite(p.y)||p.x<1||p.y<1||p.x>=rgb.cols-1||p.y>=rgb.rows-1;}))break;
    Face f;if(!gridEdges(rgb,fith)||!sample(rgb,gray,q,f,true))break;
    f.cells=9;f.score=16;refined.push_back(f);
  }
  if(refined.size()==6){
    calibrateDiagram(refined);
    std::array<int,6> counts{},centers{};
    for(const auto& f:refined){centers[f.colors[4]]++;for(int color:f.colors)counts[color]++;}
    if(std::all_of(counts.begin(),counts.end(),[](int n){return n==9;})&&
       std::all_of(centers.begin(),centers.end(),[](int n){return n==1;})){faces=std::move(refined);return true;}
  }
  }}
  return false;
}

// Joined nets have the same spacing between stickers across face boundaries.
// A greedy collection of local 3x3 windows cannot identify those boundaries.
// Match the whole cross before choosing any of its six faces. Picture recovery
// can bridge merged contours only when all 54 squares have visible boundaries.
static bool joinedNet(const cv::Mat& local,const std::vector<Cell>& cells,const cv::Mat& rgb,const cv::Mat& gray,std::vector<Face>& faces,bool enhanced) {
  if(cells.size()<(enhanced?30:54))return false;
  const P origin=project(local,0,0),axisX=project(local,1,0)-origin,axisY=project(local,0,1)-origin;
  if(enhanced&&(axisX.x<=std::abs(axisX.y)||axisY.y<=std::abs(axisY.x)))return false;
  const std::array<P,6> slots={P(1,0),P(0,1),P(1,1),P(2,1),P(3,1),P(1,2)};
  const auto occupied=[](int x,int y){return (x>=0&&x<12&&y>=3&&y<6)||(x>=3&&x<6&&y>=0&&y<9);};
  const auto nearest=[&](const cv::Mat& h,float x,float y,double tolerance){
    const P p=project(h,x,y),u=project(h,x+1,y)-p,v=project(h,x,y+1)-p;
    const double area=std::abs(u.x*v.y-u.y*v.x),step=std::sqrt(area);
    if(!std::isfinite(step)||step<6)return -1;
    int chosen=-1;double best=step*tolerance;
    for(size_t i=0;i<cells.size();i++){
      const double ratio=cells[i].area/area;if(ratio<.40||ratio>1.15)continue;
      const double d=cv::norm(cells[i].center-p);if(d<best){best=d;chosen=int(i);}
    }
    return chosen;
  };
  // Extrapolating a homography fitted to one tiny face magnifies subpixel
  // corner errors across the whole net. Seed with its local affine tangent,
  // then fit perspective using all observed sticker centers.
  cv::Mat linear=cv::Mat::eye(3,3,CV_64F);
  const P c=project(local,1.5,1.5),u=project(local,2,1.5)-project(local,1,1.5),v=project(local,1.5,2)-project(local,1.5,1);
  linear.at<double>(0,0)=u.x;linear.at<double>(1,0)=u.y;linear.at<double>(0,1)=v.x;linear.at<double>(1,1)=v.y;
  linear.at<double>(0,2)=c.x-1.5*(u.x+v.x);linear.at<double>(1,2)=c.y-1.5*(u.y+v.y);
  for(const auto& base:enhanced?std::vector<cv::Mat>{linear,local}:std::vector<cv::Mat>{local})for(const auto anchor:slots){
    cv::Mat shift=cv::Mat::eye(3,3,CV_64F);shift.at<double>(0,2)=-anchor.x*3;shift.at<double>(1,2)=-anchor.y*3;
    cv::Mat h=base*shift;std::vector<P> src,dst;std::set<int> used;
    for(int y=0;y<9;y++)for(int x=0;x<12;x++)if(occupied(x,y)){
      const int i=nearest(h,x+.5f,y+.5f,enhanced?.40:.30);
      if(i<0||!used.insert(i).second)continue;
      src.push_back(P(x+.5f,y+.5f));dst.push_back(cells[i].center);
    }
    if(src.size()<(enhanced?30:54))continue;
    bool coverage=true;
    for(const auto s:slots){int n=0;for(const auto p:src)if(p.x>s.x*3&&p.x<s.x*3+3&&p.y>s.y*3&&p.y<s.y*3+3)n++;if(n<3)coverage=false;}
    if(!coverage)continue;
    h=fit(src,dst);if(h.empty())continue;
    double residual=0;bool aligned=true;
    for(size_t k=0;k<src.size();k++){
      const auto p=src[k];const double step=cv::norm(project(h,p.x+1,p.y)-project(h,p.x,p.y));
      const double error=cv::norm(project(h,p.x,p.y)-dst[k])/step;
      if(!std::isfinite(error)||error>.20){aligned=false;break;}residual+=error;
    }
    if(!aligned||residual/src.size()>.08)continue;
    // Reject subwindows of larger grids: the cross's immediate outer neighbors
    // must be empty. Recovery also checks every square's measured boundaries.
    int extra=0;
    for(int y=-1;y<=9;y++)for(int x=-1;x<=12;x++)if(!occupied(x,y)&&
      (occupied(x-1,y)||occupied(x+1,y)||occupied(x,y-1)||occupied(x,y+1))){
      if(nearest(h,x+.5f,y+.5f,.20)>=0)extra++;
    }
    if(extra>1)continue;
    std::vector<Face> result;
    for(const auto s:slots){
      const float x=s.x*3,y=s.y*3;
      Q q={project(h,x,y),project(h,x+3,y),project(h,x+3,y+3),project(h,x,y+3)};
      if(std::any_of(q.begin(),q.end(),[&](P p){return !std::isfinite(p.x)||!std::isfinite(p.y)||p.x<1||p.y<1||p.x>=rgb.cols-1||p.y>=rgb.rows-1;}))break;
      Face f;if(!sample(rgb,gray,q,f,enhanced))break;
      if(enhanced&&!gridEdges(rgb,h,x,y))break;
      f.cells=9;f.score=20-residual/src.size();result.push_back(f);
    }
    if(result.size()==6){faces=std::move(result);return true;}
  }
  return false;
}

static std::string detectPass(const uint8_t* rgba,int width,int height,int stride,bool enhanced,bool& ready,
  std::chrono::steady_clock::time_point begin,double scaleX=1,double scaleY=1) {
  if(!rgba||width<32||height<32||width>1920||height>1920||stride<width*4)throw std::invalid_argument("Invalid frame dimensions");
  cv::Mat input(height,width,CV_8UC4,const_cast<uint8_t*>(rgba),stride),rgb,gray,blur,edges;
  cv::cvtColor(input,rgb,cv::COLOR_RGBA2RGB);cv::cvtColor(rgb,gray,cv::COLOR_RGB2GRAY);
  cv::GaussianBlur(gray,blur,{3,3},0.6);cv::Canny(blur,edges,35,95);
  std::vector<std::vector<cv::Point>> contours;cv::findContours(edges,contours,cv::RETR_LIST,cv::CHAIN_APPROX_SIMPLE);
  // Camera blur weakens grayscale seams, especially between red/green or
  // white/background. Retain chromatic edges and locally normalized outlines.
  if(enhanced){
  cv::Mat smooth;cv::GaussianBlur(rgb,smooth,{3,3},.6);
  std::vector<cv::Mat> channels;cv::split(smooth,channels);
  cv::Mat chromatic=cv::Mat::zeros(height,width,CV_8UC1);
  for(const auto& channel:channels){cv::Mat e;cv::Canny(channel,e,12,36);cv::bitwise_or(chromatic,e,chromatic);}
  std::vector<std::vector<cv::Point>> additional;cv::findContours(chromatic,additional,cv::RETR_LIST,cv::CHAIN_APPROX_SIMPLE);
  contours.insert(contours.end(),additional.begin(),additional.end());
  for(int base:{11,31}){
    const int block=std::max(3,int(std::round(base*std::min(width,height)/320.))|1);
    cv::Mat local;cv::adaptiveThreshold(blur,local,255,cv::ADAPTIVE_THRESH_GAUSSIAN_C,cv::THRESH_BINARY,block,2);
    cv::findContours(local,additional,cv::RETR_LIST,cv::CHAIN_APPROX_SIMPLE);
    contours.insert(contours.end(),additional.begin(),additional.end());
  }
  }
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
  bool completeNet=false;
  const auto accept=[&](const std::vector<P>& src,const std::vector<P>& dst,double area){
    if(largerGrid||completeNet)return;
    if(enhanced){
      // A two-row strip plus blank background is not a face. Recovered grids
      // must still have measured regions across every row and column.
      for(int k=0;k<3;k++)if(std::none_of(src.begin(),src.end(),[&](P p){return std::abs(p.x-k-.5)<.01;})||
        std::none_of(src.begin(),src.end(),[&](P p){return std::abs(p.y-k-.5)<.01;}))return;
      if(std::count_if(src.begin(),src.end(),[](P p){return p.x!=1.5f&&p.y!=1.5f;})<2)return;
    }
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
    if((enhanced||src.size()==9)&&joinedNet(h,cells,rgb,gray,found,enhanced)){completeNet=true;gridCandidates+=6;return;}
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
    Face f;if(!sample(rgb,gray,q,f,enhanced))return;
    f.cells=enhanced?(gridEdges(rgb,h)?9:std::min(8,int(src.size()))):int(src.size());
    f.score=(enhanced?2*f.cells+.15*src.size():src.size())-error+*std::min_element(f.confidence.begin(),f.confidence.end());
    auto duplicate=std::find_if(found.begin(),found.end(),[&](const Face&old){return cv::norm(center(old.q)-center(q))<cv::norm(q[0]-q[1])*.4;});
    if(duplicate==found.end())found.push_back(f);else if(f.score>duplicate->score)*duplicate=f;
  };
  // Fit a 3x3 lattice to sticker centers as well as sticker corners. A phone's
  // small, rounded, or slightly blurred stickers have unreliable corner angles
  // even when centers remain visible. Physical frames require all nine regions;
  // picture recovery also checks missing regions against local boundaries.
  for(const auto& seed:cells){
    if(largerGrid||completeNet)break;
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
        if(chosen<0){if(enhanced)continue;else break;}
        used.insert(chosen);src.push_back({float(k%3)+.5f,float(k/3)+.5f});dst.push_back(cells[chosen].center);
      }
      if(src.size()>=(enhanced?5:9))accept(src,dst,seed.area);
    }
  }
  for(const auto& seed:cells)for(float spacing:{1.10f,1.22f,1.36f})for(int slot=0;slot<9;slot++) {
    if(largerGrid||completeNet)continue;
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
    if(src.size()<(enhanced?5:8))continue;
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
  if(enhanced&&!completeNet)refineNet(found,rgb,gray);
  found.erase(std::remove_if(found.begin(),found.end(),[](const Face& f){return f.cells<8;}),found.end());
  if(largerGrid)found.clear();
  if(enhanced)calibrateDiagram(found);
  ready=found.size()==6&&std::all_of(found.begin(),found.end(),[](const Face& f){return f.cells==9&&f.sharpness>=(f.calibrated?8:18)&&f.glare<.22&&*std::min_element(f.confidence.begin(),f.confidence.end())>=(f.calibrated?.75:.65);});
  std::ostringstream out;out.precision(7);
  std::string quality=found.empty()?"missing":"good";
  if(!found.empty()&&std::all_of(found.begin(),found.end(),[](const Face&f){return f.sharpness<(f.calibrated?8:18);}))quality="blur";
  if(!found.empty()&&std::all_of(found.begin(),found.end(),[](const Face&f){return f.glare>.22;}))quality="glare";
  out<<"{\"quality\":\""<<quality<<"\",\"faces\":[";
  for(size_t i=0;i<found.size();i++) {
    if(i)out<<',';const auto&f=found[i];out<<"{\"colors\":[";
    for(int j=0;j<9;j++){if(j)out<<',';out<<'\"'<<names[f.colors[j]]<<'\"';}
    out<<"],\"confidence\":[";for(int j=0;j<9;j++){if(j)out<<',';out<<f.confidence[j];}
    out<<"],\"quad\":[";for(int j=0;j<4;j++){if(j)out<<',';out<<"{\"x\":"<<f.q[j].x*scaleX<<",\"y\":"<<f.q[j].y*scaleY<<'}';}
    out<<"],\"sharpness\":"<<f.sharpness<<",\"glare\":"<<f.glare<<",\"cells\":"<<f.cells<<",\"calibrated\":"<<(f.calibrated?"true":"false")<<'}';
  }
  out<<"],\"enhanced\":"<<(enhanced?"true":"false")<<",\"largerGrid\":"<<(largerGrid?"true":"false")<<",\"diagnostics\":{\"regions\":"<<cells.size()<<",\"grids\":"<<gridCandidates<<"},\"processingMs\":"<<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count()<<'}';
  return out.str();
}
std::string detect(const uint8_t* rgba,int width,int height,int stride,bool picture) {
  const auto begin=std::chrono::steady_clock::now();
  bool ready=false;auto baseline=detectPass(rgba,width,height,stride,false,ready,begin);
  if(!picture||ready||baseline.find("\"largerGrid\":true")!=std::string::npos)return baseline;
  // Screen seams must occupy a consistent pixel scale. Never upscale a frame;
  // map reduced-image geometry back to the original camera coordinates.
  cv::Mat input(height,width,CV_8UC4,const_cast<uint8_t*>(rgba),stride),small;
  std::string recovered;
  // Bounded recovery: a second scale handles sampling artifacts; mild smoothing
  // handles screen moire. Stop as soon as a complete clear picture is measured.
  for(int pass=0;pass<3;pass++){
    const int limit=pass==1?384:448;
    const double ratio=std::min(1.,double(limit)/std::max(width,height));
    cv::resize(input,small,{},ratio,ratio,cv::INTER_AREA);
    if(pass==2)cv::GaussianBlur(small,small,{5,5},.8);
    auto result=detectPass(small.data,small.cols,small.rows,int(small.step),true,ready,begin,double(width)/small.cols,double(height)/small.rows);
    if(ready)return result;
    if(recovered.empty())recovered=std::move(result);
    if(pass==0&&std::max(width,height)<=384)pass++;
  }
  const auto timing=recovered.rfind(",\"processingMs\":");
  return recovered.substr(0,timing)+",\"processingMs\":"+std::to_string(std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count())+"}";
}
}
