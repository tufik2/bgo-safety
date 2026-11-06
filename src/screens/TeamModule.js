// Property team: the users assigned to this property. Everyone on it can see the list;
// only Admins can change it or make someone an Admin.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, LinkButton, Pill, Portal, Sheet, TopBar } from '../components/ui';
import { Card, H2, Header } from './ChecklistModule';
import { fullName, initials } from '../helpers';
import { Store } from '../store';
import { F, useTheme } from '../theme';

function Person({ u, onPress, right }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: c.ink }}>{initials(u)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 16, color: c.ink }}>{fullName(u)}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted }} numberOfLines={1}>{[u.title, u.email].filter(Boolean).join(' · ')}</Text>
        </View>
        {right}
      </Card>
    </Pressable>
  );
}

export default function TeamModule({ user, asset, onExit, onAccount, onToast }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const isAdmin = user.role === 'Admin';
  const [team, setTeam] = useState(null);
  const [editing, setEditing] = useState(null); // Set of user ids while editing
  const [everyone, setEveryone] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [person, setPerson] = useState(null);

  const load = useCallback(() => Store.team(asset.propertyNumber).then(setTeam).catch(() => { setTeam([]); onToast('Couldn’t load the team. Check your connection.'); }), [asset.propertyNumber, onToast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (editing) setEditing(null); else onExit(); return true; });
    return () => sub.remove();
  }, [editing, onExit]);

  async function startEdit() {
    try { setEveryone((await Store.allUsers()).filter((u) => u.role !== 'Admin')); } catch { onToast('Couldn’t load users. Check your connection.'); return; }
    setEditing(new Set(team.map((u) => u.id)));
    setQ('');
  }
  async function saveEdit() {
    setBusy(true);
    try { setTeam(await Store.setTeam(asset.propertyNumber, [...editing])); setEditing(null); onToast('Property team updated'); }
    catch { onToast('Couldn’t save the team. Check your connection.'); }
    setBusy(false);
  }
  async function changeRole(u, role) {
    try {
      await Store.setRole(u.id, role);
      setPerson(null);
      onToast(role === 'Admin' ? `${fullName(u)} is now an Admin` : `${fullName(u)} is now a Property Manager`);
      load();
    } catch { onToast('Couldn’t change the role. Check your connection.'); }
  }

  const candidates = useMemo(() => {
    if (!everyone) return [];
    const s = q.trim().toLowerCase();
    return everyone.filter((u) => !s || `${u.firstName} ${u.lastName} ${u.email} ${u.title}`.toLowerCase().includes(s))
      .sort((a, b) => (editing.has(b.id) - editing.has(a.id)) || `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
  }, [everyone, q, editing]);

  const sub = `${asset.propertyNumber} · ${asset.name || asset.address}`;

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <TopBar user={user} onAccount={onAccount} />
        <Header title="Edit property team" subtitle={sub} onBack={() => setEditing(null)} />
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: c.line, borderRadius: 10, paddingHorizontal: 14, backgroundColor: c.surface }}>
            <Icon name="search" size={20} color={c.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search people" placeholderTextColor={c.muted} autoCorrect={false}
              style={{ flex: 1, fontFamily: F.regular, fontSize: 17, color: c.ink, paddingVertical: 12 }} />
          </View>
          <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted, marginTop: 8 }}>
            {editing.size} selected. Admins see every property, so they aren’t listed. Re-importing the property spreadsheet replaces these changes.
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
          {candidates.map((u) => {
            const on = editing.has(u.id);
            return (
              <Person key={u.id} u={u} onPress={() => { const n = new Set(editing); if (on) n.delete(u.id); else n.add(u.id); setEditing(n); }}
                right={<View accessibilityRole="checkbox" aria-checked={on} style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: on ? c.primary : c.muted, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on && <Icon name="check" size={15} color="#fff" />}</View>} />
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          <Button title="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
          <Button title={busy ? 'Saving…' : 'Save team'} onPress={saveEdit} disabled={busy} style={{ flex: 2 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar user={user} onAccount={onAccount} />
      <Header title="Property team" subtitle={sub} onBack={onExit} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom, gap: 8 }}>
        {!team && <Text style={{ fontFamily: F.regular, color: c.muted }}>Loading…</Text>}
        {team && team.length === 0 && (
          <Card><Text style={{ fontFamily: F.regular, fontSize: 15, color: c.muted }}>No one is assigned to this property yet. Admins can still see it.</Text></Card>
        )}
        {team && team.map((u) => <Person key={u.id} u={u} onPress={() => setPerson(u)} right={<Icon name="chev" size={18} color={c.muted} />} />)}
        {isAdmin && team && (
          <View style={{ marginTop: 8 }}>
            <Button title="Edit team" onPress={startEdit} />
          </View>
        )}
        {!isAdmin && team && <H2>Only Admins can change the team.</H2>}
      </ScrollView>
      <Portal>
        <Sheet visible={!!person} onClose={() => setPerson(null)}>
          {person && (
            <View>
              <Text style={{ fontFamily: F.cond, fontSize: 26, color: c.ink }}>{fullName(person)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 14 }}><Pill>{person.role}</Pill></View>
              {person.title ? <Text style={{ fontFamily: F.regular, fontSize: 15, color: c.muted, marginBottom: 10 }}>{person.title}</Text> : null}
              <View style={{ gap: 2, marginBottom: 16 }}>
                {person.email ? <LinkButton title={person.email} onPress={() => Linking.openURL(`mailto:${person.email}`)} /> : null}
                {person.phone ? <LinkButton title={person.phone} onPress={() => Linking.openURL(`tel:${person.phone.replace(/\D/g, '')}`)} /> : null}
              </View>
              {isAdmin && person.id !== user.id && (
                person.role === 'Admin'
                  ? <Button title="Make Property Manager" variant="ghost" onPress={() => changeRole(person, 'Property Manager')} />
                  : <Button title="Make Admin (sees all properties)" variant="ghost" onPress={() => changeRole(person, 'Admin')} />
              )}
              <Button title="Close" variant="ghost" onPress={() => setPerson(null)} style={{ marginTop: 10 }} />
            </View>
          )}
        </Sheet>
      </Portal>
    </View>
  );
}
