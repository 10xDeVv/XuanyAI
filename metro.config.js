const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
config.resolver.blockList=[/[\\/]\.tools[\\/].*/,/[\\/]\.cache[\\/].*/,/[\\/]artifacts[\\/].*/,/[\\/]modules[\\/]cube-vision[\\/]opencv[\\/].*/];
module.exports=config;
