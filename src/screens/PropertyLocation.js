// Property location captured on site: the person at the property confirms they're there and the
// phone's GPS position becomes the property's location (used to open it automatically next time).
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, LinkButton, Portal, Sheet } from '../components/ui';
import { getPosition } from '../location';
import { fmtDate } from '../checklists/logic';
import { Store } from '../store';
import { F, useTheme } from '../theme';

const MAX_ACCURACY_M = 150;

export function LocationCard({ user, asset, onSaved, onToast }) {
  const c = useTheme();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const has = asset.latitude != null;

  async function save() {
    setBusy(true);
    try {
      const r = await getPosition();
      if (!r.ok) {
        onToast(r.reason === 'denied' ? 'Location is off for this app. Allow it in the device settings.'
          : r.reason === 'off' ? 'Location is turned off on this device. Turn it on and try again.'
          : 'Couldn’t get your location. Try again outside or near a window.');
        return;
      }
      const acc = Math.round(r.coords.accuracy || 0);
      if (acc > MAX_ACCURACY_M) { onToast(`GPS is too imprecise right now (±${acc} m). Try again outside or near a window.`); return; }
      const loc = { latitude: r.coords.latitude, longitude: r.coords.longitude, accuracy: acc, capturedAt: new Date().toISOString() };
      const saved = await Store.setPropertyLocation(asset.propertyNumber, loc, user);
      setAsk(false);
      onSaved(saved);
      onToast(saved.pendingSync ? 'Location saved on this phone. It will upload when you’re back online.' : `Location saved for ${asset.propertyNumber}`);
    } catch {
      onToast('Couldn’t save the location. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginHorizontal: 16, marginTop: 16 }}>
      {has ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="pin" size={18} color={c.muted} />
          <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 13.5, color: c.muted }} numberOfLines={2}>
            {asset.locationSource === 'on-site' && asset.locationSetBy
              ? `Location saved on site by ${asset.locationSetBy.name}${asset.locationSetAt ? `, ${fmtDate(asset.locationSetAt)}` : ''}`
              : 'Location set'}
          </Text>
          <LinkButton title="Update location" onPress={() => setAsk(true)} />
        </View>
      ) : (
        <Pressable onPress={() => setAsk(true)} accessibilityRole="button"
          style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primary, backgroundColor: c.surface }}>
          <Icon name="pin" size={22} color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: c.ink }}>This property has no location yet</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 13.5, lineHeight: 18, color: c.muted, marginTop: 2 }}>
              At the property now? Save your location so the app opens it automatically next time.
            </Text>
          </View>
          <Icon name="chev" size={18} color={c.muted} />
        </Pressable>
      )}
      <Portal>
        <Sheet visible={ask} onClose={() => !busy && setAsk(false)}>
          <Text style={{ fontFamily: F.cond, fontSize: 26, color: c.ink, marginBottom: 6 }}>Are you at {asset.propertyNumber} now?</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 15.5, lineHeight: 22, color: c.muted, marginBottom: 6 }}>
            {asset.name ? `${asset.name}, ` : ''}{asset.address}, {asset.city}
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: c.muted, marginBottom: 18 }}>
            Your phone’s current GPS position will be saved as this property’s location for everyone on the team.
            {has ? ' It replaces the location saved earlier.' : ''} Stand at or near the main entrance for the best result.
          </Text>
          <View style={{ gap: 10 }}>
            <Button title={busy ? 'Getting your location…' : 'Yes, I’m on site. Save location'} onPress={save} disabled={busy} />
            <Button title="Not now" variant="ghost" onPress={() => setAsk(false)} disabled={busy} />
          </View>
        </Sheet>
      </Portal>
    </View>
  );
}
