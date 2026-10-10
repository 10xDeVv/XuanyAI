require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
  s.name = 'CubeVision'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = package['homepage']
  s.license = package['license']
  s.author = package['author']
  s.platforms = { :ios => min_ios_version_supported }
  # Installed from this repository as a local pod by Expo autolinking.
  s.source = { :git => 'https://github.com/10xDeVv/XuanyAI.git', :branch => 'main' }
  s.source_files = 'cpp/Detector.{hpp,cpp}', 'cpp/HybridCubeVision.hpp'
  s.vendored_frameworks = 'opencv/ios/opencv2.framework'
  s.frameworks = 'Accelerate', 'AVFoundation', 'CoreGraphics', 'CoreMedia', 'CoreVideo'
  s.libraries = 'c++'
  load File.join(__dir__, 'nitrogen/generated/ios/CubeVision+autolinking.rb')
  add_nitrogen_files(s)
  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
