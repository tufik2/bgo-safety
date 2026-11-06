import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import ChecklistModule from './src/screens/ChecklistModule';
import IncidentModule from './src/screens/IncidentModule';
import TeamModule from './src/screens/TeamModule';
import PhoneChange from './src/components/PhoneChange';
import { AssetsScreen, PropertyScreen } from './src/screens/MainScreens';
import { AccountSheet, AppWidthContext, PortalProvider, PrefsSheet, Toast, TopBarContext } from './src/components/ui';
import { Store } from './src/store';
import { setAuthLostHandler } from './src/api';
import { AUTH_MODE } from './src/config';
import { useTheme } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const c = useTheme();
  const win = useWindowDimensions();
  // On a wide browser window, show the app inside a phone-sized frame
  const framed = Platform.OS === 'web' && win.width > 520;
  const appWidth = framed ? 390 : win.width;
  const [fontsLoaded] = useFonts({ Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, BarlowCondensed_700Bold });
  const [screen, setScreen] = useState('boot'); // boot | login | assets | property | module
  const [moduleKey, setModuleKey] = useState(null);
  const [user, setUser] = useState(null);
  const [asset, setAsset] = useState(null);
  const [account, setAccount] = useState(false);
  const [autoLocate, setAutoLocate] = useState(true); // auto-open nearby property after sign-in / launch
  const [toast, setToast] = useState('');
  const [prefs, setPrefs] = useState(false);
  const [pending, setPending] = useState(0);
  const topBarActions = useMemo(() => ({ onPrefs: () => setPrefs(true), pending, syncNow: () => Store.syncNow() }), [pending]);
  // Offline changes: show how many are waiting and send them when signed in
  useEffect(() => Store.onPendingChange(setPending), []);
  useEffect(() => { if (user) Store.startSync(); }, [user && user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore a signed-in session on launch
  useEffect(() => {
    let live = true;
    (async () => {
      const s = await Store.getSession();
      if (s && s.userId) {
        let u = null, offline = false;
        try { u = await Store.getUser(s.userId); } catch { offline = true; }
        if (offline && s.user) u = s.user; // no signal at launch: keep the last signed-in user
        if (live && u && (!u.status || u.status === 'Active')) { setUser(u); setScreen('assets'); return; }
        await Store.clearSession();
      }
      if (live) setScreen('login');
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (fontsLoaded && screen !== 'boot') SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, screen]);

  // Android hardware back: close sheet, then go back a screen
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (account) { setAccount(false); return true; }
      if (prefs) { setPrefs(false); return true; }
      if (screen === 'property') { setScreen('assets'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [account, prefs, screen]);

  const signedIn = useCallback((u, token) => {
    setUser(u); Store.setSession({ userId: u.id, token: token || null, user: u }); setAutoLocate(true); setScreen('assets');
  }, []);

  const exitModule = useCallback(() => setScreen('property'), []);
  const stopAutoLocate = useCallback(() => setAutoLocate(false), []);
  const clearToast = useCallback(() => setToast(''), []);

  const signOut = useCallback(() => {
    Store.clearSession(); setAccount(false); setUser(null); setAsset(null); setScreen('login');
  }, []);

  // The server ended the session (expired, or the user was deactivated)
  useEffect(() => {
    setAuthLostHandler(() => { signOut(); setToast('Your sign-in has ended. Please sign in again.'); });
    return () => setAuthLostHandler(null);
  }, [signOut]);

  const pick = useCallback(async (a, opts) => {
    setAsset(a); setScreen('property'); setAutoLocate(false);
    if (opts && opts.auto) setToast(`Opened ${a.propertyNumber} based on your location`);
    if (user && user.recentProperty !== a.propertyNumber) {
      setUser((u) => ({ ...u, recentProperty: a.propertyNumber }));
      await Store.updateUser(user.id, { recentProperty: a.propertyNumber }).catch(() => {});
    }
  }, [user]);

  if (!fontsLoaded || screen === 'boot') return null;

  const app = (
    <TopBarContext.Provider value={topBarActions}>
    <PortalProvider>
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {screen === 'login' && <LoginScreen onSignedIn={signedIn} />}
      {screen === 'assets' && user && (
        <AssetsScreen user={user} onPick={pick} onAccount={() => setAccount(true)} autoLocate={autoLocate} onAutoLocateDone={stopAutoLocate} />
      )}
      {screen === 'property' && user && asset && (
        <PropertyScreen user={user} asset={asset} onBack={() => setScreen('assets')} onAccount={() => setAccount(true)}
          onModule={(k) => { setModuleKey(k); setScreen('module'); }} onAssetChange={setAsset} onToast={setToast} />
      )}
      {screen === 'module' && user && asset && moduleKey === 'incident' && (
        <IncidentModule user={user} asset={asset} onAccount={() => setAccount(true)} onExit={exitModule} onToast={setToast} />
      )}
      {screen === 'module' && user && asset && moduleKey === 'team' && (
        <TeamModule user={user} asset={asset} onAccount={() => setAccount(true)} onExit={exitModule} onToast={setToast} />
      )}
      {screen === 'module' && user && asset && moduleKey !== 'incident' && moduleKey !== 'team' && (
        <ChecklistModule moduleKey={moduleKey} user={user} asset={asset} onAccount={() => setAccount(true)}
          onExit={exitModule} onToast={setToast} />
      )}
      <Toast message={toast} onDone={clearToast} />
      {user && <AccountSheet user={user} visible={account} onClose={() => setAccount(false)} onSignOut={signOut} PhoneChange={PhoneChange}
        onUserChange={(u, msg) => { setUser(u); Store.updateSessionUser(u); setToast(msg); }} />}
      <PrefsSheet visible={prefs} onClose={() => setPrefs(false)} aws={AUTH_MODE === 'aws'}
        onResetDemo={async () => { setPrefs(false); await Store.resetDemoData(); signOut(); setToast('Demo data reset'); }} />
    </View>
    </PortalProvider>
    </TopBarContext.Provider>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <AppWidthContext.Provider value={appWidth}>
        {framed ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dark ? '#080B0E' : '#D5DBE0', padding: 20 }}>
            <View
              style={{
                width: 390 + 20, height: Math.min(844, win.height - 40) + 20, borderRadius: 46, padding: 10,
                backgroundColor: '#14191E', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, shadowOffset: { width: 0, height: 16 },
              }}
            >
              <View style={{ flex: 1, borderRadius: 36, overflow: 'hidden', backgroundColor: c.bg }}>{app}</View>
            </View>
          </View>
        ) : app}
      </AppWidthContext.Provider>
    </SafeAreaProvider>
  );
}
