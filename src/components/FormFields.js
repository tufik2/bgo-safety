import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import { Button, Icon, LinkButton, Portal, Sheet } from './ui';
import { F, useTheme } from '../theme';
import { Store } from '../store';
import { keepPhoto } from '../photos';

const MAX_PHOTOS = 6;

export function FieldLabel({ label, required, hint, error }) {
  const c = useTheme();
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontFamily: F.semi, fontSize: 15, color: c.ink }}>
        {label}{required ? <Text style={{ color: c.fire }}> *</Text> : null}
      </Text>
      {hint ? <Text style={{ fontFamily: F.regular, fontSize: 13.5, lineHeight: 18, color: c.muted, marginTop: 2 }}>{hint}</Text> : null}
    </View>
  );
}

export function FieldError({ error }) {
  const c = useTheme();
  return error ? <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: c.fire, marginTop: 4 }}>{error}</Text> : null;
}

const boxStyle = (c, error, ro) => ({
  borderWidth: 1.5, borderColor: error ? c.fire : c.line, borderRadius: 10, backgroundColor: ro ? c.surface2 : c.surface,
});

export function TextField({ value, onChange, multiline, ro, error, ...rest }) {
  const c = useTheme();
  return (
    <TextInput
      value={value || ''}
      onChangeText={onChange}
      editable={!ro}
      multiline={multiline}
      placeholderTextColor={c.muted}
      style={[boxStyle(c, error, ro), { paddingHorizontal: 12, paddingVertical: 11, minHeight: multiline ? 96 : 46, textAlignVertical: multiline ? 'top' : 'center',
        fontFamily: F.regular, fontSize: 16, color: ro ? c.muted : c.ink }]}
      {...rest}
    />
  );
}

/* ---------- Select (opens a list in a bottom sheet) ---------- */
export function SelectField({ value, options, onChange, ro, error, label, emptyHint }) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const none = !options.length;
  return (
    <>
      <Pressable
        onPress={() => !ro && !none && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'not selected'}`}
        style={[boxStyle(c, error, ro), { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: none ? 0.6 : 1 }]}
      >
        <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 16, color: value ? (ro ? c.muted : c.ink) : c.muted }} numberOfLines={1}>
          {value || (none ? emptyHint || 'No options' : 'Select')}
        </Text>
        {!ro && <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 9l6 6 6-6" stroke={c.muted} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>}
      </Pressable>
      <Portal>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Text style={{ fontFamily: F.cond, fontSize: 24, color: c.ink, marginBottom: 10 }}>{label}</Text>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 6 }}>
          {options.map((o) => (
            <Pressable key={o} onPress={() => { onChange(o); setOpen(false); }} accessibilityRole="radio" aria-checked={value === o}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5,
                borderColor: value === o ? c.primary : c.line, backgroundColor: c.surface }}>
              <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 16, color: c.ink }}>{o}</Text>
              {value === o && <Icon name="check" size={18} color={c.primary} />}
            </Pressable>
          ))}
        </ScrollView>
        {value ? <LinkButton title="Clear selection" onPress={() => { onChange(null); setOpen(false); }} /> : null}
        <Button title="Close" variant="ghost" onPress={() => setOpen(false)} style={{ marginTop: 8 }} />
      </Sheet>
      </Portal>
    </>
  );
}

/* ---------- Date: typed YYYY-MM-DD with day stepping and "Today" ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };

function Stepper({ dir, onPress, label }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6}
      style={{ width: 40, height: 46, borderRadius: 10, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d={dir === 'up' ? 'M6 15l6-6 6 6' : dir === 'down' ? 'M6 9l6 6 6-6' : dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
          stroke={c.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

export function DateField({ value, onChange, ro, error, label }) {
  const step = (n) => { const d = parse(value) || new Date(); d.setDate(d.getDate() + n); onChange(iso(d)); };
  if (ro) return <TextField value={value} ro />;
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Stepper dir="left" onPress={() => step(-1)} label={`${label}: previous day`} />
        <View style={{ flex: 1 }}>
          <TextField value={value} onChange={(t) => onChange(t.replace(/[^0-9-]/g, '').slice(0, 10))} error={error} placeholder="YYYY-MM-DD"
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} accessibilityLabel={label} />
        </View>
        <Stepper dir="right" onPress={() => step(1)} label={`${label}: next day`} />
      </View>
      <LinkButton title="Today" onPress={() => onChange(iso(new Date()))} />
    </View>
  );
}

/* ---------- Time: hour/minute steppers with AM/PM (like the web form) ---------- */
export function TimeField({ value, onChange, ro, label }) {
  const c = useTheme();
  const [h24, m] = (value || '00:00').split(':').map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 || 12;
  const set = (h, mm) => onChange(`${pad(((h % 24) + 24) % 24)}:${pad(((mm % 60) + 60) % 60)}`);
  const box = { minWidth: 52, height: 46, borderRadius: 10, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: ro ? c.surface2 : c.surface };
  const num = { fontFamily: F.semi, fontSize: 17, color: ro ? c.muted : c.ink };
  if (ro) return <View style={[box, { alignSelf: 'flex-start', paddingHorizontal: 12 }]}><Text style={num}>{pad(h12)}:{pad(m)} {pm ? 'PM' : 'AM'}</Text></View>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`${label} ${pad(h12)}:${pad(m)} ${pm ? 'PM' : 'AM'}`}>
      <View style={{ gap: 4, alignItems: 'center' }}>
        <Stepper dir="up" onPress={() => set(h24 + 1, m)} label="Hour up" />
        <View style={box}><Text style={num}>{pad(h12)}</Text></View>
        <Stepper dir="down" onPress={() => set(h24 - 1, m)} label="Hour down" />
      </View>
      <Text style={[num, { marginHorizontal: -2 }]}>:</Text>
      <View style={{ gap: 4, alignItems: 'center' }}>
        <Stepper dir="up" onPress={() => set(h24, m + 1)} label="Minute up" />
        <View style={box}><Text style={num}>{pad(m)}</Text></View>
        <Stepper dir="down" onPress={() => set(h24, m - 1)} label="Minute down" />
      </View>
      <Pressable onPress={() => set(h24 + 12, m)} accessibilityRole="button" accessibilityLabel={`Switch to ${pm ? 'AM' : 'PM'}`}
        style={[box, { marginLeft: 4 }]}>
        <Text style={num}>{pm ? 'PM' : 'AM'}</Text>
      </Pressable>
    </View>
  );
}

/* ---------- Checkboxes and radio buttons ---------- */
function Tick({ on, round }) {
  const c = useTheme();
  return (
    <View style={{ width: 22, height: 22, borderRadius: round ? 11 : 5, borderWidth: 1.5, borderColor: on ? c.primary : c.muted,
      backgroundColor: on && !round ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on && (round ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : <Icon name="check" size={14} color="#fff" />)}
    </View>
  );
}

export function ChecksField({ value, options, onChange, ro, columns = 1, error }) {
  const c = useTheme();
  const sel = new Set(value || []);
  const toggle = (o) => { const n = new Set(sel); if (n.has(o)) n.delete(o); else n.add(o); onChange(options.filter((x) => n.has(x))); };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderWidth: error ? 1.5 : 0, borderColor: c.fire, borderRadius: 10, padding: error ? 6 : 0 }}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => !ro && toggle(o)} accessibilityRole="checkbox" aria-checked={sel.has(o)} accessibilityState={{ checked: sel.has(o), disabled: ro }}
          style={{ width: `${100 / columns}%`, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingRight: 8 }}>
          <Tick on={sel.has(o)} />
          <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: c.ink }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function RadioField({ value, options, onChange, ro }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 24 }} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable key={o} onPress={() => !ro && onChange(value === o ? null : o)} accessibilityRole="radio" aria-checked={value === o}
          accessibilityState={{ checked: value === o, disabled: ro }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <Tick on={value === o} round />
          <Text style={{ fontFamily: F.medium, fontSize: 16, color: c.ink }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- Photo thumbnail: local file, or a stored photo fetched through a short-lived link ---------- */
export function PhotoThumb({ photo, size = 84, label }) {
  const c = useTheme();
  const [url, setUrl] = useState(photo.uri || null);
  useEffect(() => {
    let live = true;
    if (!photo.uri && photo.key) Store.photoUrl(photo.key).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [photo.uri, photo.key]);
  return url
    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: 8, backgroundColor: c.surface2 }} accessibilityLabel={label} />
    : <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: c.surface2 }} accessibilityLabel={label} />;
}

/* ---------- Photos (camera or library) ---------- */
export function PhotosField({ value, onChange, ro, onToast }) {
  const c = useTheme();
  const photos = value || [];
  async function add(camera) {
    try {
      let res;
      if (camera && Platform.OS !== 'web') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) { onToast('Camera access is off for this app'); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4 });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 });
      }
      if (res.canceled || !res.assets || !res.assets[0]) return;
      onChange([...photos, { uri: await keepPhoto(res.assets[0].uri), at: new Date().toISOString() }].slice(0, MAX_PHOTOS));
    } catch { onToast('Couldn’t add the photo'); }
  }
  return (
    <View>
      {photos.length === 0 && ro && <Text style={{ fontFamily: F.regular, color: c.muted, fontSize: 15 }}>No photos</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((p, i) => (
          <View key={p.at + i}>
            <PhotoThumb photo={p} size={84} label={`Photo ${i + 1}`} />
            {!ro && (
              <Pressable onPress={() => onChange(photos.filter((_, j) => j !== i))} accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={6}
                style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={12} color={c.surface} />
              </Pressable>
            )}
          </View>
        ))}
      </View>
      {!ro && photos.length < MAX_PHOTOS && (
        <View style={{ flexDirection: 'row', gap: 18 }}>
          {Platform.OS !== 'web' && <LinkButton title="Take photo" onPress={() => add(true)} />}
          <LinkButton title={Platform.OS === 'web' ? 'Add photo' : 'Choose photo'} onPress={() => add(false)} />
        </View>
      )}
    </View>
  );
}
