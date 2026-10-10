import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
export default function Layout(){return <><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#F5F6F0'}}}/></>;}
