import { useColorScheme } from 'react-native';

const light = {
  bg: '#EDF0F2', surface: '#FFFFFF', surface2: '#F6F8F9', ink: '#1C2630', muted: '#5A6772', line: '#D3DAE0',
  fire: '#C8102E', egress: '#00804A', mandatory: '#0B5CAD', warn: '#F2B21B', enviro: '#2C7A68', slate: '#4A5966',
  primary: '#065CFE', focus: '#065CFE', dangerBg: '#FCEBEC', dangerInk: '#9B0D23', scrim: 'rgba(10,15,20,0.5)', dark: false,
};
const dark = {
  bg: '#11171C', surface: '#1A2229', surface2: '#212B33', ink: '#E7ECEF', muted: '#9AA7B1', line: '#2E3943',
  fire: '#F0384F', egress: '#26B677', mandatory: '#4C9AEA', warn: '#F5BE3A', enviro: '#3FA48B', slate: '#7D8C98',
  primary: '#2F6FF2', focus: '#7FB6F2', dangerBg: '#3A1A1F', dangerInk: '#FFB3BD', scrim: 'rgba(0,0,0,0.6)', dark: true,
};

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export const F = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semi: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  cond: 'BarlowCondensed_700Bold',
};
