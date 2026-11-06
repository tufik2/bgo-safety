// Change your own mobile number: a 6-digit code goes to the NEW number and must be entered to save it.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, CodeInput, ErrorBox, Field, LinkButton } from './ui';
import { parseIdentifier } from '../helpers';
import { Store } from '../store';
import { F, useTheme } from '../theme';

const MESSAGES = {
  invalid_phone: 'Enter a 10-digit mobile number.',
  same_phone: 'That’s already your mobile number.',
  phone_in_use: 'That number belongs to another user. Ask your administrator if it should be yours.',
  rate_limited: 'Too many codes requested. Wait 15 minutes and try again.',
  mismatch: 'That code doesn’t match.',
  locked: 'That code was entered incorrectly 3 times. Request a new one.',
  expired: 'The code expired. Request a new one.',
  network: 'Couldn’t reach the server. Check your connection and try again.',
};

export default function PhoneChange({ user, onDone, onCancel }) {
  const c = useTheme();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(null); // { phone, simulatedCode? }
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function request() {
    setErr('');
    const p = parseIdentifier(phone);
    if (!p || p.type !== 'phone') { setErr(MESSAGES.invalid_phone); return; }
    setBusy(true);
    const r = await Store.requestPhoneChange(user, p.value).catch(() => ({ ok: false, error: 'network' }));
    setBusy(false);
    if (!r.ok) { setErr(MESSAGES[r.error] || MESSAGES.network); return; }
    setSent({ phone: r.phone, simulatedCode: r.simulatedCode || null });
    setCode('');
  }

  async function verify(v) {
    setCode(v);
    if (v.length < 6 || busy) return;
    setBusy(true);
    const r = await Store.verifyPhoneChange(user, v).catch(() => ({ ok: false, error: 'network' }));
    setBusy(false);
    if (r.ok) { onDone(r.user, `Mobile number changed to ${r.user.phone}`); return; }
    setCode('');
    if (r.error === 'locked' || r.error === 'expired') setSent(null);
    setErr(r.error === 'mismatch' ? `${MESSAGES.mismatch} ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.` : MESSAGES[r.error] || MESSAGES.network);
  }

  async function remove() {
    setBusy(true);
    const r = await Store.removePhone(user).catch(() => ({ ok: false, error: 'network' }));
    setBusy(false);
    if (r.ok) onDone(r.user, 'Mobile number removed. Sign in with your email.');
    else setErr(MESSAGES[r.error] || MESSAGES.network);
  }

  return (
    <View>
      <Text style={{ fontFamily: F.cond, fontSize: 26, color: c.ink, marginBottom: 4 }}>Mobile number</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: c.muted, marginBottom: 14 }}>
        {user.phone ? `Current: ${user.phone}. ` : ''}You can sign in with this number by text message.
      </Text>
      <ErrorBox>{err}</ErrorBox>
      {!sent ? (
        <View>
          <Field label="New mobile number" value={phone} onChangeText={(t) => { setPhone(t); if (err) setErr(''); }}
            placeholder="647-555-0123" keyboardType="phone-pad" autoComplete="tel" onSubmitEditing={request} />
          <View style={{ gap: 10 }}>
            <Button title={busy ? 'Sending…' : 'Send code to this number'} onPress={request} disabled={busy || !phone.trim()} />
            {user.phone ? <LinkButton title="Remove my mobile number" onPress={remove} /> : null}
            <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
          </View>
        </View>
      ) : (
        <View>
          <Text style={{ fontFamily: F.semi, fontSize: 15.5, color: c.ink, marginBottom: 6 }}>Enter the code we texted to {sent.phone}</Text>
          {sent.simulatedCode ? (
            <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted, marginBottom: 6 }}>Prototype: the code is {sent.simulatedCode}</Text>
          ) : null}
          <CodeInput value={code} onChange={verify} />
          <View style={{ gap: 10 }}>
            <LinkButton title="Use a different number" onPress={() => { setSent(null); setErr(''); }} />
            <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
          </View>
        </View>
      )}
    </View>
  );
}
