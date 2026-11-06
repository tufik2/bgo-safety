import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, CodeInput, ErrorBox, Field, LinkButton, Logo, Notification, Pill, Ring } from '../components/ui';
import { parseIdentifier } from '../helpers';
import { Auth, MAX_ATTEMPTS } from '../auth';
import { AUTH_MODE, SSO } from '../config';
import SsoButton from '../components/SsoButton';
import { F, useTheme } from '../theme';

const EXPIRED = 'Your access code expired. Enter your mobile number or email to get a new one.';
const NETWORK = 'Couldn’t reach the sign-in service. Check your connection and try again.';

export default function LoginScreen({ onSignedIn }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('identify'); // identify | verify | setup
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null); // {channel, to, expiresAt, maxAttempts, simulated?}
  const [setupToken, setSetupToken] = useState(null);
  const [showNotif, setShowNotif] = useState(false);
  const [entry, setEntry] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [shake, setShake] = useState(0);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  const maxAttempts = (sent && sent.maxAttempts) || MAX_ATTEMPTS;
  const simulated = sent && sent.simulated;              // local mode only
  const viaDevice = !!(simulated && simulated.viaDevice);

  const restart = useCallback((message) => {
    Auth.cancel();
    setRaw(''); setStep('identify'); setSent(null); setShowNotif(false); setSetupToken(null);
    setEntry(''); setAttempts(0); setErr(message || '');
  }, []);

  useEffect(() => {
    if (step !== 'verify' || !sent) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [step, sent]);

  const remaining = sent ? sent.expiresAt - now : 0;
  useEffect(() => {
    if (step === 'verify' && sent && remaining <= 0) restart(EXPIRED);
  }, [remaining, step, sent, restart]);

  const sending = useRef(false); // a second tap or Enter while the first request is still going is ignored
  async function sendCode() {
    if (sending.current) return;
    sending.current = true;
    try { await sendCodeOnce(); } finally { sending.current = false; }
  }
  async function sendCodeOnce() {
    setErr('');
    const p = parseIdentifier(raw);
    if (p && p.type === 'phone') setRaw(p.value);
    setBusy(true);
    const r = await Auth.requestCode(raw);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error === 'invalid' ? 'Enter a 10-digit mobile number or a valid email address.'
        : r.error === 'rate_limited' ? 'Too many codes requested. Wait 15 minutes and try again.' : NETWORK);
      return;
    }
    setSent(r);
    setNow(Date.now());
    setShowNotif(!!(r.simulated && !r.simulated.viaDevice)); // banner only when no device notification
    setEntry(''); setAttempts(0); setStep('verify');
  }

  async function onCode(val) {
    setEntry(val);
    if (val.length < 6 || busy) return;
    setBusy(true);
    const r = await Auth.verifyCode(sent.to, val);
    setBusy(false);
    if (r.ok) {
      setShowNotif(false); setErr('');
      if (r.needsSetup) {
        setSetupToken(r.setupToken || null);
        setForm((f) => ({ ...f, email: sent.channel === 'email' ? sent.to : '', phone: sent.channel === 'phone' ? sent.to : '' }));
        setStep('setup');
      } else onSignedIn(r.user, r.token);
      return;
    }
    if (r.error === 'expired') { restart(EXPIRED); return; }
    if (r.error === 'locked') { restart(`That code was entered incorrectly ${maxAttempts} times. Start again to get a new code.`); return; }
    if (r.error === 'mismatch') {
      setShake((k) => k + 1);
      setAttempts(maxAttempts - r.attemptsLeft); setEntry('');
      setErr(`That code doesn’t match. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`);
      return;
    }
    setEntry(''); setErr(NETWORK);
  }

  async function ssoFinish(ticket) {
    setErr('');
    const r = await Auth.ssoRedeem(ticket);
    if (r.ok) onSignedIn(r.user, r.token);
    else setErr(r.error === 'network' ? NETWORK : 'Single sign-on took too long. Try again.');
  }

  async function saveProfile() {
    setErr('');
    const f = { firstName: form.firstName.trim(), lastName: form.lastName.trim() };
    if (!f.firstName || !f.lastName) { setErr('Enter your first and last name.'); return; }
    let email = form.email.trim();
    let phone = form.phone.trim();
    if (email) { const p = parseIdentifier(email); if (!p || p.type !== 'email') { setErr('Enter a valid email address, or leave it blank.'); return; } email = p.value; }
    if (phone) { const p = parseIdentifier(phone); if (!p || p.type !== 'phone') { setErr('Enter a 10-digit mobile number, or leave it blank.'); return; } phone = p.value; }
    setBusy(true);
    const r = await Auth.completeSetup(sent.to, { ...f, email, phone }, setupToken);
    setBusy(false);
    if (r.ok) onSignedIn(r.user, r.token);
    else if (r.error === 'expired') restart(EXPIRED);
    else setErr(NETWORK);
  }

  const h1 = { fontFamily: F.cond, fontSize: 36, lineHeight: 38, color: c.ink, marginBottom: 8 };
  const lead = { fontFamily: F.regular, fontSize: 16, lineHeight: 23, color: c.muted, marginBottom: 26 };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ height: insets.top, backgroundColor: c.bg }} />
      <View style={{ height: 6, backgroundColor: c.primary }} />
      {showNotif && simulated && <Notification sent={{ ...sent, code: simulated.code }} onDismiss={() => setShowNotif(false)} />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: showNotif && step === 'verify' ? 150 : 36, paddingBottom: 24 + insets.bottom }}
        >
          <View style={{ marginBottom: 40 }}><Logo height={46} /></View>

          {step === 'identify' && (
            <View>
              <Text style={h1}>Life & fire safety</Text>
              <Text style={lead}>Sign in with the mobile number or email your administrator registered for you.</Text>
              <ErrorBox>{err}</ErrorBox>
              <Field
                label="Mobile number or email"
                value={raw}
                onChangeText={(t) => { setRaw(t); if (err) setErr(''); }}
                onBlur={() => { const p = parseIdentifier(raw); if (p && p.type === 'phone') setRaw(p.value); }}
                onSubmitEditing={sendCode}
                placeholder="416-555-0123 or name@company.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="username"
                returnKeyType="send"
              />
              <Button title={busy ? 'Checking…' : 'Send access code'} onPress={sendCode} disabled={busy || !raw.trim()} />
              {SSO.enabled && <SsoButton disabled={busy} onMessage={setErr} onTicket={ssoFinish} />}
            </View>
          )}

          {step === 'verify' && sent && (
            <View>
              <Text style={h1}>Enter your code</Text>
              <Text style={lead}>
                If <Text style={{ fontFamily: F.bold, color: c.ink }}>{sent.to}</Text> is registered for this app, we’ve{' '}
                {sent.channel === 'phone' ? 'texted' : 'emailed'} it a 6-digit code.{viaDevice ? ' Check your notifications.' : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <Ring remaining={remaining} />
                <View>
                  <Text style={{ fontFamily: F.semi, fontSize: 16, color: c.ink }}>
                    Code expires in {Math.ceil(Math.max(0, remaining) / 1000)}s
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }} accessibilityLabel={`${maxAttempts - attempts} attempts left`}>
                    {Array.from({ length: maxAttempts }, (_, i) => (
                      <View key={i} style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: i < attempts ? c.fire : c.line }} />
                    ))}
                  </View>
                </View>
              </View>
              <ErrorBox>{err}</ErrorBox>
              <CodeInput value={entry} onChange={onCode} shake={shake} />
              <Text style={{ fontFamily: F.regular, fontSize: 14.5, lineHeight: 20, color: c.muted, marginBottom: 4 }}>
                No code? Check that you entered the {sent.channel === 'phone' ? 'mobile number' : 'email address'} your administrator registered, or ask them for access.
              </Text>
              <LinkButton title="Use a different number or email" onPress={() => restart('')} />
              {!showNotif && simulated && (
                <LinkButton title={viaDevice ? 'Didn’t get it? Show the code here' : 'Show the simulated message again'} onPress={() => setShowNotif(true)} />
              )}
            </View>
          )}

          {step === 'setup' && (
            <View>
              <Text style={h1}>Set up your account</Text>
              <Text style={lead}>You’re the first person to sign in, so you’ll be the administrator for this app.</Text>
              <ErrorBox>{err}</ErrorBox>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Field style={{ flex: 1 }} label="First name" value={form.firstName} onChangeText={(t) => setForm({ ...form, firstName: t })} autoComplete="given-name" />
                <Field style={{ flex: 1 }} label="Last name" value={form.lastName} onChangeText={(t) => setForm({ ...form, lastName: t })} autoComplete="family-name" />
              </View>
              <Field label="Email" value={form.email} editable={sent.channel !== 'email'} onChangeText={(t) => setForm({ ...form, email: t })} placeholder="Optional" keyboardType="email-address" autoCapitalize="none" />
              <Field label="Mobile number" value={form.phone} editable={sent.channel !== 'phone'} onChangeText={(t) => setForm({ ...form, phone: t })} placeholder="Optional" keyboardType="phone-pad" />
              <Text style={{ fontFamily: F.semi, fontSize: 15, color: c.ink, marginBottom: 6 }}>Role</Text>
              <View style={{ marginBottom: 20 }}><Pill>Admin</Pill></View>
              <Button title={busy ? 'Saving…' : 'Create account'} onPress={saveProfile} disabled={busy} />
            </View>
          )}

          <View style={{ flex: 1 }} />
          {AUTH_MODE === 'local' && (
            <Text style={{ color: c.muted, fontSize: 13, fontFamily: F.regular, marginTop: 32 }}>
              Prototype — access codes are simulated on this device instead of being sent by text or email.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
