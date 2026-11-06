import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Button, Icon, LinkButton, Portal, Sheet, TopBar } from '../components/ui';
import SignaturePad from '../components/SignaturePad';
import { PhotoThumb } from '../components/FormFields';
import { keepPhoto } from '../photos';
import * as WebBrowser from 'expo-web-browser';
import { ALL_CHECKLISTS, MODULES } from '../checklists/registry';
import { demoInspection } from '../checklists/demoHistory';
import {
  ANSWER_LABEL, activeFollowUps, correctiveFor, correctiveList, dueText, fmtDate, followUpLabel,
  inspectionStats, questionIssues, sectionStats, verdict, visibleQuestions, visibleAnswers, weightedScore,
  copyAnswers, copiedCount, currentPeriod, periodOf, statusLabel,
} from '../checklists/logic';
import { fullName } from '../helpers';
import { Store } from '../store';
import { AUTH_MODE, DEMO_HISTORY } from '../config';
import { F, useTheme } from '../theme';

const MAX_PHOTOS = 3;
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return fmtDate(iso);
};

/* ============================== Shell ============================== */
export default function ChecklistModule({ moduleKey, user, asset, onExit, onAccount, onToast }) {
  const mod = MODULES[moduleKey];
  const C = useTheme();
  const [stack, setStack] = useState([{ name: 'home' }]);
  const [all, setAll] = useState(null); // all inspections
  const top = stack[stack.length - 1];
  const push = (s) => setStack((st) => [...st, s]);
  const pop = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const reset = (s) => setStack([{ name: 'home' }, ...(s ? [s] : [])]);

  useEffect(() => {
    (async () => {
      // POC: past-year history for this property, so previous surveys can be reviewed and copied
      if (DEMO_HISTORY) {
        await Store.ensureDemoHistory(asset.propertyNumber, () => ALL_CHECKLISTS.flatMap((cl) =>
          ['2024', '2025'].map((y) => demoInspection(cl, asset.propertyNumber, y)))).catch(() => {});
      }
      try { setAll(await Store.inspections(asset.propertyNumber)); }
      catch { setAll([]); onToast('Couldn’t load surveys. Check your connection.'); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back: pop within the module, or leave it
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) pop(); else onExit();
      return true;
    });
    return () => sub.remove();
  }, [stack.length, pop, onExit]);

  // Debounced save of the inspection being edited
  const timer = useRef(null);
  const pendingSave = useRef(null);
  const queue = useRef(Promise.resolve()); // saves run one at a time, in order
  const warnedOffline = useRef(false);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      const ins = pendingSave.current;
      pendingSave.current = null;
      if (!ins) return;
      try {
        const saved = await Store.saveInspection(ins);
        warnedOffline.current = false;
        if (saved && saved.conflict) setConflict({ mine: ins, theirs: saved.conflict });
      } catch {
        if (!warnedOffline.current) {
          warnedOffline.current = true;
          onToast(AUTH_MODE === 'aws' ? 'Offline: your changes will sync when you’re back online.' : 'Couldn’t save on this device. Remove a photo and try again.');
        }
        if (AUTH_MODE === 'aws' && !pendingSave.current) pendingSave.current = ins; // retried with the next change
      }
    });
    return queue.current;
  }, [onToast]);
  useEffect(() => () => { flush(); }, [flush]);

  const update = useCallback((ins) => {
    setAll((list) => (list || []).map((x) => (x.id === ins.id ? ins : x)));
    pendingSave.current = ins;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [flush]);

  // When queued offline changes finish uploading, refresh the list (status, PDF availability)
  const lastPending = useRef(null);
  useEffect(() => Store.onPendingChange((n) => {
    const fewer = lastPending.current != null && n < lastPending.current;
    lastPending.current = n;
    if (fewer && !pendingSave.current) Store.inspections(asset.propertyNumber).then(setAll).catch(() => {});
  }), [asset.propertyNumber]);

  // Someone else saved this survey since we opened it: ask which version to keep
  const [conflict, setConflict] = useState(null);
  async function resolveConflict(keepMine) {
    const { mine, theirs } = conflict;
    setConflict(null);
    if (keepMine) {
      const saved = await Store.saveInspection(mine, { force: true }).catch(() => null);
      if (!saved || saved.conflict) { onToast('Couldn’t save. Check your connection and try again.'); return; }
      setAll((l) => l.map((x) => (x.id === saved.id ? saved : x)));
      onToast('Your version is saved');
    } else {
      Store.adopt(theirs);
      setAll((l) => l.map((x) => (x.id === theirs.id ? theirs : x)));
      onToast(`Showing ${theirs.savedBy ? `${theirs.savedBy.name}’s` : 'the latest'} version`);
    }
  }
  const conflictSheet = (
    <Portal>
      <Sheet visible={!!conflict} onClose={() => {}}>
        {conflict && (
          <View>
            <Text style={{ fontFamily: F.cond, fontSize: 26, color: C.ink, marginBottom: 6 }}>Someone else saved this survey</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 15.5, lineHeight: 22, color: C.muted, marginBottom: 18 }}>
              {conflict.theirs.savedBy ? conflict.theirs.savedBy.name : 'A colleague'} saved it {conflict.theirs.savedAt ? ago(conflict.theirs.savedAt) : 'recently'}, after you opened it. Which version should be kept?
            </Text>
            <View style={{ gap: 10 }}>
              <Button title="Use their version" onPress={() => resolveConflict(false)} />
              <Button title="Keep mine (replace theirs)" variant="ghost" onPress={() => resolveConflict(true)} />
            </View>
          </View>
        )}
      </Sheet>
    </Portal>
  );

  if (!all) return <TopBar user={user} onAccount={onAccount} />;
  const byId = (id) => all.find((x) => x.id === id);
  const checklistOf = (ins) => mod.checklists.find((c) => c.id === ins.checklistId);

  // Most recent submitted/approved inspection before the current period
  const previousFor = (cl) => all
    .filter((x) => x.checklistId === cl.id && x.propertyNumber === asset.propertyNumber && x.status !== 'draft' && periodOf(x) < currentPeriod())
    .sort((a, b) => periodOf(b).localeCompare(periodOf(a)))[0] || null;

  async function start(checklist, copyFrom) {
    let answers = {};
    if (copyFrom) {
      const r = copyAnswers({ checklist, prev: copyFrom, into: {} });
      answers = r.answers;
      onToast(`Copied ${r.count} answers from ${periodOf(copyFrom)}. Review each one.`);
    }
    const ins = {
      id: 'ins' + Date.now(), checklistId: checklist.id, module: moduleKey, propertyNumber: asset.propertyNumber,
      period: currentPeriod(), copiedFromId: copyFrom ? copyFrom.id : null,
      status: 'draft', startedAt: new Date().toISOString(), startedBy: { id: user.id, name: fullName(user) }, answers,
    };
    let saved;
    try { saved = await Store.saveInspection(ins); } catch { onToast('Couldn’t start the survey. Check your connection.'); return; }
    setAll((l) => [...(l || []).filter((x) => x.id !== saved.id), saved]);
    push({ name: 'overview', id: saved.id });
  }
  async function discard(ins) {
    try { await Store.deleteInspection(ins.id); } catch { onToast('Couldn’t discard the draft. Check your connection.'); return; }
    setAll((l) => l.filter((x) => x.id !== ins.id));
  }
  async function submit(ins) {
    await flush();
    const clean = Object.fromEntries(Object.entries(visibleAnswers(checklistOf(ins), ins.answers)).map(([k, v]) => [k, { ...v, copiedFrom: null, copiedUnreviewed: !!v.copiedFrom }]));
    const done = { ...ins, answers: clean, status: 'submitted', submittedAt: new Date().toISOString(), submittedBy: { id: user.id, name: fullName(user) } };
    let saved;
    try { saved = await Store.saveInspection(done); } catch { onToast('Couldn’t submit. Check your connection and try again.'); return; }
    if (saved.conflict) { setConflict({ mine: ins, theirs: saved.conflict }); return; }
    setAll((l) => l.map((x) => (x.id === saved.id ? saved : x)));
    onToast(saved.pendingSync ? 'Submitted. It will upload when you’re back online.' : 'Survey submitted. The PDF report is ready.');
    reset({ name: 'review', id: saved.id });
  }

  const common = { user, asset, onAccount };
  if (top.name === 'home') {
    return <>{conflictSheet}<Home {...common} mod={mod} all={all} previousFor={previousFor} onBack={onExit} onStart={start} onDiscard={discard}
      onOpen={(ins) => push({ name: ins.status === 'draft' ? 'overview' : 'review', id: ins.id })} /></>;
  }
  const ins = byId(top.id);
  if (!ins) { reset(); return null; }
  const checklist = checklistOf(ins);
  const prev = ins.status === 'draft' ? previousFor(checklist) : null;
  if (top.name === 'overview') {
    return <>{conflictSheet}<Overview {...common} ins={ins} checklist={checklist} prev={prev} onBack={pop}
      onCopyUnanswered={() => {
        const r = copyAnswers({ checklist, prev, into: ins.answers, onlyUnanswered: true });
        update({ ...ins, answers: r.answers });
        onToast(r.count ? `Copied ${r.count} answers from ${periodOf(prev)}` : 'Nothing left to copy');
      }}
      onSection={(i) => push({ name: 'section', id: ins.id, index: i })} onReview={() => push({ name: 'review', id: ins.id })} /></>;
  }
  if (top.name === 'section') {
    return <>{conflictSheet}<Section {...common} key={top.index} ins={ins} checklist={checklist} prev={prev} index={top.index} onBack={pop} onChange={update} onToast={onToast}
      onGo={(i) => setStack((st) => [...st.slice(0, -1), { ...top, index: i }])}
      onReview={() => setStack((st) => [...st.slice(0, -1), { name: 'review', id: ins.id }])} /></>;
  }
  return <>{conflictSheet}<Review {...common} ins={ins} checklist={checklist} onBack={pop} onSubmit={() => submit(ins)} onToast={onToast}
    onSection={(i) => push({ name: 'section', id: ins.id, index: i })}
    onAnswers={() => push({ name: 'overview', id: ins.id })} /></>;
}

/* ============================== Pieces ============================== */
export function Header({ title, subtitle, onBack }) {
  const c = useTheme();
  return (
    <View style={{ backgroundColor: c.ink, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <Pressable onPress={onBack} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="back" size={20} color={c.surface} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.cond, fontSize: 26, lineHeight: 28, color: c.surface }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: c.surface, opacity: 0.8, marginTop: 3 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function Bar({ value, total, color }) {
  const c = useTheme();
  const pct = total ? Math.min(1, value / total) : 0;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color || c.egress }} />
    </View>
  );
}

export function Card({ children, style }) {
  const c = useTheme();
  return <View style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 16 }, style]}>{children}</View>;
}

export const H2 = ({ children }) => {
  const c = useTheme();
  return <Text style={{ fontFamily: F.semi, color: c.muted, fontSize: 14.5, marginTop: 22, marginBottom: 10 }}>{children}</Text>;
};

export function Screen({ user, onAccount, header, children, footer }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar user={user} onAccount={onAccount} />
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: (footer ? 16 : 40) + insets.bottom }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ padding: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>{footer}</View>
      ) : null}
    </View>
  );
}

const sub = (asset) => `${asset.propertyNumber} · ${asset.address}`;
const hasNonCompliance = (cl) => cl.categories.some((cat) => cat.questions.some((q) => (q.correctiveActions || []).some((x) => x.nonCompliant)));
const countQuestions = (cl) => cl.categories.reduce((n, c) => n + c.questions.filter((q) => q.answers.length).length, 0);

/* ============================== Home ============================== */
function Home({ user, asset, onAccount, mod, all, previousFor, onBack, onStart, onDiscard, onOpen }) {
  const c = useTheme();
  const [confirm, setConfirm] = useState(null);
  const period = currentPeriod();
  return (
    <Screen user={user} onAccount={onAccount} header={<Header title={mod.title} subtitle={sub(asset)} onBack={onBack} />}>
      {mod.checklists.map((cl) => {
        const mine = all.filter((x) => x.checklistId === cl.id && x.propertyNumber === asset.propertyNumber);
        const current = mine.find((x) => periodOf(x) === period);
        const prev = previousFor(cl);
        const past = mine.filter((x) => x !== current && x.status !== 'draft').sort((a, b) => periodOf(b).localeCompare(periodOf(a)));
        const st = current ? inspectionStats(cl, current.answers) : null;
        const summary = (p) => {
          const s2 = inspectionStats(cl, p.answers); const ws = weightedScore(cl, p.answers);
          return [hasNonCompliance(cl) && `${s2.noncompliant} non-compliant`, ws && `${ws.title} ${ws.score}`, statusLabel(p, cl)].filter(Boolean).join(' · ');
        };
        return (
          <View key={cl.id}>
            <Card>
              <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: c.muted }}>Annual survey · {period}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 19, color: c.ink, marginTop: 2 }}>{cl.title}</Text>
              <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: c.muted, marginTop: 2, marginBottom: 14 }}>
                {cl.categories.length} sections, {countQuestions(cl)} questions{cl.approvalRequired ? '. Needs approval after submitting.' : '.'}
              </Text>

              {!current && (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 15, color: c.ink }}>Not started for {period}.</Text>
                  {prev ? (
                    <>
                      <Button title={`Start with ${periodOf(prev)} answers`} onPress={() => onStart(cl, prev)} />
                      <Button title="Start blank" variant="ghost" onPress={() => onStart(cl, null)} />
                      <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted }}>
                        Copies answers and comments from {periodOf(prev)}. Signatures and photos aren’t copied, and every copied answer is marked for you to review.
                      </Text>
                    </>
                  ) : (
                    <Button title="Start survey" onPress={() => onStart(cl, null)} />
                  )}
                </View>
              )}

              {current && current.status === 'draft' && (
                <View>
                  <Text style={{ fontFamily: F.semi, fontSize: 15, color: c.ink, marginBottom: 6 }}>
                    In progress: {st.answered} of {st.answerable} answered
                  </Text>
                  <Bar value={st.answered} total={st.answerable} />
                  <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted, marginTop: 6, marginBottom: 14 }}>
                    Started {fmtDate(current.startedAt)} by {current.startedBy.name}
                    {copiedCount(cl, current.answers) ? ` · ${copiedCount(cl, current.answers)} copied answers to review` : ''}
                  </Text>
                  <Button title="Resume survey" onPress={() => onOpen(current)} />
                  {confirm === current.id ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
                      <Text style={{ fontFamily: F.medium, color: c.ink, fontSize: 15 }}>Discard all answers?</Text>
                      <LinkButton title="Discard" onPress={() => { setConfirm(null); onDiscard(current); }} />
                      <LinkButton title="Keep" onPress={() => setConfirm(null)} />
                    </View>
                  ) : (
                    <LinkButton title="Discard draft" onPress={() => setConfirm(current.id)} />
                  )}
                </View>
              )}

              {current && current.status !== 'draft' && (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 15, color: c.ink }}>
                    {statusLabel(current, cl)}: submitted {fmtDate(current.submittedAt)} by {current.submittedBy.name}
                  </Text>
                  <Button title={`View ${period} survey`} variant="ghost" onPress={() => onOpen(current)} />
                </View>
              )}
            </Card>

            <H2>Previous years at {asset.propertyNumber}</H2>
            {past.length === 0 ? (
              <Text style={{ fontFamily: F.regular, fontSize: 15, color: c.muted }}>No earlier surveys.</Text>
            ) : past.map((p) => (
              <Pressable key={p.id} onPress={() => onOpen(p)} style={({ pressed }) => [{ marginBottom: 10, opacity: pressed ? 0.8 : 1 }]}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
                  <Text style={{ fontFamily: F.cond, fontSize: 24, color: c.ink }}>{periodOf(p)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 15, color: c.ink }}>{fmtDate(p.submittedAt)} · {p.submittedBy.name}</Text>
                    <Text style={{ fontFamily: F.regular, fontSize: 14, color: c.muted }}>{summary(p)}</Text>
                  </View>
                  <Icon name="chev" size={18} color={c.muted} />
                </Card>
              </Pressable>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

/* ============================== Overview (sections) ============================== */
function Overview({ user, asset, onAccount, ins, checklist, prev, onBack, onSection, onReview, onCopyUnanswered }) {
  const c = useTheme();
  const ro = ins.status !== 'draft';
  const st = inspectionStats(checklist, ins.answers);
  return (
    <Screen
      user={user} onAccount={onAccount}
      header={<Header title={checklist.title} subtitle={`${periodOf(ins)} · ${sub(asset)}`} onBack={onBack} />}
      footer={ro ? null : <Button title="Review and submit" onPress={onReview} />}
    >
      <Card>
        <Text style={{ fontFamily: F.cond, fontSize: 30, color: c.ink }}>{st.answered} of {st.answerable}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 15, color: c.muted, marginBottom: 10 }}>questions answered</Text>
        <Bar value={st.answered} total={st.answerable} />
        {st.noncompliant > 0 && (
          <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: c.fire, marginTop: 10 }}>
            {st.noncompliant} non-compliant {st.noncompliant === 1 ? 'item' : 'items'} so far
          </Text>
        )}
        {!ro && copiedCount(checklist, ins.answers) > 0 && (
          <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: c.ink, marginTop: 10 }}>
            {copiedCount(checklist, ins.answers)} answers copied from an earlier year still need your review
          </Text>
        )}
        {!ro && prev && st.answered < st.answerable && (
          <LinkButton title={`Copy unanswered questions from ${periodOf(prev)}`} onPress={onCopyUnanswered} />
        )}
      </Card>
      <H2>Sections</H2>
      {checklist.categories.map((cat, i) => {
        const s = sectionStats(checklist, cat, ins.answers);
        const started = s.answered > 0;
        return (
          <Pressable key={cat.id} onPress={() => onSection(i)} style={({ pressed }) => [{ marginBottom: 10, opacity: pressed ? 0.8 : 1 }]}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                backgroundColor: s.complete ? c.egress : 'transparent', borderWidth: s.complete ? 0 : 1.5, borderColor: started ? c.ink : c.line }}>
                {s.complete ? <Icon name="check" size={16} color="#fff" /> : <Text style={{ fontFamily: F.bold, fontSize: 13, color: c.muted }}>{i + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.semi, fontSize: 15.5, color: c.ink }}>{cat.title}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted }}>
                  {s.answerable ? `${s.answered} of ${s.answerable} answered` : 'Names and signatures'}
                </Text>
              </View>
              {s.noncompliant > 0 && (
                <View style={{ backgroundColor: c.fire, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 13 }}>{s.noncompliant}</Text>
                </View>
              )}
              <Icon name="chev" size={18} color={c.muted} />
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

/* ============================== Section (questions) ============================== */
function Section({ user, asset, onAccount, ins, checklist, prev, index, onBack, onChange, onGo, onReview, onToast }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const ro = ins.status !== 'draft';
  const cat = checklist.categories[index];
  const last = index === checklist.categories.length - 1;
  const [scroll, setScroll] = useState(true);
  const [showErrors, setShowErrors] = useState(false);

  const setAnswer = (q, patch) => {
    const before = ins.answers[q.id] || {};
    onChange({ ...ins, answers: { ...ins.answers, [q.id]: { ...before, copiedFrom: null, ...patch } } });
  };

  const s = sectionStats(checklist, cat, ins.answers);
  function next() {
    if (!ro && !s.complete && !showErrors) { setShowErrors(true); onToast('Some answers in this section are missing'); return; }
    if (last) { if (ro) onBack(); else onReview(); } else onGo(index + 1);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar user={user} onAccount={onAccount} />
      <Header title={cat.title} subtitle={`${periodOf(ins)} · Section ${index + 1} of ${checklist.categories.length} · ${asset.propertyNumber}`} onBack={onBack} />
      <ScrollView scrollEnabled={scroll} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {visibleQuestions(checklist, cat, ins.answers).map((q, i) => (
          <QuestionCard key={q.id} q={q} n={i + 1} a={ins.answers[q.id]} ro={ro} showErrors={showErrors} checklist={checklist}
            prevAnswer={prev && prev.answers[q.id]} prevPeriod={prev && periodOf(prev)} meId={user.id}
            onChange={(patch) => setAnswer(q, patch)} onDraw={setScroll} onToast={onToast} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
        {index > 0 && <Button title="Previous" variant="ghost" onPress={() => onGo(index - 1)} style={{ flex: 1 }} />}
        <Button title={last ? (ro ? 'Done' : 'Review and submit') : 'Next section'} onPress={next} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function AnswerButton({ label, selected, tone, onPress, disabled }) {
  const c = useTheme();
  const bg = { compliant: c.egress, noncompliant: c.fire, na: c.slate }[tone] || c.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      style={({ pressed }) => ({
        flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1.5,
        borderColor: selected ? bg : c.line, backgroundColor: selected ? bg : c.surface, opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontFamily: F.bold, fontSize: 16, color: selected ? '#fff' : c.ink }}>{label}</Text>
    </Pressable>
  );
}

function QuestionCard({ q, n, a, ro, showErrors, checklist, prevAnswer, prevPeriod, meId, onChange, onDraw, onToast }) {
  const c = useTheme();
  const ans = a && a.answer;
  const issues = showErrors ? questionIssues(q, a) : [];
  const ca = correctiveFor(q, ans);
  const fus = activeFollowUps(q, ans);
  const [noteOpen, setNoteOpen] = useState(!!(a && a.note));
  const photos = (a && a.photos) || [];
  const missing = issues.length > 0;

  async function addPhoto(fromCamera) {
    try {
      let res;
      if (fromCamera && Platform.OS !== 'web') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) { onToast('Camera access is off for this app'); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4 });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 });
      }
      if (res.canceled || !res.assets || !res.assets[0]) return;
      onChange({ photos: [...photos, { uri: await keepPhoto(res.assets[0].uri), at: new Date().toISOString() }].slice(0, MAX_PHOTOS) });
    } catch {
      onToast('Couldn’t add the photo');
    }
  }

  return (
    <View style={{ backgroundColor: c.surface, borderWidth: missing ? 1.5 : 1, borderColor: missing ? c.fire : c.line, borderRadius: 14, padding: 16 }}>
      {q.label ? <Text style={{ fontFamily: F.semi, fontSize: 13, color: c.muted, marginBottom: 3 }}>{q.label}</Text> : null}
      <Text style={{ fontFamily: F.semi, fontSize: 16.5, lineHeight: 22, color: c.ink }}>
        {q.answers.length && !q.label ? `${n}. ` : ''}{q.title}
      </Text>
      {q.instructions ? <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 19, color: c.muted, marginTop: 4 }}>{q.instructions}</Text> : null}

      {q.answers.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }} accessibilityRole="radiogroup">
          {q.answers.map((k) => (
            <AnswerButton key={k} label={ANSWER_LABEL[k]} selected={ans === k} tone={verdict(q, k)} disabled={ro}
              onPress={() => ans !== k && onChange({ answer: k })} />
          ))}
        </View>
      )}
      {!ro && a && a.copiedFrom && (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10, backgroundColor: c.surface2,
          borderLeftWidth: 4, borderLeftColor: c.warn, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 14, color: c.ink, flexShrink: 1 }}>Copied from {a.copiedFrom}. Still correct?</Text>
          <LinkButton title="Yes, keep it" onPress={() => onChange({ copiedFrom: null })} />
        </View>
      )}
      {!ro && !(a && a.copiedFrom) && prevAnswer && prevAnswer.answer && q.answers.length > 0 && (
        <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted, marginTop: 8 }} numberOfLines={2}>
          {prevPeriod}: {ANSWER_LABEL[prevAnswer.answer]}
          {Object.values(prevAnswer.followUps || {}).filter((v) => typeof v === 'string' && v.trim()).slice(0, 1).map((v) => ` · “${v}”`).join('')}
        </Text>
      )}
      {missing && issues.includes('answer') && <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: c.fire, marginTop: 6 }}>Choose an answer</Text>}

      {ca && (
        <View style={{ marginTop: 12, borderLeftWidth: 4, borderLeftColor: c.fire, backgroundColor: c.dangerBg, borderRadius: 8, padding: 10 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: c.dangerInk }}>Corrective action</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 14.5, color: c.ink, marginTop: 2 }}>{ca.taskTitle || 'Follow up on this item'}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted, marginTop: 2 }}>
            {[ca.due && `Due within ${dueText(ca.due)}`, ca.assignedTo.filter((x) => !x.startsWith('User ')).length && `Assigned to ${ca.assignedTo.filter((x) => !x.startsWith('User ')).join(', ')}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
      )}

      {fus.map((f) => {
        const v = a && a.followUps && a.followUps[f.id];
        const bad = issues.includes(f.id);
        const set = (val) => onChange({ followUps: { ...((a && a.followUps) || {}), [f.id]: val } });
        if (f.type === 'heading') {
          return <HeadingNote key={f.id} f={f} value={v} onChange={set} ro={ro} bad={bad} onToast={onToast} />;
        }
        return (
          <View key={f.id} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: c.ink, marginBottom: 6 }}>
              {followUpLabel(f)}{f.required ? '' : ' (optional)'}
            </Text>
            {f.type === 'signature' ? (
              <SignaturePad value={v} onChange={set} disabled={ro} onDrawStart={() => onDraw(false)} onDrawEnd={() => onDraw(true)} />
            ) : (
              <TextInput
                value={v == null ? '' : String(v)}
                onChangeText={(t) => set(f.type === 'numeric' ? t.replace(/[^0-9.,]/g, '') : t)}
                keyboardType={f.type === 'numeric' ? 'numeric' : 'default'}
                editable={!ro}
                multiline={f.type === 'comments'}
                placeholder={/hazard/i.test(f.title || '') ? 'Describe the hazard and how it’s being controlled' : ''}
                placeholderTextColor={c.muted}
                style={{ borderWidth: 1.5, borderColor: bad ? c.fire : c.line, borderRadius: 10, padding: 12, minHeight: f.type === 'comments' ? 80 : 46,
                  textAlignVertical: 'top', fontFamily: F.regular, fontSize: 16, color: c.ink, backgroundColor: ro ? c.surface2 : c.surface }}
              />
            )}
            {bad && <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: c.fire, marginTop: 4 }}>Required</Text>}
          </View>
        );
      })}

      {checklist.showCommentIcon && noteOpen && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: c.ink, marginBottom: 6 }}>Note (optional)</Text>
          <TextInput value={(a && a.note) || ''} onChangeText={(t) => onChange({ note: t })} editable={!ro} multiline placeholderTextColor={c.muted}
            style={{ borderWidth: 1.5, borderColor: c.line, borderRadius: 10, padding: 12, minHeight: 64, textAlignVertical: 'top', fontFamily: F.regular, fontSize: 16, color: c.ink, backgroundColor: ro ? c.surface2 : c.surface }} />
        </View>
      )}

      {photos.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <View key={p.at + i}>
              <PhotoThumb photo={p} size={72} label={`Photo ${i + 1}`} />
              {!ro && (
                <Pressable onPress={() => onChange({ photos: photos.filter((_, j) => j !== i) })} accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={6}
                  style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={12} color={c.surface} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {!ro && (checklist.showCommentIcon || checklist.showPhotosIcon) && (
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
          {checklist.showCommentIcon && !noteOpen && <LinkButton title="Add note" onPress={() => setNoteOpen(true)} />}
          {checklist.showPhotosIcon && photos.length < MAX_PHOTOS && Platform.OS !== 'web' && <LinkButton title="Take photo" onPress={() => addPhoto(true)} />}
          {checklist.showPhotosIcon && photos.length < MAX_PHOTOS && <LinkButton title={Platform.OS === 'web' ? 'Add photo' : 'Choose photo'} onPress={() => addPhoto(false)} />}
        </View>
      )}
    </View>
  );
}

// Instruction from the questionnaire (type "heading"). Required ones need a "Confirmed" tick.
function HeadingNote({ f, value, onChange, ro, bad, onToast }) {
  const c = useTheme();
  return (
    <View style={{ marginTop: 12, borderLeftWidth: 4, borderLeftColor: c.mandatory, backgroundColor: c.surface2, borderRadius: 8, padding: 10,
      borderWidth: bad ? 1.5 : 0, borderColor: bad ? c.fire : 'transparent' }}>
      <Text style={{ fontFamily: F.regular, fontSize: 14.5, lineHeight: 20, color: c.ink }}>{f.title}</Text>
      {f.link && (
        <Pressable onPress={() => onToast(`Opens ${f.link.label} in BORiS once the app is connected`)} hitSlop={6} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: F.semi, fontSize: 14, color: c.mandatory, textDecorationLine: 'underline' }}>
            BORiS: {f.link.parent && f.link.parent !== f.link.label ? `${f.link.parent} › ` : ''}{f.link.label}
          </Text>
        </Pressable>
      )}
      {f.required && (
        <Pressable onPress={() => !ro && onChange(value === true ? null : true)} accessibilityRole="checkbox" accessibilityState={{ checked: value === true, disabled: ro }} aria-checked={value === true}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: value === true ? c.egress : c.muted,
            backgroundColor: value === true ? c.egress : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {value === true && <Icon name="check" size={14} color="#fff" />}
          </View>
          <Text style={{ fontFamily: F.semi, fontSize: 14.5, color: c.ink }}>Confirmed</Text>
        </Pressable>
      )}
      {bad && <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: c.fire, marginTop: 4 }}>Confirm to continue</Text>}
    </View>
  );
}

/* ============================== Review & submit ============================== */
function Review({ user, asset, onAccount, ins, checklist, onBack, onSubmit, onSection, onAnswers, onToast }) {
  const c = useTheme();
  const ro = ins.status !== 'draft';
  const st = inspectionStats(checklist, ins.answers);
  const fromIso = ins.submittedAt || new Date().toISOString();
  const actions = useMemo(() => correctiveList(checklist, ins.answers, fromIso), [checklist, ins.answers, fromIso]);
  const counts = useMemo(() => {
    const t = { compliant: 0, noncompliant: 0, na: 0, answered: 0 };
    for (const cat of checklist.categories) for (const q of visibleQuestions(checklist, cat, ins.answers)) {
      const v = verdict(q, ins.answers[q.id] && ins.answers[q.id].answer);
      if (v) t[v] += 1;
    }
    return t;
  }, [checklist, ins.answers]);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  async function openPdf() {
    setPdfBusy(true);
    try { await WebBrowser.openBrowserAsync(await Store.surveyPdfUrl(ins.id)); }
    catch (e) { onToast(e.message === 'network' ? 'You’re offline. The PDF opens once you’re connected.' : 'Couldn’t create the PDF report. Try again.'); }
    setPdfBusy(false);
  }
  const score = weightedScore(checklist, ins.answers);
  const hasActions = checklist.categories.some((cat) => cat.questions.some((q) => (q.correctiveActions || []).some((x) => x.nonCompliant)));

  const incomplete = ro ? [] : checklist.categories
    .map((cat, i) => ({ cat, i, qs: visibleQuestions(checklist, cat, ins.answers).filter((q) => questionIssues(q, ins.answers[q.id]).length) }))
    .filter((x) => x.qs.length);

  return (
    <Screen
      user={user} onAccount={onAccount}
      header={<Header title={ro ? `${periodOf(ins)} survey` : 'Review and submit'} subtitle={`${checklist.title} · ${periodOf(ins)} · ${asset.propertyNumber}`} onBack={onBack} />}
      footer={ro ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="View answers" variant="ghost" onPress={onAnswers} style={{ flex: 1 }} />
          {AUTH_MODE === 'aws' && <Button title={pdfBusy ? 'Opening…' : 'PDF report'} disabled={pdfBusy || !!ins.pendingSync} onPress={openPdf} style={{ flex: 1 }} />}
        </View>
      )
        : <Button title={busy ? 'Submitting…' : 'Submit survey'} disabled={!st.complete || busy} onPress={() => { setBusy(true); onSubmit(); }} />}
    >
      {ro && (
        <Card style={{ marginBottom: 12, borderColor: ins.status === 'approved' ? c.egress : c.warn, borderWidth: 1.5 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: c.ink }}>{statusLabel(ins, checklist)}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: c.muted, marginTop: 2 }}>
            Submitted {fmtDate(ins.submittedAt)} by {ins.submittedBy.name}

          </Text>
        </Card>
      )}

      {incomplete.length > 0 && (
        <View>
          <Card style={{ borderColor: c.fire, borderWidth: 1.5 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 16, color: c.ink }}>
              {st.issues} {st.issues === 1 ? 'item needs' : 'items need'} attention before you can submit
            </Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: c.muted, marginTop: 2 }}>Tap a section to finish it.</Text>
          </Card>
          {incomplete.map(({ cat, i, qs }) => (
            <Pressable key={cat.id} onPress={() => onSection(i)} style={({ pressed }) => [{ marginTop: 10, opacity: pressed ? 0.8 : 1 }]}>
              <Card style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontFamily: F.semi, fontSize: 15.5, color: c.ink }}>{i + 1}. {cat.title}</Text>
                  <Icon name="chev" size={18} color={c.muted} />
                </View>
                {qs.slice(0, 3).map((q) => (
                  <Text key={q.id} numberOfLines={1} style={{ fontFamily: F.regular, fontSize: 14, color: c.muted, marginTop: 3 }}>• {q.title}</Text>
                ))}
                {qs.length > 3 && <Text style={{ fontFamily: F.regular, fontSize: 14, color: c.muted, marginTop: 3 }}>and {qs.length - 3} more</Text>}
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {!ro && copiedCount(checklist, ins.answers) > 0 && (
        <Card style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: c.warn }}>
          <Text style={{ fontFamily: F.semi, fontSize: 15, color: c.ink }}>
            {copiedCount(checklist, ins.answers)} copied answers haven’t been reviewed
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, color: c.muted, marginTop: 2 }}>
            They’ll be submitted as they are. Open the sections to check them first.
          </Text>
        </Card>
      )}
      {incomplete.length === 0 && (
        <Card>
          <View style={{ flexDirection: 'row' }}>
            {[['compliant', 'Compliant', c.egress], ['noncompliant', 'Non-compliant', c.fire], ['answered', 'Answered', c.ink], ['na', 'N/A', c.slate]]
              .filter(([k]) => counts[k] > 0 || (k !== 'answered' && hasActions))
              .concat(score ? [['score', score.title, c.mandatory]] : [])
              .map(([k, label, col]) => (
              <View key={k} style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.cond, fontSize: 32, color: col }}>{k === 'score' ? score.score : counts[k]}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 14, color: c.muted }}>{label}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {actions.length > 0 && (
        <View>
          <H2>Corrective actions ({actions.length})</H2>
          {actions.map(({ category, question, action, due, answer }) => (
            <Card key={question.id} style={{ marginBottom: 10, borderLeftWidth: 4, borderLeftColor: c.fire }}>
              <Text style={{ fontFamily: F.semi, fontSize: 15.5, color: c.ink }}>{action.taskTitle || 'Follow up on this item'}</Text>
              <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: c.muted, marginTop: 2 }}>
                {category.title}: {question.title} ({ANSWER_LABEL[answer.answer]})
              </Text>
              {due && <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: c.ink, marginTop: 4 }}>Due {fmtDate(due)}</Text>}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
