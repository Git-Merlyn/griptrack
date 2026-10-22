import React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface IconButtonProps
  extends Omit<TouchableOpacityProps, 'children' | 'accessibilityLabel' | 'accessibilityRole'> {
  icon: IconName;
  /** Read by TalkBack / VoiceOver. Required: an icon has no text of its own. */
  label: string;
  size?: number;
  color?: string;
}

/**
 * Icon-only button with an accessibility role and label. Use it for every
 * tappable icon that has no visible text (close, delete, edit, show password).
 */
export default function IconButton({
  icon,
  label,
  size = 22,
  color = '#6b7280',
  hitSlop = 8,
  activeOpacity = 0.7,
  ...rest
}: IconButtonProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlop}
      activeOpacity={activeOpacity}
      {...rest}
    >
      <Ionicons name={icon} size={size} color={color} />
    </TouchableOpacity>
  );
}
