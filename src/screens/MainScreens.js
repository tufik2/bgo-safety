import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Path } from 'react-native-svg';
import { Badge, Button, ErrorBox, Icon, KV, LinkButton, Sheet, TopBar, useAppWidth } from '../components/ui';
import { MODULES } from '../checklists/registry';
import { LocationCard as SaveLocationCard } from './PropertyLocation';
import { NEARBY_RADIUS_M, formatDistance, getPosition, rankByDistance } from '../location';
import { fullName } from '../helpers';
import { Store } from '../store';
import { F, useTheme } from '../theme';

/* ======================= Property list ======================= */
function AssetRow({ a, accent, onPick }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={() => onPick(a)}
      style={({ pressed }) => [
        st.asset,
        { backgroundColor: c.surface, borderColor: accent || c.line, borderWidth: accent ? 1.5 : 1, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[st.num, { backgroundColor: c.ink }]}>
        <Text style={{ fontFamily: F.cond, fontSize: 17, color: c.surface, letterSpacing: 0.5 }}>{a.propertyNumber}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 16, color: c.ink }} numberOfLines={1}>{a.name || a.address}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: c.muted }} numberOfLines={1}>
          {a.name && a.name !== a.address ? `${a.address}, ` : ''}{a.city}{a.distance != null ? `  ·  ${formatDistance(a.distance)}` : ''}
        </Text>
      </View>
      <Icon name="chev" size={18} color={c.muted} />
    </Pressable>
  );
}

/* Where am I? — status card above the list */
function LocationCard({ loc, onRetry, onChange }) {
  const c = useTheme();
  let tone = c.muted, text;
  if (!loc || loc.state === 'locating') text = 'Finding your location…';
  else if (loc.state === 'denied') text = 'Location is off for this app. Turn it on to open your property automatically.';
  else if (loc.state === 'off') text = 'Location is turned off on this device. Turn it on in the device settings, then tap Try again.';
  else if (loc.state === 'unavailable') text = 'Couldn’t get your location. Check that location is on, then tap Try again.';
  else if (loc.noPositions) text = 'Your properties don’t have locations yet. Choose one from the list; when you’re on site, open it and save its location.';
  else if (loc.nearest) { tone = c.egress; text = `You’re at ${loc.nearest.propertyNumber}.`; }
  else if (loc.closest && loc.closest.distance != null) text = `No property within ${NEARBY_RADIUS_M} m. Closest is ${loc.closest.propertyNumber}, ${formatDistance(loc.closest.distance)} away. On site? Open the property and save its location.`;
  else text = 'No property found near you.';
  const showRetry = loc && (loc.state === 'denied' || loc.state === 'off' || loc.state === 'unavailable' || (loc.state === 'done' && !loc.nearest));
  return (
    <View style={[st.locCard, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Icon name="pin" size={20} color={tone} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: c.ink }}>{text}</Text>
        {loc && loc.simulated && (
          <Text style={{ fontFamily: F.regular, fontSize: 13, color: c.muted, marginTop: 2 }}>Simulated location: {loc.simulated.label}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 2 }}>
          {showRetry && <LinkButton title="Try again" onPress={onRetry} />}
          <LinkButton title="Simulate location" onPress={onChange} />
        </View>
      </View>
    </View>
  );
}

/* Demo aid: pretend to be at a property (emulators/preview aren't at real sites) */
function SimulateSheet({ visible, assets, current, onClose, onChoose }) {
  const c = useTheme();
  const opt = (key, label, sub, value) => {
    const on = (current ? current.key : 'device') === key;
    return (
      <Pressable key={key} onPress={() => onChoose(value)} style={[st.opt, { borderColor: on ? c.primary : c.line, backgroundColor: c.surface }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 15.5, color: c.ink }}>{label}</Text>
          {sub ? <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted }}>{sub}</Text> : null}
        </View>
        {on && <Icon name="check" size={20} color={c.primary} />}
      </Pressable>
    );
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ fontFamily: F.cond, fontSize: 26, color: c.ink, marginBottom: 4 }}>Simulate location</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: c.muted, marginBottom: 14 }}>
        For demos and testing. Choose where to pretend you are; the app then finds the property as if your GPS put you there.
      </Text>
      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
        {opt('device', 'Use my real location', 'Device GPS', null)}
        {opt('away', 'Away from all properties', 'Downtown Winnipeg', { key: 'away', label: 'away from all properties', latitude: 49.8951, longitude: -97.1384 })}
        {(assets || []).length > 0 && !(assets || []).some((a) => a.latitude != null) && (
          <View style={{ backgroundColor: c.surface2, borderRadius: 10, padding: 12 }}>
            <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: c.ink }}>Your properties don’t have map positions yet</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 13.5, lineHeight: 19, color: c.muted, marginTop: 4 }}>
              They’re added from each property’s address by server/scripts/geocode-properties.mjs (setup guide, section 6). Once that has run, every property you can see is listed here.
            </Text>
          </View>
        )}
        {(assets || []).filter((a) => a.latitude != null).map((a) =>
          opt(a.propertyNumber, `At ${a.propertyNumber}`, `${a.address}, ${a.city}`,
            { key: a.propertyNumber, label: `at ${a.propertyNumber}`, latitude: a.latitude + 0.0004, longitude: a.longitude + 0.0003 }))}
      </ScrollView>
      <Button title="Close" variant="ghost" onPress={onClose} style={{ marginTop: 14 }} />
    </Sheet>
  );
}

export function AssetsScreen({ user, onPick, onAccount, autoLocate, onAutoLocateDone }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState(null); // {state, coords, nearest, closest, simulated}
  const [simOpen, setSimOpen] = useState(false);
  const [sim, setSim] = useState(null);

  useEffect(() => {
    let live = true;
    Store.assets(user)
      .then((a) => live && setList(a))
      .catch(() => { if (live) { setErr('Couldn’t load properties. Try again.'); setList([]); } });
    Store.getSimLocation().then((v) => live && setSim(v));
    return () => { live = false; };
  }, []);

  const locate = useCallback(async (assets, auto) => {
    setLoc({ state: 'locating' });
    const r = await getPosition();
    if (!r.ok) { setLoc({ state: r.reason }); if (auto) onAutoLocateDone(); return; }
    const { list: ranked, nearest } = rankByDistance(assets, r.coords);
    const noPositions = !assets.some((a) => a.latitude != null);
    setLoc({ state: 'done', coords: r.coords, nearest, closest: ranked[0], simulated: r.simulated, noPositions });
    if (auto) {
      onAutoLocateDone();
      if (nearest) onPick(nearest, { auto: true });
    }
  }, [onPick, onAutoLocateDone]);

  // Locate once the properties are loaded; auto-open only right after sign-in / app launch
  const located = useRef(false);
  useEffect(() => {
    if (!list || located.current) return;
    located.current = true;
    locate(list, autoLocate);
  }, [list, autoLocate, locate]);

  async function chooseSim(v) {
    await Store.setSimLocation(v);
    setSim(v); setSimOpen(false);
    if (list) locate(list, false);
  }

  const ranked = useMemo(() => {
    if (!list) return [];
    return loc && loc.coords ? rankByDistance(list, loc.coords).list : list;
  }, [list, loc]);
  const here = loc && loc.nearest ? ranked.find((a) => a.id === loc.nearest.id) : null;
  const recent = ranked.find((a) => a.propertyNumber === user.recentProperty && a !== here);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ranked.filter((a) => !s || [a.propertyNumber, a.name, a.address, a.city, a.stateProvince, a.postalCode].join(' ').toLowerCase().includes(s));
  }, [ranked, q]);
  const others = q ? filtered : filtered.filter((a) => a !== recent && a !== here);
  const byDistance = !!(loc && loc.coords);

  const sect = { fontFamily: F.semi, color: c.muted, fontSize: 14.5, marginTop: 20, marginBottom: 10 };

  const header = (
    <View>
      <Text style={pageH(c)}>Hello, {user.firstName || 'there'}</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 16, color: c.muted, marginBottom: 16 }}>Choose the property you’re inspecting.</Text>
      <LocationCard loc={loc} onRetry={() => list && locate(list, false)} onChange={() => setSimOpen(true)} />
      <View style={[st.search, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Icon name="search" size={20} color={c.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by number, name, address or city"
          placeholderTextColor={c.muted}
          style={{ flex: 1, fontFamily: F.regular, fontSize: 17, color: c.ink, paddingVertical: 12 }}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <ErrorBox>{err}</ErrorBox>
      {list && here && !q && (
        <View>
          <Text style={sect}>You’re here</Text>
          <AssetRow a={here} accent={c.egress} onPick={onPick} />
        </View>
      )}
      {list && recent && !q && (
        <View>
          <Text style={sect}>Last visited</Text>
          <AssetRow a={recent} accent={c.slate} onPick={onPick} />
        </View>
      )}
      {list && list.length > 0 && (
        <Text style={sect}>
          {q
            ? `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'}`
            : `${here || recent ? 'Other properties' : 'All properties'} (${others.length})${byDistance ? ', nearest first' : ''}`}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar user={user} onAccount={onAccount} />
      <FlatList
        data={list ? others : []}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <AssetRow a={item} onPick={onPick} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !list ? (
            <Text style={{ color: c.muted, fontFamily: F.regular, paddingVertical: 20 }}>Loading properties…</Text>
          ) : (
            <View style={[st.empty, { borderColor: c.line }]}>
              <Text style={{ color: c.muted, fontFamily: F.regular, textAlign: 'center', fontSize: 15 }}>
                {q ? `No properties match “${q}”.` : 'No properties have been added yet. Ask your administrator to add properties.'}
              </Text>
            </View>
          )
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      />
      <SimulateSheet visible={simOpen} assets={list} current={sim} onClose={() => setSimOpen(false)} onChoose={chooseSim} />
    </View>
  );
}

/* ======================= Property dashboard ======================= */
const TILES = [
  { key: 'environmental', name: 'Environmental survey', desc: 'Spills, waste handling, air and water quality observations.', shape: 'square', color: 'enviro',
    icon: <Path d="M4.5 19.5C4.5 10 10.5 4 20 4c0 9.5-6 15.5-15.5 15.5zM4.5 19.5 13 11" /> },
  { key: 'health', name: 'Health & safety survey', desc: 'Workplace hazards, PPE and housekeeping checks.', shape: 'circle', color: 'mandatory',
    icon: <Path d="M3 17.5h18M5 17.5a7 7 0 0 1 14 0M10 10.8V7h4v3.8" /> },
  { key: 'incident', name: 'Incident reporting', desc: 'Log an incident or near miss with photos and location.', shape: 'triangle', color: 'warn',
    icon: <Path d="M12 6v8M12 18.5v.5" /> },
  { key: 'fire', name: 'Fire & life safety checklist', desc: 'Inspect alarms, extinguishers, exits and suppression systems.', shape: 'square', color: 'fire',
    icon: <Path d="M12 2.5c.6 3.4 4.8 5.3 4.8 10.2A4.8 4.8 0 0 1 12 21.5a4.8 4.8 0 0 1-4.8-4.8c0-2.6 1.4-3.8 2.4-5 .2 1.8 1 2.8 2.2 3 .2-3.6-1.2-5.8.2-12.2z" /> },
  { key: 'emergency', name: 'Emergency preparedness', desc: 'Evacuation plans, wardens, assembly points and drills.', shape: 'square', color: 'egress',
    icon: <Path d="M4 21V3h10v18M11 12h.01M14 12h7m-3-3 3 3-3 3" /> },
  { key: 'team', name: 'Property team', desc: 'See and update who manages this property.', shape: 'neutral', color: 'slate',
    icon: [<Circle key="a" cx="9" cy="8" r="3.2" />, <Path key="b" d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />, <Circle key="c" cx="17.5" cy="9" r="2.5" />, <Path key="d" d="M16.5 14.2c2.6.3 4.5 2.6 4.5 5.3" />] },
];

const GRID = TILES.filter((t) => t.key !== 'team');
const TEAM = TILES.find((t) => t.key === 'team');

export function PropertyScreen({ user, asset, onBack, onAccount, onModule, onAssetChange, onToast }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(null);
  const tile = TILES.find((t) => t.key === open);
  const cols = 2; // always two tiles per row
  const gap = 12;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar user={user} onAccount={onAccount} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <View style={{ backgroundColor: c.ink, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 22, flexDirection: 'row', gap: 14 }}>
          <Pressable onPress={onBack} accessibilityLabel="Back to properties" style={[st.iconbtn, { borderColor: 'rgba(255,255,255,0.3)' }]}>
            <Icon name="back" size={20} color={c.surface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.cond, fontSize: 40, lineHeight: 42, color: c.surface, letterSpacing: 0.8 }}>{asset.propertyNumber}</Text>
            {asset.name ? <Text style={{ fontFamily: F.semi, fontSize: 17.5, color: c.surface, marginTop: 4 }}>{asset.name}</Text> : null}
            <Text style={{ fontFamily: F.regular, fontSize: 15.5, color: c.surface, opacity: 0.85, marginTop: 2 }}>
              {asset.address}, {asset.city}, {asset.stateProvince}
            </Text>
          </View>
        </View>
        <SaveLocationCard user={user} asset={asset} onSaved={onAssetChange} onToast={onToast} />
        {/* Rows of two tiles sharing the available width, so a scrollbar can't push a tile onto its own row */}
        <View style={{ padding: 16, gap }}>
          {Array.from({ length: Math.ceil(GRID.length / cols) }, (_, r) => GRID.slice(r * cols, r * cols + cols)).map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap }}>
              {row.map((t) => (
            <View key={t.key} style={{ flex: 1 }}>
            <Pressable
              onPress={() => (MODULES[t.key] || t.key === 'incident' ? onModule(t.key) : setOpen(t.key))}
              style={({ pressed }) => [st.tile, { flex: 1, backgroundColor: c.surface, borderColor: c.line, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            >
              <Badge shape={t.shape} color={c[t.color]} icon={t.icon} />
              <View>
                <Text style={{ fontFamily: F.bold, fontSize: 16.5, lineHeight: 20, color: c.ink }}>{t.name}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13.5, lineHeight: 18, color: c.muted, marginTop: 4 }}>{t.desc}</Text>
              </View>
            </Pressable>
            </View>
              ))}
              {row.length < cols && <View style={{ flex: cols - row.length }} />}
            </View>
          ))}

          {/* People, kept apart from the inspection tools */}
          <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: c.muted, marginTop: 10 }}>People</Text>
          <Pressable
            onPress={() => onModule('team')}
            accessibilityRole="button"
            style={({ pressed }) => [st.teamRow, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.85 : 1 }]}
          >
            <Badge shape={TEAM.shape} color={c[TEAM.color]} icon={TEAM.icon} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 16.5, color: c.ink }}>{TEAM.name}</Text>
              <Text style={{ fontFamily: F.regular, fontSize: 13.5, lineHeight: 18, color: c.muted, marginTop: 2 }}>{TEAM.desc}</Text>
            </View>
            <Icon name="chev" size={18} color={c.muted} />
          </Pressable>
        </View>
      </ScrollView>

      <Sheet visible={!!tile} onClose={() => setOpen(null)}>
        {tile && (
          <View>
            <Badge shape={tile.shape} color={c[tile.color]} icon={tile.icon} />
            <Text style={{ fontFamily: F.cond, fontSize: 26, color: c.ink, marginTop: 12, marginBottom: 6 }}>{tile.name}</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: c.muted, marginBottom: 12 }}>
              {tile.desc} This module is planned for the next phase of the prototype.
            </Text>
            <KV rows={[['Property', asset.propertyNumber], ['Signed in as', `${fullName(user)} (${user.role})`]]} />
            <Button title="Close" variant="ghost" onPress={() => setOpen(null)} />
          </View>
        )}
      </Sheet>
    </View>
  );
}

const pageH = (c) => ({ fontFamily: F.cond, fontSize: 32, lineHeight: 34, color: c.ink, marginTop: 4, marginBottom: 4 });

const st = StyleSheet.create({
  asset: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  num: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, marginBottom: 6 },
  locCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, marginBottom: 12 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  empty: { padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12 },
  iconbtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderWidth: 1, borderRadius: 14 },
  tile: { minHeight: 160, padding: 16, borderWidth: 1, borderRadius: 14, gap: 14 },
});
