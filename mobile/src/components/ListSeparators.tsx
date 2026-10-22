import React from 'react';
import { View } from 'react-native';

// FlatList separators, declared once at module scope. An inline
// `ItemSeparatorComponent={() => <View … />}` is a new component type on every
// render, so React unmounts and remounts every separator each time the
// parent re-renders (e.g. on every keystroke in a search box).

/** 10 px gap between cards. */
export const GapSm = () => <View className="h-2.5" />;
/** 12 px gap between cards. */
export const GapMd = () => <View className="h-3" />;
/** 1 px divider between rows in a sheet or list. */
export const Hairline = () => <View className="h-px bg-white/5" />;
