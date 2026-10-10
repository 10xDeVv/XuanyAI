"""Reproducible shared OpenCV/WASM build. Downloads only pinned upstream sources."""
import argparse, os, pathlib, shutil, subprocess, sys, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
TOOLS=ROOT/'.tools'
VERSION='4.13.0'

def run(args,**kwargs):
    print(' '.join(str(a) for a in args),flush=True)
    subprocess.run([str(a) for a in args],check=True,**kwargs)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--jobs',default='4');args=parser.parse_args()
    TOOLS.mkdir(exist_ok=True)
    source=TOOLS/f'opencv-{VERSION}'
    if not source.exists():
        archive=TOOLS/f'opencv-{VERSION}.zip'
        if not archive.exists() or not zipfile.is_zipfile(archive):
            print('Downloading OpenCV source',flush=True)
            partial=archive.with_suffix('.part')
            with urllib.request.urlopen(f'https://github.com/opencv/opencv/archive/refs/tags/{VERSION}.zip',timeout=120) as response,partial.open('wb') as out:
                shutil.copyfileobj(response,out,1024*1024)
            if not zipfile.is_zipfile(partial):raise RuntimeError('Incomplete OpenCV source download; rerun build:vision.')
            partial.replace(archive)
        with zipfile.ZipFile(archive) as z: z.extractall(TOOLS)
    emsdk=pathlib.Path(os.environ.get('EMSDK',str(TOOLS/'emsdk')))
    em=emsdk/'upstream'/'emscripten'
    if not (em/'emcc.py').exists():
        raise SystemExit('Install Emscripten 4.0.15 in .tools/emsdk first. See README.md.')
    env=os.environ.copy();env['EMSDK']=str(emsdk);env['EM_CONFIG']=str(emsdk/'.emscripten')
    node_candidates=list((emsdk/'node').glob('*/bin/node'))+list((emsdk/'node').glob('*/bin/node.exe'))
    env['PATH']=str(em)+os.pathsep+(str(node_candidates[0].parent)+os.pathsep if node_candidates else '')+env['PATH']
    python_tools=TOOLS/'python-packages'
    if python_tools.exists():
        env['PYTHONPATH']=str(python_tools)+os.pathsep+env.get('PYTHONPATH','')
        env['PATH']=str(python_tools/'cmake/data/bin')+os.pathsep+str(python_tools/'bin')+os.pathsep+env['PATH']
    cmake=shutil.which('cmake',path=env['PATH']);ninja=shutil.which('ninja',path=env['PATH'])
    if not cmake or not ninja: raise SystemExit('Install CMake and Ninja (python -m pip install cmake ninja).')
    build=TOOLS/'opencv-wasm';build.mkdir(exist_ok=True)
    run([sys.executable,em/'emcmake.py',cmake,'-S',source,'-B',build,'-G','Ninja',
         '-DCMAKE_BUILD_TYPE=Release','-DBUILD_LIST=core,imgproc','-DBUILD_SHARED_LIBS=OFF',
         '-DBUILD_TESTS=OFF','-DBUILD_PERF_TESTS=OFF','-DBUILD_EXAMPLES=OFF','-DBUILD_opencv_apps=OFF',
         '-DBUILD_JAVA=OFF','-DBUILD_opencv_js=OFF','-DWITH_IPP=OFF','-DWITH_ITT=OFF','-DWITH_OPENCL=OFF',
         '-DENABLE_CCACHE=OFF','-DWITH_JPEG=OFF','-DWITH_PNG=OFF','-DWITH_TIFF=OFF','-DWITH_WEBP=OFF',
         '-DWITH_OPENJPEG=OFF','-DWITH_OPENEXR=OFF','-DWITH_AVIF=OFF','-DWITH_JASPER=OFF',
         '-DWITH_FFMPEG=OFF','-DWITH_GSTREAMER=OFF','-DWITH_V4L=OFF','-DWITH_GTK=OFF',
         '-DWITH_PROTOBUF=OFF','-DWITH_QUIRC=OFF','-DWITH_OBSENSOR=OFF',
         '-DWITH_PTHREADS_PF=OFF','-DCV_ENABLE_INTRINSICS=OFF','-DCPU_BASELINE=','-DCPU_DISPATCH=',
         '-DCMAKE_C_FLAGS=-O3','-DCMAKE_CXX_FLAGS=-O3'],env=env)
    run([cmake,'--build',build,'--parallel',args.jobs],env=env)
    output=ROOT/'public'/'vision';output.mkdir(parents=True,exist_ok=True)
    run([sys.executable,em/'em++.py','-O3','-std=c++17','--bind',
         ROOT/'modules/cube-vision/cpp/Detector.cpp',ROOT/'modules/cube-vision/cpp/wasm.cpp',
         '-I'+str(source/'modules/core/include'),'-I'+str(source/'modules/imgproc/include'),'-I'+str(build),
         build/'lib/libopencv_imgproc.a',build/'lib/libopencv_core.a',*list((build/'3rdparty/lib').glob('libzlib*.a')),
         '-sALLOW_MEMORY_GROWTH=1','-sMODULARIZE=1','-sEXPORT_NAME=createCubeVision',
         '-sENVIRONMENT=web,worker,node','-sEXPORTED_FUNCTIONS=["_malloc","_free"]',
         '-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',output/'cube-vision.js'],env=env)
    print('Built public/vision/cube-vision.js and cube-vision.wasm',flush=True)

if __name__=='__main__':main()
