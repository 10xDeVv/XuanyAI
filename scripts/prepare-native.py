"""Download pinned official OpenCV SDKs. Safe to rerun after interrupted downloads."""
import argparse, hashlib, json, os, pathlib, shutil, stat, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
MODULE=ROOT/'modules'/'cube-vision'
VERSION='4.13.0'

def prepare(platform):
    dest=MODULE/'opencv'/platform
    marker=dest/'.complete'
    if marker.exists():return
    artifact=f'opencv-{VERSION}-'+('android-sdk.zip' if platform=='android' else 'ios-framework.zip')
    cache=ROOT/'.cache';cache.mkdir(exist_ok=True)
    archive=cache/artifact
    metadata=json.load(urllib.request.urlopen(f'https://api.github.com/repos/opencv/opencv/releases/tags/{VERSION}',timeout=60))
    asset=next(a for a in metadata['assets'] if a['name']==artifact)
    if not archive.exists() or archive.stat().st_size!=asset['size']:
        partial=archive.with_suffix('.part')
        print(f'Downloading {artifact} ({asset["size"]//1000000} MB)',flush=True)
        with urllib.request.urlopen(asset['browser_download_url'],timeout=90) as response,partial.open('wb') as output:
            shutil.copyfileobj(response,output,1024*1024)
        if partial.stat().st_size!=asset['size']:raise RuntimeError('Incomplete SDK download; rerun prepare-native.')
        partial.replace(archive)
    digest=asset.get('digest')
    if digest and digest.startswith('sha256:'):
        actual=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
        if actual!=digest.split(':')[1]:raise RuntimeError('OpenCV SDK checksum mismatch.')
    dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        entries=z.namelist()
        if platform=='android':
            prefix=next(name.split('sdk/native/')[0] for name in entries if 'sdk/native/jni/OpenCVConfig.cmake' in name)
            for name in entries:
                if not name.startswith(prefix+'sdk/native/') or name.endswith('/'):continue
                relative=pathlib.PurePosixPath(name[len(prefix):])
                if '..' in relative.parts:raise RuntimeError('Unsafe archive path')
                target=dest/pathlib.Path(*relative.parts);target.parent.mkdir(parents=True,exist_ok=True)
                with z.open(name) as source,target.open('wb') as out:shutil.copyfileobj(source,out)
        else:
            framework='opencv2.framework/'
            frameworks=[name.split(framework)[0] for name in entries if framework in name]
            if not frameworks:raise RuntimeError('The pinned iOS framework is missing.')
            prefix=frameworks[0]
            links=[]
            for name in entries:
                if not name.startswith(prefix+framework) or name.endswith('/'):continue
                relative=pathlib.PurePosixPath(name[len(prefix):])
                if '..' in relative.parts:raise RuntimeError('Unsafe archive path')
                target=dest/pathlib.Path(*relative.parts);target.parent.mkdir(parents=True,exist_ok=True)
                if stat.S_ISLNK(z.getinfo(name).external_attr >> 16):
                    links.append((target,z.read(name).decode()));continue
                with z.open(name) as source,target.open('wb') as out:shutil.copyfileobj(source,out)
            for target,link in links:
                resolved=(target.parent/link).resolve()
                if not resolved.is_relative_to(dest.resolve()):raise RuntimeError('Unsafe framework symlink')
                if os.name=='nt':
                    source=pathlib.Path(str(resolved).replace('Versions\\Current','Versions\\A'))
                    if source.is_dir():shutil.copytree(source,target,dirs_exist_ok=True)
                    else:shutil.copy2(source,target)
                elif not target.exists():target.symlink_to(link)
    marker.write_text(VERSION)
    print(f'OpenCV {platform} ready',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--platform',choices=['android','ios','all'],default=os.environ.get('EAS_BUILD_PLATFORM','all'));args=parser.parse_args()
    for platform in (['android','ios'] if args.platform=='all' else [args.platform]):prepare(platform)
