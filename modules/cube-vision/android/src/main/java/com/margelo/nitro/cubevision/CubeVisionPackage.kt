package com.margelo.nitro.cubevision
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CubeVisionPackage : ReactPackage {
  companion object { init { System.loadLibrary("CubeVision") } }
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
