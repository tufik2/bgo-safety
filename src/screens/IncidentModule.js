import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, LinkButton, TopBar } from '../components/ui';
import { ChecksField, DateField, FieldError, FieldLabel, PhotosField, RadioField, SelectField, TextField, TimeField } from '../components/FormFields';
import { Card, H2, Header, Screen } from './ChecklistModule';
import { FORMS, defaults, validate } from '../incidents/forms';
import { fmtDate } from '../checklists/logic';
import { fullName } from '../helpers';
import { Store } from '../store';
import { AUTH_MODE } from '../config';
import { F, useTheme } from '../theme';

/* ============================== Shell ============================== */
export default function IncidentModule({ user, asset, onExit, onAccount, onToast }) {
  const [all, setAll] = useState(null);
  const [openId, setOpenId] = useState(null);
  const touched = useRef(false);

  useEffect(() => {
    Store.incidents(asset.propertyNumber).then(setAll).catch(() => { setAll([]); onToast('Couldn’t load reports. Check your connection.'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When queued offline reports finish uploading, refresh (they get their numbers)
  const lastPending = useRef(null);
  useEffect(() => Store.onPendingChange((n) => {
    const fewer = lastPending.current != null && n < lastPending.current;
    lastPending.current = n;
    if (fewer) Store.incidents(asset.propertyNumber).then(setAll).catch(() => {});
  }), [asset.propertyNumber]);

  // Debounced save
  const timer = useRef(null);
  const pending = useRef(null);
  const queue = useRef(Promise.resolve()); // saves run one at a time, in order
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      const r = pending.current; pending.current = null;
      if (!r) return;
      try { await Store.saveIncident(r); } catch {
        onToast(AUTH_MODE === 'aws' ? 'Offline: your changes will sync when you’re back online.' : 'Couldn’t save on this device. Remove a photo and try again.');
        if (AUTH_MODE === 'aws' && !pending.current) pending.current = r;
      }
    });
    return queue.current;
  }, [onToast]);
  useEffect(() => () => { flush(); }, [flush]);
  const update = useCallback((r) => {
    touched.current = true;
    setAll((l) => l.map((x) => (x.id === r.id ? r : x)));
    pending.current = r;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [flush]);

  // Leaving a report: drop a draft nobody typed into
  const close = useCallback(async () => {
    await flush();
    const r = all && all.find((x) => x.id === openId);
    if (r && r.status === 'draft' && !touched.current) {
      await Store.deleteIncident(r.id);
      setAll((l) => l.filter((x) => x.id !== r.id));
    }
    setOpenId(null);
  }, [all, openId, flush]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (openId) close(); else onExit(); return true; });
    return () => sub.remove();
  }, [openId, close, onExit]);

  if (!all) return <TopBar user={user} onAccount={onAccount} />;

  async function create(formKey) {
    const r = {
      id: 'inc' + Date.now(), form: formKey, propertyNumber: asset.propertyNumber, status: 'draft', number: null,
      values: defaults(formKey, user, asset), createdAt: new Date().toISOString(), createdBy: { id: user.id, name: fullName(user) },
    };
    let saved;
    try { saved = await Store.saveIncident(r); } catch { onToast('Couldn’t start the report. Check your connection.'); return; }
    setAll((l) => [...l, saved]);
    touched.current = false;
    setOpenId(saved.id);
  }

  async function remove(r) {
    try { await Store.deleteIncident(r.id); } catch { onToast('Couldn’t delete the draft. Check your connection.'); return; }
    setAll((l) => l.filter((x) => x.id !== r.id));
    setOpenId(null);
    onToast('Draft deleted');
  }

  async function submit(r) {
    await flush();
    const form = FORMS[r.form];
    const year = new Date().getFullYear();
    const seq = all.filter((x) => x.form === r.form && x.propertyNumber === asset.propertyNumber && x.number && x.number.includes(`-${year}-`)).length + 1;
    const number = `${form.numberPrefix}-${asset.propertyNumber}-${year}-${String(seq).padStart(3, '0')}`;
    const done = { ...r, status: 'submitted', number: AUTH_MODE === 'aws' ? null : number, submittedAt: new Date().toISOString(), submittedBy: { id: user.id, name: fullName(user) } };
    let saved;
    try { saved = await Store.saveIncident(done); } catch { onToast('Couldn’t submit. Check your connection and try again.'); return; }
    setAll((l) => l.map((x) => (x.id === saved.id ? saved : x)));
    onToast(saved.pendingSync ? `${form.short} saved. It will be numbered and sent when you’re back online.` : `${form.short} reported as ${saved.number || number}`);
    touched.current = true;
  }

  const open = all.find((x) => x.id === openId);
  if (open) {
    return <ReportForm user={user} asset={asset} onAccount={onAccount} report={open} onBack={close}
      onChange={update} onSubmit={() => submit(open)} onDelete={() => remove(open)} onToast={onToast} />;
  }
  return <Home user={user} asset={asset} onAccount={onAccount} all={all} onBack={onExit} onCreate={create}
    onOpen={(r) => { touched.current = true; setOpenId(r.id); }} />;
}

/* ============================== Home ============================== */
function ActionCard({ title, desc, badge, onPress }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {badge}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: c.ink }}>{title}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 19, color: c.muted, marginTop: 2 }}>{desc}</Text>
        </View>
        <Icon name="chev" size={18} color={c.muted} />
      </Card>
    </Pressable>
  );
}

function TypeTag({ form }) {
  const c = useTheme();
  const acc = form === 'accident';
  return (
    <View style={{ minWidth: 44, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignItems: 'center', backgroundColor: acc ? c.fire : c.warn }}>
      <Text style={{ fontFamily: F.cond, fontSize: 15, color: acc ? '#fff' : '#1C2630' }}>{FORMS[form].numberPrefix}</Text>
    </View>
  );
}

function Home({ user, asset, onAccount, all, onBack, onCreate, onOpen }) {
  const c = useTheme();
  const mine = all.filter((x) => x.propertyNumber === asset.propertyNumber);
  const drafts = mine.filter((x) => x.status === 'draft').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const done = mine.filter((x) => x.status !== 'draft').sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  const row = (r) => {
    const f = FORMS[r.form];
    const v = r.values;
    const when = v[f.dateField];
    return (
      <Pressable key={r.id} onPress={() => onOpen(r)} style={({ pressed }) => [{ marginBottom: 10, opacity: pressed ? 0.8 : 1 }]}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <TypeTag form={r.form} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semi, fontSize: 15.5, color: c.ink }} numberOfLines={1}>{v[f.titleField] || `Untitled ${f.short.toLowerCase()}`}</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted }} numberOfLines={1}>
              {[r.number || (r.status === 'draft' ? 'Draft' : 'Waiting to upload'), when, f.summaryField && v[f.summaryField]].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Icon name="chev" size={18} color={c.muted} />
        </Card>
      </Pressable>
    );
  };
  return (
    <Screen user={user} onAccount={onAccount} header={<Header title="Incident reporting" subtitle={`${asset.propertyNumber} · ${asset.address}`} onBack={onBack} />}>
      <View style={{ gap: 10 }}>
        <ActionCard title="Report an accident or illness" desc="Someone was hurt or became ill. Records the person, injury and what happened."
          badge={<TypeTag form="accident" />} onPress={() => onCreate('accident')} />
        <ActionCard title="Report a near miss" desc="Nobody was hurt, but could have been. Records causes and how to prevent it."
          badge={<TypeTag form="nearMiss" />} onPress={() => onCreate('nearMiss')} />
      </View>
      {drafts.length > 0 && (<><H2>Drafts</H2>{drafts.map(row)}</>)}
      <H2>Reported at {asset.propertyNumber}</H2>
      {done.length ? done.map(row) : <Text style={{ fontFamily: F.regular, fontSize: 15, color: c.muted }}>No incidents reported yet.</Text>}
    </Screen>
  );
}

/* ============================== Form ============================== */
function ReportForm({ user, asset, onAccount, report, onBack, onChange, onSubmit, onDelete, onToast }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const form = FORMS[report.form];
  const ro = report.status !== 'draft';
  const v = report.values;
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroll = useRef(null);
  const errors = showErrors && !ro ? validate(form, v) : {};
  const errCount = Object.keys(errors).length;

  const set = (f, val) => {
    const patch = { [f.id]: val };
    for (const k of f.clears || []) patch[k] = null;
    onChange({ ...report, values: { ...v, ...patch } });
  };

  async function trySubmit() {
    const e = validate(form, v);
    if (Object.keys(e).length) {
      setShowErrors(true);
      scroll.current && scroll.current.scrollTo({ y: 0, animated: true });
      onToast(`${Object.keys(e).length} required ${Object.keys(e).length === 1 ? 'field is' : 'fields are'} missing`);
      return;
    }
    setBusy(true);
    await onSubmit();
    setBusy(false);
  }

  const renderField = (f) => {
    const val = v[f.id];
    const err = errors[f.id];
    const opts = typeof f.options === 'function' ? f.options(v) : f.options;
    let input;
    switch (f.type) {
      case 'auto':
        input = <TextField value={report.number || 'Assigned when you submit'} ro />; break;
      case 'textarea':
        input = <TextField value={val} onChange={(t) => set(f, t)} multiline ro={ro} error={err} accessibilityLabel={f.label} />; break;
      case 'select':
        input = <SelectField value={val} options={opts} onChange={(o) => set(f, o)} ro={ro} error={err} label={f.label} emptyHint={f.emptyHint} />; break;
      case 'radio':
        input = <RadioField value={val} options={opts} onChange={(o) => set(f, o)} ro={ro} />; break;
      case 'date':
        input = <DateField value={val} onChange={(d) => set(f, d)} ro={ro} error={err} label={f.label} />; break;
      case 'time':
        input = <TimeField value={val} onChange={(t) => set(f, t)} ro={ro} label={f.label} />; break;
      case 'checks':
        input = <ChecksField value={val} options={opts} onChange={(a) => set(f, a)} ro={ro} columns={f.columns} error={err} />; break;
      case 'photos':
        input = <PhotosField value={val} onChange={(a) => set(f, a)} ro={ro} onToast={onToast} />; break;
      default:
        input = <TextField value={val} onChange={(t) => set(f, t)} ro={ro} error={err} autoCapitalize={f.autoCapitalize} accessibilityLabel={f.label} />;
    }
    return (
      <View key={f.id} style={{ marginBottom: 16, flex: f.half ? 1 : undefined }}>
        <FieldLabel label={f.label} required={f.required && !ro} hint={ro ? null : f.hint} />
        {input}
        <FieldError error={err} />
      </View>
    );
  };

  // Pair up consecutive half-width fields
  const layout = (fields) => {
    const out = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.half && fields[i + 1] && fields[i + 1].half) {
        out.push(<View key={f.id + '+'} style={{ flexDirection: 'row', gap: 12 }}>{renderField(f)}{renderField(fields[i + 1])}</View>);
        i += 1;
      } else out.push(renderField(f));
    }
    return out;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar user={user} onAccount={onAccount} />
      <Header title={report.number || `New ${form.short.toLowerCase()}`} subtitle={`${form.title} · ${asset.propertyNumber}`} onBack={onBack} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {ro && (
          <Card style={{ marginBottom: 8, borderColor: c.egress, borderWidth: 1.5 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 16, color: c.ink }}>Reported</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: c.muted, marginTop: 2 }}>
              {fmtDate(report.submittedAt)} by {report.submittedBy.name}
            </Text>
          </Card>
        )}
        {errCount > 0 && (
          <Card style={{ marginBottom: 8, borderColor: c.fire, borderWidth: 1.5 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: c.ink }}>
              {errCount} required {errCount === 1 ? 'field is' : 'fields are'} missing
            </Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14, color: c.muted, marginTop: 2 }}>They’re marked in red below.</Text>
          </Card>
        )}
        {!ro && (
          <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted, marginBottom: 4 }}>
            Fields marked with <Text style={{ color: c.fire }}>*</Text> are mandatory. Your draft saves as you type.
          </Text>
        )}
        {form.sections.map((sec) => (
          <View key={sec.title}>
            <Text style={{ fontFamily: F.cond, fontSize: 22, color: c.ink, marginTop: 18, marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
              {sec.title}
            </Text>
            {layout(sec.fields)}
          </View>
        ))}
        {!ro && (
          confirmDelete ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Text style={{ fontFamily: F.medium, color: c.ink, fontSize: 15 }}>Delete this draft?</Text>
              <LinkButton title="Delete" onPress={onDelete} />
              <LinkButton title="Keep" onPress={() => setConfirmDelete(false)} />
            </View>
          ) : <LinkButton title="Delete draft" onPress={() => setConfirmDelete(true)} />
        )}
      </ScrollView>
      {!ro && (
        <View style={{ padding: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          <Button title={busy ? 'Submitting…' : 'Submit report'} onPress={trySubmit} disabled={busy} />
        </View>
      )}
    </View>
  );
}
