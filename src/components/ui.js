import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { F, useTheme } from '../theme';
import { fullName, initials } from '../helpers';

/* ---------- Logo ---------- */
export function Logo({ height = 44 }) {
  return (
    <Image
      source={require('../../assets/logo.png')}
      style={{ height, width: (height * 300) / 90 }}
      resizeMode="contain"
      accessibilityLabel="Refined Data"
    />
  );
}

/* ---------- Icons ---------- */
export function Icon({ name, size = 20, color }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'alert' && (<G {...p} strokeWidth={2}><Circle cx="12" cy="12" r="9" /><Path d="M12 7.5v5.5M12 16.5v.5" /></G>)}
      {name === 'search' && (<G {...p} strokeWidth={2}><Circle cx="11" cy="11" r="6.5" /><Path d="m20 20-4.2-4.2" /></G>)}
      {name === 'back' && <Path {...p} d="M15 5l-7 7 7 7" />}
      {name === 'chev' && <Path {...p} d="M9 5l7 7-7 7" />}
      {name === 'x' && <Path {...p} d="M6 6l12 12M18 6 6 18" />}
      {name === 'pin' && (<G {...p} strokeWidth={2}><Path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><Circle cx="12" cy="10" r="2.4" /></G>)}
      {name === 'check' && <Path {...p} d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === 'key' && (<G {...p} strokeWidth={2}><Circle cx="8" cy="15" r="4" /><Path d="M11 12l9-9M17 6l3 3M14 9l2 2" /></G>)}
      {name === 'gear' && (<G {...p} strokeWidth={1.9}><Circle cx="12" cy="12" r="3.2" /><Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></G>)}
      {name === 'sms' && <Path fill={color} d="M12 3C6.5 3 2 6.7 2 11.2c0 2.6 1.5 4.9 3.8 6.4L5 21l4-2.2c1 .3 2 .4 3 .4 5.5 0 10-3.7 10-8.2S17.5 3 12 3z" />}
      {name === 'mail' && (<G {...p} strokeWidth={2}><Rect x="3" y="5" width="18" height="14" rx="2" /><Path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></G>)}
    </Svg>
  );
}

/* ---------- ISO 7010-inspired badge ---------- */
export function Badge({ shape, color, icon, size = 52 }) {
  const ink = shape === 'triangle' ? '#1C2630' : '#FFFFFF';
  const sw = shape === 'triangle' ? 3 : 1.9;
  const t = shape === 'triangle' ? 'translate(15 19) scale(.92)' : 'translate(10.4 10.4) scale(1.3)';
  return (
    <Svg width={size} height={size} viewBox="0 0 52 52">
      {shape === 'square' && <Rect x="1" y="1" width="50" height="50" rx="7" fill={color} />}
      {shape === 'circle' && <Circle cx="26" cy="26" r="25" fill={color} />}
      {shape === 'triangle' && <Path d="M26 3 50 47H2z" fill={color} stroke="#1C2630" strokeWidth={3} strokeLinejoin="round" />}
      {shape === 'neutral' && <Rect x="1" y="1" width="50" height="50" rx="16" fill={color} />}
      <G transform={t} fill="none" stroke={ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </G>
    </Svg>
  );
}

/* ---------- Buttons, inputs, errors ---------- */
export function Button({ title, onPress, disabled, variant = 'primary', style }) {
  const c = useTheme();
  const ghost = variant === 'ghost';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        ghost ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.line } : { backgroundColor: c.primary },
        (disabled || pressed) && { opacity: disabled ? 0.55 : 0.85 },
        style,
      ]}
    >
      <Text style={[s.btnText, { color: ghost ? c.ink : '#FFFFFF' }]}>{title}</Text>
    </Pressable>
  );
}

export function LinkButton({ title, onPress }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ paddingVertical: 8, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.mandatory, fontFamily: F.semi, fontSize: 16, textDecorationLine: 'underline' }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...props }) {
  const c = useTheme();
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      <Text style={[s.label, { color: c.ink }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        style={[
          s.input,
          { borderColor: c.line, backgroundColor: props.editable === false ? c.surface2 : c.surface, color: props.editable === false ? c.muted : c.ink },
        ]}
        {...props}
      />
    </View>
  );
}

export function ErrorBox({ children }) {
  const c = useTheme();
  if (!children) return null;
  return (
    <View accessibilityRole="alert" style={[s.error, { backgroundColor: c.dangerBg }]}>
      <View style={{ marginTop: 2 }}><Icon name="alert" size={18} color={c.dangerInk} /></View>
      <Text style={{ color: c.dangerInk, fontFamily: F.medium, fontSize: 15, flex: 1 }}>{children}</Text>
    </View>
  );
}

export function Pill({ children }) {
  const c = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: c.line, backgroundColor: c.surface2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
      <Text style={{ fontFamily: F.bold, fontSize: 13, color: c.ink }}>{children}</Text>
    </View>
  );
}

/* ---------- App width (phone frame on wide screens) ---------- */
export const AppWidthContext = createContext(390);
export const useAppWidth = () => useContext(AppWidthContext);

/* ---------- Portal: renders overlays (sheets) at the app root, inside the phone frame ---------- */
const PortalCtx = createContext(null);
export function PortalProvider({ children }) {
  const [items, setItems] = useState({});
  const api = useMemo(() => ({
    set: (k, node) => setItems((st) => ({ ...st, [k]: node })),
    remove: (k) => setItems((st) => { const n = { ...st }; delete n[k]; return n; }),
  }), []);
  return (
    <PortalCtx.Provider value={api}>
      <View style={{ flex: 1 }}>
        {children}
        {Object.entries(items).map(([k, node]) => (
          <View key={k} style={StyleSheet.absoluteFill} pointerEvents="box-none">{node}</View>
        ))}
      </View>
    </PortalCtx.Provider>
  );
}
export function Portal({ children }) {
  const api = useContext(PortalCtx);
  const key = useRef('portal' + Math.random().toString(36).slice(2)).current;
  useEffect(() => { if (api) api.set(key, children); });
  useEffect(() => () => { if (api) api.remove(key); }, [api, key]);
  return api ? null : children;
}

/* ---------- Bottom sheet ----------
   Rendered inside the app (not a native Modal) so it stays within the
   phone frame on web; handles the Android back button itself. */
export function Sheet({ visible, onClose, children }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: visible ? 240 : 180, useNativeDriver: true })
      .start(({ finished }) => { if (finished && !visible) setMounted(false); });
  }, [visible, anim]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!mounted) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 40, elevation: 40 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: anim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          s.sheet,
          { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '90%', backgroundColor: c.surface, paddingBottom: 22 + insets.bottom },
          { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export function KV({ rows }) {
  const c = useTheme();
  return (
    <View style={{ marginVertical: 8, marginBottom: 22, gap: 8 }}>
      {rows.filter(Boolean).map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', gap: 16 }}>
          <Text style={{ width: 110, color: c.muted, fontFamily: F.regular, fontSize: 15 }}>{k}</Text>
          <View style={{ flex: 1 }}>
            {typeof v === 'string' ? <Text style={{ color: c.ink, fontFamily: F.semi, fontSize: 15 }}>{v}</Text> : v}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------- Simulated SMS / email notification ---------- */
export function Notification({ sent, onDismiss }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-200)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
  }, [y]);
  const sms = sent.channel === 'phone';
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[s.notif, { top: insets.top + 8, backgroundColor: c.surface, borderColor: c.line, transform: [{ translateY: y }] }]}
    >
      <View style={[s.notifApp, { backgroundColor: sms ? '#2DB34A' : '#1F7AE0' }]}>
        <Icon name={sms ? 'sms' : 'mail'} size={22} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: c.muted, fontFamily: F.regular }}>{sms ? 'Messages' : 'Mail'}</Text>
          <Text style={{ fontSize: 12, color: c.muted, fontFamily: F.regular }}>now</Text>
        </View>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: c.ink }}>{sms ? 'BGO Safety' : 'no-reply@refineddata.com'}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: c.ink }}>
          Your access code is <Text style={{ fontFamily: F.cond, fontSize: 18, letterSpacing: 1 }}>{sent.code}</Text>. It expires in 60 seconds.
        </Text>
        <Text style={[s.sim, { color: c.muted, borderColor: c.line }]}>Simulated {sms ? 'text message' : 'email'} to {sent.to}</Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss notification" style={{ padding: 2 }}>
        <Icon name="x" size={18} color={c.muted} />
      </Pressable>
    </Animated.View>
  );
}

/* ---------- Countdown ring ---------- */
export function Ring({ remaining }) {
  const c = useTheme();
  const r = 24, circ = 2 * Math.PI * r;
  const f = Math.max(0, remaining) / 60000;
  const secs = Math.ceil(Math.max(0, remaining) / 1000);
  const col = secs <= 10 ? c.fire : c.egress;
  return (
    <View style={{ width: 56, height: 56 }} accessibilityLabel={`${secs} seconds left`}>
      <Svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx="28" cy="28" r={r} fill="none" stroke={c.line} strokeWidth={5} />
        <Circle cx="28" cy="28" r={r} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - f)} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: F.cond, fontSize: 20, color: col }}>{secs}</Text>
      </View>
    </View>
  );
}

/* ---------- 6-digit code input ---------- */
export function CodeInput({ value, onChange, shake }) {
  const c = useTheme();
  const ref = useRef(null);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shake) return;
    Animated.sequence([-8, 8, -6, 6, 0].map((v) => Animated.timing(x, { toValue: v, duration: 60, useNativeDriver: true }))).start();
  }, [shake, x]);
  return (
    <Pressable onPress={() => ref.current && ref.current.focus()}>
      <Animated.View style={{ flexDirection: 'row', gap: 8, marginVertical: 6, marginBottom: 14, transform: [{ translateX: x }] }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const cur = i === Math.min(value.length, 5);
          return (
            <View key={i} style={[s.box, { borderColor: value[i] ? c.ink : cur ? c.focus : c.line, backgroundColor: c.surface }]}>
              <Text style={{ fontFamily: F.cond, fontSize: 30, color: c.ink }}>{value[i] || ''}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        caretHidden
        accessibilityLabel="6-digit access code"
        style={s.hiddenInput}
      />
    </Pressable>
  );
}

/* ---------- Top bar & account sheet ---------- */
// App-wide top bar actions (preferences gear), provided once by App
export const TopBarContext = createContext({ onPrefs: null, pending: 0, syncNow: null });

export function TopBar({ user, onAccount }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { onPrefs, pending, syncNow } = useContext(TopBarContext);
  return (
    <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, paddingTop: insets.top }}>
      <View style={s.barIn}>
        <Logo height={32} />
        <View style={{ flex: 1 }} />
        {onPrefs && (
          <Pressable onPress={onPrefs} accessibilityLabel="App preferences" hitSlop={6}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
            <Icon name="gear" size={24} color={c.ink} />
          </Pressable>
        )}
        <Pressable onPress={onAccount} accessibilityLabel={`Account: ${fullName(user)}`} style={[s.avatar, { backgroundColor: c.ink }]}>
          <Text style={{ color: c.surface, fontFamily: F.bold, fontSize: 15 }}>{initials(user)}</Text>
        </Pressable>
      </View>
      {pending > 0 && (
        <Pressable onPress={syncNow} accessibilityRole="button" accessibilityLabel="Changes waiting to upload. Tap to try now."
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: c.surface2, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.warn }} />
          <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 13.5, color: c.ink }}>
            {pending === 1 ? '1 change' : `${pending} changes`} saved on this phone, waiting to upload
          </Text>
          <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: c.mandatory }}>Sync now</Text>
        </Pressable>
      )}
    </View>
  );
}

export function AccountSheet({ user, visible, onClose, onSignOut, onUserChange, PhoneChange }) {
  const c = useTheme();
  const [changing, setChanging] = useState(false);
  const close = () => { setChanging(false); onClose(); };
  if (changing) {
    return (
      <Sheet visible={visible} onClose={close}>
        <PhoneChange user={user} onCancel={() => setChanging(false)}
          onDone={(u, msg) => { setChanging(false); onUserChange(u, msg); }} />
      </Sheet>
    );
  }
  return (
    <Sheet visible={visible} onClose={close}>
      <Text style={[s.sheetTitle, { color: c.ink }]}>{fullName(user)}</Text>
      <KV
        rows={[
          ['Role', <Pill key="r">{user.role}</Pill>],
          user.title ? ['Title', user.title] : null,
          ['Email', user.email || '—'],
          ['Mobile', <View key="m" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Text style={{ color: c.ink, fontFamily: F.semi, fontSize: 15 }}>{user.phone || '—'}</Text>
            {PhoneChange ? <LinkButton title={user.phone ? 'Change' : 'Add'} onPress={() => setChanging(true)} /> : null}
          </View>],
          ['Last property', user.recentProperty || '—'],
        ]}
      />
      <View style={{ gap: 10 }}>
        <Button title="Sign out" onPress={onSignOut} />
        <Button title="Close" variant="ghost" onPress={close} />
      </View>
    </Sheet>
  );
}

export const s = StyleSheet.create({
  btn: { borderRadius: 10, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.bold, fontSize: 17, letterSpacing: 0.2 },
  label: { fontFamily: F.semi, fontSize: 15, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 17, fontFamily: F.regular },
  error: { flexDirection: 'row', gap: 10, borderRadius: 10, padding: 12, marginBottom: 16 },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 22 },
  sheetTitle: { fontFamily: F.cond, fontSize: 26, marginTop: 10, marginBottom: 6 },
  notif: { position: 'absolute', left: 10, right: 10, zIndex: 50, elevation: 12, borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } },
  notifApp: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sim: { alignSelf: 'flex-start', marginTop: 6, fontSize: 11.5, borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, fontFamily: F.regular },
  box: { flex: 1, aspectRatio: 5 / 6, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  barIn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, minHeight: 60 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

/* ---------- Toast ---------- */
export function Toast({ message, onDone }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return undefined;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(a, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onDone && onDone()), 3200);
    return () => clearTimeout(t);
  }, [message, a, onDone]);
  if (!message) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: 84 + insets.bottom, zIndex: 60, elevation: 20, alignItems: 'center', opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}
    >
      <View style={{ backgroundColor: c.ink, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 }}>
        <Text style={{ color: c.surface, fontFamily: F.semi, fontSize: 15 }}>{message}</Text>
      </View>
    </Animated.View>
  );
}

/* ---------- App preferences ---------- */
export function PrefsSheet({ visible, onClose, onResetDemo, aws }) {
  const c = useTheme();
  const [confirm, setConfirm] = useState(false);
  const planned = [
    ['Notifications', 'Survey reminders, approvals and corrective action due dates'],
    ['Display', 'Light or dark appearance, text size'],
    ['Language', 'English or French'],
    ['Sign-in', 'Stay signed in, sign out of other devices'],
  ];
  return (
    <Sheet visible={visible} onClose={() => { setConfirm(false); onClose(); }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="gear" size={24} color={c.ink} />
        <Text style={[s.sheetTitle, { color: c.ink, marginTop: 0, marginBottom: 0 }]}>App preferences</Text>
      </View>
      <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: c.muted, marginTop: 6, marginBottom: 14 }}>
        These settings are planned for the next phase.
      </Text>
      <View style={{ gap: 10, marginBottom: 18 }}>
        {planned.map(([t, d]) => (
          <View key={t}>
            <Text style={{ fontFamily: F.semi, fontSize: 15.5, color: c.ink }}>{t}</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14, color: c.muted }}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, marginBottom: 12 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 15.5, color: c.ink }}>Demo data</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14, color: c.muted }}>
          {aws
            ? 'Clears settings saved on this device and signs you out. Surveys and reports stay on the server.'
            : 'Clears surveys, incident reports and settings saved on this device, then signs you out.'}
        </Text>
        {confirm ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Text style={{ fontFamily: F.medium, color: c.ink, fontSize: 15 }}>Reset everything?</Text>
            <LinkButton title="Reset" onPress={() => { setConfirm(false); onResetDemo(); }} />
            <LinkButton title="Cancel" onPress={() => setConfirm(false)} />
          </View>
        ) : <LinkButton title="Reset demo data" onPress={() => setConfirm(true)} />}
      </View>
      <Button title="Close" variant="ghost" onPress={() => { setConfirm(false); onClose(); }} />
    </Sheet>
  );
}
