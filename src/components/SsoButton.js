// "Sign in with Okta" (or Microsoft). Opens the provider's sign-in page through the API, which keeps
// the client secret; the API sends the user back to the app with a one-time ticket.
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_BASE_URL, AUTH_MODE, SSO } from '../config';
import { api } from '../api';
import { Icon } from './ui';
import { F, useTheme } from '../theme';

WebBrowser.maybeCompleteAuthSession();

const NOT_SET_UP = 'Single sign-on isn’t set up yet. Use your email or mobile number for now.';

export default function SsoButton({ onTicket, onMessage, disabled }) {
  const c = useTheme();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(SSO.buttonLabel);
  const used = useRef(new Set()); // each one-time pass is redeemed once, however it arrives

  const finished = useRef(false);
  async function handleReturn(url) {
    const q = (url && Linking.parse(url).queryParams) || {};
    if (q.ticket || q.error) finished.current = true;
    if (q.ticket) {
      if (used.current.has(q.ticket)) return true;
      used.current.add(q.ticket);
      await onTicket(String(q.ticket));
      return true;
    }
    if (q.error) {
      onMessage({
        not_registered: `${q.email || 'This account'} isn’t set up for BGO Safety. Ask your administrator for access.`,
        sso_not_configured: NOT_SET_UP,
        cancelled: '',
      }[q.error] ?? 'Single sign-on didn’t complete. Try again.');
      return true;
    }
    return false;
  }

  // Android sometimes hands the return link to the app directly (closing the sign-in window first),
  // or restarts the app with it: catch it either way.
  useEffect(() => {
    Linking.getInitialURL().then((u) => { if (u && u.includes('ticket=')) handleReturn(u); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => { if (url.includes('ticket=') || url.includes('error=')) handleReturn(url); });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The API says which provider is set up ("Sign in with Microsoft" / "Sign in with Okta")
  useEffect(() => {
    if (AUTH_MODE !== 'aws') return undefined;
    let live = true;
    api('GET', '/auth/sso/status', undefined, { auth: false }).then((st) => { if (live && st.ok && st.enabled && st.label) setLabel(st.label); });
    return () => { live = false; };
  }, []);

  // Sign-in finishes by polling the API, so it works even when the browser can't hand control back to
  // the app (emulators such as LDPlayer, some in-app browsers). A return link, if it does arrive, also works.
  const polling = useRef(0);
  async function pollFor(pollId, untilMs) {
    const run = ++polling.current;
    while (polling.current === run && Date.now() < untilMs) {
      const p = await api('GET', `/auth/sso/poll?id=${encodeURIComponent(pollId)}`, undefined, { auth: false });
      if (polling.current !== run) return;
      if (p.ok && !p.pending) {
        polling.current += 1;
        try { WebBrowser.dismissBrowser(); } catch { /* not open */ }
        try { WebBrowser.dismissAuthSession(); } catch { /* not open */ }
        await handleReturn(`x://auth?${new URLSearchParams(Object.entries({ ticket: p.ticket, error: p.error, email: p.email }).filter(([, v]) => v))}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  async function start() {
    onMessage('');
    if (AUTH_MODE !== 'aws') { onMessage(NOT_SET_UP); return; }
    finished.current = false;
    setBusy(true);
    try {
      const back = Linking.createURL(SSO.redirectPath); // bgosafety://auth (APK) or exp://…/--/auth (Expo Go)
      const b = await api('POST', '/auth/sso/begin', { redirect: back }, { auth: false });
      if (b.error === 'network') { onMessage('Couldn’t reach the sign-in service. Check your connection and try again.'); return; }
      if (!b.ok) { onMessage(b.error === 'sso_not_configured' ? NOT_SET_UP : 'Single sign-on couldn’t start. Try again.'); return; }
      const deadline = Date.now() + 10 * 60 * 1000; // the sign-in itself is valid for 10 minutes
      const watching = pollFor(b.pollId, deadline);
      const res = await WebBrowser.openAuthSessionAsync(b.url, back);
      if (res.type === 'success') { polling.current += 1; await handleReturn(res.url); return; }
      // Window closed (by the user, or after sign-in in an emulator): keep checking briefly in case sign-in finished
      polling.current += 1;
      if (!finished.current) await pollFor(b.pollId, Date.now() + 15000);
      await watching;
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        <Text style={{ fontFamily: F.medium, color: c.muted, fontSize: 14 }}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || busy}
        onPress={start}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 10,
          borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, opacity: disabled || busy ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        <Icon name="key" size={18} color={c.ink} />
        <Text style={{ fontFamily: F.bold, fontSize: 16.5, color: c.ink }}>{busy ? 'Opening sign-in…' : label}</Text>
      </Pressable>
    </View>
  );
}
