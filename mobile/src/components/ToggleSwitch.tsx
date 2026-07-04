import React, { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB   = 22;
const PAD     = 3;
const TRAVEL  = TRACK_W - THUMB - PAD * 2;

export default function ToggleSwitch({ value, onValueChange, disabled = false }: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      bounciness: 3,
      speed: 20,
    }).start();
  }, [value]);

  const translateX = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [PAD, PAD + TRAVEL],
  });

  const trackBg = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(30,35,45,1)', 'rgba(77,235,249,0.22)'],
  });

  const trackBorder = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255,255,255,0.12)', 'rgba(77,235,249,0.5)'],
  });

  const thumbBg = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['#4b5563', '#4debf9'],
  });

  return (
    <Pressable
      onPress={() => { if (!disabled) onValueChange(!value); }}
      style={{ opacity: disabled ? 0.45 : 1 }}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View
        style={{
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          backgroundColor: trackBg,
          borderWidth: 1,
          borderColor: trackBorder,
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: thumbBg,
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.4,
            shadowRadius: 2,
            elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
