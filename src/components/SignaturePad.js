import { useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { F, useTheme } from '../theme';

// Value: { paths: ['M10 10 L12 14 ...', ...], width, height } — small enough to store as JSON.
export default function SignaturePad({ value, onChange, disabled, height = 140, onDrawStart, onDrawEnd }) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const [live, setLive] = useState('');
  const cur = useRef('');
  const paths = (value && value.paths) || [];
  const latest = useRef({ paths, width, onChange, onDrawStart, onDrawEnd });
  latest.current = { paths, width, onChange, onDrawStart, onDrawEnd };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        cur.current = `M${x.toFixed(1)} ${y.toFixed(1)}`;
        setLive(cur.current);
        latest.current.onDrawStart && latest.current.onDrawStart(); // lets the parent stop scrolling
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        cur.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        setLive(cur.current);
      },
      onPanResponderTerminate: () => { cur.current = ''; setLive(''); latest.current.onDrawEnd && latest.current.onDrawEnd(); },
      onPanResponderRelease: () => {
        const p = cur.current;
        cur.current = ''; setLive('');
        const L = latest.current;
        L.onDrawEnd && L.onDrawEnd();
        if (!p) return;
        L.onChange({ paths: [...L.paths, p.includes('L') ? p : `${p} l0.1 0.1`], width: L.width, height });
      },
    })
  ).current;

  const empty = paths.length === 0 && !live;
  return (
    <View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...(disabled ? {} : pan.panHandlers)}
        style={{ height, borderWidth: 1.5, borderColor: c.line, borderRadius: 10, backgroundColor: c.surface, overflow: 'hidden' }}
        accessibilityLabel="Signature area"
      >
        <Svg width="100%" height={height} viewBox={value && value.width ? `0 0 ${value.width} ${height}` : undefined}>
          {paths.map((d, i) => <Path key={i} d={d} stroke={c.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
          {live ? <Path d={live} stroke={c.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </Svg>
        {empty && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 14, bottom: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 4 }}>
            <Text style={{ fontFamily: F.regular, fontSize: 13, color: c.muted }}>{disabled ? 'Not signed' : 'Sign here with your finger'}</Text>
          </View>
        )}
      </View>
      {!disabled && paths.length > 0 && (
        <Pressable onPress={() => onChange(null)} hitSlop={8} style={{ alignSelf: 'flex-end', paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 14, color: c.mandatory }}>Clear signature</Text>
        </Pressable>
      )}
    </View>
  );
}
